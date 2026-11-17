// 白板上的元素：同步、新建、修改、删除（进废纸篓）、换白板。挂在 /boards 下面；规则在 services/items.ts
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import * as z from 'zod';
import { BATCH, TRASH } from '../../shared/constants';
import { CreateItem, MoveItem, PatchItem } from '../../shared/schema';
import type { Env } from '../env';
import { clearTrash, createItem, itemOr404, listItems, moveItem, patchItem, pruneTrash, purge, toTrash } from '../services/items';
import { json } from './util';

const Ids = z.object({ ids: z.string().transform((s) => s.split(',').filter(Boolean)).pipe(z.array(z.string()).min(1).max(BATCH)) });

export const items = new Hono<Env>()
  // 同步第一步：只拿 id 和 etag，前端比对后只取变了的
  // 别叫 index：hono/client 把 index 当成「这一层的根路径」，会请求成 /boards/:id
  .get('/:id/etags', async (c) => c.json({ items: await c.get('ctx').db.index(c.req.param('id')), now: Date.now() }))
  // 第二步：按 id 取，一次最多 BATCH 个（一块白板最多 BOARD_MAX 个，一次取得完）
  .get('/:id/items', zValidator('query', Ids), async (c) => {
    const list = await listItems(c.get('ctx'), c.req.param('id'), c.req.valid('query').ids);
    return c.json({ items: list, now: Date.now() });
  })
  .post('/:id/items', json(CreateItem), async (c) => {
    const r = await createItem(c.get('ctx'), c.req.param('id'), c.req.valid('json'));
    return c.json(r.item, r.created ? 201 : 200);
  })
  .patch('/:id/items/:itemId', json(PatchItem), async (c) => {
    const ctx = c.get('ctx');
    const r = await patchItem(ctx, await itemOr404(ctx, c.req.param('id'), c.req.param('itemId')), c.req.valid('json'));
    return 'conflict' in r ? c.json({ error: r.error, item: r.conflict }, 409) : c.json(r.item);
  })
  // 白板上的删除是进废纸篓（返回挪过去的那份，撤销时用）；废纸篓里的删除才是真删
  .delete('/:id/items/:itemId', async (c) => {
    const ctx = c.get('ctx');
    const boardId = c.req.param('id');
    const it = await ctx.db.getItem(boardId, c.req.param('itemId'));
    if (!it) return c.json({ ok: true as const, item: null });
    if (boardId === TRASH) { await purge(ctx, it); return c.json({ ok: true as const, item: null }); }
    return c.json({ ok: true as const, item: await toTrash(ctx, it) });
  })
  // 挪到另一块白板；从废纸篓里不指定目标就放回原处（原处没了回第一块）
  .post('/:id/items/:itemId/move', json(MoveItem), async (c) =>
    c.json(await moveItem(c.get('ctx'), c.req.param('id'), c.req.param('itemId'), c.req.valid('json'))))
  .delete('/:id/items', async (c) => {
    if (c.req.param('id') !== TRASH) return c.json({ error: '只有废纸篓能一键清空' }, 400);
    // 一次只删一批：remaining 不是 0 就再调一次
    return c.json(await clearTrash(c.get('ctx')));
  })
  // 废纸篓超出 50 个时删掉最早进去的几个；网页在删除之后接着调到 remaining 为 0
  .post('/:id/prune', async (c) => {
    if (c.req.param('id') !== TRASH) return c.json({ error: '只有废纸篓要修剪' }, 400);
    return c.json(await pruneTrash(c.get('ctx')));
  });
