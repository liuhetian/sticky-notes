// 每天的清理是分批的：定时任务每天只推一批，剩下的靠页面打开时接着调到做完。每台设备每天只帮忙一次
import { useEffect } from 'react';
import { api, drain, unwrap } from '../api/client';

const KEY = 'clip.cleanup.day';

export function useDailyCleanup(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const today = new Date().toDateString();
    if (localStorage.getItem(KEY) === today) return;
    localStorage.setItem(KEY, today);
    drain(async () => !(await unwrap<{ done: boolean }>(api.cron.cleanup.$post())).done)
      .catch(() => localStorage.removeItem(KEY));
  }, [ready]);
}
