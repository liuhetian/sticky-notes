// 画布上卡片的实际位置和大小直接量 DOM（便利贴的高度跟着内容走、图片加载完才知道多高）：
// 连线、小地图、拉框多选都用这一份
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { Box } from '@/shared/layout';

/** 一张卡片：id 是元素 id；正在上传的占位卡、还没存的新便利贴没有 */
export type CardBox = { id?: string; el: HTMLElement; rect: Box };

export function cardsIn(canvas: HTMLElement): CardBox[] {
  return [...canvas.querySelectorAll<HTMLElement>(':scope > .item')].map((el) => ({
    id: el.dataset.id, el, rect: { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight },
  }));
}

/**
 * 卡片挪了、变了大小、增删了、卡片里的长文滚动了、图片加载完了：调 onChange（一帧最多一次）。
 * 连线那两层（.links）自己的变化不算。返回的函数可以手动要求重量一次
 */
export function useCardsChanged(canvasRef: RefObject<HTMLElement | null>, onChange: () => void): () => void {
  const latest = useRef(onChange);
  latest.current = onChange;
  const trigger = useRef(() => {});
  useEffect(() => {
    const canvas = canvasRef.current!;
    let raf = 0;
    const measure = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => latest.current()); };
    trigger.current = measure;
    const ro = new ResizeObserver(measure);
    const watchSizes = () => canvas.querySelectorAll(':scope > .item').forEach((el) => ro.observe(el));
    const mo = new MutationObserver((records) => {
      if (records.some((r) => r.type === 'childList' && r.target === canvas)) watchSizes();
      // 连线自己画的、滚动条显隐（ui/Scroll）都不影响卡片位置，不用重量
      if (records.some((r) => !(r.target instanceof Element && r.target.closest('.links, .os-scrollbar')))) measure();
    });
    mo.observe(canvas, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
    canvas.addEventListener('scroll', measure, true);
    canvas.addEventListener('load', measure, true);
    watchSizes();
    measure();
    return () => {
      mo.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
      canvas.removeEventListener('scroll', measure, true);
      canvas.removeEventListener('load', measure, true);
    };
  }, [canvasRef]);
  return useCallback(() => trigger.current(), []);
}
