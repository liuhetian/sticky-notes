// 元素的业务规则：新建、修改、删除（进废纸篓）、到期、换白板、彻底删除；白板上限、废纸篓修剪。
// 网页、快捷指令、AI 三个入口都调这里，路由只管取参数和回状态码
import { HTTPException } from 'hono/http-exception';
import { BATCH, BOARD_FULL, BOARD_MAX, DEFAULT_TTL, TRASH, TRASH_KEEP, expiryFrom, isAlive } from '../../shared/constants';
import { newId } from '../../shared/ids';
import { isFileLike, itemBase, mergePatch } from '../../shared/items';
import { sizeOf, type Pos, type Size } from '../../shared/layout';
import type { Board, CreateItemBody, FileLikeItem, Item, MoveItem, NoteItem, PatchItem } from '../../shared/schema';
import type { Ctx } from '../env';
import { intakeFile } from './intake';
import { autoPlace } from './place';

/** 读白板时顺手做的事（到期的挪走、「上传中」的转正）一次最多几个：读整块白板已经用掉大半请求额度 */
export const CHANGES = 2;

/** 文件名里不能有路径分隔符和控制字符 */
export const safeName = (s: string) => s.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200) || 'file';

/** 按 id 或名字找白板；找不到时把现有的白板列出来，方便照着改 */
export async function boardNamed(ctx: Ctx, idOrName: string): Promise<Board> {
  const board = await ctx.db.findBoard(idOrName);
  if (board) return board;
  const names = (await ctx.db.boards()).map((b) => b.name).join('、');
  throw new HTTPException(404, { message: `没有「${idOrName}」这块白板，现有的：${names}` });
}

/** 能往上放新元素的白板：不存在的、废纸篓都不行 */
export async function boardForNew(ctx: Ctx, idOrName: string): Promise<Board> {
  const board = await boardNamed(ctx, idOrName);
  if (board.id === TRASH) throw new HTTPException(400, { message: '废纸篓里不能直接贴东西，换一块白板' });
  return board;
}

/** 这个元素；没有就 404 */
export async function itemOr404(ctx: Ctx, boardId: string, id: string): Promise<Item> {
  const it = await ctx.db.getItem(boardId, id);
  if (!it) throw new HTTPException(404, { message: '这个元素没了（可能已过期、被删或挪走了），重新读一遍白板' });
  return it;
}

/** 白板放不下了就拒绝。count 是现在有几个（list 的结果，正在上传的也算）；两个人同时放多出一两个无害 */
export function assertRoom(count: number, n = 1) {
  if (count + n > BOARD_MAX) throw new HTTPException(409, { message: BOARD_FULL });
}

/**
 * 新元素放哪，顺带检查放不放得下：给了位置就用它（只 list 一次数个数）；
 * 没给就读整块白板，在现有内容中心附近挑个空位，others 是读到的那些（聊天记录一整组挑位置时还要用）
 */
export async function spotFor(ctx: Ctx, boardId: string, size: Size, pos: Partial<Pos> = {}): Promise<Pos & { others?: Item[] }> {
  if (pos.x !== undefined && pos.y !== undefined) {
    assertRoom((await ctx.db.index(boardId)).length);
    return { x: pos.x, y: pos.y };
  }
  const index = await ctx.db.index(boardId);
  assertRoom(index.length);
  const now = Date.now();
  const others = (await ctx.db.getItems(boardId, index.slice(0, BATCH).map((e) => e.id))).filter((it) => isAlive(it, now));
  return { ...autoPlace(others, size), others };
}

export function newItemBase(ctx: Ctx, boardId: string, pos: Pos, ttl: number | null, id = newId()) {
  const now = Date.now();
  return itemBase({ id, boardId, x: pos.x, y: pos.y, now, expiresAt: expiryFrom(ttl, now), by: ctx.by });
}

/**
 * 新建（网页和 AI 共用）：便利贴、位置直接存；文件要已经传上来了，聊天记录压缩包会拆开。
 * 便利贴不给颜色时用 color（网页黄色、AI 白色）。返回它本身（压缩包变成的便利贴）；
 * id 是前端定的：同一个请求重发时，原样返回已经建好的那个，created 为 false
 */
export async function createItem(ctx: Ctx, boardIdOrName: string, b: CreateItemBody, color: NoteItem['color'] = 'yellow'): Promise<{ item: Item; created: boolean }> {
  const board = await boardForNew(ctx, boardIdOrName);
  const dup = b.id ? await ctx.db.getItem(board.id, b.id) : null;
  if (dup) return { item: dup, created: false };
  const { id, x, y, ttl, ...content } = b;
  const spot = await spotFor(ctx, board.id, sizeOf(content), { x, y });
  const base = newItemBase(ctx, board.id, spot, ttl, id);
  if (content.type === 'note' || content.type === 'location') {
    const item = { ...base, ...content, ...(content.type === 'note' ? { color: content.color ?? color } : {}) } as Item;
    await ctx.db.putItem(item);
    return { item, created: true };
  }
  const len = await ctx.files.size(content.file.id);
  if (len === null) throw new HTTPException(400, { message: '文件还没传上去：先 PUT 到上传地址，传完再建' });
  const saved = await intakeFile(ctx, { ...base, type: content.type, file: { ...content.file, name: safeName(content.file.name) } }, len, spot.others);
  if (!saved) {
    await ctx.files.delete(content.file.id);
    throw new HTTPException(400, { message: '文件超过 100 MB' });
  }
  return { item: saved[0], created: true };
}

