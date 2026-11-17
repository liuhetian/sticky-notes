// 卡片的右键菜单：这种卡片专属的操作（itemActions.ts），再加通用的；废纸篓里只有放回和彻底删除
import * as CM from '@radix-ui/react-context-menu';
import clsx from 'clsx';
import { COLORS, TRASH } from '@/shared/constants';
import type { Board, Item } from '@/shared/schema';
import { fmtDay } from '../../lib/format';
import type { Actions } from '../../state/actions';
import { editStore } from '../../state/stores';
import { Icon, type IconName } from '../../ui/Icon';
import { MenuRow } from '../../ui/menu';
import type { PickAnchor } from '../links/anchors';
import { labelOf, otherEnd, wiresFor, type Wire } from '../links/model';
import { kindActions, moveTargets, moveToBoard, shareAction, trashActions, type ItemAction } from './itemActions';
import { MoveItems, ReminderItems, TtlItems } from './Pickers';

const COLOR_NAMES: Record<(typeof COLORS)[number], string> = { yellow: '黄', pink: '粉', blue: '蓝', green: '绿', purple: '紫', orange: '橙', white: '白' };

const Rows = ({ list }: { list: ItemAction[] }) => (
  <>{list.map((a) => <MenuRow key={a.key} kit={CM} icon={a.icon} danger={a.danger} onSelect={a.run}>{a.label}</MenuRow>)}</>
);
const Sub = ({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) => (
  <CM.Sub>
    <CM.SubTrigger className="mi sub"><Icon name={icon} /><span>{label}</span><span className="mi-arrow"><Icon name="chevron" /></span></CM.SubTrigger>
    <CM.Portal><CM.SubContent className="menu" sideOffset={6} alignOffset={-6}>{children}</CM.SubContent></CM.Portal>
  </CM.Sub>
);

export function ItemContextMenu({ item, boardId, boards, items, wires, actions, anchor, onLink, onUnlink, selectedCount, onDeleteSelected }: {
  item: Item; boardId: string; boards: Board[]; items: Item[]; wires: Wire[]; actions: Actions;
  /** 右键点在便利贴的某一行、图片的某个点上：可以从那里拉线 */
  anchor?: PickAnchor;
  onLink: (anchor?: PickAnchor) => void; onUnlink: (w: Wire) => void;
  /** 右键的这张在多选里：多一项「删除选中的 N 项」 */
  selectedCount: number; onDeleteSelected: () => void;
}) {
  if (boardId === TRASH) {
    const [restore, purge] = trashActions(item, boards, actions);
    return <><Rows list={[restore]} /><CM.Separator className="msep" /><Rows list={[purge]} /></>;
  }

  // 关菜单后再进编辑：不然输入框刚拿到的焦点会被菜单收回去
  const edit = () => requestAnimationFrame(() => editStore.set(item.id));
  const mine = wiresFor(wires, item.id);
  const remindOn = item.remindAt !== null && !item.remindDone;
  const targets = moveTargets(boards, boardId);

  return (
    <>
      <Rows list={kindActions(item, edit).filter((a) => !a.barOnly)} />
      {item.type === 'note' && (
        <Sub icon="palette" label="颜色">
          {COLORS.map((c) => (
            <CM.Item key={c} className="mi" onSelect={() => actions.patch(boardId, item, { color: c })}>
              <span className={clsx('swatch', c, c === item.color && 'on')} /><span>{COLOR_NAMES[c]}</span>
            </CM.Item>
          ))}
        </Sub>
      )}
      <CM.Separator className="msep" />

      <Sub icon="bell" label={remindOn ? `提醒 · ${fmtDay(item.remindAt!)}` : '到点提醒'}>
        <ReminderItems kit={CM} remindAt={remindOn ? item.remindAt : null} onSet={(t) => actions.patch(boardId, item, { remindAt: t })} />
      </Sub>
      <Sub icon="clock" label="保留时长">
        <TtlItems kit={CM} onPick={(ttl) => actions.patch(boardId, item, { ttl })} />
      </Sub>
      <CM.Separator className="msep" />

      {anchor && <MenuRow kit={CM} icon="target" onSelect={() => onLink(anchor)}>{'line' in anchor ? '从这一行连线到…' : '从这个点连线到…'}</MenuRow>}
      <MenuRow kit={CM} icon="connect" onSelect={() => onLink()}>{anchor ? '从整张卡片连线到…' : '连线到…'}</MenuRow>
      {mine.length > 0 && (
        <Sub icon="unlink" label={`断开连线（${mine.length}）`}>
          {mine.map((w) => {
            const o = items.find((i) => i.id === otherEnd(w, item.id));
            return <CM.Item key={w.key} className="mi" onSelect={() => onUnlink(w)}>{o ? labelOf(o) : '（已不在）'}</CM.Item>;
          })}
        </Sub>
      )}
      {/* 右键菜单只在电脑上有：分享一律复制链接 */}
      <Rows list={[shareAction(item, false)]} />
      {targets.length > 0 && (
        <Sub icon="move" label="移到"><MoveItems kit={CM} boards={targets} onPick={(b) => moveToBoard(actions, boardId, item, b)} /></Sub>
      )}
      <CM.Separator className="msep" />
      {selectedCount > 1 && <MenuRow kit={CM} icon="trash" danger onSelect={onDeleteSelected}>删除选中的 {selectedCount} 项</MenuRow>}
      <MenuRow kit={CM} icon="trash" danger onSelect={() => actions.remove(boardId, item)}>删除</MenuRow>
    </>
  );
}
