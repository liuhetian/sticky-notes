import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';

/** 请求体校验失败统一回 400 + 中文说明 */
export const json = <T extends ZodType>(schema: T) =>
  zValidator('json', schema, (r, c) => {
    if (!r.success) return c.json({ error: `参数不对：${r.error.issues.map((i) => `${i.path.join('.') || '请求体'} ${i.message}`).join('；')}` }, 400);
  });
