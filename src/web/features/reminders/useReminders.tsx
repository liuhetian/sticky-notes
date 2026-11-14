// 到点提醒：页面开着时才响（Makers 的定时任务最小间隔一天，没法关着推送）
// 每分钟拉一次提醒索引，到点弹一个不会自己消失的提示；桌面浏览器在页面藏在后台时另弹系统通知
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { Board, Reminder } from '@/shared/schema';
import { serverNow } from '../../api/client';
import { useReminderList } from '../../state/queries';
import { fmtDay } from '../../lib/format';
import { useTick } from '../../lib/hooks';

export function useReminders(boards: Board[], go: (r: Reminder) => void, done: (r: Reminder) => void) {
  const { data: reminders = [] } = useReminderList();
  const shown = useRef(new Map<string, string | number>()); // itemId → toast id
  useTick(15_000);

  useEffect(() => {
    const now = serverNow();
    const live = new Set(reminders.map((r) => r.itemId));
    // 别的设备点了「知道了」，这边的提示也收起来
    for (const [itemId, tid] of shown.current) if (!live.has(itemId)) { toast.dismiss(tid); shown.current.delete(itemId); }
    for (const r of reminders) {
      if (r.remindAt > now || shown.current.has(r.itemId)) continue;
      const board = boards.find((b) => b.id === r.boardId)?.name ?? '白板';
      const tid = toast(`⏰ 到点了：「${board}」上的一条（${fmtDay(r.remindAt)}）`, {
        duration: Infinity,
        action: { label: '看看', onClick: () => go(r) },
        cancel: { label: '知道了', onClick: () => done(r) },
      });
      shown.current.set(r.itemId, tid);
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('牛牛便利贴提醒', { body: `「${board}」上有一条到点了`, tag: r.itemId });
      }
    }
  });
}

export function askNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}
