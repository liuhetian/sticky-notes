// 读：先比 etag，只取变了的元素。什么时候读看设置里的「自动同步」：
// 开着按固定间隔拉；关着只在打开页面、切回页面时拉一次（main.tsx 的 refetchOnWindowFocus），省边缘函数的用量。
// 白板上有「上传中」的卡片时不管开没开，都每 5 秒看一次，直到它转正
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { BATCH, isAlive } from '@/shared/constants';
import type { Board, IndexEntry, Item, Reminder } from '@/shared/schema';
import { api, serverNow, syncClock, unwrap } from '../api/client';
import { syncStore } from './stores';
import { isWriting, writeSeq, writesDone } from './writes';

export const qk = {
  boards: ['boards'] as const,
  items: (boardId: string) => ['items', boardId] as const,
  reminders: ['reminders'] as const,
  names: ['names'] as const,
};

/** 开着自动同步才按这个间隔拉，关着不定时拉 */
const every = (on: boolean, ms: number) => (on ? ms : false);

export function useBoards() {
  const sync = syncStore.use();
  return useQuery({
    queryKey: qk.boards,
    queryFn: async () => (await unwrap<{ boards: Board[] }>(api.boards.$get())).boards,
    refetchInterval: every(sync, 30_000),
  });
}

/** 名字怎么显示、登录页能选谁：部署配置里定的，一次打开页面只取一次 */
export function useNames() {
  return useQuery({
    queryKey: qk.names,
    queryFn: () => unwrap<{ names: Record<string, string>; login: string[] }>(api.names.$get()),
    staleTime: Infinity,
  });
}

// 每块白板记一份「元素 id → etag」，同步时只取 etag 变了的
// 手机快捷指令发来、还在传的元素每轮都重取，等它转成正常卡片
const isPending = (it?: Item) => !!it && (it.type === 'image' || it.type === 'file') && !!it.pending;
const etags = new Map<string, Map<string, string>>();

/** 同步一块白板：一块最多 50 个元素，变了的一次取完 */
export async function syncBoard(qc: QueryClient, boardId: string): Promise<Item[]> {
  const cached = qc.getQueryData<Item[]>(qk.items(boardId));
  // 本机正在写：这轮先不覆盖；这块白板还没读过（刚切过来）就等写完再读，不能拿空的当结果
  if (isWriting()) { if (cached) return cached; await writesDone(); }
  const prev = cached ?? [];
  const seq = writeSeq();
  const idx = await unwrap<{ items: IndexEntry[]; now: number }>(api.boards[':id'].etags.$get({ param: { id: boardId } }));
  syncClock(idx.now);
  const known = etags.get(boardId) ?? new Map<string, string>();
  const prevById = new Map(prev.map((it) => [it.id, it]));
  // 偶尔有人同时放、超出了一两个：这次没取到的不记 etag，下一轮自然补上
  const need = idx.items
    .filter((e) => known.get(e.id) !== e.etag || !prevById.has(e.id) || isPending(prevById.get(e.id)))
    .map((e) => e.id)
    .slice(0, BATCH);
  const fetched = new Map<string, Item>();
  if (need.length) {
    const r = await unwrap<{ items: Item[] }>(api.boards[':id'].items.$get({ param: { id: boardId }, query: { ids: need.join(',') } }));
    for (const it of r.items) fetched.set(it.id, it);
  }
  if (seq !== writeSeq() || isWriting()) return cached ? qc.getQueryData<Item[]>(qk.items(boardId)) ?? prev : syncBoard(qc, boardId);
  const nextEtags = new Map<string, string>();
  const next: Item[] = [];
  for (const e of idx.items) {
    const it = need.includes(e.id) ? fetched.get(e.id) : prevById.get(e.id);
    if (!it) continue; // 到期了，服务端不返回
    next.push(it);
    nextEtags.set(e.id, e.etag);
  }
  etags.set(boardId, nextEtags);
  return next.sort((a, b) => a.createdAt - b.createdAt);
}

export const itemsQuery = (qc: QueryClient, boardId: string) => ({ queryKey: qk.items(boardId), queryFn: () => syncBoard(qc, boardId) });

export function useItems(boardId: string | undefined) {
  const qc = useQueryClient();
  const sync = syncStore.use();
  return useQuery({
    ...itemsQuery(qc, boardId ?? ''),
    enabled: !!boardId,
    refetchInterval: (q) => (sync || q.state.data?.some(isPending) ? 5000 : false),
    select: (items) => items.filter((it) => isAlive(it, serverNow())),
  });
}

/** 提醒列表：到点由页面自己计时（useReminders），这里只管拿到有哪些 */
export function useReminderList() {
  const sync = syncStore.use();
  return useQuery({
    queryKey: qk.reminders,
    queryFn: async () => {
      const r = await unwrap<{ reminders: Reminder[]; now: number }>(api.reminders.$get());
      syncClock(r.now);
      return r.reminders;
    },
    refetchInterval: every(sync, 60_000),
  });
}
