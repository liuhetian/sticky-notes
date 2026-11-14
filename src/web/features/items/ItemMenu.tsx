// 卡片上的右键菜单：按类型给能做的事，再加通用的；废纸篓里只有放回和彻底删除
import * as CM from '@radix-ui/react-context-menu';
import clsx from 'clsx';
import { toast } from 'sonner';
import { COLORS, TRASH } from '@/shared/constants';
import { fmtCoords } from '@/shared/geo';
import type { Board, Item } from '@/shared/schema';
import { shareUrl } from '../../api/client';
import { copyImage, copyText, download, shareLink } from '../../lib/clipboard';
import { TTL_LABELS, fmtDay } from '../../lib/format';
import type { Actions } from '../../state/actions';
import { editStore, lightboxStore, sketchStore, ttlStore } from '../../state/stores';
import { Icon, type IconName } from '../../ui/Icon';
import type { PickAnchor } from '../links/anchors';
import { labelOf, otherEnd, wiresFor, type Wire } from '../links/model';
import { askNotificationPermission } from '../reminders/useReminders';
import { openInMap } from './bodies';
import { readableUrl } from './FileImage';
import { quickPicks } from './Menus';

const COLOR_NAMES: Record<(typeof COLORS)[number], string> = { yellow: '黄', pink: '粉', blue: '蓝', green: '绿', purple: '紫', orange: '橙' };

