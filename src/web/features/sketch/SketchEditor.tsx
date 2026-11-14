// 画布：在白纸上手绘，或者垫着一张图往上画；存成一张新图片（白纸存 PNG，有底图存 JPEG），原图不动
// 两层：底层是白纸或底图，上层是笔迹（橡皮只擦笔迹）。画完的笔画缓存在一张离屏画布里，画新笔画时只重画这一笔
import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { getStroke } from 'perfect-freehand';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { sketchStore } from '../../state/stores';
import { readableUrl } from '../items/FileImage';
import { Icon } from '../../ui/Icon';

const COLORS = ['#2d2a25', '#e5534b', '#f08c2e', '#f2c94c', '#3fae5a', '#3d7fd9', '#9b6bd9', '#ffffff'];
const SIZES = [4, 9, 18];
const BLANK = { w: 1600, h: 1200 };
const MAX_SIDE = 2400;

type Stroke = { points: number[][]; color: string; size: number; erase: boolean; pressure: boolean };

/** perfect-freehand 给的是笔画轮廓的点，连成二次曲线闭合路径 */
function strokePath(s: Stroke) {
  const pts = getStroke(s.points, { size: s.size, thinning: 0.6, smoothing: 0.5, streamline: 0.45, simulatePressure: !s.pressure });
  if (!pts.length) return null;
  const d = pts.reduce<(string | number)[]>((acc, [x0, y0], i, arr) => {
    const [x1, y1] = arr[(i + 1) % arr.length];
    acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    return acc;
  }, ['M', ...pts[0], 'Q']);
  return new Path2D([...d, 'Z'].join(' '));
}

function paint(ctx: CanvasRenderingContext2D, s: Stroke) {
  const path = strokePath(s);
  if (!path) return;
  ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
  ctx.fillStyle = s.erase ? '#000' : s.color;
  ctx.fill(path);
  ctx.globalCompositeOperation = 'source-over';
}

