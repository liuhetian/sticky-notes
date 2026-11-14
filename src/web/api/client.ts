// 带类型的 API 客户端：路径、参数、请求体都由 src/server/app.ts 的路由推导
import { hc } from 'hono/client';
import type { AppType } from '@/server/app';

export const client = hc<AppType>('/');
export const api = client.api;

export class ApiError extends Error {
  constructor(message: string, public status: number, public data: any) {
    super(message);
  }
}

/** 登录失效时通知 App 回到登录页 */
export const authLost = new EventTarget();

/** 服务端时钟和本机的差，倒计时、提醒都按服务端时间算 */
export let clockOffset = 0;
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

type FileKey = { id: string; name: string };
/** 给 <img> 和下载用：会跳到 COS 的临时地址 */
export const fileUrl = (f: FileKey) => `/api/files/${f.id}/${encodeURIComponent(f.name)}`;
/** 要读图片内容时用（画图、复制图片、转 HEIC）：由本站转发，不跨域 */
export const rawUrl = (f: FileKey) => `${fileUrl(f)}?raw=1`;
/** 单条分享链接：网址后面直接跟元素 id；便利贴里的引用 [标题](/id) 也是这个地址 */
export const shareUrl = (itemId: string) => `${location.origin}/${itemId}`;

/** 把一个文件传进 COS（不显示进度的小文件用，比如地图缩略图）；返回文件 ID */
export async function putFile(blob: Blob, name: string): Promise<string> {
  const { id, url } = await unwrap<{ id: string; url: string }>(api.uploads.$post({ json: { name, size: blob.size, mime: blob.type } }));
  const res = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } });
  if (!res.ok) throw new Error(`上传失败（${res.status}）`);
  return id;
}
