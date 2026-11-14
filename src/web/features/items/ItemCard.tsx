// 一个元素：外壳负责定位、拖动、工具条、底栏；正文按类型分（NoteBody、FileBodies、location/LocationBody）。
// 工具条上的操作和右键菜单是同一份（itemActions.ts）；手机上没有右键，全靠工具条
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useDrag } from '@use-gesture/react';
import clsx from 'clsx';
import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { toast } from 'sonner';
import { COLORS, TRASH } from '@/shared/constants';
import { isFileLike } from '@/shared/items';
import { EDGE } from '@/shared/layout';
import { PEEK } from '../board/geometry';
import type { Board, Item, PatchItem } from '@/shared/schema';
import { countTasks } from '@/shared/todo';
import { expiringSoon, fmtDay, isRinging, remain, rotFor } from '../../lib/format';
import type { Actions } from '../../state/actions';
import { editStore } from '../../state/stores';
import { Icon, IconButton } from '../../ui/Icon';
import { LocationBody } from '../location/LocationBody';
import { FileLikeBody } from './FileBodies';
import { kindActions, moveTargets, moveToBoard, shareAction, trashActions, type ItemAction } from './itemActions';
import { NoteContent } from './NoteBody';
import { Dropdown, MoveItems, ReminderPopover, TtlItems } from './Pickers';

let topZ = 10;

type Props = {
  item: Item;
  boardId: string;
  boards: Board[];
  actions: Actions;
  mobile: boolean;
  /** 画布大小：拖动不出界 */
  bounds: { w: number; h: number };
  /** 抓手模式下卡片不能拖 */
  canDrag: boolean;
  /** 画布缩放比例：拖动的屏幕距离要除回去 */
  scale: number;
  /** 拉框或 Shift 点选中了 */
  selected?: boolean;
  onShiftClick?: (id: string) => void;
  /** 拖这张会带着别的卡片一起动（多选、或者它有连出去的卡片）：把移动距离交给白板统一算 */
  onGroupDrag?: (id: string, d: { dx: number; dy: number }, last: boolean) => void;
  /** 正跟着一起动时，白板算好的位移 */
  groupOffset?: { dx: number; dy: number };
  spotlight?: boolean;
  /** 高亮一直闪，鼠标移上来就停 */
  onSpotlightEnd?: () => void;
};

