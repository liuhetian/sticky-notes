// 元素的规则里前后端都要算的部分：新建时的基础字段、按字段合并改动。
// 服务端按它存，前端按它先改界面（乐观更新），两边结果才对得上
import { DAY, expiryFrom } from './constants';
import type { FileLikeItem, Item, PatchItem } from './schema';

export const isFileLike = (it: Item | undefined): it is FileLikeItem => it?.type === 'image' || it?.type === 'file';

/** 每种元素都有的字段；rev 为 0 表示本机刚建、服务端还没确认 */
export const itemBase = (o: { id: string; boardId: string; x: number; y: number; now: number; expiresAt: number | null; rev?: number }) => ({
  id: o.id, boardId: o.boardId, x: o.x, y: o.y, createdAt: o.now, updatedAt: o.now,
  expiresAt: o.expiresAt, remindAt: null, remindDone: false, rev: o.rev ?? 1,
});

/**
 * 把一次改动合并进元素：只改这次带来的、而且这种元素有的字段（rev、updatedAt 由调用方管）。
 * 设了提醒就重新等着响；提醒比到期还晚时，到期往后推到提醒后一天
 */
export function mergePatch(prev: Item, p: PatchItem, now: number): Item {
  const next: Item = { ...prev };
  if (p.x !== undefined) next.x = p.x;
  if (p.y !== undefined) next.y = p.y;
  if (next.type === 'note') {
    if (p.text !== undefined) next.text = p.text;
    if (p.color !== undefined) next.color = p.color;
  }
  if (next.type === 'location') {
    if (p.name !== undefined) next.name = p.name;
    if (p.thumb !== undefined) next.thumb = p.thumb;
  }
  if (p.ttl !== undefined) next.expiresAt = expiryFrom(p.ttl, now);
  if (p.remindAt !== undefined) { next.remindAt = p.remindAt; next.remindDone = false; }
  if (p.remindDone !== undefined) next.remindDone = p.remindDone;
  if (p.links !== undefined) {
    const seen = new Set<string>();
    next.links = p.links.filter((l) => l.to !== next.id && !seen.has(l.id) && !!seen.add(l.id));
  }
  if (next.remindAt !== null && next.expiresAt !== null && next.expiresAt < next.remindAt + DAY) next.expiresAt = next.remindAt + DAY;
  return next;
}
