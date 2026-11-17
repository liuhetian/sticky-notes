// 牛牛便利贴 API（/api/*）：这里只管把各组路由拼起来。数据模型见 ../shared/schema.ts
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from './auth';
import type { Ctx, Env } from './env';
import { ai, aiDocs } from './routes/ai';
import { open } from './routes/auth';
import { boards } from './routes/boards';
import { files } from './routes/files';
import { items } from './routes/items';
import { share } from './routes/share';
import { system } from './routes/system';

/** makeCtx 只管存储；这次是谁（by）由 requireAuth 认出来以后补上 */
export function createApp(makeCtx: (c: Context<Env>) => Omit<Ctx, 'by'>) {
  const app = new Hono<Env>().basePath('/api');
  // 业务上拒绝（services 里抛的 HTTPException）按它的状态码回；其余是真出错了
  app.onError((err, c) => (err instanceof HTTPException ? c.json({ error: err.message }, err.status) : c.json({ error: `服务出错：${err.message}` }, 500)));
  return app
    // 接口响应一律不进任何缓存；文件下发自己设了 Cache-Control，不覆盖
    .use('*', async (c, next) => {
      await next();
      if (!c.res.headers.has('Cache-Control')) {
        c.res.headers.set('Cache-Control', 'private, no-store, max-age=0');
        c.res.headers.set('CDN-Cache-Control', 'no-store');
      }
    })
    .use('*', async (c, next) => {
      if (!c.env.SITE_PASSWORD || !c.env.COOKIE_SECRET || !c.env.NAMES) return c.json({ error: '站点配置缺失' }, 500);
      c.set('ctx', { ...makeCtx(c), by: '' });
      await next();
    })
    .route('/', open)
    // 给 AI 读的文档：不用登录；占位符背后的接口在进程内调这个 app 自己，各自照常鉴权
    .route('/ai', aiDocs((req, c) => app.fetch(req, c.env, executionCtxOf(c))))
    .use('*', requireAuth)
    .route('/boards', boards)
    .route('/boards', items)
    .route('/', files)
    .route('/', share)
    .route('/', system)
    .route('/ai', ai);
}

/** 测试里直接 app.request()，没有 executionCtx，取它会抛错 */
function executionCtxOf(c: Context<Env>) {
  try { return c.executionCtx; } catch { return undefined; }
}

export type AppType = ReturnType<typeof createApp>;
