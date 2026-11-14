// 一个元素：外壳负责定位、拖动、工具条、底栏；正文按类型分（NoteBody.tsx、bodies.tsx）
import { useDrag } from '@use-gesture/react';
import clsx from 'clsx';
import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { toast } from 'sonner';
import { COLORS, TRASH, previewKind } from '@/shared/constants';
import { fmtCoords } from '@/shared/geo';
import type { Board, Item } from '@/shared/schema';
import { allTasksDone, countTasks, toggleTaskLine } from '@/shared/todo';
import { shareUrl } from '../../api/client';
import { copyImage, copyText, download, shareLink } from '../../lib/clipboard';
import { expiringSoon, fmtDay, isRinging, remain, rotFor } from '../../lib/format';
import type { Actions } from '../../state/actions';
import { docStore, editStore, lightboxStore, sketchStore, ttlStore } from '../../state/stores';
import { Icon, IconButton } from '../../ui/Icon';
import { FileBody, ImageBody, LocationBody, PendingBody, openInMap } from './bodies';
import { readableUrl } from './FileImage';
import { ReminderPopover, TtlMenu } from './Menus';
import { Markdown, NoteEditor } from './NoteBody';

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
  /** 还没存的新便利贴：存的时候交给外面创建 */
  draft?: { onSave: (text: string, color: string) => void; onCancel: () => void };
};

