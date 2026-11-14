// 连线锚点里要量 DOM 的部分：鼠标点的地方算哪个锚点、一个锚点现在在画布的什么位置
import { isLineAnchor, isPointAnchor, lineAnchor, resolveLine } from '@/shared/anchors';
import type { Anchor, Item } from '@/shared/schema';
import type { Pos } from './path';

export type Rect = { x: number; y: number; w: number; h: number };
/** 屏幕坐标 → 画布坐标 */
export type ToCanvas = (clientX: number, clientY: number) => Pos;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const photoOf = (card: Element) => card.querySelector<HTMLElement>('.photo img');

/**
 * 鼠标在卡片上点的这个位置对应什么锚点：便利贴的某一行文字、图片上的一个点；
 * 点在别处（边距、标题、底栏）返回 undefined，表示连整张卡片
 */
export function anchorAt(item: Item, target: Element, clientX: number, clientY: number): Anchor | undefined {
  if (item.type === 'note') {
    const block = target.closest<HTMLElement>('.md [data-line]');
    if (!block) return undefined;
    const start = Number(block.dataset.line), count = Number(block.dataset.lines) || 1;
    const r = block.getBoundingClientRect();
    const guess = start + Math.min(count - 1, Math.floor(clamp01((clientY - r.top) / Math.max(1, r.height)) * count));
    return lineAnchor(item.text, guess) ?? lineAnchor(item.text, start) ?? undefined;
  }
  if (item.type === 'image') {
    const img = target.closest('.photo img');
    if (!img) return undefined;
    const r = img.getBoundingClientRect();
    return { px: clamp01((clientX - r.left) / Math.max(1, r.width)), py: clamp01((clientY - r.top) / Math.max(1, r.height)) };
  }
  return undefined;
}

/**
 * 锚点现在在画布上的位置。图片上的点就是那个点；便利贴的行取那一行的高度、贴在离对方近的那条边上。
 * 量不出来（行被改没了、图片还没加载、卡片正在编辑）返回 null，调用方改连整张卡片
 */
export function anchorPos(card: HTMLElement, rect: Rect, item: Item, anchor: Anchor | undefined, toward: Pos, toCanvas: ToCanvas): Pos | null {
  if (isPointAnchor(anchor)) {
    const img = photoOf(card);
    if (!img || !img.clientWidth) return null;
    const r = img.getBoundingClientRect();
    return toCanvas(r.left + r.width * anchor.px, r.top + r.height * anchor.py);
  }
  if (isLineAnchor(anchor) && item.type === 'note') {
    const line = resolveLine(item.text, anchor);
    const md = card.querySelector<HTMLElement>('.md');
    if (line === null || !md) return null;
    // 包含这一行的块里挑最小的那个（嵌套列表里是最里层的 li）
    let best: HTMLElement | null = null, bestCount = Infinity;
    for (const el of md.querySelectorAll<HTMLElement>('[data-line]')) {
      const start = Number(el.dataset.line), count = Number(el.dataset.lines) || 1;
      if (line >= start && line < start + count && count < bestCount) { best = el; bestCount = count; }
    }
    if (!best) return null;
    const r = best.getBoundingClientRect(), box = md.getBoundingClientRect();
    const start = Number(best.dataset.line);
    // 正文太长会在卡片里滚动：行滚出去了就贴在正文框的上沿或下沿
    const y = Math.max(box.top + 4, Math.min(box.bottom - 4, r.top + ((line - start + 0.5) / bestCount) * r.height));
    const onRight = toward.x > rect.x + rect.w / 2;
    return { x: onRight ? rect.x + rect.w : rect.x, y: toCanvas(0, y).y };
  }
  return null;
}

export const centerOf = (r: Rect): Pos => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** 从卡片中心朝 toward 方向出发，碰到卡片边的那一点 */
export function edgeOf(r: Rect, toward: Pos): Pos {
  const c = centerOf(r);
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const t = Math.min(dx ? r.w / 2 / Math.abs(dx) : Infinity, dy ? r.h / 2 / Math.abs(dy) : Infinity);
  return { x: c.x + dx * Math.min(1, t), y: c.y + dy * Math.min(1, t) };
}
