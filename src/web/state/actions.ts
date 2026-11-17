// 写操作的唯一入口：先改界面（乐观更新）再排队发给服务端，失败回滚；能撤销的顺手记一笔
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { DEFAULT_TTL, TRASH, expiryFrom } from '@/shared/constants';
import { newId } from '@/shared/ids';
import { itemBase, mergePatch } from '@/shared/items';
import type { Board, CreateItem, Item, MoveItem, PatchItem, Reminder } from '@/shared/schema';
import { ApiError, api, drain, serverNow, unwrap } from '../api/client';
import { qk } from './queries';
import { conflictStore, meStore } from './stores';
import { pushUndo, undoEntry } from './undo';
import { enqueue } from './writes';

// 本机连着改同一张卡片（连点几个待办）：后一个请求是在前一个回来之前点的，带的 baseRev 是旧的。
// 发出时把 baseRev 抬到「本机最近一次写回来的 rev」—— 自己不跟自己冲突，以本机最新的为准；
// 中间别的设备改过，服务端的 rev 比这个还大，照样 409
const ownRev = new Map<string, number>();
// 还在排队的本机改动：先回来的结果叠上后面这些再显示，界面不往回跳
const queued = new Map<string, PatchItem[]>();

/** 和服务端同一套合并规则，界面先变成服务端存好以后的样子 */
const applyPatch = (item: Item, p: PatchItem) => mergePatch(item, p, serverNow(), meStore.get());
const withQueued = (item: Item) => (queued.get(item.id) ?? []).reduce(applyPatch, item);

/** 新建的元素在服务端确认之前先长这样（rev 为 0）。网页新建总是带位置 */
function localItem(boardId: string, id: string, b: CreateItem): Item {
  const now = serverNow();
  const base = itemBase({ id, boardId, x: b.x ?? 0, y: b.y ?? 0, now, expiresAt: expiryFrom(b.ttl === undefined ? DEFAULT_TTL : b.ttl, now), by: meStore.get(), rev: 0 });
  if (b.type === 'note') return { ...base, type: 'note', text: b.text ?? '', color: b.color ?? 'yellow' };
  if (b.type === 'location') return { ...base, type: 'location', lat: b.lat, lng: b.lng, name: b.name ?? '' };
  return { ...base, type: b.type, file: b.file };
}

/** 哪些改动可以撤销，撤销时叫什么 */
const UNDOABLE: [keyof PatchItem, string][] = [['text', '改文字'], ['color', '改颜色'], ['name', '改名'], ['links', '连线'], ['x', '移动'], ['y', '移动']];
type Opt = { /** 撤销操作自己不再记一笔 */ record?: boolean };
type Quiet = Opt & { /** 不弹提示（撤销时） */ quiet?: boolean };

