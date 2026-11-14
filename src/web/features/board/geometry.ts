// 画布的几个纯计算。尺寸约定（画布多大、卡片多大、边界）在 shared/layout.ts，和服务端挑位置用的是同一份
import { CANVAS, sizeOf, type Box, type Pos } from '@/shared/layout';
import type { Item } from '@/shared/schema';

export type { Box, Pos };
/** 当前看得见的那一块（画布坐标） */
export type View = Box;

/** 内容外面再留这么多空，才有地方往外放东西 */
const MARGIN = 300;
export const MIN_SCALE = 0.25, MAX_SCALE = 2;
/** 卡片拖到画布右下边时，至少还露出这么多 */
export const PEEK = 80;

/** 所有内容的外框；空白板返回 null */
export function contentBox(items: Item[]): Box | null {
  if (!items.length) return null;
  const boxes = items.map((it) => ({ x: it.x, y: it.y, ...sizeOf(it) }));
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 内容的中心；空白板是画布中央 */
export function contentCenter(items: Item[]): Pos {
  const b = contentBox(items);
  return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: CANVAS.w / 2, y: CANVAS.h / 2 };
}

/** 推荐的比例：能把所有内容看全，最大 100%（内容少就不放大）。screen 是视口的屏幕尺寸 */
export function fitScale(items: Item[], screen: { w: number; h: number }): number {
  const b = contentBox(items);
  if (!b) return 1;
  // 四周留白：上面有标题，下面有操作栏
  return Math.max(MIN_SCALE, Math.min(1, (screen.w - 96) / b.w, (screen.h - 180) / b.h));
}

/** 画布要多大才装得下这些东西 */
export function worldSize(view: View, items: Item[], extra: Box[]) {
  let w = 0, h = 0;
  for (const b of [...items.map((it) => ({ x: it.x, y: it.y, ...sizeOf(it) })), ...extra]) { w = Math.max(w, b.x + b.w); h = Math.max(h, b.y + b.h); }
  return { w: Math.max(CANVAS.w, view.w, w + MARGIN), h: Math.max(CANVAS.h, view.h, h + MARGIN) };
}
