import { useState } from 'react';
import { api, unwrap } from '../../api/client';
import { useNames } from '../../state/queries';
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
        <select aria-label="我是谁" required value={name} onChange={(e) => setPicked(e.target.value)}>
          {names?.login.map((k) => <option key={k} value={k}>我是{names.names[k]}</option>)}
        </select>
        <input type="password" placeholder="密码" autoComplete="current-password" required autoFocus
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" disabled={busy || !name}>{busy ? '…' : '进入'}</button>
        <p className="login-err">{error}</p>
      </form>
    </div>
  );
}
