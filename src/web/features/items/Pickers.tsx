// 卡片上「选一个」的小菜单：保留时长、移到哪块白板、什么时候提醒。
// 菜单项用 kit 写，右键菜单的子菜单和卡片上点开的下拉菜单共用一份
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import dayjs from 'dayjs';
import { useState, type ReactNode } from 'react';
import type { Board } from '@/shared/schema';
import { serverNow } from '../../api/client';
import { TTL_LABELS, fmtDay } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { asKit, type MenuKit } from '../../ui/menu';
import { askNotificationPermission } from '../reminders/useReminders';

export function TtlItems({ kit, onPick }: { kit: MenuKit; onPick: (ttl: number | null) => void }) {
  const K = asKit(kit);
  return (
    <>
      <K.Label className="mlabel">从现在起保留，到期进废纸篓</K.Label>
      {TTL_LABELS.map(([v, label]) => <K.Item key={label} className="mi" onSelect={() => onPick(v)}>{label}</K.Item>)}
    </>
  );
}

export function MoveItems({ kit, boards, onPick }: { kit: MenuKit; boards: Board[]; onPick: (b: Board) => void }) {
  const K = asKit(kit);
  return <>{boards.map((b) => <K.Item key={b.id} className="mi" onSelect={() => onPick(b)}>{b.name}</K.Item>)}</>;
}

/** 点 trigger 弹出的下拉菜单 */
export function Dropdown({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" sideOffset={6} align="end" onClick={(e) => e.stopPropagation()}>{children}</DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function quickPicks(): [string, number][] {
  const now = dayjs(serverNow());
  const tonight = now.hour() < 20 ? now.hour(20).minute(0).second(0) : null;
  const morning = now.add(1, 'day').hour(9).minute(0).second(0);
  return [
    ['10 分钟后', now.add(10, 'minute').valueOf()],
    ['1 小时后', now.add(1, 'hour').valueOf()],
    ...(tonight ? [['今晚 20:00', tonight.valueOf()] as [string, number]] : []),
    ['明早 09:00', morning.valueOf()],
  ];
}

/** 右键菜单里的提醒：只有几个快捷时间 */
export function ReminderItems({ kit, remindAt, onSet }: { kit: MenuKit; remindAt: number | null; onSet: (t: number | null) => void }) {
  const K = asKit(kit);
  return (
    <>
      <K.Label className="mlabel">页面开着时提醒</K.Label>
      {quickPicks().map(([label, t]) => (
        <K.Item key={label} className="mi" onSelect={() => { askNotificationPermission(); onSet(t); }}>{label}<span className="mi-hint">{fmtDay(t)}</span></K.Item>
      ))}
      {remindAt !== null && <K.Item className="mi danger" onSelect={() => onSet(null)}>不提醒了</K.Item>}
    </>
  );
}

/** 卡片上的提醒：快捷时间之外还能自己挑时间 */
export function ReminderPopover({ trigger, remindAt, onSet }: { trigger: ReactNode; remindAt: number | null; onSet: (t: number | null) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const pick = (t: number | null) => {
    if (t !== null) askNotificationPermission();
    onSet(t);
    setOpen(false);
  };
  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) setCustom(dayjs(remindAt ?? serverNow() + 3600_000).format('YYYY-MM-DDTHH:mm')); }}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="menu remind" sideOffset={6} align="end" onClick={(e) => e.stopPropagation()}>
          <div className="mlabel">{remindAt ? `现在：${fmtDay(remindAt)}` : '到点提醒我（页面开着时）'}</div>
          {quickPicks().map(([label, t]) => (
            <button key={label} type="button" className="mi" onClick={() => pick(t)}>{label}<span className="mi-hint">{fmtDay(t)}</span></button>
          ))}
          <div className="remind-custom">
            <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} />
            <button type="button" className="btn" disabled={!custom} onClick={() => pick(dayjs(custom).valueOf())}>定</button>
          </div>
          {remindAt !== null && <button type="button" className="mi danger" onClick={() => pick(null)}><Icon name="x" />不提醒了</button>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
