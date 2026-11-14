// 菜单的小部件：Radix 的 ContextMenu 和 DropdownMenu 子组件同名，传哪套（kit）用哪套。
// 同一份菜单项既能放进右键菜单，也能放进点按钮弹出的下拉菜单
import type * as ContextMenu from '@radix-ui/react-context-menu';
import type * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type MenuKit = typeof ContextMenu | typeof DropdownMenu;
/** 两套组件的属性一样，按其中一套写就行 */
export const asKit = (kit: MenuKit) => kit as typeof DropdownMenu;

export function MenuRow({ kit, icon, danger, onSelect, children }: { kit: MenuKit; icon?: IconName; danger?: boolean; onSelect: () => void; children: ReactNode }) {
  const K = asKit(kit);
  return <K.Item className={clsx('mi', danger && 'danger')} onSelect={onSelect}>{icon && <Icon name={icon} />}<span>{children}</span></K.Item>;
}
