// 画布的尺寸约定：前端排版、拖动限位，服务端给快捷指令发来的东西挑位置，都按这一份
import type { ItemType } from './schema';

export type Size = { w: number; h: number };
export type Pos = { x: number; y: number };
export type Box = Pos & Size;

/** 画布至少这么大，只有元素真摆到外面才往外长；空白板的视角和服务端挑位置都以它的中央为准 */
export const CANVAS: Size = { w: 3000, h: 2000 };
/** 卡片左上角最小的坐标：上面留出白板名字的位置 */
export const EDGE = { x: 8, y: 44 };
/** 卡片左上角最大的坐标（数据模型允许到 20000，留一点余量） */
export const COORD_MAX = 19_500;

/** 一行字大概多宽（按「几个汉字」算，英文数字算半个多一点）；markdown 链接的地址不显示，不算 */
const weight = (line: string) => { let w = 0; for (const ch of line.replace(/\]\([^)]*\)/g, ']')) w += ch.charCodeAt(0) > 0xff ? 1 : 0.55; return w; };

const FIXED: Record<Exclude<ItemType, 'note'>, Size> = {
  /** 按竖图算：放下以后不会压到下面的 */
  image: { w: 280, h: 412 },
  file: { w: 260, h: 170 },
  location: { w: 260, h: 250 },
};
/** 刚新建、正在写的便利贴（编辑框比显示时高） */
export const NEW_NOTE: Size = { w: 240, h: 200 };

/**
 * 卡片大概多大（和样式对应）。便利贴宽度跟着最长的一行走：最窄 240、最宽 420，一个汉字约 17px、左右留白共 36；
 * 再按这个宽度估行数，正文最高 440
 */
export function sizeOf(it: { type: ItemType; text?: string }): Size {
  if (it.type !== 'note') return FIXED[it.type];
  const rows = (it.text ?? '').split('\n').map(weight);
  const w = Math.round(Math.min(420, Math.max(240, 36 + Math.max(0, ...rows) * 17)));
  const perLine = (w - 36) / 17;
  const lines = rows.reduce((n, r) => n + Math.max(1, Math.ceil(r / perLine)), 0);
  return { w, h: 62 + Math.min(440, 28 * Math.max(2, lines)) };
}

/** 把卡片左上角收进画布能放的范围 */
export const clampPos = (p: Pos, max: Pos = { x: COORD_MAX, y: COORD_MAX }): Pos => ({
  x: Math.round(Math.min(max.x, Math.max(EDGE.x, p.x))),
  y: Math.round(Math.min(max.y, Math.max(EDGE.y, p.y))),
});