export const ItemCard = memo(function ItemCard({ item, boardId, boards, actions, mobile, bounds, canDrag, scale, selected, onShiftClick, onGroupDrag, groupOffset, spotlight, onSpotlightEnd }: Props) {
  const inTrash = boardId === TRASH;
  const [editing, setEditing] = useState(false);
  // 右键菜单点了「编辑」「改名」：只有被点的那张会重渲染
  const editRequested = editStore.useSelect((id) => id === item.id);
  useEffect(() => {
    if (!editRequested) return;
    editStore.set(null);
    setEditing(true);
  }, [editRequested]);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [z, setZ] = useState(0);
  const draggedAt = useRef(0);
  const patch = (p: PatchItem) => actions.patch(boardId, item, p);

  const bind = useDrag(({ first, last, canceled, movement: [mx, my], event, cancel, tap }) => {
    if (first && (event.target as HTMLElement).closest('button, a, input, textarea, label, video, audio, .bar')) return cancel();
    // 上面取消掉的那次，use-gesture 还会补发一个收尾事件，带着已经挪过的那几像素：不算拖动，不然卡片会被挪一下
    if (canceled || tap) return;
    if (last) draggedAt.current = Date.now();
    if (onGroupDrag) return onGroupDrag(item.id, { dx: mx / scale, dy: my / scale }, !!last);
    const p = {
      x: Math.round(Math.max(EDGE.x, Math.min(bounds.w - PEEK, item.x + mx / scale))),
      y: Math.round(Math.max(EDGE.y, Math.min(bounds.h - PEEK, item.y + my / scale))),
    };
    if (!last) return setDrag(p);
    setDrag(null);
    if (p.x !== item.x || p.y !== item.y) patch({ x: p.x, y: p.y });
  }, { enabled: !mobile && !editing && canDrag, filterTaps: true, threshold: 4 });

  const gesture = bind();
  const pos = drag ?? (groupOffset ? { x: item.x + groupOffset.dx, y: item.y + groupOffset.dy } : item);
  const style = {
    left: pos.x, top: pos.y, zIndex: z || undefined,
    '--rot': `${rotFor(item.id)}deg`,
    order: -Math.floor(item.createdAt / 1000), // 手机上新的在前
  } as CSSProperties;

  const todo = item.type === 'note' ? countTasks(item.text) : null;
  const ringing = isRinging(item);
  const remindOn = !inTrash && item.remindAt !== null && !item.remindDone;
  const targets = moveTargets(boards, boardId);
  const fromName = inTrash ? boards.find((b) => b.id === item.from)?.name : undefined;
  const button = (a: ItemAction) =>
    <IconButton key={a.key} name={a.icon} title={a.hint ?? a.label} className={a.danger ? 'danger' : ''} onClick={a.run} />;

  return (
    <div
      {...gesture}
      data-id={item.id}
      className={clsx('item', item.type, item.type === 'note' && item.color, { editing, dragging: !!drag || !!groupOffset, spotlight, ringing, selected })}
      style={style}
      // 点到谁谁就到最上面；use-gesture 自己也要 onPointerDown，两个都调
      onPointerDown={(e) => { setZ(++topZ); if (spotlight) onSpotlightEnd?.(); gesture.onPointerDown?.(e); }}
      onPointerEnter={() => { if (spotlight) onSpotlightEnd?.(); }}
      onClick={(e) => { if (e.shiftKey && onShiftClick) { e.preventDefault(); onShiftClick(item.id); } }}
      // 右键交给白板弹这张卡片的菜单；正在打字的地方用浏览器自己的菜单（好粘贴）
      onContextMenu={(e) => { if ((e.target as HTMLElement).closest('textarea, input')) e.stopPropagation(); }}
    >
      <div className="bar">
        {inTrash ? trashActions(item, boards, actions).map(button) : (
          <>
            {item.type === 'note' && (
              <>
                {COLORS.map((c) => (
                  <button key={c} type="button" className={clsx('swatch', c, c === item.color && 'on')} title="换颜色" aria-label="换颜色"
                    onClick={(e) => { e.stopPropagation(); patch({ color: c }); }} />
                ))}
                <span className="sep" />
              </>
            )}
            {kindActions(item, () => setEditing(true)).map(button)}
            {button(shareAction(item, mobile))}
            {/* 电脑上「移到」在右键菜单里；手机没有右键，放在这里 */}
            {mobile && targets.length > 0 && (
              <Dropdown trigger={<button type="button" className="ib" title="移到" aria-label="移到"><Icon name="move" /></button>}>
                <MoveItems kit={DropdownMenu} boards={targets} onPick={(b) => moveToBoard(actions, boardId, item, b)} />
              </Dropdown>
            )}
            <ReminderPopover remindAt={remindOn ? item.remindAt : null} onSet={(t) => patch({ remindAt: t })}
              trigger={<button type="button" className="ib" title="到点提醒" aria-label="到点提醒"><Icon name="bell" /></button>} />
            <IconButton name="trash" title="删除（进废纸篓）" className="danger" onClick={() => actions.remove(boardId, item)} />
          </>
        )}
      </div>
      {item.type === 'note' && <div className="tape" />}

      {item.type === 'note' && (
        <NoteContent item={item} editing={editing} setEditing={setEditing} readOnly={inTrash} patch={patch}
          onThrow={async () => { if (await actions.move(boardId, item, TRASH)) toast('已丢入废纸篓'); }} />
      )}
      {isFileLike(item) && <FileLikeBody item={item} />}
      {item.type === 'location' && (
        <LocationBody item={item} renaming={editing} wasDragged={() => Date.now() - draggedAt.current < 250}
          onStartRename={() => { if (!inTrash) setEditing(true); }}
          onRename={(name) => {
            setEditing(false);
            if (name !== null && name !== item.name) patch({ name });
          }} />
      )}

      <div className="foot">
        <span className="when">{fromName ? `来自「${fromName}」` : fmtDay(item.createdAt)}</span>
        <span className="foot-r">
          {todo && todo.total > 0 && <span className={clsx('todo-count', todo.done === todo.total && 'all')}>✓ {todo.done}/{todo.total}</span>}
          {remindOn && (ringing ? (
            <button type="button" className="chip ringing-chip" title="知道了" onClick={(e) => { e.stopPropagation(); patch({ remindDone: true }); }}>
              <Icon name="bell" />到点了 · 知道了
            </button>
          ) : (
            <ReminderPopover remindAt={item.remindAt} onSet={(t) => patch({ remindAt: t })}
              trigger={<button type="button" className="chip" title="改提醒时间"><Icon name="bell" />{fmtDay(item.remindAt!)}</button>} />
          ))}
          {inTrash ? (
            <span className="chip" title="到时候就彻底删除"><Icon name="trash" />{remain(item)}后清除</span>
          ) : (
            <Dropdown trigger={<button type="button" className={clsx('chip', expiringSoon(item) && 'soon')} title="到期后进废纸篓，点一下修改"><Icon name="clock" />{remain(item)}</button>}>
              <TtlItems kit={DropdownMenu} onPick={(ttl) => patch({ ttl })} />
            </Dropdown>
          )}
        </span>
      </div>
    </div>
  );
});