const Row = ({ icon, children, danger, onSelect }: { icon: IconName; children: React.ReactNode; danger?: boolean; onSelect: () => void }) => (
  <CM.Item className={clsx('mi', danger && 'danger')} onSelect={onSelect}><Icon name={icon} /><span>{children}</span></CM.Item>
);
const Sub = ({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) => (
  <CM.Sub>
    <CM.SubTrigger className="mi sub"><Icon name={icon} /><span>{label}</span><span className="mi-arrow"><Icon name="chevron" /></span></CM.SubTrigger>
    <CM.Portal><CM.SubContent className="menu" sideOffset={6} alignOffset={-6}>{children}</CM.SubContent></CM.Portal>
  </CM.Sub>
);

export function ItemMenu({ item, boardId, boards, items, wires, actions, mobile, anchor, onLink, onUnlink, selectedCount, onDeleteSelected }: {
  item: Item; boardId: string; boards: Board[]; items: Item[]; wires: Wire[]; actions: Actions; mobile: boolean;
  /** 右键点在便利贴的某一行、图片的某个点上：可以从那里拉线 */
  anchor?: PickAnchor;
  onLink: (anchor?: PickAnchor) => void; onUnlink: (w: Wire) => void;
  /** 右键的这张在多选里：多一项「删除选中的 N 项」 */
  selectedCount: number; onDeleteSelected: () => void;
}) {
  const boardName = (id?: string) => boards.find((b) => b.id === id)?.name;
  if (boardId === TRASH) {
    return (
      <>
        <Row icon="undo" onSelect={async () => { const r = await actions.move(boardId, item, undefined, { ttl: ttlStore.get() }); if (r) toast(`已放回「${boardName(r.to) ?? '白板'}」`); }}>
          放回「{boardName(item.from) ?? '第一块白板'}」
        </Row>
        <CM.Separator className="msep" />
        <Row icon="trash" danger onSelect={() => { if (confirm('彻底删除？删了就找不回来了')) actions.remove(boardId, item); }}>彻底删除</Row>
      </>
    );
  }

  const file = (item.type === 'image' || item.type === 'file') && !item.pending ? item : null;
  const mine = wiresFor(wires, item.id);
  const remindOn = item.remindAt !== null && !item.remindDone;
  const others = boards.filter((b) => b.id !== boardId && b.id !== TRASH);

  return (
    <>
      {item.type === 'note' && (
        <>
          <Row icon="edit" onSelect={() => requestAnimationFrame(() => editStore.set(item.id))}>编辑</Row>
          <Row icon="copy" onSelect={() => copyText(item.text)}>复制文字</Row>
          <Sub icon="palette" label="颜色">
            {COLORS.map((c) => (
              <CM.Item key={c} className="mi" onSelect={() => actions.patch(boardId, item, { color: c })}>
                <span className={clsx('swatch', c, c === item.color && 'on')} /><span>{COLOR_NAMES[c]}</span>
              </CM.Item>
            ))}
          </Sub>
        </>
      )}
      {file?.type === 'image' && (
        <>
          <Row icon="brush" onSelect={() => sketchStore.set({ at: Date.now(), bg: file.file, pos: { x: item.x + 300, y: item.y } })}>在上面画</Row>
          <Row icon="open" onSelect={() => lightboxStore.set(file.file)}>看大图</Row>
          <Row icon="copy" onSelect={() => copyImage(readableUrl(file.file))}>复制图片</Row>
        </>
      )}
      {file && <Row icon="download" onSelect={() => download(file.file)}>下载</Row>}
      {item.type === 'location' && (
        <>
          <Row icon="open" onSelect={() => openInMap(item)}>在地图中打开</Row>
          <Row icon="copy" onSelect={() => copyText(fmtCoords(item), '坐标已复制')}>复制坐标</Row>
          <Row icon="edit" onSelect={() => requestAnimationFrame(() => editStore.set(item.id))}>改名</Row>
        </>
      )}
      <CM.Separator className="msep" />

      <Sub icon="bell" label={remindOn ? `提醒 · ${fmtDay(item.remindAt!)}` : '到点提醒'}>
        <CM.Label className="mlabel">页面开着时提醒</CM.Label>
        {quickPicks().map(([label, t]) => (
          <CM.Item key={label} className="mi" onSelect={() => { askNotificationPermission(); actions.patch(boardId, item, { remindAt: t }); }}>
            {label}<span className="mi-hint">{fmtDay(t)}</span>
          </CM.Item>
        ))}
        {remindOn && <CM.Item className="mi danger" onSelect={() => actions.patch(boardId, item, { remindAt: null })}>不提醒了</CM.Item>}
      </Sub>
      <Sub icon="clock" label="保留时长">
        <CM.Label className="mlabel">从现在起保留，到期进废纸篓</CM.Label>
        {TTL_LABELS.map(([v, label]) => (
          <CM.Item key={label} className="mi" onSelect={() => actions.patch(boardId, item, { ttl: v })}>{label}</CM.Item>
        ))}
      </Sub>
      <CM.Separator className="msep" />

      {anchor && <Row icon="target" onSelect={() => onLink(anchor)}>{'line' in anchor ? '从这一行连线到…' : '从这个点连线到…'}</Row>}
      <Row icon="connect" onSelect={() => onLink()}>{anchor ? '从整张卡片连线到…' : '连线到…'}</Row>
      {mine.length > 0 && (
        <Sub icon="unlink" label={`断开连线（${mine.length}）`}>
          {mine.map((w) => {
            const o = items.find((i) => i.id === otherEnd(w, item.id));
            return <CM.Item key={w.key} className="mi" onSelect={() => onUnlink(w)}>{o ? labelOf(o) : '（已不在）'}</CM.Item>;
          })}
        </Sub>
      )}
      <Row icon="link" onSelect={() => shareLink(shareUrl(item.id), mobile)}>复制分享链接</Row>
      {others.length > 0 && (
        <Sub icon="move" label="移到">
          {others.map((b) => (
            <CM.Item key={b.id} className="mi" onSelect={async () => { if (await actions.move(boardId, item, b.id)) toast(`已移到「${b.name}」`); }}>{b.name}</CM.Item>
          ))}
        </Sub>
      )}
      <CM.Separator className="msep" />
      {selectedCount > 1 && <Row icon="trash" danger onSelect={onDeleteSelected}>删除选中的 {selectedCount} 项</Row>}
      <Row icon="trash" danger onSelect={() => actions.remove(boardId, item)}>删除</Row>
    </>
  );
}
