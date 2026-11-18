// 前端的失败记录（src/web/api/client.ts）：在 node 里替换掉 localStorage、location、fetch 来跑
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { url: string; method: string; body?: any };
let calls: Call[];
let reply: (c: Call) => Response | Promise<Response>;
let store: Map<string, string>;

const faults = () => JSON.parse(store.get('clip.faults') ?? '[]');
const settle = () => new Promise((r) => setTimeout(r, 0));

async function load() {
  vi.resetModules();
  return import('../src/web/api/client');
}

beforeEach(() => {
  calls = [];
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
  vi.stubGlobal('location', { href: 'https://clip.test/', origin: 'https://clip.test' });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const c: Call = { url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    return reply(c);
  }));
});

describe('失败记录', () => {
  it('5xx 记下来，下一次成功时报上去，报完清掉', async () => {
    const { api } = await load();
    reply = () => new Response('Error return from script', { status: 545 });
    await api.boards.$get();
    expect(faults()).toMatchObject([{ method: 'GET', path: '/api/boards', status: 545 }]);
    reply = (c) => (c.url.endsWith('/api/faults') ? Response.json({}, { status: 201 }) : Response.json({ boards: [] }));
    await api.boards.$get();
    await settle();
    const sent = calls.find((c) => c.url.endsWith('/api/faults'));
    expect(sent?.method).toBe('POST');
    expect(sent?.body.faults).toMatchObject([{ path: '/api/boards', status: 545 }]);
    expect(faults()).toEqual([]);
  });

  it('4xx 和页面自己取消的不记；网络不通记成 0', async () => {
    const { api } = await load();
    reply = () => Response.json({ error: '没有这块白板' }, { status: 404 });
    await api.boards.$get();
    reply = () => { throw new DOMException('aborted', 'AbortError'); };
    await expect(api.boards.$get()).rejects.toThrow();
    expect(faults()).toEqual([]);
    reply = () => { throw new TypeError('Failed to fetch'); };
    await expect(api.boards.$get()).rejects.toThrow();
    expect(faults()).toMatchObject([{ status: 0 }]);
  });

  it('报不上去就留着（上报自己的失败也记），一分钟内不再报', async () => {
    const { api } = await load();
    reply = () => new Response('', { status: 545 });
    await api.boards.$get();
    reply = (c) => (c.url.endsWith('/api/faults') ? new Response('', { status: 545 }) : Response.json({ boards: [] }));
    await api.boards.$get();
    await settle();
    expect(faults().map((f: any) => f.path)).toEqual(['/api/boards', '/api/faults']);
    await api.boards.$get();
    await settle();
    expect(calls.filter((c) => c.url.endsWith('/api/faults'))).toHaveLength(1);
  });

  it('最多攒 50 条，丢最早的；别的站的请求不记', async () => {
    const { apiFetch } = await load();
    reply = () => new Response('', { status: 502 });
    for (let i = 0; i < 55; i++) await apiFetch(`/api/files/${i}`);
    await apiFetch('https://cos.example.com/x');
    expect(faults()).toHaveLength(50);
    expect(faults()[0].path).toBe('/api/files/5');
  });
});
