import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PAGES } from '../src/server/wiki';
import { AS, setup } from './helpers';

describe('wiki 的 Markdown /wiki/<页>.md', () => {
  it('带密码：占位符换成当前的白板列表，不进缓存', async () => {
    const t = setup();
    const { status, text, res } = await t.wiki('ai-api.md');
    expect(status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(text).toContain('\n白板：共用、牛牛、香蕉、废纸篓\n');
    // AI 的密码也能读
    expect((await t.wiki('ai-api.md', AS('ai', 'ai-test'))).text).toContain('白板：共用、');
  });

  it('代码块里的占位符原样保留', async () => {
    const { text } = await setup().wiki('dev.md');
    expect(text).toContain('```markdown\n{{ api("/api/ai/boards").names }}\n```');
  });

  it('不带密码：照样给文档，占位符处是「加载失败」，不碰存储', async () => {
    const t = setup();
    const { status, text } = await t.wiki('ai-api.md', {});
    expect(status).toBe(200);
    expect(text).toContain('\n白板：加载失败\n');
    expect(t.blob.data.size).toBe(0);
  });

  it('没有的页回 404；docs/ 里的 .md 都打进了函数', async () => {
    expect((await setup().wiki('nope.md')).status).toBe(404);
    const docs = readdirSync('docs', { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.md'));
    expect([...PAGES.keys()].sort()).toEqual(docs.sort());
  });

  it('接口对所有来源开放跨域（主 wiki 收纳的页面从别的域名取数）', async () => {
    const { res } = await setup().call('GET', '/ai/boards', undefined, { ...AS(), Origin: 'http://172.20.90.202:8100' });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});
