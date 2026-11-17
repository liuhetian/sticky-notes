// 微信「聊天记录 → 保存为文件」导出的压缩包：聊天记录_<日期>_<时间>.zip
//   聊天记录.txt                         每条是「·昵称 / 2026年11月12日 18:23 / 内容」，条与条之间空一行
//   聊天记录内的图片、视频和文件/…        有图片视频文件时才有
// txt 排成便利贴能看的样子；图片和文件解出来另存成单独的卡片（有个数上限）；超出的不解，留在压缩包里。压缩包本身太大就不拆
import { unzipSync } from 'fflate';
import { MAX_TEXT } from '../../shared/constants';
import { addRef, refLink, type Ref } from '../../shared/refs';

export const CHAT_ZIP = /^聊天记录.*\.zip$/i;
/**
 * 压缩包要整个读进边缘函数的内存才能拆。线上实测：12 MB 能拆（约 12 秒），24 MB 函数直接被系统杀掉，
 * 而且拦不住、会让整块白板打不开。所以超过 10 MB 的不拆，当普通文件
 */
export const MAX_CHAT_ZIP = 10 * 1024 * 1024;
export const MAX_PARTS = 30;
/** 每个引用会让文字变长多少（[]、(/)、16 位 id，再给文件名里要转义的字符留点） */
const REF_ROOM = 40;
/** 有没拆的文件时，便利贴末尾的说明，链接到留着的压缩包 */
export const othersNote = (others: number, zip: Ref) => `（还有 ${others} 个文件没拆出来，${refLink('在连着的压缩包里', zip)}）`;

const TIME = /^(\d{4}年\d{1,2}月\d{1,2}日)\s+(\d{1,2}:\d{2})(?::\d{2})?$/;
const HEAD = /^[·•・]\s*(.+?)\s*$/;
const esc = (s: string) => s.replace(/[\\`*_[\]]/g, '\\$&');

/** 排版：日期变了插一行日期；同一个人同一分钟连发的几条并在一起。认不出格式就原样返回 */
export function formatChat(raw: string): string {
  const lines = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  type Msg = { who: string; date: string; time: string; body: string[] };
  const msgs: Msg[] = [];
  const pre: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(HEAD);
    const t = lines[i + 1]?.trim().match(TIME);
    if (head && t) { msgs.push({ who: head[1], date: t[1], time: t[2], body: [] }); i++; continue; }
    (msgs.at(-1)?.body ?? pre).push(lines[i]);
  }
  if (!msgs.length) return raw.trim();
  const join = (ls: string[]) => ls.join('\n').trim();
  const out: string[] = [];
  if (join(pre)) out.push(join(pre));
  let date = '';
  let last: Msg | null = null;
  for (const m of msgs) {
    const body = join(m.body);
    if (m.date !== date) { out.push(`*${m.date}*`); date = m.date; last = null; }
    if (last && last.who === m.who && last.time === m.time) { if (body) out[out.length - 1] += `\n${body}`; }
    else out.push(`**${esc(m.who)}** ${m.time}${body ? `\n${body}` : ''}`);
    last = m;
  }
  return out.join('\n\n');
}

function decode(u8: Uint8Array): string | null {
  for (const enc of ['utf-8', 'gb18030']) {
    try { return new TextDecoder(enc, { fatal: true }).decode(u8); } catch { /* 换一种编码 */ }
  }
  return null;
}

/** 文件名没打 UTF-8 标记时 fflate 按 latin1 解；微信的其实是 UTF-8 字节，还原回来 */
function fixName(name: string) {
  if (!/[\u0080-ÿ]/.test(name) || /[^\u0000-ÿ]/.test(name)) return name;
  return decode(Uint8Array.from(name, (c) => c.charCodeAt(0))) ?? name;
}
const baseName = (path: string) => path.split('/').pop()!.replace(/[\u0000-\u001f\\]/g, '').slice(-200) || 'file';

export type ChatPart = { name: string; data: Uint8Array };
export type Chat = {
  /** 便利贴的文字；末尾没拆文件的说明（othersNote）要等压缩包有了 id 才加，不在这里 */
  text: string;
  /** 要拆出来的图片和文件，按在聊天里出现的顺序 */
  parts: ChatPart[];
  /** 超出上限、留在压缩包里的有几个 */
  others: number;
};

/**
 * 压缩包 → 聊天记录；没有能读的 txt（不是聊天记录）返回 null。
 * room 是白板上还能放几张卡片：最多拆这么多（也不超过 MAX_PARTS）；有没拆的文件时压缩包本身也要留在白板上，再让出一个位置
 */
export function readChatZip(buf: ArrayBuffer | null, room = Infinity): Chat | null {
  if (!buf) return null;
  const max = Math.min(MAX_PARTS, room);
  let others = 0, taken = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buf), {
      filter: (f) => {
        const name = fixName(f.name);
        if (name.endsWith('/') || name.startsWith('__MACOSX/')) return false;
        if (/\.txt$/i.test(name) && f.originalSize <= 2 * 1024 * 1024) return true;
        if (taken < max) {
          taken++;
          return true;
        }
        others++;
        return false;
      },
    });
  } catch {
    return null;
  }
  const entries = Object.entries(files).map(([k, v]) => [fixName(k), v] as const);
  // 优先「聊天记录.txt」；其余的 txt 留在压缩包里
  const txts = entries.filter(([n]) => /\.txt$/i.test(n)).sort(([a], [b]) => Number(!a.endsWith('聊天记录.txt')) - Number(!b.endsWith('聊天记录.txt')));
  const raw = txts.length ? decode(txts[0][1]) : null;
  if (raw === null || !raw.trim()) return null;
  others += txts.length - 1;
  const at = (name: string) => { const i = raw.indexOf(name); return i < 0 ? Infinity : i; };
  const parts = entries
    .filter(([n]) => !/\.txt$/i.test(n))
    .map(([n, data]) => ({ name: baseName(n), data }))
    .sort((a, b) => at(a.name) - at(b.name));
  // 压缩包要留下（有没拆的），而位置刚好被拆出来的占满：聊天里最后出现的那个不拆了，给压缩包让位
  if (others && parts.length && parts.length >= room) { parts.pop(); others++; }
  let text = formatChat(raw);
  // 之后每个拆出来的文件都要换成引用、末尾还要加说明，先把位置留出来
  const tail = others ? othersNote(others, { id: '0'.repeat(16) }).length + 2 : 0;
  const budget = MAX_TEXT - tail - parts.length * REF_ROOM;
  if (text.length > budget) text = `${text.slice(0, budget - 20)}\n\n……（太长，后面截掉了）`;
  return { text, parts, others };
}

/**
 * 把文字里第一处还没变成链接的 name 换成指向 ref 的引用（拆出来的文件连到它所在的那条消息上）；
 * 找不到（文件名被截掉了之类）就加在最后
 */
export function linkName(text: string, name: string, ref: Ref): string {
  const md = refLink(name, ref);
  for (let i = text.indexOf(name); i >= 0; i = text.indexOf(name, i + 1)) {
    if (text[i - 1] !== '[') return text.slice(0, i) + md + text.slice(i + name.length);
  }
  return addRef(text, md);
}
