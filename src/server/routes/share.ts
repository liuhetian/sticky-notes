// 给 iPhone 快捷指令用：白板可以直接写名字，位置由服务端挑。
// 快捷指令自己分清类型，一种类型一个接口：文字、链接、位置、文件；这里不猜内容
import { Hono } from 'hono';
import { BATCH, DEFAULT_TTL, INLINE_IMAGE_EXT, TRASH, extOf } from '../../shared/constants';
import { newFileId } from '../../shared/ids';
import { ShareFile, ShareLink, ShareLocation, ShareText, type Item } from '../../shared/schema';
import type { Ctx, Env } from '../env';
import { listItems, newItemBase } from '../services/items';
import { placeOfLink } from '../services/maplink';
import { autoPlace, sizeOf } from '../services/place';
import { json, kindOf, safeName } from './util';

type Body = { type: 'note'; text: string } | { type: 'location'; lat: number; lng: number; name: string };

/** 「标题 + 链接」写成 markdown 链接；没有标题（或标题就是网址）只放网址 */
export function linkMarkdown(url: string, title = ''): string {
  const t = title.trim();
  if (!t || t === url) return url;
  const safe = url.replace(/[()\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
  return `[${t.replace(/[\\[\]]/g, '\\$&')}](${safe})`;
}

/** 挑空位时参考的元素：白板上东西很多时只看其中一批（读不了全部），偶尔会压到没看的那些 */
async function nearby(ctx: Ctx, boardId: string) {
  const index = await ctx.db.index(boardId);
  return listItems(ctx, boardId, index.slice(0, BATCH).map((e) => e.id));
}

/** 在名叫 boardName 的白板上挑个空位，建一张便利贴或位置卡片；白板不存在回 null */
async function add(ctx: Ctx, boardName: string, body: Body) {
  const board = await ctx.db.findBoard(boardName);
  if (!board || board.id === TRASH) return null;
  const { x, y } = autoPlace(await nearby(ctx, board.id), sizeOf(body));
  const base = newItemBase(board.id, x, y, DEFAULT_TTL);
  const item: Item = body.type === 'note' ? { ...base, ...body, color: 'yellow' } : { ...base, ...body };
  await ctx.db.putItem(item);
  return { ok: true as const, board: board.name, itemId: item.id, type: item.type };
}
const noBoard = (name: string) => ({ error: `没有叫「${name}」的白板` });

export const share = new Hono<Env>()
  .post('/share/text', json(ShareText), async (c) => {
    const b = c.req.valid('json');
    const r = await add(c.get('ctx'), b.board, { type: 'note', text: b.text });
    return r ? c.json(r) : c.json(noBoard(b.board), 404);
  })
  // 链接：地图 App 分享的地点变位置卡片，其余存成「[标题](网址)」的便利贴
  .post('/share/link', json(ShareLink), async (c) => {
    const b = c.req.valid('json');
    const spot = await placeOfLink(b.url);
    const r = await add(c.get('ctx'), b.board, spot ? { type: 'location', ...spot } : { type: 'note', text: linkMarkdown(b.url, b.title) });
    return r ? c.json(r) : c.json(noBoard(b.board), 404);
  })
  .post('/share/location', json(ShareLocation), async (c) => {
    const b = c.req.valid('json');
    const r = await add(c.get('ctx'), b.board, { type: 'location', lat: b.lat, lng: b.lng, name: b.name });
    return r ? c.json(r) : c.json(noBoard(b.board), 404);
  })
  // 先建一个「上传中」的元素再给 PUT 地址；文件到了，下次读白板时自动转成正常卡片（小的纯文本转成便利贴）
  // 直接回纯文本的地址：快捷指令拿「URL 的内容」就能当下一步的地址，不用再取词典值
  .post('/share/file', json(ShareFile), async (c) => {
    const ctx = c.get('ctx');
    const b = c.req.valid('json');
    const board = await ctx.db.findBoard(b.board);
    if (!board || board.id === TRASH) return c.json({ error: `没有叫「${b.board}」的白板` }, 404);
    const ext = b.ext?.replace(/^\./, '').toLowerCase();
    const name = safeName(ext && extOf(b.name) !== ext ? `${b.name}.${ext}` : b.name);
    const fileId = newFileId();
    const url = await ctx.files.uploadUrl(fileId);
    const type = kindOf(name);
    const { x, y } = autoPlace(await nearby(ctx, board.id), sizeOf({ type }));
    const item: Item = {
      ...newItemBase(board.id, x, y, DEFAULT_TTL), type, pending: true,
      file: { id: fileId, name, size: 0, mime: INLINE_IMAGE_EXT[extOf(name)] ?? '' },
    };
    await ctx.db.putItem(item);
    return c.text(url);
  });
