// 不用登录就能调的：登录、退出、定时清理
import { Hono } from 'hono';
import { Login } from '../../shared/schema';
import { clearCookie, issueCookie, passwordOk } from '../auth';
import type { Env } from '../env';
import { cleanup } from '../services/cleanup';
import { json } from './util';

export const open = new Hono<Env>()
  .post('/login', json(Login), async (c) => {
    if (!(await passwordOk(c, c.req.valid('json').password))) return c.json({ error: '密码不对' }, 401);
    await issueCookie(c);
    return c.json({ ok: true as const });
  })
  .post('/logout', (c) => {
    clearCookie(c);
    return c.json({ ok: true as const });
  })
  // 每天的定时任务调这里；只做清理，谁调都无害
  // 每调一次清一批；done 为 false 就是还没清完，再调一次接着清
  .post('/cron/cleanup', async (c) => c.json(await cleanup(c.get('ctx'))));
