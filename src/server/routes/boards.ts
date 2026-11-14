// 白板：列表、新建、改名、删除
import { Hono } from 'hono';
import { TRASH } from '../../shared/constants';
import { newBoardId } from '../../shared/ids';
import { BoardName } from '../../shared/schema';
import type { Env } from '../env';
import { trashBoard } from '../services/items';
import { json } from './util';

export const boards = new Hono<Env>()
  .get('/', async (c) => c.json({ boards: await c.get('ctx').db.boards() }))
  .post('/', json(BoardName), async (c) => {
    const { db } = c.get('ctx');
    const board = { id: newBoardId(), name: c.req.valid('json').name, createdAt: Date.now() };
    await db.saveBoards([...(await db.boards()), board]);
    return c.json(board, 201);
  })
  .patch('/:id', json(BoardName), async (c) => {
    const { db } = c.get('ctx');
    const list = await db.boards();
    const board = list.find((b) => b.id === c.req.param('id'));
    if (!board) return c.json({ error: '没有这块白板' }, 404);
    if (board.id === TRASH) return c.json({ error: '废纸篓不能改名' }, 400);
    board.name = c.req.valid('json').name;
    await db.saveBoards(list);
    return c.json(board);
  })
  // 上面的元素进废纸篓，不直接删
  .delete('/:id', async (c) => {
    const ctx = c.get('ctx');
    const list = await ctx.db.boards();
    const id = c.req.param('id');
    if (id === TRASH) return c.json({ error: '废纸篓不能删' }, 400);
    if (!list.some((b) => b.id === id)) return c.json({ error: '没有这块白板' }, 404);
    if (list.filter((b) => b.id !== TRASH).length <= 1) return c.json({ error: '至少留一块白板' }, 400);
    // 元素多的白板一次挪不完：remaining 不是 0 时白板还在，再调一次接着挪
    const r = await trashBoard(ctx, id);
    if (!r.remaining) await ctx.db.saveBoards(list.filter((b) => b.id !== id));
    return c.json({ ok: true as const, ...r });
  });
