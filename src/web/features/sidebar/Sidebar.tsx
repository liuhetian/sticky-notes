// 左侧白板标签：可以收起成一条窄栏（只剩图标），状态记在本机；左下角是设置、说明、退出
import clsx from 'clsx';
import { useState } from 'react';
import { TRASH } from '@/shared/constants';
import type { Board } from '@/shared/schema';
import type { Actions } from '../../state/actions';
import { guideStore } from '../../state/stores';
import { Icon, IconButton } from '../../ui/Icon';
import { Logo } from '../../ui/Logo';
import { BoardIcon } from './BoardIcons';
import { SettingsButton } from './Settings';

type Props = {
  boards: Board[];
  current: string;
  onSwitch: (id: string) => void;
  actions: Actions;
  renaming: string | null;
  setRenaming: (id: string | null) => void;
  onLogout: () => void;
};

export function Sidebar({ boards, current, onSwitch, actions, renaming, setRenaming, onLogout }: Props) {
  const regular = boards.filter((b) => b.id !== TRASH);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('clip.side') === 'collapsed');
  const toggle = () => {
    localStorage.setItem('clip.side', collapsed ? 'open' : 'collapsed');
    setCollapsed(!collapsed);
  };
  return (
    <aside className={clsx('side', collapsed && 'collapsed')}>
      <div className="brand">
        <Logo className="brand-logo" /><span className="brand-name">牛牛便利贴</span>
        <IconButton name={collapsed ? 'panelOpen' : 'panelClose'} title={collapsed ? '展开侧栏' : '收起侧栏'} className="side-toggle" onClick={toggle} />
      </div>
      <nav className="tabs">
        {regular.map((b, i) => (
          <div key={b.id} className={clsx('tab', b.id === current && 'on')} title={collapsed ? b.name : '双击改名'}
            onClick={() => onSwitch(b.id)} onDoubleClick={() => !collapsed && setRenaming(b.id)}>
            <BoardIcon name={b.name} index={i} />
            {renaming === b.id && !collapsed ? (
              <input className="tab-input" defaultValue={b.name} maxLength={40} autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') { e.currentTarget.value = b.name; e.currentTarget.blur(); }
                }}
                onBlur={(e) => {
                  setRenaming(null);
                  const name = e.currentTarget.value.trim();
                  if (name && name !== b.name) actions.renameBoard(b.id, name);
                }} />
            ) : <span className="tab-name">{b.name}</span>}
            {regular.length > 1 && (
              <IconButton name="x" title="删除白板" className="tab-x" onClick={async () => {
                if (!confirm(`删除白板「${b.name}」？上面的内容会进废纸篓，30 天内可以放回别的白板`)) return;
                if ((await actions.deleteBoard(b.id)) && b.id === current) onSwitch(regular.find((x) => x.id !== b.id)!.id);
              }} />
            )}
          </div>
        ))}
      </nav>
      <button type="button" className="new-board" title="新建白板" onClick={async () => {
        const b = await actions.createBoard(`白板 ${regular.length + 1}`);
        if (b) {
          onSwitch(b.id);
          if (collapsed) toggle();
          setRenaming(b.id);
        }
      }}><Icon name="plus" /><span>新建白板</span></button>
      <div className={clsx('tab trash-tab', current === TRASH && 'on')} title="废纸篓" onClick={() => onSwitch(TRASH)}>
        <Icon name="trash" /><span className="tab-name">废纸篓</span>
      </div>
      <div className="side-foot">
        <SettingsButton />
        <IconButton name="info" title="常见问题" className="info" onClick={() => guideStore.set(true)} />
        <IconButton name="out" title="退出登录" className="logout" onClick={onLogout} />
      </div>
    </aside>
  );
}