export function createActions(qc: QueryClient) {
  const setItems = (boardId: string, fn: (items: Item[]) => Item[]) =>
    qc.setQueryData<Item[]>(qk.items(boardId), (old) => fn(old ?? []));
  const upsert = (boardId: string, it: Item) =>
    setItems(boardId, (items) => (items.some((x) => x.id === it.id) ? items.map((x) => (x.id === it.id ? it : x)) : [...items, it]));
  const drop = (boardId: string, ids: string[]) => setItems(boardId, (items) => items.filter((x) => !ids.includes(x.id)));
  const find = (boardId: string, id: string) => qc.getQueryData<Item[]>(qk.items(boardId))?.find((x) => x.id === id);
  const refresh = (boardId: string) => qc.invalidateQueries({ queryKey: qk.items(boardId) });
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));
  /** 删进废纸篓以后：废纸篓超出 50 个就把最早进去的真删，接着调到不超；不打扰人，失败了等每天的清理 */
  const pruneTrash = () => drain(async () => {
    const r = await enqueue(() => unwrap<{ removed: number; remaining: number }>(api.boards[':id'].prune.$post({ param: { id: TRASH } })));
    return r.remaining > 0 && r.removed > 0;
  }).catch(() => {}).finally(() => refresh(TRASH));

  async function create(boardId: string, body: CreateItem, o: Opt = {}) {
    const id = body.id ?? newId();
    upsert(boardId, localItem(boardId, id, body));
    try {
      const it = await enqueue(() => unwrap<Item>(api.boards[':id'].items.$post({ param: { id: boardId }, json: { ...body, id } as never })));
      ownRev.set(it.id, it.rev);
      upsert(boardId, withQueued(it));
      // 传的是文件、回来的是便利贴（微信聊天记录）：还拆出了图片卡片，马上同步一次
      if (it.type !== body.type) refresh(boardId);
      if (o.record !== false) {
        pushUndo({ label: '新建', run: async () => { const cur = find(boardId, id); if (cur) await remove(boardId, cur, { record: false, quiet: true }); } });
      }
      return it;
    } catch (e) {
      drop(boardId, [id]);
      fail(e);
      return null;
    }
  }

  /** 发一个改动：先改界面、排队发出，回来以后以服务端为准（叠上还在排队的）；失败时界面退回去并抛出 */
  async function send(boardId: string, item: Item, p: PatchItem): Promise<Item> {
    const list = queued.get(item.id) ?? [];
    list.push(p);
    queued.set(item.id, list);
    const settle = () => { list.splice(list.indexOf(p), 1); if (!list.length) queued.delete(item.id); };
    upsert(boardId, applyPatch(item, p));
    try {
      const saved = await enqueue(() => {
        const json = p.baseRev === undefined ? p : { ...p, baseRev: Math.max(p.baseRev, ownRev.get(item.id) ?? 0) };
        return unwrap<Item>(api.boards[':id'].items[':itemId'].$patch({ param: { id: boardId, itemId: item.id }, json }));
      });
      ownRev.set(item.id, saved.rev);
      settle();
      upsert(boardId, withQueued(saved));
      return saved;
    } catch (e) {
      settle();
      upsert(boardId, withQueued(item));
      throw e;
    }
  }

  async function patch(boardId: string, item: Item, p: PatchItem, o: Opt = {}) {
    try {
      const saved = await send(boardId, item, p);
      if ('remindAt' in p || 'remindDone' in p) qc.invalidateQueries({ queryKey: qk.reminders });
      const fields = UNDOABLE.filter(([k]) => k in p);
      if (o.record !== false && fields.length) {
        const back: Record<string, unknown> = {};
        for (const [k] of fields) back[k] = k === 'links' ? item.links ?? [] : (item as Record<string, unknown>)[k];
        pushUndo({
          label: fields[0][1],
          run: async () => {
            const cur = find(boardId, item.id);
            if (!cur) throw new Error('这个元素已经不在这块白板上了');
            // 改回文字时带上现在的 rev：别人在这之后又改过，就照文字冲突处理
            await patch(boardId, cur, { ...back, ...('text' in back ? { baseRev: cur.rev } : {}) } as PatchItem, { record: false });
          },
        });
      }
      return saved;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && 'text' in p) {
        upsert(boardId, e.data.item);
        conflictStore.set({ boardId, theirs: e.data.item, mine: p.text! });
      } else fail(e);
      return null;
    }
  }

  /** 多张一起拖：一次全部挪过去再逐个保存，撤销时一起挪回来；没存上的那几张退回原处 */
  async function patchMany(boardId: string, updates: { item: Item; patch: PatchItem }[], o: Opt = {}) {
    const results = await Promise.allSettled(updates.map((u) => send(boardId, u.item, u.patch)));
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) fail(failed.reason);
    const moved = updates.filter((_, i) => results[i].status === 'fulfilled');
    if (o.record !== false && moved.length) {
      pushUndo({
        label: `移动 ${moved.length} 项`,
        run: () => patchMany(boardId, moved.flatMap((u) => {
          const cur = find(boardId, u.item.id);
          return cur ? [{ item: cur, patch: { x: u.item.x, y: u.item.y } }] : [];
        }), { record: false }),
      });
    }
  }

  /** 撤销一次挪动：挪回原来的白板；从废纸篓挪回来的，到期时间也恢复原样 */
  const moveBack = (original: Item, moved: Item) =>
    move(moved.boardId, moved, original.boardId, moved.boardId === TRASH ? { expiresAt: original.expiresAt } : {}, { record: false });

  /** 白板上的删除是进废纸篓，可以撤销；废纸篓里的删除是彻底删除 */
  async function removeMany(boardId: string, list: Item[], o: Quiet = {}) {
    if (!list.length) return;
    drop(boardId, list.map((x) => x.id));
    const failed: Item[] = [];
    const done: { original: Item; trashed: Item }[] = [];
    await enqueue(async () => {
      for (const it of list) {
        try {
          const r = await unwrap<{ item: Item | null }>(api.boards[':id'].items[':itemId'].$delete({ param: { id: boardId, itemId: it.id } }));
          if (r.item) done.push({ original: it, trashed: r.item });
        } catch { failed.push(it); }
      }
    });
    if (failed.length) {
      setItems(boardId, (items) => [...items, ...failed]);
      toast.error(`有 ${failed.length} 项没删掉`);
    }
    if (boardId === TRASH) {
      if (!failed.length && !o.quiet) toast(list.length > 1 ? `已彻底删除 ${list.length} 项` : '已彻底删除');
      return;
    }
    if (done.length) pruneTrash(); else refresh(TRASH);
    if (!done.length) return;
    const label = done.length > 1 ? `删除 ${done.length} 项` : '删除';
    const entry = o.record === false ? null : pushUndo({ label, run: async () => { for (const d of done) await moveBack(d.original, d.trashed); } });
    if (!o.quiet) {
      toast(done.length > 1 ? `已删除 ${done.length} 项，在废纸篓里留 30 天` : '已删除，在废纸篓里留 30 天', entry ? { action: { label: '撤销', onClick: () => { undoEntry(entry); } } } : undefined);
    }
  }
  const remove = (boardId: string, item: Item, o?: Quiet) => removeMany(boardId, [item], o);

  /** 挪到另一块白板；从废纸篓里不指定目标就是放回原处 */
  async function move(boardId: string, item: Item, to?: string, opts: Omit<MoveItem, 'to'> = {}, o: Opt = {}) {
    drop(boardId, [item.id]);
    try {
      const r = await enqueue(() => unwrap<{ item: Item; to: string }>(
        api.boards[':id'].items[':itemId'].move.$post({ param: { id: boardId, itemId: item.id }, json: { to, ...opts } })));
      ownRev.set(r.item.id, r.item.rev);
      // 目标白板的数据已经在本机：直接放进去，不等下一轮同步
      if (qc.getQueryData(qk.items(r.to))) upsert(r.to, r.item);
      if (r.to === TRASH) pruneTrash(); else refresh(r.to);
      qc.invalidateQueries({ queryKey: qk.reminders });
      if (o.record !== false && boardId !== TRASH) {
        pushUndo({ label: r.to === TRASH ? '丢入废纸篓' : '移到其他白板', run: () => moveBack(item, r.item) });
      }
      return r;
    } catch (e) {
      upsert(boardId, item);
      fail(e);
      return null;
    }
  }

  /** 提醒点了「知道了」：卡片在本机就照常改；不在本机（别的白板上的、已经没了的）交给服务端，元素没了它会把这条提醒删掉 */
  async function ackReminder(r: Reminder) {
    const it = find(r.boardId, r.itemId);
    if (it) { await patch(r.boardId, it, { remindDone: true }); return; }
    try {
      await enqueue(() => unwrap(api.reminders.done.$post({ json: r })));
    } catch (e) { fail(e); }
    qc.invalidateQueries({ queryKey: qk.reminders });
  }

  async function clearTrash() {
    try {
      let removed = 0;
      await drain(async () => {
        const r = await enqueue(() => unwrap<{ removed: number; remaining: number }>(api.boards[':id'].items.$delete({ param: { id: TRASH } })));
        removed += r.removed;
        return r.remaining > 0 && r.removed > 0;
      });
      setItems(TRASH, () => []);
      toast(`废纸篓已清空（${removed} 项）`);
    } catch (e) { fail(e); }
  }

  async function createBoard(name: string) {
    try {
      const b = await enqueue(() => unwrap<Board>(api.boards.$post({ json: { name } })));
      await qc.invalidateQueries({ queryKey: qk.boards });
      return b;
    } catch (e) { fail(e); return null; }
  }
  async function renameBoard(id: string, name: string) {
    qc.setQueryData<Board[]>(qk.boards, (bs) => bs?.map((b) => (b.id === id ? { ...b, name } : b)));
    try { await enqueue(() => unwrap(api.boards[':id'].$patch({ param: { id }, json: { name } }))); }
    catch (e) { fail(e); }
    qc.invalidateQueries({ queryKey: qk.boards });
  }
  async function deleteBoard(id: string) {
    try {
      // 元素多的白板后端一次挪不完，接着调到挪完、白板真的删掉
      let trashed = 0;
      await drain(async () => {
        const r = await enqueue(() => unwrap<{ trashed: number; remaining: number }>(api.boards[':id'].$delete({ param: { id } })));
        trashed += r.trashed;
        return r.remaining > 0 && r.trashed > 0;
      });
      await qc.invalidateQueries({ queryKey: qk.boards });
      if (trashed) pruneTrash();
      toast(trashed ? `白板已删除，上面的 ${trashed} 项进了废纸篓` : '白板已删除');
      return true;
    } catch (e) { fail(e); return false; }
  }

  return { create, patch, patchMany, remove, removeMany, move, ackReminder, clearTrash, createBoard, renameBoard, deleteBoard };
}
export type Actions = ReturnType<typeof createActions>;

/** 同一个 QueryClient 下始终是同一组函数，可以放心放进依赖数组和撤销记录 */
export function useActions(): Actions {
  const qc = useQueryClient();
  return useMemo(() => createActions(qc), [qc]);
}
