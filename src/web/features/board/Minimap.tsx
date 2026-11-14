// 小地图：按比例画出整块画布、每张卡片和当前视口；点或拖小地图就把视口挪过去
import { useLayoutEffect, useState, type RefObject } from 'react';
import { COLORS } from '@/shared/constants';

const MAX_W = 200, MAX_H = 140;
type Rect = { x: number; y: number; w: number; h: number; kind: string };
import type { View } from './geometry';

function kindOf(el: HTMLElement) {
  if (el.classList.contains('note')) return COLORS.find((c) => el.classList.contains(c)) ?? 'yellow';
  if (el.classList.contains('image')) return 'img';
  if (el.classList.contains('location')) return 'loc';
  if (el.classList.contains('uploading')) return 'up';
  return 'file';
}

export function Minimap({ world, view, canvasRef, version, onJump }: {
  world: { w: number; h: number };
  view: View;
  canvasRef: RefObject<HTMLDivElement | null>;
  /** 元素变了就换一个值，触发重新量尺寸 */
  version: string;
  onJump: (x: number, y: number) => void;
}) {
  const [rects, setRects] = useState<Rect[]>([]);
  useLayoutEffect(() => {
    const els = canvasRef.current?.querySelectorAll<HTMLElement>(':scope > .item') ?? [];
    setRects([...els].map((el) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, kind: kindOf(el) })));
  }, [version, canvasRef]);

  const s = Math.min(MAX_W / world.w, MAX_H / world.h);
  const jump = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onJump((e.clientX - r.left) / s, (e.clientY - r.top) / s);
  };
  return (
    <div className="minimap" style={{ width: world.w * s, height: world.h * s }} title="小地图：点一下或拖动跳过去"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); jump(e); }}
      onPointerMove={(e) => { if (e.buttons & 1) jump(e); }}>
      {rects.map((r, i) => (
        <i key={i} className={`mm-item ${r.kind}`}
          style={{ left: r.x * s, top: r.y * s, width: Math.max(2, r.w * s), height: Math.max(2, r.h * s) }} />
      ))}
      <b className="mm-view" style={{ left: view.x * s, top: view.y * s, width: Math.min(view.w, world.w) * s, height: Math.min(view.h, world.h) * s }} />
    </div>
  );
}
