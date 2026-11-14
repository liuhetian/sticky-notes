// 右键空白处、底部操作栏和手机右下角的「+」共用的创建菜单。只管新建；保留时长在设置里配
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Icon } from '../../ui/Icon';
import { MenuRow, type MenuKit } from '../../ui/menu';

export type CreateHandlers = { onNote: () => void; onSketch: () => void; onFile: () => void; onLocation: () => void };

export function CreateMenuItems({ kit, onNote, onSketch, onFile, onLocation }: { kit: MenuKit } & CreateHandlers) {
  return (
    <>
      <MenuRow kit={kit} icon="note" onSelect={onNote}>便利贴</MenuRow>
      <MenuRow kit={kit} icon="brush" onSelect={onSketch}>画布</MenuRow>
      <MenuRow kit={kit} icon="clip" onSelect={onFile}>上传文件…</MenuRow>
      <MenuRow kit={kit} icon="pin" onSelect={onLocation}>位置（当前所在）</MenuRow>
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
