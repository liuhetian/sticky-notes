import { useEffect, useState, useSyncExternalStore } from 'react';

export function useMedia(query: string) {
  return useSyncExternalStore(
    (f) => { const m = matchMedia(query); m.addEventListener('change', f); return () => m.removeEventListener('change', f); },
    () => matchMedia(query).matches,
  );
}
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
