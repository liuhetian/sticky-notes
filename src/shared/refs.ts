// 便利贴里的引用：指向本站元素地址的 markdown 链接 [标题](/<id>)，引用图片上的某个点时带 #px,py（0~1）。
// 分享链接也是这个地址（https://域名/<id>），贴进便利贴同样算引用。便利贴连出去的线全靠这个推导，不另外存
import { ITEM_ID_RE } from './constants';

export type RefPoint = { px: number; py: number };
export type Ref = { id: string; p?: RefPoint };

const ID = '[0-9a-f]{16}';
const NUM = String.raw`\d+(?:\.\d+)?`;
const PATH = new RegExp(`^/(${ID})(?:#(${NUM}),(${NUM}))?$`);
/** markdown 行内链接：[文字](地址 "可选标题")；文字里允许转义的方括号 */
const LINK = /( ?)\[((?:\\.|[^\\\]])*)\]\(\s*<?([^\s()<>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 本站的完整链接（裸链接或写在 markdown 链接里都算）；后面紧跟字母数字、斜杠、# 的不算 */
const fullRe = (origin: string) => new RegExp(`( ?)${escRe(origin)}/${ID}(?:#${NUM},${NUM})?(?![\\w/#-])`, 'g');

const fmt = (n: number) => String(Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000);

export const refPath = (r: Ref) => `/${r.id}${r.p ? `#${fmt(r.p.px)},${fmt(r.p.py)}` : ''}`;
/** 同一个引用（id 和点都一样）的标识：去重、比对、DOM 上找那个链接都用它 */
export const refKey = (r: Ref) => refPath(r).slice(1);
export const sameRef = (a: Ref, b: Ref) => refKey(a) === refKey(b);

/** 标题里的方括号和反斜杠转义，换行压成空格 */
export const refLink = (title: string, r: Ref) => `[${title.replace(/\s*\n\s*/g, ' ').replace(/[\\[\]]/g, '\\$&')}](${refPath(r)})`;

/** 链接地址 → 引用；origin 给了就连本站完整链接也认。不是引用返回 null */
export function parseRef(href: string, origin?: string): Ref | null {
  let path = href.trim();
  if (origin && path.startsWith(`${origin}/`)) path = path.slice(origin.length);
  const m = path.match(PATH);
  if (!m || !ITEM_ID_RE.test(m[1])) return null;
  if (m[2] === undefined) return { id: m[1] };
  const px = Number(m[2]), py = Number(m[3]);
  // 坐标出了 0~1 就当没写，连整张
  return px <= 1 && py <= 1 ? { id: m[1], p: { px, py } } : { id: m[1] };
}

/** 文字里引用了哪些元素：按出现顺序，id 和点都一样的只算一次 */
export function refsIn(text: string, origin?: string): Ref[] {
  const found: { at: number; ref: Ref }[] = [];
  for (const m of text.matchAll(LINK)) {
    const r = parseRef(m[3], origin);
    if (r) found.push({ at: m.index + m[1].length, ref: r });
  }
  if (origin) {
    for (const m of text.matchAll(fullRe(origin))) {
      const r = parseRef(m[0].trim(), origin);
      if (r) found.push({ at: m.index + m[1].length, ref: r });
    }
  }
  found.sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  return found.flatMap(({ ref }) => (seen.has(refKey(ref)) ? [] : (seen.add(refKey(ref)), [ref])));
}

/** 只有引用、没有别的字的一行 */
const onlyRefs = (line: string) => line.trim() !== '' && line.replace(LINK, '').trim() === '';

/**
 * 加一个引用：给了行号（从 0 数）就加在那一行末尾；否则加在最后。
 * 最后一行本来就只有引用的，接着往下写；不然空一行另起一段，免得被并进上面的列表或引用块
 */
export function addRef(text: string, md: string, line?: number): string {
  const lines = text.split('\n');
  if (line !== undefined && lines[line]?.trim()) {
    lines[line] = `${lines[line].trimEnd()} ${md}`;
    return lines.join('\n');
  }
  const body = text.trimEnd();
  if (!body) return md;
  return `${body}${onlyRefs(body.split('\n').at(-1)!) ? '\n' : '\n\n'}${md}`;
}

/** 删掉和 r 一样的引用（连同前面的一个空格）；删完变空的行去掉 */
export function dropRef(text: string, r: Ref, origin?: string): string {
  const out: string[] = [];
  let changed = false;
  for (const line of text.split('\n')) {
    let next = line.replace(LINK, (all, _sp, _t, href) => {
      const x = parseRef(href, origin);
      return x && sameRef(x, r) ? '' : all;
    });
    if (origin) next = next.replace(fullRe(origin), (all) => {
      const x = parseRef(all.trim(), origin);
      return x && sameRef(x, r) ? '' : all;
    });
    if (next !== line) changed = true;
    if (next === line || next.trim()) out.push(next);
  }
  // 末尾那个引用是空一行另起的：删掉后别留个空行
  return changed ? out.join('\n').trimEnd() : text;
}