/** 「把原文换成新文字」→ 整段新文字。原文要恰好出现一次；原文为空就在末尾加一行 */
function replaceText(prev: NoteItem, old: string, next: string): string | { conflict: string } {
  if (!old) return prev.text.trim() ? `${prev.text.replace(/\s+$/, '')}\n${next}` : next;
  const n = prev.text.split(old).length - 1;
  if (n === 0) return { conflict: '原文在便利贴里没找到（多半是别人刚改过）：item 是最新的内容，照它重新给原文再改' };
  if (n > 1) throw new HTTPException(400, { message: `原文在便利贴里出现了 ${n} 次：多带一点前后文，让它只出现一次` });
  return prev.text.replace(old, () => next);
}

/**
 * 按字段合并：读最新的那份，只覆盖这次带来的字段。改文字有两种写法：
 *   text + baseRev：整段换掉，baseRev 对不上（别人刚改过）就是冲突；
 *   old + new：把原文换成新文字，原文找不到就是冲突。
 * 冲突时什么都不存，返回最新的那份和说明
 */
export async function patchItem(ctx: Ctx, prev: Item, p: PatchItem): Promise<{ item: Item } | { conflict: Item; error: string }> {
  const { old, new: next, ...rest } = p;
  let patch: PatchItem = rest;
  if (next !== undefined || old !== undefined) {
    if (prev.type !== 'note') throw new HTTPException(400, { message: '只有便利贴能改文字' });
    if (next === undefined) throw new HTTPException(400, { message: '给了 old 就要给 new：把 old 这段原文换成 new' });
    if (rest.text !== undefined) throw new HTTPException(400, { message: '改文字二选一：给 text（整段换掉），或者给 old 和 new（换掉其中一段）' });
    const text = replaceText(prev, old ?? '', next);
    if (typeof text !== 'string') return { conflict: prev, error: text.conflict };
    const { baseRev: _b, ...others } = rest;
    patch = { ...others, text };
  } else if (prev.type === 'note' && p.text !== undefined && p.baseRev !== undefined && p.baseRev !== prev.rev && p.text !== prev.text) {
    return { conflict: prev, error: '这张便利贴刚被别人改过' };
  }
  const now = Date.now();
  const item: Item = { ...mergePatch(prev, patch, now, ctx.by), rev: prev.rev + 1, updatedAt: now };
  await ctx.db.putItem(item, prev);
  // 位置卡片换了缩略图：旧的那张没人用了
  if (prev.type === 'location' && item.type === 'location' && prev.thumb && prev.thumb.id !== item.thumb?.id) ctx.defer(ctx.files.delete(prev.thumb.id));
  return { item };
}

/** 这个元素占着哪些文件 */
export function fileIdsOf(it: Item): string[] {
  if (isFileLike(it)) return [it.file.id];
  if (it.type === 'location' && it.thumb) return [it.thumb.id];
  return [];
}

/** 彻底删除：元素和它的文件都没了，找不回来 */
export async function purge({ db, files }: Ctx, it: Item) {
  await db.dropItem(it);
  await Promise.all(fileIdsOf(it).map((id) => files.delete(id)));
}

/** 删除和到期都走这里：挪进废纸篓，从这一刻起再留 30 天 */
export async function toTrash({ db }: Ctx, it: Item): Promise<Item> {
  const now = Date.now();
  const moved: Item = { ...it, boardId: TRASH, from: it.boardId, expiresAt: now + TRASH_KEEP, rev: it.rev + 1, updatedAt: now };
  await db.relocate(it, moved);
  return moved;
}

/**
 * 换到另一块白板。从废纸篓放回来要重新计时：指定了 expiresAt 就用它（撤销删除时恢复原样），
 * 否则按 ttl（没给就用默认保留时长）
 */
export async function moveTo(ctx: Ctx, it: Item, to: string, opts: { ttl?: number | null; expiresAt?: number | null } = {}): Promise<Item> {
  if (to === TRASH) return toTrash(ctx, it);
  const now = Date.now();
  const moved: Item = { ...it, boardId: to, rev: it.rev + 1, updatedAt: now };
  delete moved.from;
  if (it.boardId === TRASH) {
    moved.expiresAt = opts.expiresAt !== undefined ? opts.expiresAt : expiryFrom(opts.ttl === undefined ? DEFAULT_TTL : opts.ttl, now);
  }
  await ctx.db.relocate(it, moved);
  return moved;
}

