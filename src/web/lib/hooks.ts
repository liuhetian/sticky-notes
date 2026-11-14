import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

export function useMedia(query: string) {
  return useSyncExternalStore(
    (f) => { const m = matchMedia(query); m.addEventListener('change', f); return () => m.removeEventListener('change', f); },
    () => matchMedia(query).matches,
  );
}
/** 和 styles/mobile.css 的断点一致 */
export const useMobile = () => useMedia('(max-width: 760px)');

/** 每隔一段时间重渲染一次：倒计时、到期隐藏、提醒响铃都靠它 */
export function useTick(ms: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

/** 挂一个全局事件监听：只挂一次，处理函数每次渲染换成最新的（读得到最新的 state） */
export function useEvent<E extends Event>(target: EventTarget, type: string, handler: (e: E) => void, enabled = true) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const f = (e: Event) => latest.current(e as E);
    target.addEventListener(type, f);
    return () => target.removeEventListener(type, f);
  }, [target, type, enabled]);
}

/** 焦点在输入框里：按键、粘贴归它 */
export const isTyping = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]');
