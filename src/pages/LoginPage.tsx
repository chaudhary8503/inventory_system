import { useState, type FormEvent } from 'react';
import { signIn, type SessionUser } from '../auth';
import { supabaseConfigured } from '../lib/supabase';
import './LoginPage.css';

interface LoginPageProps {
  onSuccess: (user: SessionUser) => void;
  /** App name on the card. Module apps pass their own, e.g. "Inventory". */
  title?: string;
}

function LoginPage({ onSuccess, title = 'Powerant Portal' }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    supabaseConfigured ? null : 'The portal is not connected to the database yet (missing Supabase settings).',
  );
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const user = await signIn(username, password);
      onSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.');
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="card login-card" onSubmit={handleSubmit}>
        <img className="login-logo" src="/powerant-logo.jpg" alt="Powerant" />
        <h1 className="page-title">{title}</h1>
        <p className="page-sub">Sign in with the username and password you were given.</p>

        <label htmlFor="username">Username</label>
        <input
          id="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError(null);
          }}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
        />

        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="login-submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

export default LoginPage;
