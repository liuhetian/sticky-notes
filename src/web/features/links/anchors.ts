// 连线锚点：鼠标点的地方算哪个锚点、一个锚点现在在画布的什么位置（要量 DOM）
import { refKey, type Ref } from '@/shared/refs';
import type { Anchor, Item } from '@/shared/schema';
import type { Box, Pos } from '@/shared/layout';

/** 图片上的一个点（0~1），会存下来 */
export type PointAnchor = Anchor;
/** 便利贴的第几行（从 0 数）：只在「从这一行连线到…」时临时用，连上以后引用就加在那一行末尾 */
export type LineAnchor = { line: number };
/** 拉线时鼠标点出来的锚点 */
export type PickAnchor = PointAnchor | LineAnchor;
/** 画线时一端接在哪：再加上便利贴文字里的那个引用链接 */
export type WireAnchor = PickAnchor | { ref: Ref };

export const isPointAnchor = (a: WireAnchor | undefined): a is PointAnchor => !!a && 'px' in a;
export const isLineAnchor = (a: WireAnchor | undefined): a is LineAnchor => !!a && 'line' in a;
export const sameAnchor = (x?: PointAnchor, y?: PointAnchor) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);

/** 屏幕坐标 → 画布坐标 */
export type ToCanvas = (clientX: number, clientY: number) => Pos;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const photoOf = (card: Element) => card.querySelector<HTMLElement>('.photo img');

/**
 * 鼠标在卡片上点的这个位置对应什么锚点：便利贴的某一行文字、图片上的一个点；
 * 点在别处（边距、标题、底栏）返回 undefined，表示连整张卡片
 */
export function anchorAt(item: Item, target: Element, clientX: number, clientY: number): PickAnchor | undefined {
  if (item.type === 'note') {
    const block = target.closest<HTMLElement>('.md [data-line]');
    if (!block) return undefined;
    const start = Number(block.dataset.line), count = Number(block.dataset.lines) || 1;
    const r = block.getBoundingClientRect();
    const guess = start + Math.min(count - 1, Math.floor(clamp01((clientY - r.top) / Math.max(1, r.height)) * count));
    // 空行没法往后加引用：退回这一块的第一行
    const lines = item.text.split('\n');
    const line = lines[guess]?.trim() ? guess : start;
    return lines[line]?.trim() ? { line } : undefined;
  }
  if (item.type === 'image') {
    const img = target.closest('.photo img');
    if (!img) return undefined;
    const r = img.getBoundingClientRect();
    return { px: clamp01((clientX - r.left) / Math.max(1, r.width)), py: clamp01((clientY - r.top) / Math.max(1, r.height)) };
  }
  return undefined;
}

/** 便利贴正文里屏幕高度 clientY 的地方，贴在离对方近的那条边上；正文在卡片里滚动，滚出去了就贴在正文框的上沿或下沿 */
function sideAt(md: HTMLElement, rect: Box, clientY: number, toward: Pos, toCanvas: ToCanvas): Pos {
  const box = md.getBoundingClientRect();
  const y = Math.max(box.top + 4, Math.min(box.bottom - 4, clientY));
  const onRight = toward.x > rect.x + rect.w / 2;
  return { x: onRight ? rect.x + rect.w : rect.x, y: toCanvas(0, y).y };
}

/**
 * 锚点现在在画布上的位置。图片上的点就是那个点；便利贴的行、引用链接取它的高度、贴在离对方近的那条边上。
 * 量不出来（图片还没加载、卡片正在编辑、引用写在代码块里没变成链接）返回 null，调用方改连整张卡片
 */
export function anchorPos(card: HTMLElement, rect: Box, item: Item, anchor: WireAnchor | undefined, toward: Pos, toCanvas: ToCanvas): Pos | null {
  if (isPointAnchor(anchor)) {
    const img = photoOf(card);
    if (!img || !img.clientWidth) return null;
    const r = img.getBoundingClientRect();
    return toCanvas(r.left + r.width * anchor.px, r.top + r.height * anchor.py);
  }
  const md = item.type === 'note' ? card.querySelector<HTMLElement>('.md') : null;
  if (!md) return null;
  if (anchor && 'ref' in anchor) {
    const a = md.querySelector<HTMLElement>(`a.ref[data-ref="${refKey(anchor.ref)}"]`);
    if (!a) return null;
    const r = a.getBoundingClientRect();
    return sideAt(md, rect, r.top + r.height / 2, toward, toCanvas);
  }
  if (isLineAnchor(anchor)) {
    const { line } = anchor;
    // 包含这一行的块里挑最小的那个（嵌套列表里是最里层的 li）
    let best: HTMLElement | null = null, bestCount = Infinity;
    for (const el of md.querySelectorAll<HTMLElement>('[data-line]')) {
      const start = Number(el.dataset.line), count = Number(el.dataset.lines) || 1;
      if (line >= start && line < start + count && count < bestCount) { best = el; bestCount = count; }
    }
    if (!best) return null;
    const r = best.getBoundingClientRect();
    const start = Number(best.dataset.line);
    return sideAt(md, rect, r.top + ((line - start + 0.5) / bestCount) * r.height, toward, toCanvas);
  }
  return null;
}

export const centerOf = (r: Box): Pos => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** 从卡片中心朝 toward 方向出发，碰到卡片边的那一点 */
export function edgeOf(r: Box, toward: Pos): Pos {
  const c = centerOf(r);
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const t = Math.min(dx ? r.w / 2 / Math.abs(dx) : Infinity, dy ? r.h / 2 / Math.abs(dy) : Infinity);
  return { x: c.x + dx * Math.min(1, t), y: c.y + dy * Math.min(1, t) };
}
