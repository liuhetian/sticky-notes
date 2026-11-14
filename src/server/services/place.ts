// 快捷指令发来的东西没有坐标，服务端替它挑位置：
// 以白板现有内容的重心为圆心（空白板用画布中央），一圈圈往外找离中心最近、不压着别人的空位。
// 打开白板时视角正对内容中心，所以新来的一打开就在眼前
import type { ItemType } from '../../shared/schema';

export type Size = { w: number; h: number };
type Sizable = { type: ItemType; text?: string };
type Placeable = Sizable & { x: number; y: number };

/** 画布初始 3000×2000 的中央，和前端 board/geometry.ts 的 BASE 对应 */
const CENTER = { x: 1500, y: 1000 };
const GAP = 24, STEP = 40, MAX_RING = 80;
const MIN_X = 8, MIN_Y = 44, MAX = 19_500;

/** 一行字大概多宽（按「几个汉字」算，英文数字算半个多一点）；markdown 链接的地址不显示，不算 */
const weight = (line: string) => { let w = 0; for (const ch of line.replace(/\]\([^)]*\)/g, ']')) w += ch.charCodeAt(0) > 0xff ? 1 : 0.55; return w; };

/**
 * 卡片大概多大（和样式对应）。便利贴宽度跟着最长的一行走：最窄 240、最宽 420，一个汉字约 17px、左右留白共 36；
 * 再按这个宽度估行数，正文最高 440
 */
export function sizeOf(it: Sizable): Size {
  if (it.type === 'image') return { w: 280, h: 412 };
  if (it.type === 'file') return { w: 260, h: 170 };
  if (it.type === 'location') return { w: 260, h: 250 };
  const rows = (it.text ?? '').split('\n').map(weight);
  const w = Math.round(Math.min(420, Math.max(240, 36 + Math.max(0, ...rows) * 17)));
  const perLine = (w - 36) / 17;
  const lines = rows.reduce((n, r) => n + Math.max(1, Math.ceil(r / perLine)), 0);
  return { w, h: 62 + Math.min(440, 28 * Math.max(2, lines)) };
}

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
    : CENTER;
  const ox = Math.round(c.x - size.w / 2), oy = Math.round(c.y - size.h / 2);
  const free = (x: number, y: number) =>
    x >= MIN_X && y >= MIN_Y && x + size.w <= MAX && y + size.h <= MAX &&
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
  return { x: Math.min(MAX, Math.max(MIN_X, ox)), y: Math.min(MAX, Math.max(MIN_Y, oy)) };
}
