// wiki 的 Markdown：GET /wiki/<页>.md（规范：test-wiki/main-wiki/docs/new-subservice.md）。
// 页面 /wiki/<页>/ 是 zensical 构建的静态文件；同一路径换成 .md 就是给 AI 读的版本：docs/ 里的原文，占位符换成实时数据。
// EdgeOne 上静态文件优先于函数、函数又读不到静态文件，所以 .md 不上传（scripts/build-docs.ts 排除），原文打进函数。
// 不用登录也能读；占位符背后的接口在进程内调（边缘函数请求自己的域名会被平台回 404），带上调用者自己的 X-Password 或 cookie，
// 各自照常鉴权，没带密码就是「加载失败」。一页里所有占位符读存储的次数都算在这一次执行的额度里，别引用读整块白板的接口
import { Hono } from 'hono';
import aiApi from '../../docs/ai-api.md?raw';
import dev from '../../docs/dev.md?raw';
import index from '../../docs/index.md?raw';
import ops from '../../docs/ops.md?raw';
import requirements from '../../docs/requirements.md?raw';
import timeline from '../../docs/timeline.md?raw';
import todo from '../../docs/todo.md?raw';
import { executionCtxOf, type AppType } from './app';
import type { Env } from './env';
import { renderMarkdown } from './md-render';

/** 文档原文，键是相对 docs/ 的路径；加一页就在这里加一行（tests/ai-docs.test.ts 会核对 docs/ 里的都在），
 * 同时在 edgeone.json 加一条 301、在 zensical.toml 的 nav 加一行。index.md 是项目入口，给 AI 的接口说明是 ai-api.md */
export const PAGES = new Map<string, string>([
  ['index.md', index],
  ['requirements.md', requirements],
  ['ai-api.md', aiApi],
  ['ops.md', ops],
  ['dev.md', dev],
  ['timeline.md', timeline],
  ['todo.md', todo],
]);

export const createWiki = (api: Pick<AppType, 'fetch'>) => new Hono<Env>()
  .get('/wiki/:page{.+\\.md}', async (c) => {
    const text = PAGES.get(c.req.param('page'));
    if (text === undefined) return c.json({ error: '没有这页文档，从 /wiki/index.md 看起' }, 404);
    const headers = new Headers();
    for (const h of ['X-Password', 'Cookie']) {
      const v = c.req.header(h);
      if (v !== undefined) headers.set(h, v);
    }
    const body = await renderMarkdown(text, async (url) => {
      const res = await api.fetch(new Request(new URL(url, c.req.url), { headers }), c.env, executionCtxOf(c));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
    // 带密码读到的是真实数据，不能进任何缓存。线上 edgeone.json 里 /wiki/* 的 Cache-Control 规则会盖掉这里的，两处要一致
    return c.body(body, 200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'CDN-Cache-Control': 'no-store',
    });
  })
  .notFound((c) => c.json({ error: '没有这页文档，从 /wiki/index.md 看起' }, 404));
