// 元素上的两个小弹层：到期时间菜单、提醒设置
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import dayjs from 'dayjs';
import { useState, type ReactNode } from 'react';
import { serverNow } from '../../api/client';
import { TTL_LABELS, fmtDay } from '../../lib/format';
import { askNotificationPermission } from '../reminders/useReminders';
import { Icon } from '../../ui/Icon';

export function TtlMenu({ trigger, onPick }: { trigger: ReactNode; onPick: (ttl: number | null) => void }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" sideOffset={6} align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu.Label className="mlabel">从现在起保留</DropdownMenu.Label>
          {TTL_LABELS.map(([v, label]) => (
            <DropdownMenu.Item key={label} className="mi" onSelect={() => onPick(v)}>{label}</DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
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
