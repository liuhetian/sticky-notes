// 白板名字右边的刷新按钮：关着自动同步时才有。点一下同步当前白板、白板列表和提醒，就是开着自动同步时定时拉的那三样。
// 同步时转圈，成功后变成 ✓ 停 1 秒，看得出这次已经拿到结果
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { qk } from '../../state/queries';
import { syncStore } from '../../state/stores';
import { Icon } from '../../ui/Icon';

export function RefreshButton({ boardId }: { boardId: string }) {
  const qc = useQueryClient();
  const sync = syncStore.use();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  useEffect(() => {
    if (state !== 'done') return;
    const t = setTimeout(() => setState('idle'), 1000);
    return () => clearTimeout(t);
  }, [state]);
  if (sync) return null;
  const refresh = async () => {
    setState('busy');
    const keys = [qk.items(boardId), qk.boards, qk.reminders];
    try {
      // 至少转满一圈：同步很快时也看得出点上了
      await Promise.all([...keys.map((queryKey) => qc.refetchQueries({ queryKey }, { throwOnError: true })), new Promise((r) => setTimeout(r, 600))]);
      setState('done');
    } catch (e) {
      setState('idle');
      toast.error(`同步失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const label = state === 'done' ? '已同步' : '同步别的设备的改动';
  return (
    <button type="button" className={clsx('tb-ib refresh', state)} title={label} aria-label={label}
      disabled={state === 'busy'} onClick={refresh}><Icon key={state === 'done' ? 'check' : 'refresh'} name={state === 'done' ? 'check' : 'refresh'} /></button>
  );
}
