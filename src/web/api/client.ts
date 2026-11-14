// 带类型的 API 客户端：路径、参数、请求体都由 src/server/app.ts 的路由推导
import { hc } from 'hono/client';
import type { AppType } from '@/server/app';
import type { FileRef } from '@/shared/schema';

export const api = hc<AppType>('/').api;

export class ApiError extends Error {
  constructor(message: string, public status: number, public data: any) {
    super(message);
  }
}

/** 登录失效时通知 App 回到登录页 */
export const authLost = new EventTarget();

/** 服务端时钟和本机的差，倒计时、提醒都按服务端时间算 */
let clockOffset = 0;
export const serverNow = () => Date.now() + clockOffset;
export const syncClock = (now: number) => { clockOffset = now - Date.now(); };

export async function unwrap<T>(p: Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>): Promise<T> {
  const res = await p;
  let data: any = null;
  try { data = await res.json(); } catch { /* 空响应 */ }
  if (res.status === 401 && data?.error !== '密码不对') authLost.dispatchEvent(new Event('lost'));
  if (!res.ok) throw new ApiError(data?.error ?? `请求失败（${res.status}）`, res.status, data);
  return data as T;
}

/**
 * 后端一次只做一批（一次执行读不了太多元素）：一直调到做完。step 返回还要不要接着调；
 * 次数封顶，后端出了岔子（一直说没做完）也不会没完没了
 */
export async function drain(step: () => Promise<boolean>, max = 500) {
  for (let i = 0; i < max && (await step()); i++);
}

type FileKey = Pick<FileRef, 'id' | 'name'>;
/** 给 <img> 和下载用：会跳到 COS 的临时地址 */
export const fileUrl = (f: FileKey) => `/api/files/${f.id}/${encodeURIComponent(f.name)}`;
/** 当附件下载 */
export const downloadUrl = (f: FileKey) => `${fileUrl(f)}?dl=1`;
/** 要读图片内容时用（画图、复制图片、转 HEIC）：由本站转发，不跨域 */
export const rawUrl = (f: FileKey) => `${fileUrl(f)}?raw=1`;
/** 单条分享链接：网址后面直接跟元素 id；便利贴里的引用 [标题](/id) 也是这个地址 */
export const shareUrl = (itemId: string) => `${location.origin}/${itemId}`;

/** 把一个文件传进 COS（不显示进度的小文件用，比如地图缩略图）；返回文件 ID */
export async function putFile(blob: Blob): Promise<string> {
  const { id, url } = await unwrap<{ id: string; url: string }>(api.uploads.$post({ json: { size: blob.size } }));
  const res = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } });
  if (!res.ok) throw new Error(`上传失败（${res.status}）`);
  return id;
}
