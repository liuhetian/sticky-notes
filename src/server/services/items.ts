// 元素的业务规则：新建、删除（进废纸篓）、到期、换白板、彻底删除
import { DEFAULT_TTL, TRASH, TRASH_KEEP, expiryFrom, isAlive } from '../../shared/constants';
import { newId } from '../../shared/ids';
import type { Item } from '../../shared/schema';
import type { Ctx } from '../env';
import { settlePending } from './intake';

export function newItemBase(boardId: string, x: number, y: number, ttl: number | null, id = newId()) {
  const now = Date.now();
  return { id, boardId, x, y, createdAt: now, updatedAt: now, expiresAt: expiryFrom(ttl, now), remindAt: null, remindDone: false, rev: 1 };
}

/** 这个元素占着哪些文件 */
export function fileIdsOf(it: Item): string[] {
  if (it.type === 'image' || it.type === 'file') return [it.file.id];
  if (it.type === 'location' && it.thumb) return [it.thumb.id];
  return [];
}

/** 彻底删除：元素和它的文件都没了，找不回来 */
export async function purge({ db, files }: Ctx, it: Item, { keepFiles = false } = {}) {
  await db.dropItem(it);
  if (!keepFiles) await Promise.all(fileIdsOf(it).map((id) => files.delete(id)));
}

/** 删除和到期都走这里：挪进废纸篓，从这一刻起再留 30 天 */
export async function toTrash({ db }: Ctx, it: Item): Promise<Item> {
  if (it.boardId === TRASH) return it;
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
export async function listItems(ctx: Ctx, boardId: string, ids?: string[]): Promise<Item[]> {
  const got = await ctx.db.getItems(boardId, ids);
  const now = Date.now();
  const out: Item[] = [];
  for (const [i, it] of got.entries()) {
    if (!isAlive(it, now)) { ctx.defer(expire(ctx, it)); continue; }
    // 转成别的样子会变大：按转好的大小重新挑位置，避开已经排好的和还没轮到的
    if ((it.type === 'image' || it.type === 'file') && it.pending) out.push(...(await settlePending(ctx, it, [...out, ...got.slice(i + 1)])));
    else out.push(it);
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
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
