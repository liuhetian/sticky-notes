// 文件传上来以后变成什么：一般就是图片或文件卡片；微信聊天记录压缩包 → 便利贴 + 拆出来的图片和文件
import { BOARD_MAX, MAX_FILE, fileKind, imageMime } from '../../shared/constants';
import { newFileId, newId } from '../../shared/ids';
import { itemBase } from '../../shared/items';
import { COORD_MAX, sizeOf } from '../../shared/layout';
import type { FileLikeItem, Item, NoteItem } from '../../shared/schema';
import type { Ctx } from '../env';
import { CHAT_ZIP, MAX_CHAT_ZIP, linkName, othersNote, readChatZip } from './chat';
import { autoPlace } from './place';

/**
 * 文件已经在 COS 里了（len 是实际大小），把元素存成正式的卡片：一般就是图片或文件卡片，
 * 微信聊天记录压缩包原地变成便利贴、再拆出图片和文件卡片。返回存好的元素，第一个是它本身。
 * it.pending 的是快捷指令先建好的「上传中」元素（已经存着）；其余的是刚要新建的（还没存）。
 * others 是白板上别的元素：给了就让聊天记录那一整组重新挑位置（快捷指令、没给位置的新建）。
 * 超过大小上限返回 null，什么都不存，由调用方收拾
 */
export async function intakeFile(ctx: Ctx, it: FileLikeItem, len: number, others?: Item[]): Promise<Item[] | null> {
  if (len > MAX_FILE) return null;
  try {
    const chat = await chatNote(ctx, it, len, others);
    if (chat) return chat;
  } catch (e) {
    // 拆包要把整个压缩包读进内存。读不动、解不开、写到一半失败，都退回成普通文件卡片：
    // 「上传中」的元素是在读白板时转的，这里要是抛出去，下一轮同步还会再拆一遍
    console.error('[chat-zip]', it.file.name, e);
  }
  const ready: Item = { ...it, file: { ...it.file, size: len }, ...(it.pending ? { pending: false, rev: it.rev + 1, updatedAt: Date.now() } : {}) };
  await ctx.db.putItem(ready, it.pending ? it : null);
  return [ready];
}

/**
 * 微信导出的「聊天记录_….zip」：原地变成便利贴（文字排好版）。
 * 里面的图片和文件拆成单独的卡片，在便利贴右边按聊天顺序排三列；消息里的文件名换成指向它的引用 [文件名](/id)，线就从那里连过去。
 * 只拆到白板放得下为止；没拆的（太多、放不下）留在压缩包里，压缩包排在图片后面、末尾的说明链接到它，否则删掉。
 * 不是聊天记录返回 null，什么都不动。传了 others 就给这一整组重新挑位置；网页上传的留在放下的地方
 */
async function chatNote(ctx: Ctx, it: FileLikeItem, len: number, others?: Item[]): Promise<Item[] | null> {
  if (!CHAT_ZIP.test(it.file.name) || len > MAX_CHAT_ZIP) return null;
  // 还能放几张：便利贴本身占一个（「上传中」的已经算在名单里了）
  const room = BOARD_MAX - (await ctx.db.index(it.boardId)).length - (it.pending ? 0 : 1);
  const chat = readChatZip(await ctx.files.read(it.file.id), room);
  if (!chat) return null;
  const now = Date.now();
  // 一行三张，行距按最高的图片卡（竖图）算，不会压到下一行
  const n = chat.parts.length + (chat.others ? 1 : 0);
  // 拆出来的卡片排在便利贴右边：便利贴有多宽就让开多远
  const noteSize = sizeOf({ type: 'note', text: chat.text }), img = sizeOf({ type: 'image' });
  const gap = noteSize.w + 30, dx = img.w + 20, dy = img.h + 18;
  if (others) {
    const size = n ? { w: gap + (Math.min(3, n) - 1) * dx + img.w, h: Math.max(noteSize.h, (Math.ceil(n / 3) - 1) * dy + img.h) } : noteSize;
    it = { ...it, ...autoPlace(others, size) };
  }
  /** 第 i 张拆出来的卡片：基础字段和位置 */
  const fresh = (i: number) => itemBase({
    id: newId(), boardId: it.boardId, now, expiresAt: it.expiresAt, by: it.by,
    x: Math.min(COORD_MAX, it.x + gap + (i % 3) * dx), y: Math.min(COORD_MAX, it.y + Math.floor(i / 3) * dy),
  });
  const linked: Item[] = [];
  let text = chat.text;
  for (const part of chat.parts) {
    const fileId = newFileId();
    const mime = imageMime(part.name);
    await ctx.files.write(fileId, part.data, mime);
    const card: Item = { ...fresh(linked.length), type: fileKind(part.name), file: { id: fileId, name: part.name, size: part.data.length, mime } };
    linked.push(card);
    text = linkName(text, part.name, { id: card.id });
  }
  if (chat.others) {
    const zip: Item = { ...fresh(linked.length), type: it.type, pending: false, file: { ...it.file, size: len } };
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
