// 连线的数据：存在发起那一端卡片的 links 里；两端都在这块白板上才画
import { sameAnchor } from '@/shared/anchors';
import { newLinkId } from '@/shared/ids';
import type { Anchor, Item, Link } from '@/shared/schema';

/** 一条画得出来的线：holder 是存着它的那张卡片，link.to 是另一头 */
export type Wire = { key: string; holder: string; link: Link };

export function wiresOf(items: Item[]): Wire[] {
  const ids = new Set(items.map((i) => i.id));
  const out: Wire[] = [];
  for (const it of items) {
    for (const link of it.links ?? []) {
      if (link.to !== it.id && ids.has(link.to)) out.push({ key: link.id, holder: it.id, link });
    }
  }
  return out;
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
