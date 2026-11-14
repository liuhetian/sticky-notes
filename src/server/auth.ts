// 登录：表单换一个 30 天的签名 cookie；脚本和快捷指令直接带 X-Password 请求头
import type { Context, Next } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { timingSafeEqual } from 'hono/utils/buffer';
import type { Env } from './env';

const COOKIE = 'clip_auth';
const MAX_AGE = 30 * 86400;

// 签名密钥里混进站点密码：改了密码，旧 cookie 全部失效
const secretOf = (c: Context<Env>) => `${c.env.COOKIE_SECRET}\n${c.env.SITE_PASSWORD}`;

export const passwordOk = (c: Context<Env>, given: string) => timingSafeEqual(given, c.env.SITE_PASSWORD);

export async function issueCookie(c: Context<Env>) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  await setSignedCookie(c, COOKIE, String(exp), secretOf(c), {
    maxAge: MAX_AGE, path: '/', httpOnly: true, secure: true, sameSite: 'Lax',
  });
}

export const clearCookie = (c: Context<Env>) => deleteCookie(c, COOKIE, { path: '/', secure: true });

export async function requireAuth(c: Context<Env>, next: Next) {
  const header = c.req.header('X-Password');
  let ok: boolean;
  if (header !== undefined) ok = await passwordOk(c, header);
  else {
    const exp = await getSignedCookie(c, secretOf(c), COOKIE);
    ok = typeof exp === 'string' && Number(exp) > Date.now() / 1000;
  }
  if (!ok) return c.json({ error: '需要登录：网页里输密码，或者把密码放进 X-Password 请求头' }, 401);
  await next();
}
