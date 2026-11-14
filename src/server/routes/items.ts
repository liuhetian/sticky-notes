// 白板上的元素：同步、新建、修改、删除（进废纸篓）、换白板。挂在 /boards 下面
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { DAY, TRASH, expiryFrom } from '../../shared/constants';
import { CreateItem, MoveItem, PatchItem, type Item } from '../../shared/schema';
import type { Env } from '../env';
import { chatNote } from '../services/intake';
import { clearTrash, listItems, moveTo, newItemBase, purge, toTrash } from '../services/items';
import { json, safeName } from './util';

export const items = new Hono<Env>()
  // 同步第一步：只拿 id 和 etag，前端比对后只取变了的
  // 别叫 index：hono/client 把 index 当成「这一层的根路径」，会请求成 /boards/:id
  .get('/:id/etags', async (c) => c.json({ items: await c.get('ctx').db.index(c.req.param('id')), now: Date.now() }))
  .get('/:id/items', zValidator('query', z.object({ ids: z.string().optional() })), async (c) => {
    const { ids } = c.req.valid('query');
    const list = await listItems(c.get('ctx'), c.req.param('id'), ids === undefined ? undefined : ids.split(',').filter(Boolean));
    return c.json({ items: list, now: Date.now() });
  })
  .post('/:id/items', json(CreateItem), async (c) => {
    const ctx = c.get('ctx');
    const boardId = c.req.param('id');
    if (boardId === TRASH) return c.json({ error: '废纸篓里不能直接贴东西' }, 400);
    if (!(await ctx.db.findBoard(boardId))) return c.json({ error: '没有这块白板' }, 404);
    const b = c.req.valid('json');
    // id 是前端定的：同一个请求重发时，原样返回已经建好的那个
    if (b.id) {
      const dup = await ctx.db.getItem(boardId, b.id);
      if (dup) return c.json(dup, 200);
    }
    const base = newItemBase(boardId, b.x, b.y, b.ttl, b.id);
    let item: Item;
    if (b.type === 'note') item = { ...base, type: 'note', text: b.text, color: b.color };
    else if (b.type === 'location') item = { ...base, type: 'location', lat: b.lat, lng: b.lng, name: b.name };
    else {
      const len = await ctx.files.size(b.file.id);
      if (len === null) return c.json({ error: '文件还没传上去' }, 400);
      const fileItem = { ...base, type: b.type, file: { ...b.file, name: safeName(b.file.name), size: len } };
      // 微信聊天记录压缩包：直接变成便利贴
      const chat = await chatNote(ctx, fileItem, len).catch(() => null);
      if (chat) return c.json(chat[0], 201);
      item = fileItem;
    }
    await ctx.db.putItem(item);
    return c.json(item, 201);
  })
  // 按字段合并：读最新的那份，只覆盖这次带来的字段；文字带 baseRev 做冲突检测
  .patch('/:id/items/:itemId', json(PatchItem), async (c) => {
    const ctx = c.get('ctx');
    const prev = await ctx.db.getItem(c.req.param('id'), c.req.param('itemId'));
    if (!prev) return c.json({ error: '这个元素没了（可能已过期）' }, 404);
    const p = c.req.valid('json');
    if (prev.type === 'note' && p.text !== undefined && p.baseRev !== undefined && p.baseRev !== prev.rev && p.text !== prev.text) {
      return c.json({ error: '这张便利贴刚被别人改过', item: prev }, 409);
    }
    const now = Date.now();
    const next: Item = { ...prev, rev: prev.rev + 1, updatedAt: now };
    if (p.x !== undefined) next.x = p.x;
    if (p.y !== undefined) next.y = p.y;
    if (next.type === 'note') {
      if (p.text !== undefined) next.text = p.text;
      if (p.color !== undefined) next.color = p.color;
    }
    let oldThumb: string | undefined;
    if (next.type === 'location') {
      if (p.name !== undefined) next.name = p.name;
      if (p.thumb !== undefined && p.thumb.id !== next.thumb?.id) { oldThumb = next.thumb?.id; next.thumb = p.thumb; }
    }
    if (p.ttl !== undefined) next.expiresAt = expiryFrom(p.ttl, now);
    if (p.remindAt !== undefined) { next.remindAt = p.remindAt; next.remindDone = false; }
    if (p.remindDone !== undefined) next.remindDone = p.remindDone;
    if (p.links !== undefined) {
      const seen = new Set<string>();
      next.links = p.links.filter((l) => l.to !== next.id && !seen.has(l.id) && !!seen.add(l.id));
    }
    // 提醒比到期还晚：到期往后推到提醒后一天
    if (next.remindAt !== null && next.expiresAt !== null && next.expiresAt < next.remindAt + DAY) next.expiresAt = next.remindAt + DAY;
    await ctx.db.putItem(next, prev);
    if (oldThumb) ctx.defer(ctx.files.delete(oldThumb));
    return c.json(next);
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
