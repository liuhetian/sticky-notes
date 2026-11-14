// 登录状态、分享链接定位、提醒索引
import { Hono } from 'hono';
import { TRASH } from '../../shared/constants';
import type { Env } from '../env';

export const system = new Hono<Env>()
  .get('/me', (c) => c.json({ ok: true as const }))
  // 分享链接只带元素 id；进了废纸篓的和删掉的一样，都算没了
  .get('/items/:id/locate', async (c) => {
    const boardId = await c.get('ctx').db.locate(c.req.param('id'));
    return boardId && boardId !== TRASH ? c.json({ boardId }) : c.json({ error: '这条已经过期或被删了' }, 404);
  })
  .get('/reminders', async (c) => c.json({ reminders: await c.get('ctx').db.reminders(), now: Date.now() }));
