// 测试替身：内存版 Blob（元素数据）和内存版文件存储（COS），外加一个接好它们的 app
import { BATCH } from '../src/shared/constants';
import { createApp } from '../src/server/app';
import { Db } from '../src/server/repo/db';
import type { BlobLike } from '../src/server/storage/blob';
import type { Disposition, FileStore } from '../src/server/storage/files';

export class FakeBlob implements BlobLike {
  data = new Map<string, { body: string; etag: string }>();
  private n = 0;
  async get(key: string) {
    const v = this.data.get(key);
    return v ? JSON.parse(v.body) : null;
  }
  async setJSON(key: string, value: unknown) { this.data.set(key, { body: JSON.stringify(value), etag: `e${++this.n}` }); }
  async delete(key: string) { this.data.delete(key); }
  async list({ prefix = '' }: { prefix?: string }) {
    return { blobs: [...this.data.entries()].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => ({ key, etag: v.etag })) };
  }
}

export class MemoryFiles implements FileStore {
  data = new Map<string, { bytes: Uint8Array; modifiedAt: number }>();
  async uploadUrl(id: string) { return `memory://upload/${id}`; }
  async downloadUrl(id: string, d: Disposition) { return `memory://download/${id}?inline=${d.inline}&mime=${encodeURIComponent(d.mime)}`; }
  async previewUrl(id: string, srcType: string, as: string) { return `memory://preview/${id}?srcType=${srcType}&as=${as}`; }
  async size(id: string) { return this.data.get(id)?.bytes.length ?? null; }
  async read(id: string) { return this.data.get(id)?.bytes.slice().buffer ?? null; }
  async open(id: string) {
    const v = this.data.get(id);
    return v ? new Response(v.bytes.slice().buffer).body : null;
  }
  async write(id: string, data: Uint8Array) { this.data.set(id, { bytes: data, modifiedAt: Date.now() }); }
  async delete(id: string) { this.data.delete(id); }
  async list() { return [...this.data.entries()].map(([id, v]) => ({ id, modifiedAt: v.modifiedAt })); }
  /** 模拟浏览器或快捷指令往预签名地址 PUT 文件 */
  upload(urlOrId: string, body: string | Uint8Array) {
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
    this.data.set(urlOrId.replace('memory://upload/', ''), { bytes, modifiedAt: Date.now() });
  }
}

export const ENV = { SITE_PASSWORD: 'pw-test', COOKIE_SECRET: 'cookie-secret', COS_BUCKET: 'b', COS_REGION: 'r', COS_SECRET_ID: 'i', COS_SECRET_KEY: 'k' };

export function setup() {
  const blob = new FakeBlob();
  const files = new MemoryFiles();
  const pending: Promise<unknown>[] = [];
  const app = createApp(() => ({ db: new Db(blob), files, defer: (p) => { pending.push(p.catch(() => {})); } }));
  async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = { 'X-Password': 'pw-test' }, env = ENV) {
    const res = await app.request(`/api${path}`, {
      method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }, env);
    // 「响应发出后接着做」的事（到期的挪进废纸篓等）在测试里等它做完
    await Promise.all(pending.splice(0));
    const text = await res.text();
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* 文件内容 */ }
    return { status: res.status, data, res };
  }
  const boardIds = async () => ((await call('GET', '/boards')).data.boards as { id: string }[]).map((b) => b.id);
  /** 和页面一样：先拿 etags，再按 id 取 */
  const itemsOf = async (boardId: string) => {
    const ids = ((await call('GET', `/boards/${boardId}/etags`)).data.items as { id: string }[]).map((e) => e.id);
    const out: any[] = [];
    for (let i = 0; i < ids.length; i += BATCH) out.push(...(await call('GET', `/boards/${boardId}/items?ids=${ids.slice(i, i + BATCH).join(',')}`)).data.items);
    return out;
  };
  return { blob, files, app, call, boardIds, itemsOf, firstBoard: async () => (await boardIds())[0] };
}

export const note = (over: Record<string, unknown> = {}) => ({ type: 'note', text: '你好', x: 100, y: 100, ...over });
