// 元素的规则里前后端都要算的部分：新建时的基础字段、按字段合并改动。
// 服务端按它存，前端按它先改界面（乐观更新），两边结果才对得上
import { DAY, expiryFrom } from './constants';
import type { FileLikeItem, Item, PatchItem } from './schema';

export const isFileLike = (it: Item | undefined): it is FileLikeItem => it?.type === 'image' || it?.type === 'file';

/** 每种元素都有的字段；rev 为 0 表示本机刚建、服务端还没确认；by 是谁建的 */
export const itemBase = (o: { id: string; boardId: string; x: number; y: number; now: number; expiresAt: number | null; by: string; rev?: number }) => ({
  id: o.id, boardId: o.boardId, x: o.x, y: o.y, createdAt: o.now, updatedAt: o.now,
  expiresAt: o.expiresAt, remindAt: null, remindDone: false, rev: o.rev ?? 1, by: o.by, editedAt: o.now,
});

/**
 * 把一次改动合并进元素：只改这次带来的、而且这种元素有的字段（rev、updatedAt 由调用方管）。
 * 内容（文字、地名）真的变了才算编辑，记下 by 是谁改的；拖动、换颜色、保留时长、提醒、连线不算。
 * 设了提醒就重新等着响；提醒比到期还晚时，到期往后推到提醒后一天
 */
export function mergePatch(prev: Item, p: PatchItem, now: number, by: string): Item {
  const next: Item = { ...prev };
  let edited = false;
  if (p.x !== undefined) next.x = p.x;
  if (p.y !== undefined) next.y = p.y;
  if (next.type === 'note') {
    if (p.text !== undefined && p.text !== next.text) { next.text = p.text; edited = true; }
    if (p.color !== undefined) next.color = p.color;
  }
  if (next.type === 'location') {
    if (p.name !== undefined && p.name !== next.name) { next.name = p.name; edited = true; }
    if (p.thumb !== undefined) next.thumb = p.thumb;
  }
  if (edited) { next.by = by; next.editedAt = now; }
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
