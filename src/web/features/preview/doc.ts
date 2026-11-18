// 文档（PDF、Word、Excel、PPT）的封面：第一页的图由 COS 现转，这里只管取回来和记住页数
import type { FileRef } from '@/shared/schema';
import { apiFetch, fileUrl } from '../../api/client';

type FileKey = Pick<FileRef, 'id' | 'name'>;
export type Cover = { url: string; pages: number | null };
export const coverUrl = (file: FileKey) => `${fileUrl(file)}?preview=cover`;
export const viewerUrl = (file: FileKey) => `${fileUrl(file)}?preview=viewer`;

const covers = new Map<string, Promise<Cover>>();

/**
 * 用 fetch 取封面，是为了顺带读响应头里的总页数（<img> 读不到响应头）。
 * 读不到（跨域头没配、被拦）就退回让 <img> 自己去加载，只是不显示页数
 */
export function docCover(file: FileKey): Promise<Cover> {
  let p = covers.get(file.id);
  if (!p) {
    p = (async () => {
      try {
        const res = await apiFetch(coverUrl(file));
        if (!res.ok) throw new Error(String(res.status));
        const pages = Number(res.headers.get('x-total-page')) || null;
        return { url: URL.createObjectURL(await res.blob()), pages };
      } catch {
        return { url: coverUrl(file), pages: null };
      }
    })();
    covers.set(file.id, p);
  }
  return p;
}
