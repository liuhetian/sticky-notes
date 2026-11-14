// EdgeOne Makers 边缘函数入口：scripts/build-edge.ts 把它打成 edge-functions/api/[[default]].js
import { getStore } from '@edgeone/pages-blob';
import { createApp } from './app';
import { Db } from './repo/db';
import type { BlobLike } from './storage/blob';
import { CosFiles } from './storage/files';

type MakersContext = { request: Request; env: Record<string, string>; waitUntil?: (p: Promise<unknown>) => void };

const app = createApp((c) => {
  let defer: (p: Promise<unknown>) => void = (p) => { p.catch(() => {}); };
  try {
    const ctx = c.executionCtx;
    defer = (p) => ctx.waitUntil(p.catch(() => {}));
  } catch { /* 没有执行上下文就同步吞掉 */ }
  const { COS_BUCKET, COS_REGION, COS_SECRET_ID, COS_SECRET_KEY } = c.env;
  if (!COS_BUCKET || !COS_REGION || !COS_SECRET_ID || !COS_SECRET_KEY) throw new Error('COS 配置缺失');
  return {
    db: new Db(getStore({ name: 'clipboard', consistency: 'strong' } as never) as unknown as BlobLike),
    files: new CosFiles({ bucket: COS_BUCKET, region: COS_REGION, secretId: COS_SECRET_ID, secretKey: COS_SECRET_KEY }),
    defer,
  };
});

export function onRequest(context: MakersContext) {
  const waitUntil = context.waitUntil?.bind(context) ?? ((p: Promise<unknown>) => { p.catch(() => {}); });
  return app.fetch(context.request, context.env, { waitUntil, passThroughOnException() {}, props: {} });
}
