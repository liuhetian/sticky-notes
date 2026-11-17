// 连线的数据：便利贴连出去的线来自文字里的引用 [标题](/id)；别的卡片连出去的存在它的 links 里。两端都在这块白板上才画
import { fmtCoords } from '@/shared/geo';
import { newLinkId } from '@/shared/ids';
import { refsIn, type Ref } from '@/shared/refs';
import type { Anchor, Item, Link } from '@/shared/schema';
import { sameAnchor } from './anchors';

/** 一条画得出来的线：holder 是发起的那张卡片，link.to 是另一头；ref 有值说明这条线是便利贴文字里的那个引用 */
export type Wire = { key: string; holder: string; link: Link; ref?: Ref };

export function wiresOf(items: Item[]): Wire[] {
  const ids = new Set(items.map((i) => i.id));
  const out: Wire[] = [];
  for (const it of items) {
    if (it.type === 'note') {
      // 便利贴身上即使还留着老的 links 也不看：它的关系只认文字
      for (const ref of refsIn(it.text)) {
        if (ref.id === it.id || !ids.has(ref.id)) continue;
        // key 要能当 DOM id 用，也要以目标 id 打头（seedOf 靠它定线往哪边弯）
        const key = `${ref.id}-${it.id}${ref.p ? `-${Math.round(ref.p.px * 1000)}-${Math.round(ref.p.py * 1000)}` : ''}`;
        out.push({ key, holder: it.id, link: { id: key, to: ref.id, ...(ref.p ? { b: ref.p } : {}) }, ref });
      }
      continue;
    }
    for (const link of it.links ?? []) {
      if (link.to !== it.id && ids.has(link.to)) out.push({ key: link.id, holder: it.id, link });
    }
  }
  return out;
}

/** 一句话认出是哪张卡片：便利贴取第一行，文件取文件名，位置取地名。引用的标题也用它 */
export function labelOf(it: Item, max = 18) {
  const s = it.type === 'note' ? it.text.replace(/\]\([^)]*\)/g, ' ').replace(/[*_`#>[\]-]/g, ' ').split('\n').map((l) => l.trim()).find(Boolean) ?? '空便利贴'
    : it.type === 'location' ? it.name || fmtCoords(it) : it.file.name;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** 和这张卡片有关的线 */
export const wiresFor = (wires: Wire[], id: string) => wires.filter((w) => w.holder === id || w.link.to === id);
export const otherEnd = (w: Wire, id: string) => (w.holder === id ? w.link.to : w.holder);

/** 两端和锚点都一样的线已经有了（不管当初是从哪一头拉的） */
export function hasWire(wires: Wire[], from: string, to: string, a?: Anchor, b?: Anchor) {
  return wires.some((w) =>
    (w.holder === from && w.link.to === to && sameAnchor(w.link.a, a) && sameAnchor(w.link.b, b)) ||
    (w.holder === to && w.link.to === from && sameAnchor(w.link.a, b) && sameAnchor(w.link.b, a)));
}

export function makeLink(to: string, a?: Anchor, b?: Anchor): Link {
  return { id: newLinkId(), to, ...(a ? { a } : {}), ...(b ? { b } : {}) };
}

/**
 * 连线有方向：从谁拉出来，谁就是「父」。拖父卡片时，它连出去的卡片（以及再往下连的）跟着一起动；
 * 拖子卡片不带动父卡片。返回 roots 加上它们往下连到的所有卡片
 */
export function withDescendants(wires: Wire[], roots: string[]): Set<string> {
  const out = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    const id = queue.pop()!;
    for (const w of wires) {
      if (w.holder === id && !out.has(w.link.to)) { out.add(w.link.to); queue.push(w.link.to); }
    }
  }
  return out;
}
