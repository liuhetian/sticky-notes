// 文件：领上传地址、下载。文件本体在 COS，这里只发有时效的地址
import { Hono } from 'hono';
import { DOC_EXT, FILE_ID_RE, INLINE_IMAGE_EXT, MEDIA_EXT, extOf } from '../../shared/constants';
import { newFileId } from '../../shared/ids';
import { UploadRequest } from '../../shared/schema';
import type { Env } from '../env';
import { safeName } from '../services/items';
import { json } from './util';

export const files = new Hono<Env>()
  // 先领预签名 PUT 地址，浏览器直接传进 COS；传完再建元素
  .post('/uploads', json(UploadRequest), async (c) => {
    const id = newFileId();
    return c.json({ id, url: await c.get('ctx').files.uploadUrl(id) });
  })
  // 常见位图、音视频按本来的类型给，页面里能直接显示、播放；其余一律当附件下载。
  // 文档带 preview=cover / viewer 时跳到 COS 现转的第一页图片 / 在线阅读器。
  // 默认跳到 COS 的预签名地址；带 raw=1 时由本站原样转发（画图、复制图片、转 HEIC 要读像素，走本站域名才不跨域）
  .get('/files/:id/:name', async (c) => {
    const id = c.req.param('id');
    if (!FILE_ID_RE.test(id)) return c.json({ error: '文件 ID 不对' }, 400);
    const store = c.get('ctx').files;
    const name = safeName(c.req.param('name'));
    const ext = extOf(name);
    const known = INLINE_IMAGE_EXT[ext] ?? MEDIA_EXT[ext];
    const inline = !!known && c.req.query('dl') !== '1';
    const mime = inline ? known : 'application/octet-stream';
    if (c.req.query('raw') === '1') {
      const body = await store.open(id);
      if (!body) return c.json({ error: '文件没了（可能已过期）' }, 404);
      return c.body(body, 200, {
        'Content-Type': mime,
        'Cache-Control': 'private, max-age=86400',
        'CDN-Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
    }
    const preview = c.req.query('preview');
    const doc = preview === 'cover' || preview === 'viewer' ? preview : null;
    if (doc && !DOC_EXT.includes(ext)) return c.json({ error: '这种文件不能预览' }, 400);
    // 不先问 COS 文件在不在：每张图片显示都走这里，省一次请求；文件没了 COS 自己回 404。
    // 地址一天一换；跳转本身缓存一小时，内容由浏览器按 COS 的地址缓存
    c.header('Cache-Control', 'private, max-age=3600');
    c.header('CDN-Cache-Control', 'no-store');
    return c.redirect(doc ? await store.previewUrl(id, ext, doc) : await store.downloadUrl(id, { name, mime, inline }), 302);
  });
