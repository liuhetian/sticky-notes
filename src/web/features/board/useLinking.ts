// 连线的交互：从一张卡片（或它上面的某一行、某个点）拉出线头，点另一张卡片接上。
// 便利贴拉出来的线写成文字里的引用 [标题](/id)（从某一行拉就加在那一行末尾）；别的卡片拉出来的存进 links
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MAX_TEXT } from '@/shared/constants';
import { addRef, dropRef, refLink } from '@/shared/refs';
import type { Item } from '@/shared/schema';
import type { Actions } from '../../state/actions';
import { anchorAt, isLineAnchor, isPointAnchor, type PickAnchor, type PointAnchor } from '../links/anchors';
import { hasWire, labelOf, makeLink, wiresOf, type Wire } from '../links/model';
import type { Pos } from './geometry';

export function useLinking(boardId: string, items: Item[], actions: Actions) {
  const wires = useMemo(() => wiresOf(items), [items]);
  /** 正在从哪张卡片的哪个锚点拉线 */
  const [from, setFrom] = useState<{ id: string; anchor?: PickAnchor } | null>(null);
  /** 线头跟着的鼠标位置 */
  const [end, setEnd] = useState<Pos | null>(null);
  /** 点选中的那条线 */
  const [selected, setSelected] = useState<string | null>(null);

  const start = (id: string, anchor?: PickAnchor) => { setFrom({ id, anchor }); setEnd(null); setSelected(null); };
  const stop = () => { setFrom(null); setEnd(null); };

  /** b 只可能是图片上的点：接到便利贴上一律连整张 */
  const add = (fromId: string, a: PickAnchor | undefined, toId: string, b: PointAnchor | undefined) => {
    const holder = items.find((i) => i.id === fromId), target = items.find((i) => i.id === toId);
    if (!holder || !target) return;
    if (holder.type === 'note') {
      // 行号不存：引用加在那一行末尾，线自然就从那里出去
      if (hasWire(wires, fromId, toId, undefined, b)) { toast('已经连着了'); return; }
      const text = addRef(holder.text, refLink(labelOf(target, 30), { id: toId, ...(b ? { p: b } : {}) }), isLineAnchor(a) ? a.line : undefined);
      if (text.length > MAX_TEXT) { toast.error('便利贴太长了，加不下引用'); return; }
      actions.patch(boardId, holder, { text, baseRev: holder.rev });
      return;
    }
    const pa = isPointAnchor(a) ? a : undefined;
    if (hasWire(wires, fromId, toId, pa, b)) { toast('已经连着了'); return; }
    actions.patch(boardId, holder, { links: [...(holder.links ?? []), makeLink(toId, pa, b)] });
  };
  const remove = (w: Wire) => {
    setSelected(null);
    const holder = items.find((i) => i.id === w.holder);
    if (!holder) return;
    // 引用线：把文字里那段 [标题](/id) 删掉
    if (w.ref) {
      if (holder.type === 'note') actions.patch(boardId, holder, { text: dropRef(holder.text, w.ref, location.origin), baseRev: holder.rev });
      return;
    }
    if (holder.links) actions.patch(boardId, holder, { links: holder.links.filter((l) => l.id !== w.key) });
  };

  /**
   * 连线中按下左键就定：按在另一张卡片上就连上（按在图片某个点上就接到那里），按在别处取消。
   * 返回 true 表示这一下被连线用掉了
   */
  const pick = (e: { button: number; target: EventTarget; clientX: number; clientY: number }): boolean => {
    if (!from) return false;
    stop();
    if (e.button !== 0) return false;
    const target = e.target as Element;
    const toId = target.closest<HTMLElement>('.item[data-id]')?.dataset.id;
    const to = toId && toId !== from.id ? items.find((i) => i.id === toId) : undefined;
    if (to) {
      const b = anchorAt(to, target, e.clientX, e.clientY);
      add(from.id, from.anchor, to.id, isPointAnchor(b) ? b : undefined);
    }
    return true;
  };

  return { wires, from, end, setEnd, selected, setSelected, start, stop, remove, pick };
}
