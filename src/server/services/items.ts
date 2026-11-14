// 元素的业务规则：新建、修改、删除（进废纸篓）、到期、换白板、彻底删除
import { HTTPException } from 'hono/http-exception';
import { BATCH, DEFAULT_TTL, TRASH, TRASH_KEEP, expiryFrom, isAlive } from '../../shared/constants';
import { newId } from '../../shared/ids';
import { isFileLike, itemBase, mergePatch } from '../../shared/items';
import type { Board, CreateItemBody, FileLikeItem, Item, PatchItem } from '../../shared/schema';
import type { Ctx } from '../env';
import { intakeFile } from './intake';

/** 文件名里不能有路径分隔符和控制字符 */
export const safeName = (s: string) => s.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200) || 'file';

/** 能往上放新元素的白板：不存在的、废纸篓都不行。快捷指令里写的是白板名字，byName 时也按名字找 */
export async function boardForNew(ctx: Ctx, idOrName: string, byName = false): Promise<Board | null> {
  const board = byName ? await ctx.db.findBoard(idOrName) : (await ctx.db.boards()).find((b) => b.id === idOrName);
  return board && board.id !== TRASH ? board : null;
}

export function newItemBase(boardId: string, x: number, y: number, ttl: number | null, id = newId()) {
  const now = Date.now();
  return itemBase({ id, boardId, x, y, now, expiresAt: expiryFrom(ttl, now) });
}

/** 网页上新建：便利贴、位置直接存；文件要已经传上来了，聊天记录压缩包会拆开。返回它本身（压缩包变成的便利贴） */
export async function createItem(ctx: Ctx, boardId: string, b: CreateItemBody): Promise<Item> {
  const base = newItemBase(boardId, b.x, b.y, b.ttl, b.id);
  if (b.type === 'note' || b.type === 'location') {
    const { id: _i, x: _x, y: _y, ttl: _t, ...content } = b;
    const item = { ...base, ...content } as Item;
    await ctx.db.putItem(item);
    return item;
  }
  const len = await ctx.files.size(b.file.id);
  if (len === null) throw new HTTPException(400, { message: '文件还没传上去' });
  const saved = await intakeFile(ctx, { ...base, type: b.type, file: { ...b.file, name: safeName(b.file.name) } }, len);
  if (!saved) {
    await ctx.files.delete(b.file.id);
    throw new HTTPException(400, { message: '文件超过 100 MB' });
  }
  return saved[0];
}

/** 按字段合并：读最新的那份，只覆盖这次带来的字段。改文字时 baseRev 对不上（别人刚改过）返回 conflict，什么都不存 */
export async function patchItem(ctx: Ctx, prev: Item, p: PatchItem): Promise<{ item: Item } | { conflict: Item }> {
  if (prev.type === 'note' && p.text !== undefined && p.baseRev !== undefined && p.baseRev !== prev.rev && p.text !== prev.text) return { conflict: prev };
  const now = Date.now();
  const next: Item = { ...mergePatch(prev, p, now), rev: prev.rev + 1, updatedAt: now };
  await ctx.db.putItem(next, prev);
  // 位置卡片换了缩略图：旧的那张没人用了
  if (prev.type === 'location' && next.type === 'location' && prev.thumb && prev.thumb.id !== next.thumb?.id) ctx.defer(ctx.files.delete(prev.thumb.id));
  return { item: next };
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

/** 到期了：白板上的进废纸篓，废纸篓里的真删 */
export function expire(ctx: Ctx, it: Item): Promise<unknown> {
  return it.boardId === TRASH ? purge(ctx, it) : toTrash(ctx, it);
}

/** 读一批元素；顺手处理到期的，把「上传中」且文件已到的转成正常卡片 */
export async function listItems(ctx: Ctx, boardId: string, ids: string[]): Promise<Item[]> {
  const got = await ctx.db.getItems(boardId, ids);
  const now = Date.now();
  const out: Item[] = [];
  for (const [i, it] of got.entries()) {
    if (!isAlive(it, now)) { ctx.defer(expire(ctx, it)); continue; }
    // 转成别的样子会变大：按转好的大小重新挑位置，避开已经排好的和还没轮到的
    if (isFileLike(it) && it.pending) out.push(...(await settlePending(ctx, it, [...out, ...got.slice(i + 1)])));
    else out.push(it);
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

/** 快捷指令发来的「上传中」元素：文件到了就转成正式卡片；超过大小上限的连文件一起删掉 */
async function settlePending(ctx: Ctx, it: FileLikeItem, others: Item[]): Promise<Item[]> {
  const len = await ctx.files.size(it.file.id);
  if (len === null) return [it];
  const saved = await intakeFile(ctx, it, len, { others });
  if (saved) return saved;
  await purge(ctx, it);
  return [];
}

/** 挑空位时参考的元素：白板上东西很多时只看一批（读不了全部），偶尔会压到没看的那些。只读，不顺手转换别的元素 */
export async function nearby(ctx: Ctx, boardId: string): Promise<Item[]> {
  const index = await ctx.db.index(boardId);
  const now = Date.now();
  return (await ctx.db.getItems(boardId, index.slice(0, BATCH).map((e) => e.id))).filter((it) => isAlive(it, now));
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

/** 删白板的一批：上面的元素挪进废纸篓；remaining 是白板上还剩多少 */
export async function trashBoard(ctx: Ctx, boardId: string): Promise<{ trashed: number; remaining: number }> {
  const index = await ctx.db.index(boardId);
  const items = await ctx.db.getItems(boardId, index.slice(0, CHUNK).map((e) => e.id));
  for (const it of items) await toTrash(ctx, it);
  return { trashed: items.length, remaining: Math.max(0, index.length - CHUNK) };
}
