// 不用登录就能调的：登录、退出、名字列表、定时清理
import { Hono } from 'hono';
import { Login } from '../../shared/schema';
import { clearCookie, issueCookie, loginNamesOf, nameOk, namesOf, passwordOk } from '../auth';
import type { Env } from '../env';
import { cleanup } from '../services/cleanup';
import { json } from './util';

export const open = new Hono<Env>()
  .post('/login', json(Login), async (c) => {
    const { password, name } = c.req.valid('json');
    if (!(await passwordOk(c, password))) return c.json({ error: '密码不对' }, 401);
    if (!nameOk(c, name)) return c.json({ error: `不认识「${name}」这个名字` }, 400);
    await issueCookie(c, name);
    return c.json({ ok: true as const, name });
  })
  .post('/logout', (c) => {
    clearCookie(c);
    return c.json({ ok: true as const });
  })
  // 名字怎么显示（卡片角落的最近编辑者）、登录页能选谁：登录前就要用
  .get('/names', (c) => c.json({ names: namesOf(c.env), login: loginNamesOf(c.env) }))
  // 每天的定时任务调这里；只做清理，谁调都无害
  // 每调一次清一批；done 为 false 就是还没清完，再调一次接着清
  .post('/cron/cleanup', async (c) => c.json(await cleanup(c.get('ctx'))));
