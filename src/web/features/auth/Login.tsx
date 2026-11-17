import * as Select from '@radix-ui/react-select';
import { useState } from 'react';
import { api, unwrap } from '../../api/client';
import { useNames } from '../../state/queries';
import { Icon } from '../../ui/Icon';
import { Logo } from '../../ui/Logo';

/** 输共用密码、选「我是谁」；名字签进 cookie，密码不存在本机 */
export function Login({ onDone }: { onDone: (name: string) => void }) {
  const [password, setPassword] = useState('');
  const { data: names } = useNames();
  const [picked, setPicked] = useState('');
  const name = picked || names?.login[0] || '';
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="login-page">
      <form className="login-card" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          onDone((await unwrap<{ name: string }>(api.login.$post({ json: { password, name } }))).name);
        } catch (x) {
          setError(x instanceof Error ? x.message : String(x));
        } finally {
          setBusy(false);
        }
      }}>
        <Logo className="login-logo" />
        <h1>牛牛便利贴</h1>
        <p className="login-sub">这台设备粘贴，那台设备拿走</p>
        {/* 自己画的下拉框：原生的弹出列表是系统样式，和便利贴不搭 */}
        <Select.Root value={name} onValueChange={setPicked}>
          <Select.Trigger className="login-pick" aria-label="我是谁">
            <Select.Value placeholder="我是谁" />
            <Select.Icon className="login-pick-arrow"><Icon name="chevron" /></Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className="menu login-pick-menu" position="popper" sideOffset={6}>
              <Select.Viewport>
                {names?.login.map((k) => (
                  <Select.Item key={k} value={k} className="mi">
                    <Select.ItemText>我是{names.names[k]}</Select.ItemText>
                    <Select.ItemIndicator className="mi-hint"><Icon name="check" /></Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
        <input type="password" placeholder="密码" autoComplete="current-password" required autoFocus
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" disabled={busy || !name}>{busy ? '…' : '进入'}</button>
        <p className="login-err">{error}</p>
      </form>
    </div>
  );
}
