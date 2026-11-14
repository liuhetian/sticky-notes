// 快捷指令发来的东西没有坐标，服务端替它挑位置：
// 以白板现有内容的重心为圆心（空白板用画布中央），一圈圈往外找离中心最近、不压着别人的空位。
// 打开白板时视角正对内容中心，所以新来的一打开就在眼前
import { CANVAS, COORD_MAX, EDGE, sizeOf, type Size } from '../../shared/layout';
import type { ItemType } from '../../shared/schema';

type Placeable = { type: ItemType; text?: string; x: number; y: number };

const GAP = 24, STEP = 40, MAX_RING = 80;

/** 第 r 圈（棋盘距离）上的格子 */
function ring(r: number): [number, number][] {
  if (!r) return [[0, 0]];
  const out: [number, number][] = [];
  for (let i = -r; i <= r; i++) out.push([i, -r], [i, r]);
  for (let j = -r + 1; j < r; j++) out.push([-r, j], [r, j]);
  return out;
}

export function autoPlace(items: Placeable[], size: Size = sizeOf({ type: 'note' })): { x: number; y: number } {
  const rects = items.map((it) => ({ x: it.x, y: it.y, ...sizeOf(it) }));
  // 圆心取各卡片中心的平均：比外框中心稳，一张放偏了不会把后面的越带越偏
  const c = rects.length
    ? { x: rects.reduce((t, r) => t + r.x + r.w / 2, 0) / rects.length, y: rects.reduce((t, r) => t + r.y + r.h / 2, 0) / rects.length }
    : { x: CANVAS.w / 2, y: CANVAS.h / 2 };
  const ox = Math.round(c.x - size.w / 2), oy = Math.round(c.y - size.h / 2);
  const free = (x: number, y: number) =>
    x >= EDGE.x && y >= EDGE.y && x + size.w <= COORD_MAX && y + size.h <= COORD_MAX &&
    !rects.some((r) => x < r.x + r.w + GAP && x + size.w + GAP > r.x && y < r.y + r.h + GAP && y + size.h + GAP > r.y);
  for (let r = 0; r <= MAX_RING; r++) {
    let best: { x: number; y: number } | null = null, bestD = Infinity;
    for (const [i, j] of ring(r)) {
      const x = ox + i * STEP, y = oy + j * STEP;
      const d = i * i + j * j;
      if (d < bestD && free(x, y)) { best = { x, y }; bestD = d; }
    }
    if (best) return best;
  }
  return { x: Math.min(COORD_MAX, Math.max(EDGE.x, ox)), y: Math.min(COORD_MAX, Math.max(EDGE.y, oy)) };
}
