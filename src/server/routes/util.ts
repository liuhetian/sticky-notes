import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';
import { INLINE_IMAGE_EXT, extOf } from '../../shared/constants';

/** 请求体校验失败统一回 400 + 中文说明 */
export const json = <T extends ZodType>(schema: T) =>
  zValidator('json', schema, (r, c) => {
    if (!r.success) return c.json({ error: `参数不对：${r.error.issues.map((i) => `${i.path.join('.') || '请求体'} ${i.message}`).join('；')}` }, 400);
  });

export const safeName = (s: string) => s.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200) || 'file';
export const kindOf = (name: string) => (INLINE_IMAGE_EXT[extOf(name)] ? 'image' : 'file') as 'image' | 'file';
