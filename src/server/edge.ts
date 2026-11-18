// EdgeOne Makers 边缘函数入口：scripts/build-edge.ts 把它打成一个包，只放一个入口 edge-functions/[[default]].js，
// 接住所有没对上静态文件的路径，这里按路径分：/api/* 给接口，/wiki/ 下的（页面有静态文件，平台直接给，落到这里的是 .md）给文档，
// 其余是前端路由（分享链接 /share/...），回首页
import { getStore, type StoreOptions } from '@edgeone/pages-blob';
import indexHtml from '../../build/dist/index.html?raw';
import { createApp } from './app';
import { Db } from './repo/db';
import { CosFiles } from './storage/files';
import { createWiki } from './wiki';

type MakersContext = { request: Request; env: Record<string, string>; waitUntil?: (p: Promise<unknown>) => void };

const app = createApp((c) => {
  const { COS_BUCKET, COS_REGION, COS_SECRET_ID, COS_SECRET_KEY } = c.env;
  if (!COS_BUCKET || !COS_REGION || !COS_SECRET_ID || !COS_SECRET_KEY) throw new Error('COS 配置缺失');
  return {
    // 读一律强一致：刚写完马上读（同步、冲突检测）不能拿到旧的。
    // 类型声明把 projectId、token 标成必填，其实在平台里运行时会自己取部署凭据，不用传
    db: new Db(getStore({ name: 'clipboard', consistency: 'strong' } as StoreOptions)),
    files: new CosFiles({ bucket: COS_BUCKET, region: COS_REGION, secretId: COS_SECRET_ID, secretKey: COS_SECRET_KEY }),
    // 响应发出后接着做（删旧缩略图、处理到期的）：失败了记一笔，不影响这次请求
    defer: (p) => c.executionCtx.waitUntil(p.catch((e) => console.error('[defer]', e))),
  };
});
const wiki = createWiki(app);

/** 前端路由回首页：函数读不到本站的静态文件，首页是构建时打进包里的（和静态的 index.html 同一次构建） */
function spa(req: Request) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Not Found', { status: 404 });
  return new Response(req.method === 'HEAD' ? null : indexHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
}

export function onRequest(context: MakersContext) {
  // 平台没给 waitUntil 时，后台任务照样会跑，只是不保证跑完
  const waitUntil = context.waitUntil?.bind(context) ?? (() => {});
  const exec = { waitUntil, passThroughOnException() {}, props: {} };
  const { pathname } = new URL(context.request.url);
  if (pathname.startsWith('/api/')) return app.fetch(context.request, context.env, exec);
  if (pathname.startsWith('/wiki/')) return wiki.fetch(context.request, context.env, exec);
  return spa(context.request);
}
