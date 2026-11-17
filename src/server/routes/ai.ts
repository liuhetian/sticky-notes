// 给 AI 用的入口 /api/ai/*：和网页用同一套元素操作（services/items.ts），只是换个入口，白板可以写名字，便利贴默认白色。
// 能调的都列在这里，别的一律 404：彻底删除、清空废纸篓、白板的新建改名删除都不开放。
// AI 的密码只能调这下面的接口（auth.ts）；共用密码也能调
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import index from '../../../docs/index.md?raw';
import { BATCH, BOARD_MAX, TRASH } from '../../shared/constants';
import { readResult, renderMarkdown } from '../../shared/livedoc';
import { CreateItem, MoveItem, PatchItem, type Item } from '../../shared/schema';
import { countTasks } from '../../shared/todo';
import type { Env } from '../env';
import { boardNamed, createItem, itemOr404, listItems, moveItem, patchItem, toTrash } from '../services/items';
import { files } from './files';
import { json } from './util';

/** 文档原文，键是相对 docs/ 的路径；加一页就在这里加一行 */
const PAGES: Record<string, string> = { 'index.md': index };

export type FetchSelf = (req: Request, c: Context<Env>) => Response | Promise<Response>;

/**
 * 给 AI 读的文档 GET /api/ai/<页>.md：docs/ 里的 markdown 原文，占位符换成实时数据（规则在 shared/livedoc.ts）。
 * 不用登录也能读：文档本身不是秘密，没带密码时占位符处写「需要密码」，AI 读完就知道该怎么带。
 * 占位符背后的接口在进程内调（边缘函数请求自己的域名会被平台回 404），带上调用者自己的 X-Password 或 cookie；
 * 它们读存储的次数算在这一次执行的额度里
 */
export const aiDocs = (fetchSelf: FetchSelf) => new Hono<Env>()
  // zensical 的 md 副本是 second/index.md，原文是 second.md，两种都认
  .get('/:page{.+\\.md}', async (c) => {
    const page = c.req.param('page');
    const text = PAGES[page] ?? PAGES[page.replace(/\/index\.md$/, '.md')];
    if (text === undefined) return c.json({ error: '没有这页文档，从 /api/ai/index.md 看起' }, 404);
    const headers = new Headers();
    for (const h of ['X-Password', 'Cookie']) {
      const v = c.req.header(h);
      if (v !== undefined) headers.set(h, v);
    }
    const body = await renderMarkdown(text, async (url) => readResult(await fetchSelf(new Request(new URL(url, c.req.url), { headers }), c)));
    return c.body(body, 200, { 'Content-Type': 'text/markdown; charset=utf-8' });
  });

/** 还有没做完的 todo 的便利贴 */
const hasTodo = (it: Item) => {
  if (it.type !== 'note') return false;
  const { total, done } = countTasks(it.text);
  return done < total;
};

/** 路径里的白板（名字或 id）→ id */
const boardOf = async (c: Context<Env>) => (await boardNamed(c.get('ctx'), c.req.param('board')!)).id;

export const ai = new Hono<Env>()
  .get('/boards', async (c) => c.json({ boards: await c.get('ctx').db.boards() }))
  // 一次读完整块白板，按最近编辑从新到旧；todo=1 只要还有没做完 todo 的便利贴
  .get('/boards/:board', async (c) => {
    const ctx = c.get('ctx');
    const board = await boardNamed(ctx, c.req.param('board'));
    const index = await ctx.db.index(board.id);
    let items = (await listItems(ctx, board.id, index.slice(0, BATCH).map((e) => e.id))).sort((a, b) => b.editedAt - a.editedAt);
    if (c.req.query('todo') === '1') items = items.filter(hasTodo);
    return c.json({ board, count: index.length, max: BOARD_MAX, items });
  })
  // 读一个；「上传中」的文件已经到了就顺手转成正式卡片
  .get('/boards/:board/items/:id', async (c) => {
    const [it] = await listItems(c.get('ctx'), await boardOf(c), [c.req.param('id')]);
    if (!it) throw new HTTPException(404, { message: '这个元素没了（可能已过期、被删或挪走了），重新读一遍白板' });
    return c.json(it);
  })
  .post('/boards/:board/items', json(CreateItem), async (c) => {
    const r = await createItem(c.get('ctx'), c.req.param('board'), c.req.valid('json'), 'white');
    return c.json(r.item, r.created ? 201 : 200);
  })
  .patch('/boards/:board/items/:id', json(PatchItem), async (c) => {
    const ctx = c.get('ctx');
    const r = await patchItem(ctx, await itemOr404(ctx, await boardOf(c), c.req.param('id')), c.req.valid('json'));
    return 'conflict' in r ? c.json({ error: r.error, item: r.conflict }, 409) : c.json(r.item);
  })
  // 删除是进废纸篓，可以放回；不能彻底删除
  .delete('/boards/:board/items/:id', async (c) => {
    const ctx = c.get('ctx');
    const boardId = await boardOf(c);
    if (boardId === TRASH) throw new HTTPException(400, { message: '不能彻底删除：废纸篓里的会在 30 天后自动删掉；要放回用 POST …/move' });
    return c.json({ ok: true as const, item: await toTrash(ctx, await itemOr404(ctx, boardId, c.req.param('id'))) });
  })
  // 挪到另一块白板（to 写名字或 id）；从废纸篓里不写 to 就放回原处
  .post('/boards/:board/items/:id/move', json(MoveItem), async (c) =>
    c.json(await moveItem(c.get('ctx'), await boardOf(c), c.req.param('id'), c.req.valid('json'))))
  // 领上传地址、下载文件：和网页同一组接口
  .route('/', files)
  .all('*', (c) => c.json({ error: '没有这个接口：能调的接口见 /api/ai/index.md' }, 404));
