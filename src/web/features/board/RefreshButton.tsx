// 白板名字右边的刷新按钮：关着自动同步时才有。点一下同步当前白板、白板列表和提醒，就是开着自动同步时定时拉的那三样
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { qk } from '../../state/queries';
import { syncStore } from '../../state/stores';
import { Icon } from '../../ui/Icon';

export function RefreshButton({ boardId }: { boardId: string }) {
  const qc = useQueryClient();
  const sync = syncStore.use();
  const [busy, setBusy] = useState(false);
  if (sync) return null;
  const refresh = async () => {
    setBusy(true);
    const keys = [qk.items(boardId), qk.boards, qk.reminders];
    try {
      // 至少转满一圈：同步很快时也看得出点上了
      await Promise.all([...keys.map((queryKey) => qc.refetchQueries({ queryKey }, { throwOnError: true })), new Promise((r) => setTimeout(r, 600))]);
    } catch (e) {
      toast.error(`同步失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={clsx('tb-ib refresh', busy && 'busy')} title="同步别的设备的改动" aria-label="同步别的设备的改动"
      disabled={busy} onClick={refresh}><Icon name="refresh" /></button>
  );
}
