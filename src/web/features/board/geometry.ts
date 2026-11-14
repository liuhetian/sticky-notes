// 画布的尺寸约定和几个纯计算
import type { Item, ItemType } from '@/shared/schema';

export type Pos = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };
/** 当前看得见的那一块（画布坐标） */
export type View = Box;

/** 画布至少这么大，只有元素真摆到外面才往外长；和服务端 services/place.ts 的 CENTER 对应 */
export const BASE_W = 3000, BASE_H = 2000, MARGIN = 300;
export const MIN_SCALE = 0.25, MAX_SCALE = 2;
/** 估计的卡片大小：放新东西时用它保证整张卡片都在视口里 */
export const CARD: Record<ItemType, [number, number]> = { note: [240, 200], image: [280, 300], file: [260, 170], location: [260, 250] };

/** 所有内容的外框；空白板返回 null */
export function contentBox(items: Item[]): Box | null {
  if (!items.length) return null;
  const x0 = Math.min(...items.map((i) => i.x)), y0 = Math.min(...items.map((i) => i.y));
  const x1 = Math.max(...items.map((i) => i.x + CARD[i.type][0])), y1 = Math.max(...items.map((i) => i.y + CARD[i.type][1]));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 内容的中心；空白板是画布中央 */
export function contentCenter(items: Item[]): Pos {
  const b = contentBox(items);
  return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: BASE_W / 2, y: BASE_H / 2 };
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
  for (const it of items) { w = Math.max(w, it.x + CARD[it.type][0]); h = Math.max(h, it.y + CARD[it.type][1]); }
  for (const b of extra) { w = Math.max(w, b.x + b.w); h = Math.max(h, b.y + b.h); }
  return { w: Math.max(BASE_W, view.w, w + MARGIN), h: Math.max(BASE_H, view.h, h + MARGIN) };
}
