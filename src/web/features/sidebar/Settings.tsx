// 侧边栏左下角的设置：新内容默认保留多久、新便利贴的颜色、显不显示小地图、自动同步；都只记在这台设备上。
// 文字说明不放这里，收在旁边的 i 里
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import { COLORS } from '@/shared/constants';
import { TTL_LABELS } from '../../lib/format';
import { useMobile } from '../../lib/hooks';
import { colorStore, minimapStore, syncStore, ttlStore } from '../../state/stores';
import { Icon } from '../../ui/Icon';

export function SettingsButton() {
  const ttl = ttlStore.use();
  const color = colorStore.use();
  const minimap = minimapStore.use();
  const sync = syncStore.use();
  const mobile = useMobile();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="ib settings" title="设置" aria-label="设置"><Icon name="gear" /></button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="menu settings-panel" side="top" align="start" sideOffset={8}>
          <div className="mlabel">新贴上来的内容保留</div>
          <div className="ttl-grid">
            {TTL_LABELS.map(([v, label]) => (
              <button key={label} type="button" className={clsx('ttl-opt', v === ttl && 'on')} onClick={() => ttlStore.set(v)}>{label}</button>
            ))}
          </div>
          <div className="mlabel">新便利贴的颜色</div>
          <div className="color-row">
            {COLORS.map((c) => (
              <button key={c} type="button" className={clsx('swatch', c, c === color && 'on')} aria-label={c} onClick={() => colorStore.set(c)} />
            ))}
          </div>
          <div className="msep" />
          {/* 手机上没有小地图，开关置灰；不改存下来的值，回到电脑上还是原来的选择 */}
          <label className={clsx('mi switch-row', mobile && 'off')} title={mobile ? '手机上没有小地图' : undefined}>
            <span>显示小地图</span>
            <input type="checkbox" disabled={mobile} checked={minimap && !mobile} onChange={(e) => minimapStore.set(e.target.checked)} />
          </label>
          <label className="mi switch-row">
            <span>自动同步</span>
            <input type="checkbox" checked={sync} onChange={(e) => syncStore.set(e.target.checked)} />
          </label>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
