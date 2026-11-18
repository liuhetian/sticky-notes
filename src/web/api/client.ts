// 带类型的 API 客户端：路径、参数、请求体都由 src/server/app.ts 的路由推导。
// 所有接口调用都过 apiFetch：5xx 和网络不通记在本机，下一次有请求成功时报到故障白板（docs/requirements.md「失败上报」）。
// 它在 react-query 的自动重试下面，重试救回来的那次失败也记得到
import { hc } from 'hono/client';
import type { AppType } from '@/server/app';
import { FAULT_QUEUE } from '@/shared/constants';
import type { Fault, FileRef } from '@/shared/schema';

const FAULTS_KEY = 'clip.faults';
/** 存坏了（被手动改过）就从头记：这里抛错会让所有接口调用跟着失败 */
const readFaults = (): Fault[] => {
  try { return JSON.parse(localStorage.getItem(FAULTS_KEY) ?? '[]'); } catch (e) { console.error('[faults] 本机记录坏了，从头记', e); return []; }
};
const writeFaults = (faults: Fault[]) => localStorage.setItem(FAULTS_KEY, JSON.stringify(faults.slice(-FAULT_QUEUE)));
/** 报上去的从本机删掉；上报途中新记的留着 */
const dropReported = (batch: Fault[]) => {
  const sent = new Set(batch.map((f) => JSON.stringify(f)));
  writeFaults(readFaults().filter((f) => !sent.has(JSON.stringify(f))));
};

let reporting = false;
let nextReport = 0;
/** 有攒着的就报；同时只报一份，报不上去过一分钟再说 */
async function report() {
  if (reporting || Date.now() < nextReport) return;
  const batch = readFaults();
  if (!batch.length) return;
  reporting = true;
  try {
    const res = await api.faults.$post({ json: { faults: batch } });
    if (res.ok) dropReported(batch);
    else if (res.status === 400) {
      // 格式不对，再报多少次都一样：丢掉这批，留个记录
      console.error('[faults] 上报被拒，丢掉这批', await res.text(), batch);
      dropReported(batch);
    } else nextReport = Date.now() + 60_000;
  } catch {
    nextReport = Date.now() + 60_000;
  } finally {
    reporting = false;
  }
}

/** 调本站接口都用它（不经 api 的直接 fetch 也一样），只记本站 /api/ 下的 */
export const apiFetch: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  const ours = url.origin === location.origin && url.pathname.startsWith('/api/');
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const t0 = performance.now();
  const record = (status: number) =>
    writeFaults([...readFaults(), { at: serverNow(), method, path: url.pathname, status, ms: Math.round(performance.now() - t0) }]);
  try {
    const res = await fetch(input, init);
    if (ours && res.status >= 500) record(res.status);
    else if (ours && res.ok && url.pathname !== '/api/faults') void report();
    return res;
  } catch (e) {
    // 页面自己取消的（切走白板时 react-query 会取消请求）不算失败
    if (ours && !(e instanceof DOMException && e.name === 'AbortError')) record(0);
    throw e;
  }
};

export const api = hc<AppType>('/', { fetch: apiFetch }).api;

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
/** 分享链接带着白板：/share/白板id/元素id；只分享白板就是 /share/白板id */
export const sharePath = (boardId: string, itemId?: string) => `/share/${boardId}${itemId ? `/${itemId}` : ''}`;
export const shareUrl = (boardId: string, itemId?: string) => location.origin + sharePath(boardId, itemId);

/** 把一个文件传进 COS（不显示进度的小文件用，比如地图缩略图）；返回文件 ID */
export async function putFile(blob: Blob): Promise<string> {
  const { id, url } = await unwrap<{ id: string; url: string }>(api.uploads.$post({ json: { size: blob.size } }));
  const res = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } });
  if (!res.ok) throw new Error(`上传失败（${res.status}）`);
  return id;
}
