import { describe, expect, it } from 'vitest';
import { renderMarkdown, type Result } from '../src/shared/livedoc';
import { AS, setup } from './helpers';

describe('给 AI 读的文档 /api/ai/<页>.md', () => {
  it('带密码：占位符换成当前的白板列表', async () => {
    const t = setup();
    const { status, data, res } = await t.call('GET', '/ai/index.md');
    expect(status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(data).toContain('\n白板：共用、牛牛、香蕉、废纸篓\n');
    expect(data).toContain(`对应的 id：${(await t.boardIds()).join('、')}`);
    // AI 的密码也能读
    expect((await t.call('GET', '/ai/index.md', undefined, AS('ai', 'ai-test'))).data).toContain('白板：共用、');
  });

  it('代码块和行内代码里的占位符原样保留', async () => {
    const { data } = await setup().call('GET', '/ai/index.md');
    expect(data).toContain('```markdown\n{{ api("/api/ai/boards").boards.name.join("、") }}\n```');
    const md = await renderMarkdown('`{{ api("/api/x").a }}` {{ api("/api/x").a }}', async () => ({ ok: true, data: { a: 1 } }));
    expect(md).toBe('`{{ api("/api/x").a }}` 1');
  });

  it('不带密码：照样给文档，占位符处写需要密码，不碰存储', async () => {
    const t = setup();
    const { status, data } = await t.call('GET', '/ai/index.md', undefined, {});
    expect(status).toBe(200);
    expect(data).toContain('（需要密码：请求头带 X-Password: 密码#名字）');
    expect(data).not.toContain('牛牛、');
    expect(t.blob.data.size).toBe(0);
  });

  it('取不到的字段是空串，调用失败写原因；相同地址只调一次', async () => {
    const calls: string[] = [];
    const get = async (url: string): Promise<Result> => {
      calls.push(url);
      return url === '/api/ok' ? { ok: true, data: { a: { b: 1 } } } : { ok: false, status: 404, message: '没有这块白板' };
    };
    const md = await renderMarkdown('[{{ api("/api/ok").a.b }}][{{ api("/api/ok").a.x }}][{{ api("/api/bad").a }}]', get);
    expect(md).toBe('[1][][（获取失败：没有这块白板）]');
    expect(calls).toEqual(['/api/ok', '/api/bad']);
  });
});
