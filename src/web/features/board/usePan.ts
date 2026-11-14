// 抓手：按下就拖着画布走。在捕获阶段拦下，卡片自己的拖动和按钮都收不到
import { useRef, useState, type PointerEvent, type RefObject } from 'react';

export function usePan(scrollRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const [panning, setPanning] = useState(false);
  const pan = useRef<{ x: number; y: number; sl: number; st: number; moved: boolean } | null>(null);

  const start = (e: PointerEvent<HTMLElement>) => {
    if (!enabled || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const el = scrollRef.current!;
    pan.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false };
    el.setPointerCapture(e.pointerId);
    setPanning(true);
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const p = pan.current;
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.hypot(dx, dy) > 3) p.moved = true;
    scrollRef.current!.scrollLeft = p.sl - dx;
    scrollRef.current!.scrollTop = p.st - dy;
  };
  /** 返回这次有没有真的拖动过：拖过的话，松手时的那次点击不算 */
  const end = (): boolean => {
    const moved = !!pan.current?.moved;
    pan.current = null;
    setPanning(false);
    return moved;
  };
  return { panning, start, move, end };
}
