// 身份：每个请求都要知道是谁。网页登录换一个 30 天的签名 cookie（里面记着名字）；
// 脚本、快捷指令、AI 每次带请求头 X-Password: 密码#名字。名字必须在部署配置 NAMES 里。
// 共用密码哪里都能用；AI 的密码只能调 /api/ai/ 下的接口
import type { Context, Next } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { timingSafeEqual } from 'hono/utils/buffer';
import type { Bindings, Env } from './env';

const COOKIE = 'clip_auth';
const MAX_AGE = 30 * 86400;

/** NAMES（banana:香蕉,niuniu:牛牛）→ { banana: '香蕉', niuniu: '牛牛' } */
export function namesOf(env: Bindings): Record<string, string> {
  return Object.fromEntries((env.NAMES ?? '').split(',').flatMap((pair) => {
    const [key, label] = pair.split(':').map((s) => s.trim());
    return key ? [[key, label || key]] : [];
  }));
}
const known = (env: Bindings, name: string) => !!name && Object.hasOwn(namesOf(env), name);

/** 登录页可选的名字：WEB_NAMES 里列的；没配就是全部 */
export function loginNamesOf(env: Bindings): string[] {
  const keys = env.WEB_NAMES ? env.WEB_NAMES.split(',').map((s) => s.trim()) : Object.keys(namesOf(env));
  return keys.filter((k) => known(env, k));
}

// 签名密钥里混进共用密码：改了它，旧 cookie 全部失效；改 AI 的密码不影响人
const secretOf = (c: Context<Env>) => `${c.env.COOKIE_SECRET}\n${c.env.SITE_PASSWORD}`;

/** 共用密码对不对（网页登录只认它） */
export const passwordOk = (c: Context<Env>, given: string) => timingSafeEqual(given, c.env.SITE_PASSWORD);
export const nameOk = (c: Context<Env>, name: string) => known(c.env, name);

export async function issueCookie(c: Context<Env>, name: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  await setSignedCookie(c, COOKIE, `${exp}:${name}`, secretOf(c), {
    maxAge: MAX_AGE, path: '/', httpOnly: true, secure: true, sameSite: 'Lax',
  });
}

export const clearCookie = (c: Context<Env>) => deleteCookie(c, COOKIE, { path: '/', secure: true });

type Who = { name: string } | { status: 401 | 403; error: string };

async function who(c: Context<Env>): Promise<Who> {
  const header = c.req.header('X-Password');
  if (header === undefined) {
    // cookie 里没有名字（或名字已经不在配置里）都算没登录
    const v = await getSignedCookie(c, secretOf(c), COOKIE);
    const [exp, name = ''] = typeof v === 'string' ? v.split(':') : [];
    if (Number(exp) > Date.now() / 1000 && known(c.env, name)) return { name };
    return { status: 401, error: '需要登录：网页里输密码，或者请求头带 X-Password: 密码#名字' };
  }
  const i = header.lastIndexOf('#');
  const password = i < 0 ? header : header.slice(0, i);
  const name = i < 0 ? '' : header.slice(i + 1).trim();
  const site = await passwordOk(c, password);
  const ai = !site && !!c.env.AI_PASSWORD && (await timingSafeEqual(password, c.env.AI_PASSWORD));
  if (!site && !ai) return { status: 401, error: '密码不对：请求头写成 X-Password: 密码#名字' };
  if (!name) return { status: 401, error: '少了名字：请求头写成 X-Password: 密码#名字' };
  if (!known(c.env, name)) return { status: 401, error: `不认识「${name}」这个名字，可用的有：${Object.keys(namesOf(c.env)).join('、')}` };
  if (ai && !c.req.path.startsWith('/api/ai/')) return { status: 403, error: 'AI 的密码只能调 /api/ai/ 下的接口，说明见 /wiki/ai-api.md' };
  return { name };
}

/** 认出是谁，记进 ctx.by；认不出就拒绝 */
export async function requireAuth(c: Context<Env>, next: Next) {
  const r = await who(c);
  if ('error' in r) return c.json({ error: r.error }, r.status);
  c.set('ctx', { ...c.get('ctx'), by: r.name });
  await next();
}
