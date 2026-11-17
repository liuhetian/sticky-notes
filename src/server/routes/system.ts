// 登录状态、提醒索引
import { Hono } from 'hono';
import { Reminder } from '../../shared/schema';
import type { Env } from '../env';
import { patchItem } from '../services/items';
import { json } from './util';

export const system = new Hono<Env>()
  .get('/me', (c) => c.json({ ok: true as const, name: c.get('ctx').by }))
  .get('/reminders', async (c) => c.json({ reminders: await c.get('ctx').db.reminders(), now: Date.now() }))
  // 提醒点了「知道了」：元素还在就记下；已经不在了（删了、挪走了），那条提醒没用了，删掉
  .post('/reminders/done', json(Reminder), async (c) => {
    const ctx = c.get('ctx'), r = c.req.valid('json');
    const it = await ctx.db.getItem(r.boardId, r.itemId);
    if (!it) { await ctx.db.dropReminder(r); return c.json({ ok: true as const }); }
    await patchItem(ctx, it, { remindDone: true });
    return c.json({ ok: true as const });
  });
