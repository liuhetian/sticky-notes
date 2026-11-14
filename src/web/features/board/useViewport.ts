// 视口：滚动位置和缩放。坐标一律是「画布坐标」——屏幕距离除以缩放比例
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { MAX_SCALE, MIN_SCALE, type Pos, type View } from './geometry';

export function useViewport(scrollRef: RefObject<HTMLElement | null>, canvasRef: RefObject<HTMLDivElement | null>, mobile: boolean) {
  const [view, setView] = useState<View>({ x: 0, y: 0, w: 1200, h: 800 });
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  const frame = useRef(0);
  /** 手机上没有缩放 */
  const now = () => (mobile ? 1 : scaleRef.current);

  const current = (): View => {
    const el = scrollRef.current;
    const k = now();
    return el ? { x: el.scrollLeft / k, y: el.scrollTop / k, w: el.clientWidth / k, h: el.clientHeight / k } : view;
  };
  useLayoutEffect(() => {
    const el = scrollRef.current!;
    const read = () => setView(current());
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setView(current()));
  };

  /** 换一个比例，并把滚动位置定到 scrollTo 算出来的地方（缩放后的内容尺寸变了，要等重排完再滚） */
  const apply = (next: number, scrollTo: (s: number) => { left: number; top: number }) => {
    const el = scrollRef.current;
    if (!el) return;
    const s1 = mobile ? 1 : Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    const target = scrollTo(s1);
    if (Math.abs(s1 - scaleRef.current) < 1e-4) { el.scrollTo(target); return; }
    scaleRef.current = s1;
    pendingScroll.current = target;
    setScale(s1);
  };
  useLayoutEffect(() => {
    const el = scrollRef.current, p = pendingScroll.current;
    if (el && p) { el.scrollLeft = p.left; el.scrollTop = p.top; pendingScroll.current = null; }
    setView(current());
  }, [scale]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 以指定的屏幕点为中心缩放：缩放后那一点下面还是同一块画布；不给点就以视口中心 */
  const zoomTo = (next: number, clientX?: number, clientY?: number) => {
    const el = scrollRef.current;
    if (!el || mobile) return;
    const s0 = scaleRef.current;
    const r = el.getBoundingClientRect();
    const px = clientX === undefined ? el.clientWidth / 2 : clientX - r.left;
    const py = clientY === undefined ? el.clientHeight / 2 : clientY - r.top;
    const wx = (el.scrollLeft + px) / s0, wy = (el.scrollTop + py) / s0;
    apply(next, (s) => ({ left: wx * s - px, top: wy * s - py }));
  };
  /** 把画布上的一个点放到视口正中；可以顺便换比例 */
  const centerOn = (p: Pos, nextScale = now()) => {
    const el = scrollRef.current;
    if (el) apply(nextScale, (s) => ({ left: p.x * s - el.clientWidth / 2, top: p.y * s - el.clientHeight / 2 }));
  };

  // 触控板捏合：Chrome / Firefox 发带 ctrlKey 的 wheel，Safari 发 gesture 事件；都要拦下，免得整页缩放
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || mobile) return;
    let gesturing = false, base = 1;
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || gesturing) return;
      e.preventDefault();
      zoomTo(scaleRef.current * Math.exp(-Math.max(-30, Math.min(30, e.deltaY)) * 0.01), e.clientX, e.clientY);
    };
    type G = Event & { scale: number; clientX: number; clientY: number };
    const gs = (e: Event) => { e.preventDefault(); gesturing = true; base = scaleRef.current; };
    const gc = (e: Event) => { e.preventDefault(); const g = e as G; zoomTo(base * g.scale, g.clientX, g.clientY); };
    const ge = (e: Event) => { e.preventDefault(); gesturing = false; };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('gesturestart', gs);
    el.addEventListener('gesturechange', gc);
    el.addEventListener('gestureend', ge);
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('gesturestart', gs);
      el.removeEventListener('gesturechange', gc);
      el.removeEventListener('gestureend', ge);
    };
  }, [mobile]); // eslint-disable-line react-hooks/exhaustive-deps

  const toCanvas = (e: { clientX: number; clientY: number }): Pos => {
    const r = canvasRef.current!.getBoundingClientRect();
    const k = now();
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };

  return { view, scale: mobile ? 1 : scale, scaleNow: now, current, onScroll, zoomTo, centerOn, toCanvas };
}
export type Viewport = ReturnType<typeof useViewport>;
