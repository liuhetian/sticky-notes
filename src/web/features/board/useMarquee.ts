// V 模式在空白处按住拖：拉框多选。按住 Shift 是在原来的基础上加选；只点一下就取消选择
import { useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { Box, Pos } from './geometry';

export function useMarquee(opts: {
  canvasRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  toCanvas: (e: { clientX: number; clientY: number }) => Pos;
  scaleNow: () => number;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const drag = useRef<{ x0: number; y0: number; base: Set<string>; moved: boolean } | null>(null);

  const start = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.button !== 0 || !opts.enabled) return;
    const p = opts.toCanvas(e);
    drag.current = { x0: p.x, y0: p.y, base: e.shiftKey ? new Set(opts.selected) : new Set(), moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const m = drag.current;
    if (!m) return;
    const p = opts.toCanvas(e);
    if (!m.moved && Math.hypot(p.x - m.x0, p.y - m.y0) * opts.scaleNow() < 4) return;
    m.moved = true;
    const r = { x: Math.min(m.x0, p.x), y: Math.min(m.y0, p.y), w: Math.abs(p.x - m.x0), h: Math.abs(p.y - m.y0) };
    setBox(r);
    const hit = new Set(m.base);
    for (const el of opts.canvasRef.current!.querySelectorAll<HTMLElement>(':scope > .item[data-id]')) {
      if (el.classList.contains('draft')) continue;
      if (el.offsetLeft < r.x + r.w && el.offsetLeft + el.offsetWidth > r.x && el.offsetTop < r.y + r.h && el.offsetTop + el.offsetHeight > r.y) hit.add(el.dataset.id!);
    }
    opts.setSelected(hit);
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    const m = drag.current;
    if (!m) return;
    drag.current = null;
    setBox(null);
    if (!m.moved && !e.shiftKey) opts.setSelected(new Set());
  };
  return { box, start, move, end };
}
