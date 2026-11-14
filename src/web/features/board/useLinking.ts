// 连线的交互：从一张卡片（或它上面的某一行、某个点）拉出线头，点另一张卡片接上
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Anchor, Item } from '@/shared/schema';
import type { Actions } from '../../state/actions';
import { anchorAt } from '../links/anchors';
import { hasWire, makeLink, wiresOf, type Wire } from '../links/model';
import type { Pos } from './geometry';

export function useLinking(boardId: string, items: Item[], actions: Actions) {
  const wires = useMemo(() => wiresOf(items), [items]);
  /** 正在从哪张卡片的哪个锚点拉线 */
  const [from, setFrom] = useState<{ id: string; anchor?: Anchor } | null>(null);
  /** 线头跟着的鼠标位置 */
  const [end, setEnd] = useState<Pos | null>(null);
  /** 点选中的那条线 */
  const [selected, setSelected] = useState<string | null>(null);

  const start = (id: string, anchor?: Anchor) => { setFrom({ id, anchor }); setEnd(null); setSelected(null); };
  const stop = () => { setFrom(null); setEnd(null); };

  const add = (fromId: string, a: Anchor | undefined, toId: string, b: Anchor | undefined) => {
    const holder = items.find((i) => i.id === fromId);
    if (!holder || !items.some((i) => i.id === toId)) return;
    if (hasWire(wires, fromId, toId, a, b)) { toast('已经连着了'); return; }
    actions.patch(boardId, holder, { links: [...(holder.links ?? []), makeLink(toId, a, b)] });
  };
  const remove = (w: Wire) => {
    setSelected(null);
    const holder = items.find((i) => i.id === w.holder);
    if (holder?.links) actions.patch(boardId, holder, { links: holder.links.filter((l) => l.id !== w.key) });
  };

  /**
   * 连线中按下左键就定：按在另一张卡片上就连上（按在某行字、图片某个点上就接到那里），按在别处取消。
   * 返回 true 表示这一下被连线用掉了
   */
  const pick = (e: { button: number; target: EventTarget; clientX: number; clientY: number }): boolean => {
    if (!from) return false;
    stop();
    if (e.button !== 0) return false;
    const target = e.target as Element;
    const toId = target.closest<HTMLElement>('.item[data-id]')?.dataset.id;
    const to = toId && toId !== from.id ? items.find((i) => i.id === toId) : undefined;
    if (to) add(from.id, from.anchor, to.id, anchorAt(to, target, e.clientX, e.clientY));
    return true;
  };

  return { wires, from, end, setEnd, selected, setSelected, start, stop, remove, pick };
}
