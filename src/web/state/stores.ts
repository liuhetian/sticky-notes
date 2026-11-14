// 几个跨组件的小状态。用 useSyncExternalStore，不引状态库
import { useSyncExternalStore } from 'react';
import { DEFAULT_TTL } from '@/shared/constants';
import type { FileRef, NoteItem } from '@/shared/schema';

export function createStore<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
  return {
    get: () => value,
    set: (v: T) => { value = v; subs.forEach((f) => f()); },
    use: () => useSyncExternalStore(subscribe, () => value),
    /** 只关心由它算出来的一个值：这个值不变就不重渲染 */
    useSelect: <S>(pick: (v: T) => S) => useSyncExternalStore(subscribe, () => pick(value)),
  };
}

/** 记在本机的设置 */
export function persisted<T>(key: string, fallback: T) {
  let saved = fallback;
  try { const raw = localStorage.getItem(key); if (raw !== null) saved = JSON.parse(raw); } catch { /* 存坏了就用默认值 */ }
  const inner = createStore<T>(saved);
  return { ...inner, set: (v: T) => { localStorage.setItem(key, JSON.stringify(v)); inner.set(v); } };
}

export type Conflict = { boardId: string; theirs: NoteItem; mine: string };
export const conflictStore = createStore<Conflict | null>(null);

/**
 * 要高亮的元素（已经知道在哪块白板）：提醒点「看看」、跳转找到以后都走这里。
 * dim：其余部分压暗（分享链接、提醒）；点便利贴里的引用时不压暗，只让目标闪
 */
export const spotlightStore = createStore<{ itemId: string; dim: boolean } | null>(null);
export const spotlight = (itemId: string, dim = true) => spotlightStore.set({ itemId, dim });

/** 跳到某个元素（还不知道在哪块白板）：分享链接打开、点便利贴里的引用。App 找到所在白板后切过去高亮 */
export const jumpStore = createStore<{ itemId: string; dim: boolean } | null>(null);
export const jumpTo = (itemId: string, dim = true) => jumpStore.set({ itemId, dim });

/** 正在翻看的文档 */
export const docStore = createStore<FileRef | null>(null);

/** iPhone 快捷指令说明 */
export const guideStore = createStore(false);

/** 新内容默认保留多久（秒，null 为永久） */
export const ttlStore = persisted<number | null>('clip.ttl', DEFAULT_TTL);
export const minimapStore = persisted<boolean>('clip.minimap.on', true);
export const sidebarCollapsedStore = persisted<boolean>('clip.side.collapsed', false);
/** 当前在哪块白板：只记在本机，不进地址栏 */
export const boardStore = persisted<string | null>('clip.board.id', null);

/** 打开画布：pos 是画完的图放哪；bg 是垫在底下的图（在图片上画时） */
export const sketchStore = createStore<{ at: number; pos: { x: number; y: number }; bg?: { id: string; name: string } } | null>(null);

/** 右键菜单里点「编辑」「改名」：让那张卡片进入编辑 */
export const editStore = createStore<string | null>(null);

/** 看大图 */
export const lightboxStore = createStore<FileRef | null>(null);
