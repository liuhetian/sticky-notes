// 新东西放哪：一律放进看得见的地方，整张卡片都在视口里
import { useRef } from 'react';
import { NEW_NOTE, type Size } from '@/shared/layout';
import type { Item } from '@/shared/schema';
import type { Pos, View } from './geometry';

export function usePlacing(currentView: () => View, items: Item[]) {
  /** 鼠标最近在白板上的位置 */
  const pointer = useRef<(Pos & { t: number }) | null>(null);
  const cascade = useRef(0);

  /** 把想放的位置收进视口，并和已有的卡片错开 */
  const fit = (p: Pos, size: Size = NEW_NOTE): Pos => {
    const v = currentView();
    const minX = v.x + 16, maxX = Math.max(minX, v.x + v.w - size.w - 16);
    const minY = v.y + 48, maxY = Math.max(minY, v.y + v.h - size.h - 16);
    let q = { x: Math.round(Math.min(Math.max(p.x, minX), maxX)), y: Math.round(Math.min(Math.max(p.y, minY), maxY)) };
    // 同一个位置连着放就错开一点
    for (let i = 0; i < 20 && items.some((it) => Math.abs(it.x - q.x) < 14 && Math.abs(it.y - q.y) < 14); i++) q = { x: q.x + 28, y: q.y + 28 };
    return q;
  };
  /** 视口中间 */
  const center = (size?: Size): Pos => {
    const v = currentView();
    const k = cascade.current++ % 6;
    return fit({ x: v.x + v.w / 2 - 130 + k * 28, y: v.y + v.h / 2 - 120 + k * 28 }, size);
  };
  /** 粘贴用：鼠标刚在白板上、而且在视口里，就放鼠标那；否则放视口中间 */
  const nearPointer = (size?: Size): Pos => {
    const p = pointer.current, v = currentView();
    if (p && Date.now() - p.t < 15_000 && p.x >= v.x && p.x <= v.x + v.w && p.y >= v.y && p.y <= v.y + v.h) return fit({ x: p.x - 30, y: p.y - 24 }, size);
    return center(size);
  };
  const track = (p: Pos) => { pointer.current = { ...p, t: Date.now() }; };
  return { fit, center, nearPointer, track };
}
