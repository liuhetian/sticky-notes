// 画连线。线画在卡片底下；接在图片某个点上的那一头，另外在卡片上面补画落在这张卡片里的一小段，点才看得见。
// 卡片的位置和大小直接量 DOM（board/cards.ts）：拖动、多选一起拖、便利贴变高、图片加载完，线都跟着走
import clsx from 'clsx';
import { useEffect, useState, type RefObject } from 'react';
import type { Box, Pos } from '@/shared/layout';
import type { Item } from '@/shared/schema';
import { cardsIn, useCardsChanged, type CardBox } from '../board/cards';
import { anchorPos, centerOf, edgeOf, isPointAnchor, type PickAnchor, type WireAnchor } from './anchors';
import type { Wire } from './model';
import { curlyPath, seedOf, sketchy } from './path';

type Seg = { key: string; p: Pos; q: Pos; anchoredP: boolean; anchoredQ: boolean; clipP?: Box; clipQ?: Box };
export type TempWire = { from: string; anchor?: PickAnchor; to: Pos | null };

export function LinkLayer({ wires, items, canvasRef, world, selected, onSelect, onRemove, temp }: {
  wires: Wire[];
  items: Item[];
  canvasRef: RefObject<HTMLDivElement | null>;
  world: { w: number; h: number };
  selected: string | null;
  onSelect: (key: string) => void;
  onRemove: (w: Wire) => void;
  /** 正在连线：从这张卡片拉到鼠标 */
  temp: TempWire | null;
}) {
  const [segs, setSegs] = useState<Seg[]>([]);
  const [tempStart, setTempStart] = useState<Pos | null>(null);
  const compute = () => {
    const canvas = canvasRef.current!;
    const byId = new Map(items.map((i) => [i.id, i]));
    const cards = new Map<string, CardBox>();
    for (const c of cardsIn(canvas)) if (c.id) cards.set(c.id, c);
    const box = canvas.getBoundingClientRect();
    const k = box.width / (canvas.offsetWidth || 1) || 1;
    const toCanvas = (cx: number, cy: number) => ({ x: (cx - box.left) / k, y: (cy - box.top) / k });
    const out: Seg[] = [];
    for (const w of wires) {
      const a = cards.get(w.holder), b = cards.get(w.link.to);
      const ia = byId.get(w.holder), ib = byId.get(w.link.to);
      if (!a || !b || !ia || !ib) continue;
      // 便利贴文字里的引用：这一头接在那个链接上
      const endA: WireAnchor | undefined = w.ref ? { ref: w.ref } : w.link.a;
      // 图片上的点位置是固定的，先定下来；另一头朝着它去
      const fixedP = isPointAnchor(endA) ? anchorPos(a.el, a.rect, ia, endA, centerOf(b.rect), toCanvas) : null;
      const fixedQ = isPointAnchor(w.link.b) ? anchorPos(b.el, b.rect, ib, w.link.b, centerOf(a.rect), toCanvas) : null;
      const towardP = fixedQ ?? centerOf(b.rect), towardQ = fixedP ?? centerOf(a.rect);
      const ap = fixedP ?? anchorPos(a.el, a.rect, ia, endA, towardP, toCanvas);
      const aq = fixedQ ?? anchorPos(b.el, b.rect, ib, w.link.b, towardQ, toCanvas);
      out.push({
        key: w.key,
        p: ap ?? edgeOf(a.rect, aq ?? towardP),
        q: aq ?? edgeOf(b.rect, ap ?? towardQ),
        anchoredP: !!ap, anchoredQ: !!aq,
        clipP: fixedP ? a.rect : undefined, clipQ: fixedQ ? b.rect : undefined,
      });
    }
    setSegs(out);
    const from = temp && cards.get(temp.from), fromItem = temp && byId.get(temp.from);
    if (from && fromItem && temp.to) setTempStart(anchorPos(from.el, from.rect, fromItem, temp.anchor, temp.to, toCanvas) ?? edgeOf(from.rect, temp.to));
    else setTempStart(null);
  };
  // 卡片动了要重量；线本身变了（新连、断开、引用的文字被改）、连线中鼠标动了，也重量
  const measure = useCardsChanged(canvasRef, compute);
  useEffect(() => { measure(); }, [wires, items, temp, measure]);

  const shapes = segs.map((s) => {
    const seed = seedOf(s.key);
    const d = curlyPath(s.p, s.q, seed);
    return { ...s, d, strokes: sketchy(d, seed) };
  });
  const on = shapes.find((s) => s.key === selected);
  const wireOf = (key: string) => wires.find((w) => w.key === key);

  return (
    <>
      <svg className="links" width={world.w} height={world.h}>
        {shapes.map((s) => (
          <g key={s.key} className={clsx('link', s.key === selected && 'on')} data-link={s.key}
            onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onSelect(s.key); }}>
            <path className="hit" d={s.d} />
            {s.strokes.map((d, i) => <path key={i} className="ln" d={d} />)}
            <circle className={clsx('end', s.anchoredP && 'anchored')} cx={s.p.x} cy={s.p.y} r={s.anchoredP ? 4.5 : 3.5} />
            <circle className={clsx('end', s.anchoredQ && 'anchored')} cx={s.q.x} cy={s.q.y} r={s.anchoredQ ? 4.5 : 3.5} />
          </g>
        ))}
        {tempStart && temp?.to && <path className="ln temp" d={`M ${tempStart.x} ${tempStart.y} L ${temp.to.x} ${temp.to.y}`} />}
      </svg>
      {/* 盖在卡片上面的一层：只画落在「接了点的那张图片卡」范围里的部分 */}
      <svg className="links links-top" width={world.w} height={world.h}>
        <defs>
          {shapes.flatMap((s) => [['p', s.clipP] as const, ['q', s.clipQ] as const].flatMap(([end, r]) => (r ? [
            <clipPath key={`${s.key}-${end}`} id={`clip-${s.key}-${end}`} clipPathUnits="userSpaceOnUse"><rect x={r.x} y={r.y} width={r.w} height={r.h} /></clipPath>,
          ] : [])))}
        </defs>
        {shapes.flatMap((s) => [['p', s.clipP, s.p] as const, ['q', s.clipQ, s.q] as const].flatMap(([end, r, pt]) => (r ? [
          <g key={`${s.key}-${end}`} className={clsx('link', s.key === selected && 'on')} clipPath={`url(#clip-${s.key}-${end})`}>
            {s.strokes.map((d, i) => <path key={i} className="ln halo" d={d} />)}
            {s.strokes.map((d, i) => <path key={`l${i}`} className="ln" d={d} />)}
            <circle className="end anchored on-photo" cx={pt.x} cy={pt.y} r={5} />
          </g>,
        ] : [])))}
      </svg>
      {on && wireOf(on.key) && (
        <button type="button" className="link-x" title="删除连线（Delete）" style={{ left: (on.p.x + on.q.x) / 2, top: (on.p.y + on.q.y) / 2 }}
          onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onRemove(wireOf(on.key)!); }}>✕</button>
      )}
    </>
  );
}
