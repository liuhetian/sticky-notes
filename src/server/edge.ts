// EdgeOne Makers 边缘函数入口：scripts/build-edge.ts 把它打成一个包，放两个入口：
// edge-functions/api/[[default]].js 接 /api/*，edge-functions/wiki/[[default]].js 接 /wiki/ 下没有静态文件的路径（.md）
import { getStore, type StoreOptions } from '@edgeone/pages-blob';
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

export function onRequest(context: MakersContext) {
  // 平台没给 waitUntil 时，后台任务照样会跑，只是不保证跑完
  const waitUntil = context.waitUntil?.bind(context) ?? (() => {});
  const target = new URL(context.request.url).pathname.startsWith('/wiki/') ? wiki : app;
  return target.fetch(context.request, context.env, { waitUntil, passThroughOnException() {}, props: {} });
}
