// 给 iPhone 快捷指令用：白板可以直接写名字，位置由服务端挑，固定保留默认时长；白板满了就拒绝。
// 快捷指令自己分清类型，一种类型一个接口：文字、链接、位置、文件；这里不猜内容
import { Hono } from 'hono';
import { DEFAULT_TTL, extOf, fileKind, imageMime } from '../../shared/constants';
import { newFileId } from '../../shared/ids';
import { sizeOf } from '../../shared/layout';
import { ShareFile, ShareLink, ShareLocation, ShareText, type Board, type FileRef, type Item } from '../../shared/schema';
import type { Ctx, Env } from '../env';
import { boardForNew, newItemBase, safeName, spotFor } from '../services/items';
import { placeOfLink } from '../services/maplink';
import { json } from './util';

type Content =
  | { type: 'note'; text: string; color: 'yellow' }
  | { type: 'location'; lat: number; lng: number; name: string }
  | { type: 'image' | 'file'; file: FileRef; pending: true };

/** 「标题 + 链接」写成 markdown 链接；没有标题（或标题就是网址）只放网址 */
function linkMarkdown(url: string, title = ''): string {
  const t = title.trim();
  if (!t || t === url) return url;
  const safe = url.replace(/[()\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
  return `[${t.replace(/[\\[\]]/g, '\\$&')}](${safe})`;
}

/** 在白板上挑个空位存下；满了就拒绝 */
async function add(ctx: Ctx, board: Board, content: Content): Promise<Item> {
  const { x, y } = await spotFor(ctx, board.id, sizeOf(content));
  const item = { ...newItemBase(ctx, board.id, { x, y }, DEFAULT_TTL), ...content } as Item;
  await ctx.db.putItem(item);
  return item;
}
const done = (board: Board, item: Item) => ({ ok: true as const, board: board.name, itemId: item.id, type: item.type });
const note = (text: string): Content => ({ type: 'note', text, color: 'yellow' });

export const share = new Hono<Env>()
  .post('/share/text', json(ShareText), async (c) => {
    const ctx = c.get('ctx'), b = c.req.valid('json');
    const board = await boardForNew(ctx, b.board);
    return c.json(done(board, await add(ctx, board, note(b.text))));
  })
  // 链接：地图 App 分享的地点变位置卡片，其余存成「[标题](网址)」的便利贴
  .post('/share/link', json(ShareLink), async (c) => {
    const ctx = c.get('ctx'), b = c.req.valid('json');
    const board = await boardForNew(ctx, b.board);
    const spot = await placeOfLink(b.url);
    return c.json(done(board, await add(ctx, board, spot ? { type: 'location', ...spot } : note(linkMarkdown(b.url, b.title)))));
  })
  .post('/share/location', json(ShareLocation), async (c) => {
    const ctx = c.get('ctx'), b = c.req.valid('json');
    const board = await boardForNew(ctx, b.board);
    return c.json(done(board, await add(ctx, board, { type: 'location', lat: b.lat, lng: b.lng, name: b.name })));
  })
  // 先建一个「上传中」的元素再给 PUT 地址；文件到了，下次读白板时自动转成正常卡片。
  // 直接回纯文本的地址：快捷指令拿「URL 的内容」就能当下一步的地址，不用再取词典值
  .post('/share/file', json(ShareFile), async (c) => {
    const ctx = c.get('ctx'), b = c.req.valid('json');
    const board = await boardForNew(ctx, b.board);
    const ext = b.ext?.replace(/^\./, '').toLowerCase();
    const name = safeName(ext && extOf(b.name) !== ext ? `${b.name}.${ext}` : b.name);
    const id = newFileId();
    await add(ctx, board, { type: fileKind(name), pending: true, file: { id, name, size: 0, mime: imageMime(name) } });
    return c.text(await ctx.files.uploadUrl(id));
  });