export const ItemCard = memo(function ItemCard({ item, boardId, boards, actions, mobile, bounds, canDrag, scale, selected, onShiftClick, onGroupDrag, groupOffset, spotlight, onSpotlightEnd, draft }: Props) {
  const inTrash = boardId === TRASH;
  const [editing, setEditing] = useState(!!draft);
  // 右键菜单点了「编辑」「改名」
  const editReq = editStore.use();
  useEffect(() => {
    if (editReq !== item.id) return;
    editStore.set(null);
    if ((item.type === 'note' || item.type === 'location') && !inTrash) setEditing(true);
  }, [editReq]); // eslint-disable-line react-hooks/exhaustive-deps
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [z, setZ] = useState(0);
  const draggedAt = useRef(0);
  // 颜色以服务端为准；只有还没存的新便利贴在本地记
  const [draftColor, setDraftColor] = useState<string>('yellow');
  const color = draft ? draftColor : item.type === 'note' ? item.color : 'yellow';
  const boardName = (id?: string) => boards.find((b) => b.id === id)?.name;

  const bind = useDrag(({ first, last, movement: [mx, my], event, cancel, tap }) => {
    if (first && (event.target as HTMLElement).closest('button, a, input, textarea, label, video, audio, .bar')) return cancel();
    if (tap) return;
    if (last) draggedAt.current = Date.now();
    if (onGroupDrag) return onGroupDrag(item.id, { dx: mx / scale, dy: my / scale }, !!last);
    const p = {
      x: Math.round(Math.max(8, Math.min(bounds.w - 80, item.x + mx / scale))),
      y: Math.round(Math.max(44, Math.min(bounds.h - 80, item.y + my / scale))),
    };
    if (!last) return setDrag(p);
    setDrag(null);
    if (p.x !== item.x || p.y !== item.y) actions.patch(boardId, item, { x: p.x, y: p.y });
  }, { enabled: !mobile && !editing && !draft && canDrag, filterTaps: true, threshold: 4 });

  const gesture = bind();
  const pos = drag ?? (groupOffset ? { x: item.x + groupOffset.dx, y: item.y + groupOffset.dy } : item);
  const style = {
    left: pos.x, top: pos.y, zIndex: z || undefined,
    '--rot': `${rotFor(item.id)}deg`,
    order: -Math.floor(item.createdAt / 1000), // 手机上新的在前
  } as CSSProperties;

  const todo = item.type === 'note' ? countTasks(item.text) : null;
  const done = item.type === 'note' && allTasksDone(item.text);
  const ringing = isRinging(item);
  const file = (item.type === 'image' || item.type === 'file') && !item.pending ? item : null;
  const restore = async () => {
    const r = await actions.move(boardId, item, undefined, { ttl: ttlStore.get() });
    if (r) toast(`已放回「${boardName(r.to) ?? '白板'}」`);
  };

  // ── 工具条 ──
  const bar: ReactNode[] = [];
  if (inTrash) {
    bar.push(<IconButton key="restore" name="undo" title={`放回「${boardName(item.from) ?? '第一块白板'}」`} onClick={restore} />);
    bar.push(<IconButton key="del" name="trash" title="彻底删除" className="danger" onClick={() => { if (confirm('彻底删除？删了就找不回来了')) actions.remove(boardId, item); }} />);
  } else {
    if (item.type === 'note') {
      for (const c of COLORS) {
        bar.push(<button key={c} type="button" className={clsx('swatch', c, c === color && 'on')} title="换颜色" aria-label="换颜色"
          onClick={(e) => { e.stopPropagation(); if (draft) setDraftColor(c); else actions.patch(boardId, item, { color: c }); }} />);
      }
      bar.push(<span key="sep" className="sep" />);
      if (!draft) bar.push(<IconButton key="edit" name="edit" title="编辑" onClick={() => setEditing(true)} />);
    }
    if (!draft) {
      if (item.type === 'note') bar.push(<IconButton key="copy" name="copy" title="复制文字" onClick={() => copyText(item.text)} />);
      if (file?.type === 'image') {
        bar.push(<IconButton key="open" name="open" title="看大图" onClick={() => lightboxStore.set(file.file)} />);
        bar.push(<IconButton key="copyimg" name="copy" title="复制图片" onClick={() => copyImage(readableUrl(file.file))} />);
        bar.push(<IconButton key="draw" name="brush" title="在上面画（存成一张新图，原图不动）"
          onClick={() => sketchStore.set({ at: Date.now(), bg: file.file, pos: { x: item.x + 300, y: item.y } })} />);
      }
      if (file && previewKind(file.file.name) === 'doc') bar.push(<IconButton key="open" name="open" title="翻看" onClick={() => docStore.set(file.file)} />);
      if (file) bar.push(<IconButton key="dl" name="download" title="下载" onClick={() => download(file.file)} />);
      if (item.type === 'location') {
        bar.push(<IconButton key="map" name="open" title="在地图中打开" onClick={() => openInMap(item)} />);
        bar.push(<IconButton key="coords" name="copy" title="复制坐标" onClick={() => copyText(fmtCoords(item), '坐标已复制')} />);
        bar.push(<IconButton key="rename" name="edit" title="改名" onClick={() => setEditing(true)} />);
      }
      bar.push(<IconButton key="share" name="link" title="复制分享链接" onClick={() => shareLink(shareUrl(item.id), mobile)} />);
      bar.push(
        <span key="remind">
          <ReminderPopover remindAt={item.remindDone ? null : item.remindAt}
            onSet={(t) => actions.patch(boardId, item, { remindAt: t })}
            trigger={<button type="button" className="ib" title="到点提醒" aria-label="到点提醒"><Icon name="bell" /></button>} />
        </span>,
      );
    }
    bar.push(<IconButton key="del" name="trash" title={draft ? '不要了' : '删除（进废纸篓）'} className="danger" onClick={() => (draft ? draft.onCancel() : actions.remove(boardId, item))} />);
  }

  return (
    <div
      {...gesture}
      data-id={item.id}
      className={clsx('item', item.type, item.type === 'note' && color, {
        editing, dragging: !!drag || !!groupOffset, spotlight, ringing, selected, 'done-all': done, draft: !!draft,
      })}
      style={style}
      // 点到谁谁就到最上面；use-gesture 自己也要 onPointerDown，两个都调
      onPointerDown={(e) => { setZ(++topZ); if (spotlight) onSpotlightEnd?.(); gesture.onPointerDown?.(e); }}
      onPointerEnter={() => { if (spotlight) onSpotlightEnd?.(); }}
      onClick={(e) => { if (e.shiftKey && onShiftClick && !draft) { e.preventDefault(); onShiftClick(item.id); } }}
      // 右键交给白板弹这张卡片的菜单；正在打字的地方和还没存的新便利贴用浏览器自己的菜单（好粘贴）
      onContextMenu={(e) => { if (draft || (e.target as HTMLElement).closest('textarea, input')) e.stopPropagation(); }}
    >
      <div className="bar">{bar}</div>
      {item.type === 'note' && <div className="tape" />}

      {item.type === 'note' && (editing ? (
        <NoteEditor initial={item.text} onDone={(text) => {
          setEditing(false);
          if (draft) return text?.trim() ? draft.onSave(text, color) : draft.onCancel();
          if (text !== null && text !== item.text) actions.patch(boardId, item, { text, baseRev: item.rev });
        }} />
      ) : (
        <div className="md" onDoubleClick={() => !inTrash && setEditing(true)}>
          <Markdown text={item.text} onToggle={inTrash ? undefined : (line, checked) => actions.patch(boardId, item, { text: toggleTaskLine(item.text, line, checked), baseRev: item.rev })} />
        </div>
      ))}
      {item.type === 'note' && done && !inTrash && !draft && (
        <button type="button" className="throw" onClick={async (e) => {
          e.stopPropagation();
          if (await actions.move(boardId, item, TRASH)) toast('已丢入废纸篓');
        }}>🎉 全部完成 · 丢入废纸篓</button>
      )}

      {(item.type === 'image' || item.type === 'file') && item.pending && <PendingBody item={item} />}
      {file?.type === 'image' && <ImageBody item={file} />}
      {file?.type === 'file' && <FileBody item={file} />}
      {item.type === 'location' && (
        <LocationBody item={item} renaming={editing} wasDragged={() => Date.now() - draggedAt.current < 250}
          onStartRename={() => { if (!inTrash) setEditing(true); }}
          onRename={(name) => {
            setEditing(false);
            if (name !== null && name !== item.name) actions.patch(boardId, item, { name });
          }} />
      )}

      <div className="foot">
        <span className="when">{inTrash && boardName(item.from) ? `来自「${boardName(item.from)}」` : fmtDay(item.createdAt)}</span>
        <span className="foot-r">
          {todo && todo.total > 0 && <span className={clsx('todo-count', done && 'all')}>✓ {todo.done}/{todo.total}</span>}
          {!inTrash && item.remindAt !== null && !item.remindDone && !draft && (ringing ? (
            <button type="button" className="chip ringing-chip" title="知道了" onClick={(e) => { e.stopPropagation(); actions.patch(boardId, item, { remindDone: true }); }}>
              <Icon name="bell" />到点了 · 知道了
            </button>
          ) : (
            <ReminderPopover remindAt={item.remindAt} onSet={(t) => actions.patch(boardId, item, { remindAt: t })}
              trigger={<button type="button" className="chip" title="改提醒时间"><Icon name="bell" />{fmtDay(item.remindAt)}</button>} />
          ))}
          {draft || inTrash ? (
            <span className="chip" title={inTrash ? '到时候就彻底删除' : undefined}><Icon name={inTrash ? 'trash' : 'clock'} />{remain(item)}{inTrash && '后清除'}</span>
          ) : (
            <TtlMenu onPick={(ttl) => actions.patch(boardId, item, { ttl })}
              trigger={<button type="button" className={clsx('chip', expiringSoon(item) && 'soon')} title="到期后进废纸篓，点一下修改"><Icon name="clock" />{remain(item)}</button>} />
          )}
        </span>
      </div>
    </div>
  );
});