export function SketchEditor({ onSave }: { onSave: (file: File, pos: { x: number; y: number }) => void }) {
  const req = sketchStore.use();
  return (
    <Dialog.Root open={!!req} onOpenChange={(o) => !o && sketchStore.set(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        {req && <Editor key={req.at} bg={req.bg} onCancel={() => sketchStore.set(null)}
          onDone={(file) => { onSave(file, req.pos); sketchStore.set(null); }} />}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Editor({ bg, onCancel, onDone }: { bg?: { id: string; name: string }; onCancel: () => void; onDone: (file: File) => void }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(bg ? null : BLANK);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(SIZES[1]);
  const [erase, setErase] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [saving, setSaving] = useState(false);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const done = useRef<HTMLCanvasElement | null>(null); // 画完的笔画
  const current = useRef<Stroke | null>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  // 底图：读进来，按比例压到边长不超过 MAX_SIDE
  useEffect(() => {
    if (!bg) return;
    let alive = true;
    readableUrl(bg).then((url) => {
      const im = new Image();
      im.onload = () => {
        if (!alive) return;
        const k = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
        img.current = im;
        setSize({ w: Math.round(im.naturalWidth * k), h: Math.round(im.naturalHeight * k) });
      };
      im.onerror = () => { toast.error('这张图读不出来，没法在上面画'); onCancel(); };
      im.src = url;
    });
    return () => { alive = false; };
  }, [bg]);

  // 尺寸定了：画底层，建离屏的笔迹缓存
  useEffect(() => {
    if (!size) return;
    const b = bgRef.current!.getContext('2d')!;
    b.fillStyle = '#fff';
    b.fillRect(0, 0, size.w, size.h);
    if (img.current) b.drawImage(img.current, 0, 0, size.w, size.h);
    done.current = Object.assign(document.createElement('canvas'), { width: size.w, height: size.h });
  }, [size]);

  // 纸按比例放进编辑区：显示尺寸用 JS 算，笔触坐标才能和画布像素一一对上
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!size || !el) return;
    const fitNow = () => {
      const r = el.getBoundingClientRect();
      const k = Math.min((r.width - 24) / size.w, (r.height - 24) / size.h);
      setBox({ w: Math.max(50, size.w * k), h: Math.max(50, size.h * k) });
    };
    fitNow();
    const ro = new ResizeObserver(fitNow);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);

  // 撤销、清空后：从头重建笔迹缓存
  const rebuild = (list: Stroke[]) => {
    const c = done.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    list.forEach((s) => paint(ctx, s));
    redraw();
  };
  const redraw = () => {
    const ink = inkRef.current, c = done.current;
    if (!ink || !c) return;
    const ctx = ink.getContext('2d')!;
    ctx.clearRect(0, 0, ink.width, ink.height);
    ctx.drawImage(c, 0, 0);
    if (current.current) paint(ctx, current.current);
  };

  const toPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = e.currentTarget.width / r.width;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k, e.pressure || 0.5];
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const k = e.currentTarget.width / e.currentTarget.getBoundingClientRect().width;
    current.current = { points: [toPoint(e)], color, size: (erase ? width * 2.5 : width) * Math.max(1, k * 0.8), erase, pressure: e.pointerType === 'pen' };
    redraw();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!current.current) return;
    current.current.points.push(toPoint(e));
    redraw();
  };
  const up = () => {
    const s = current.current;
    if (!s) return;
    current.current = null;
    if (done.current) paint(done.current.getContext('2d')!, s);
    setStrokes((list) => [...list, s]);
    redraw();
  };
  const undo = () => setStrokes((list) => { const next = list.slice(0, -1); rebuild(next); return next; });
  const clear = () => { setStrokes([]); rebuild([]); };

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); } };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });

  const cancel = () => { if (!strokes.length || confirm('画的东西不要了？')) onCancel(); };
  const save = () => {
    if (!size || !bgRef.current || !inkRef.current) return;
    if (!strokes.length) return toast('还没画东西');
    setSaving(true);
    const out = Object.assign(document.createElement('canvas'), { width: size.w, height: size.h });
    const ctx = out.getContext('2d')!;
    ctx.drawImage(bgRef.current, 0, 0);
    ctx.drawImage(inkRef.current, 0, 0);
    const type = bg ? 'image/jpeg' : 'image/png';
    out.toBlob((blob) => {
      setSaving(false);
      if (!blob) return toast.error('导出失败');
      onDone(new File([blob], `画布-${dayjs().format('YYYYMMDD-HHmmss')}.${bg ? 'jpg' : 'png'}`, { type }));
    }, type, 0.9);
  };

  return (
    <Dialog.Content className="sketch" aria-describedby={undefined}
      onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => { e.preventDefault(); cancel(); }}>
      <Dialog.Title className="sr-only">画布</Dialog.Title>
      <div className="sketch-bar">
        <div className="sk-group">
          {COLORS.map((c) => (
            <button key={c} type="button" className={clsx('sk-color', !erase && c === color && 'on')} style={{ background: c }}
              title="颜色" aria-label="颜色" onClick={() => { setColor(c); setErase(false); }} />
          ))}
        </div>
        <div className="sk-group">
          {SIZES.map((w) => (
            <button key={w} type="button" className={clsx('sk-size', w === width && 'on')} title="粗细" aria-label="粗细" onClick={() => setWidth(w)}>
              <i style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>
        <div className="sk-group">
          <button type="button" className={clsx('sk-btn', erase && 'on')} title="橡皮（只擦笔迹）" onClick={() => setErase(!erase)}><Icon name="eraser" /></button>
          <button type="button" className="sk-btn" title="撤销（⌘Z）" disabled={!strokes.length} onClick={undo}><Icon name="undo" /></button>
          <button type="button" className="sk-btn" title="清空" disabled={!strokes.length} onClick={clear}><Icon name="trash" /></button>
        </div>
        <div className="sk-group sk-end">
          <button type="button" className="btn" onClick={cancel}>取消</button>
          <button type="button" className="btn primary" disabled={saving || !size} onClick={save}>{saving ? '保存中…' : '保存'}</button>
        </div>
      </div>
      <div className="sketch-stage" ref={stageRef}>
        {size ? (
          <div className="sketch-paper" style={{ width: box?.w ?? 0, height: box?.h ?? 0 }}>
            <canvas ref={bgRef} width={size.w} height={size.h} />
            <canvas ref={inkRef} width={size.w} height={size.h} className={clsx('ink', erase && 'erasing')}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          </div>
        ) : <div className="sketch-loading">载入底图…</div>}
      </div>
    </Dialog.Content>
  );
}
