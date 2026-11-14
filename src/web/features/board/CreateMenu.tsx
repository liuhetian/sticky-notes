// 右键空白处和「+」共用的创建菜单：Radix 的 ContextMenu 和 DropdownMenu 子组件同名，传哪套用哪套。
// 只管新建；保留时长在设置里配
import * as ContextMenu from '@radix-ui/react-context-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Icon } from '../../ui/Icon';

type Kit = typeof ContextMenu | typeof DropdownMenu;
export type CreateHandlers = { onNote: () => void; onSketch: () => void; onFile: () => void; onLocation: () => void };

export function CreateMenuItems({ kit, onNote, onSketch, onFile, onLocation }: { kit: Kit } & CreateHandlers) {
  const K = kit as typeof DropdownMenu;
  return (
    <>
      <K.Item className="mi" onSelect={onNote}><Icon name="note" /><span>便利贴</span></K.Item>
      <K.Item className="mi" onSelect={onSketch}><Icon name="brush" /><span>画布</span></K.Item>
      <K.Item className="mi" onSelect={onFile}><Icon name="clip" /><span>上传文件…</span></K.Item>
      <K.Item className="mi" onSelect={onLocation}><Icon name="pin" /><span>位置（当前所在）</span></K.Item>
    </>
  );
}

/** 底部操作栏最后一个、手机右下角的「+」 */
export function PlusMenu({ className = 'plus', side = 'bottom', ...handlers }: CreateHandlers & { className?: string; side?: 'top' | 'bottom' }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={className} title="新建" aria-label="新建"><Icon name="plus" /></button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" side={side} align="end" sideOffset={10}>
          <CreateMenuItems kit={DropdownMenu} {...handlers} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