/** 挪到 body.to（id 或名字）；从废纸篓里不指定目标就放回原处，原处没了回第一块。目标白板满了就拒绝 */
export async function moveItem(ctx: Ctx, fromId: string, itemId: string, body: MoveItem): Promise<{ item: Item; to: string }> {
  const it = await itemOr404(ctx, fromId, itemId);
  let to: string;
  if (body.to) to = (await boardNamed(ctx, body.to)).id;
  else if (fromId === TRASH) {
    const boards = await ctx.db.boards();
    to = boards.some((b) => b.id === it.from) ? it.from! : boards[0].id;
  } else throw new HTTPException(400, { message: '要说明挪到哪块白板（to）' });
  if (to === fromId) throw new HTTPException(400, { message: '已经在这块白板上了' });
  if (to !== TRASH) assertRoom((await ctx.db.index(to)).length);
  return { item: await moveTo(ctx, it, to, body), to };
}

/** 到期了：白板上的进废纸篓，废纸篓里的真删 */
export function expire(ctx: Ctx, it: Item): Promise<unknown> {
  return it.boardId === TRASH ? purge(ctx, it) : toTrash(ctx, it);
}

/**
 * 读这几个元素（最多 BATCH 个）；顺手处理到期的，把「上传中」且文件已到的转成正常卡片。
 * 顺手的事一次最多做 CHANGES 个，剩下的留给下一次读：到期的照样不返回，「上传中」的原样返回
 */
export async function listItems(ctx: Ctx, boardId: string, ids: string[]): Promise<Item[]> {
  const got = await ctx.db.getItems(boardId, ids);
  const now = Date.now();
  const out: Item[] = [];
  let changes = 0;
  for (const [i, it] of got.entries()) {
    if (!isAlive(it, now)) {
      if (changes < CHANGES) { changes++; ctx.defer(expire(ctx, it)); }
      continue;
    }
    // 转成别的样子会变大：按转好的大小重新挑位置，避开已经排好的和还没轮到的
    if (isFileLike(it) && it.pending && changes < CHANGES) {
      changes++;
      out.push(...(await settlePending(ctx, it, [...out, ...got.slice(i + 1)])));
    } else out.push(it);
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

/** 快捷指令发来的「上传中」元素：文件到了就转成正式卡片；超过大小上限的连文件一起删掉 */
async function settlePending(ctx: Ctx, it: FileLikeItem, others: Item[]): Promise<Item[]> {
  const len = await ctx.files.size(it.file.id);
  if (len === null) return [it];
  const saved = await intakeFile(ctx, it, len, others);
  if (saved) return saved;
  await purge(ctx, it);
  return [];
}

/** 彻底删一个、挪一个都要好几次请求，所以清空废纸篓和删白板一次只做这么多，由前端接着调直到做完 */
const CHUNK = 6;

/** 清空废纸篓的一批；remaining 是还剩多少没删 */
export async function clearTrash(ctx: Ctx): Promise<{ removed: number; remaining: number }> {
  const index = await ctx.db.index(TRASH);
  const items = await ctx.db.getItems(TRASH, index.slice(0, CHUNK).map((e) => e.id));
  await Promise.all(items.map((it) => purge(ctx, it)));
  return { removed: items.length, remaining: Math.max(0, index.length - CHUNK) };
}

/**
 * 废纸篓最多留 BOARD_MAX 个：超出时把最早进去的彻底删掉，一次最多删 CHANGES 个；remaining 是删完还超出几个。
 * 超出很多时读不完全部，只在读到的 BATCH 个里挑最早的，所以「最早」只是大致准。没超出时只 list 一次
 */
export async function pruneTrash(ctx: Ctx): Promise<{ removed: number; remaining: number }> {
  const index = await ctx.db.index(TRASH);
  const over = index.length - BOARD_MAX;
  if (over <= 0) return { removed: 0, remaining: 0 };
  const items = await ctx.db.getItems(TRASH, index.slice(0, BATCH).map((e) => e.id));
  // 进废纸篓时 expiresAt 设成「那一刻 + 30 天」：越小越早进来
  const oldest = items.sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity)).slice(0, Math.min(over, CHANGES));
  await Promise.all(oldest.map((it) => purge(ctx, it)));
  return { removed: oldest.length, remaining: over - oldest.length };
}

/** 删白板的一批：上面的元素挪进废纸篓；remaining 是白板上还剩多少 */
export async function trashBoard(ctx: Ctx, boardId: string): Promise<{ trashed: number; remaining: number }> {
  const index = await ctx.db.index(boardId);
  const items = await ctx.db.getItems(boardId, index.slice(0, CHUNK).map((e) => e.id));
  for (const it of items) await toTrash(ctx, it);
  return { trashed: items.length, remaining: Math.max(0, index.length - CHUNK) };
}
