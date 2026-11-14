import { useState } from 'react';
import { api, unwrap } from '../../api/client';

export function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="login-page">
      <form className="login-card" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await unwrap(api.login.$post({ json: { password } }));
          onDone();
        } catch (x) {
          setError(x instanceof Error ? x.message : String(x));
        } finally {
          setBusy(false);
        }
      }}>
        <div className="login-pin">📌</div>
        <h1>剪贴板</h1>
        <p className="login-sub">这台设备粘贴，那台设备拿走</p>
        <input type="password" placeholder="密码" autoComplete="current-password" required autoFocus
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" disabled={busy}>{busy ? '…' : '进入'}</button>
        <p className="login-err">{error}</p>
      </form>
    </div>
  );
}
