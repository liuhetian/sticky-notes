// 传上来的文件变成什么：一般就是图片或文件卡片；微信聊天记录压缩包 → 便利贴 + 拆出来的图片和文件
import { INLINE_IMAGE_EXT, extOf } from '../../shared/constants';
import { newFileId, newId } from '../../shared/ids';
import type { FileLikeItem, Item, NoteItem } from '../../shared/schema';
import type { Ctx } from '../env';
import { CHAT_ZIP, MAX_CHAT_ZIP, linkName, othersNote, readChatZip } from './chat';
import { autoPlace, sizeOf } from './place';

/**
 * 快捷指令发来的「上传中」元素：文件到了就转成正常卡片。
 * 返回转好的元素；聊天记录压缩包会多出拆开的图片和文件卡片，一并返回。others 是白板上别的元素，重新挑位置用
 */
export async function settlePending(ctx: Ctx, it: FileLikeItem, others: Item[]): Promise<Item[]> {
  const len = await ctx.files.size(it.file.id);
  if (len === null) return [it];
  // 拆包要把整个压缩包读进内存，读不动、解不开都别拖垮整块白板：当普通文件
  const chat = await chatNote(ctx, it, len, others).catch(() => null);
  if (chat) return chat;
  const ready: Item = { ...it, pending: false, file: { ...it.file, size: len }, rev: it.rev + 1, updatedAt: Date.now() };
  await ctx.db.putItem(ready, it);
  return [ready];
}

/**
 * 微信导出的「聊天记录_….zip」：原地变成便利贴（文字排好版）。
 * 里面的图片和文件拆成单独的卡片，在便利贴右边按聊天顺序排三列；消息里的文件名换成指向它的引用 [文件名](/id)，线就从那里连过去。
 * 还有太大没拆的（多半是视频），压缩包留着排在图片后面、末尾的说明链接到它，否则删掉。不是聊天记录返回 null，什么都不动。
 * 传了 others（快捷指令分享来的）就给这一整组重新挑位置；网页上传的留在放下的地方
 */
export async function chatNote(ctx: Ctx, it: FileLikeItem, len: number, others?: Item[]): Promise<Item[] | null> {
  if (!CHAT_ZIP.test(it.file.name) || len > MAX_CHAT_ZIP) return null;
  const chat = readChatZip(await ctx.files.read(it.file.id));
  if (!chat) return null;
  const now = Date.now();
  // 一行三张，行距按最高的图片卡（竖图）算，不会压到下一行
  const n = chat.parts.length + (chat.others ? 1 : 0);
  // 拆出来的卡片排在便利贴右边：便利贴有多宽就让开多远
  const gap = sizeOf({ type: 'note', text: chat.text }).w + 30;
  if (others) {
    const img = sizeOf({ type: 'image' }), note = sizeOf({ type: 'note', text: chat.text });
    const size = n ? { w: gap + (Math.min(3, n) - 1) * 300 + img.w, h: Math.max(note.h, (Math.ceil(n / 3) - 1) * 430 + img.h) } : note;
    it = { ...it, ...autoPlace(others, size) };
  }
  const slot = (i: number) => ({ x: Math.min(19_500, it.x + gap + (i % 3) * 300), y: Math.min(19_500, it.y + Math.floor(i / 3) * 430) });
  const fresh = { boardId: it.boardId, createdAt: now, updatedAt: now, expiresAt: it.expiresAt, remindAt: null, remindDone: false, rev: 1 };
  const linked: Item[] = [];
  let text = chat.text;
  for (const part of chat.parts) {
    const fileId = newFileId();
    const mime = INLINE_IMAGE_EXT[extOf(part.name)] ?? '';
    await ctx.files.write(fileId, part.data, mime);
    const card: Item = { ...fresh, ...slot(linked.length), id: newId(), type: mime ? 'image' : 'file', file: { id: fileId, name: part.name, size: part.data.length, mime } };
    linked.push(card);
    text = linkName(text, part.name, { id: card.id });
  }
  if (chat.others) {
    const zip: Item = { ...it, ...fresh, ...slot(linked.length), id: newId(), pending: false, file: { ...it.file, size: len } };
    delete zip.links;
    linked.push(zip);
    text = `${text}\n\n${othersNote(chat.others, { id: zip.id })}`;
  }
  for (const x of linked) await ctx.db.putItem(x);
  const { file, pending: _p, links: _l, ...rest } = it;
  const note: NoteItem = { ...rest, type: 'note', text, color: 'yellow', rev: it.rev + 1, updatedAt: now };
  await ctx.db.putItem(note, it);
  if (!chat.others) await ctx.files.delete(file.id);
  return [note, ...linked];
}
