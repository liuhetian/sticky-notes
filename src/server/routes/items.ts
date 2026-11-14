// 白板上的元素：同步、新建、修改、删除（进废纸篓）、换白板。挂在 /boards 下面；规则在 services/items.ts
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { BATCH, TRASH } from '../../shared/constants';
import { CreateItem, MoveItem, PatchItem } from '../../shared/schema';
import type { Env } from '../env';
import { boardForNew, clearTrash, createItem, listItems, moveTo, patchItem, purge, toTrash } from '../services/items';
import { json } from './util';

const Ids = z.object({ ids: z.string().transform((s) => s.split(',').filter(Boolean)).pipe(z.array(z.string()).min(1).max(BATCH)) });

export const items = new Hono<Env>()
  // 同步第一步：只拿 id 和 etag，前端比对后只取变了的
  // 别叫 index：hono/client 把 index 当成「这一层的根路径」，会请求成 /boards/:id
  .get('/:id/etags', async (c) => c.json({ items: await c.get('ctx').db.index(c.req.param('id')), now: Date.now() }))
  // 第二步：按 id 一批批取。一次执行读不了太多元素，所以必须带 ids，最多 BATCH 个
  .get('/:id/items', zValidator('query', Ids), async (c) => {
    const list = await listItems(c.get('ctx'), c.req.param('id'), c.req.valid('query').ids);
    return c.json({ items: list, now: Date.now() });
  })
  .post('/:id/items', json(CreateItem), async (c) => {
    const ctx = c.get('ctx');
    const boardId = c.req.param('id');
    if (boardId === TRASH) return c.json({ error: '废纸篓里不能直接贴东西' }, 400);
    if (!(await boardForNew(ctx, boardId))) return c.json({ error: '没有这块白板' }, 404);
    const b = c.req.valid('json');
    // id 是前端定的：同一个请求重发时，原样返回已经建好的那个
    const dup = b.id ? await ctx.db.getItem(boardId, b.id) : null;
    if (dup) return c.json(dup, 200);
    return c.json(await createItem(ctx, boardId, b), 201);
  })
  .patch('/:id/items/:itemId', json(PatchItem), async (c) => {
    const ctx = c.get('ctx');
    const prev = await ctx.db.getItem(c.req.param('id'), c.req.param('itemId'));
    if (!prev) return c.json({ error: '这个元素没了（可能已过期）' }, 404);
    const r = await patchItem(ctx, prev, c.req.valid('json'));
    return 'conflict' in r ? c.json({ error: '这张便利贴刚被别人改过', item: r.conflict }, 409) : c.json(r.item);
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
  .post('/:id/items/:itemId/move', json(MoveItem), async (c) => {
    const ctx = c.get('ctx');
    const from = c.req.param('id');
    const it = await ctx.db.getItem(from, c.req.param('itemId'));
    if (!it) return c.json({ error: '这个元素没了（可能已过期）' }, 404);
    const list = await ctx.db.boards();
    const body = c.req.valid('json');
    let to = body.to ?? (from === TRASH ? it.from : undefined);
    if (!to || !list.some((b) => b.id === to)) to = list[0].id;
    if (to === from) return c.json({ error: '已经在这块白板上了' }, 400);
    return c.json({ item: await moveTo(ctx, it, to, body), to });
  })
  .delete('/:id/items', async (c) => {
    if (c.req.param('id') !== TRASH) return c.json({ error: '只有废纸篓能一键清空' }, 400);
    // 一次只删一批：remaining 不是 0 就再调一次
    return c.json(await clearTrash(c.get('ctx')));
  });
