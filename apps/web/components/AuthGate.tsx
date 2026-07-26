'use client';

import { useState } from 'react';
import { LoginInput, RegisterInput } from '@atlas/shared';
import { errorMessage } from '@/lib/api';
import { useAuthConfig, useLogin, useRegister } from '@/lib/hooks/auth';
import { Button, Input } from '@/components/ui';
import { Logo } from '@/components/Logo';

export function AuthGate() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [clientError, setClientError] = useState<string | null>(null);
  const login = useLogin();
  const register = useRegister();
  const authConfig = useAuthConfig();
  const inviteRequired = authConfig.data?.inviteRequired ?? false;

  const active = mode === 'login' ? login : register;
  const busy = active.isPending;
  const error =
    clientError ?? (active.error ? errorMessage(active.error, 'Something went wrong') : null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // Same zod schemas the API enforces — catch it before the round-trip.
    const schema = mode === 'login' ? LoginInput : RegisterInput;
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setClientError(parsed.error.issues[0]?.message ?? 'Check your email and password');
      return;
    }
    if (mode === 'register' && inviteRequired && inviteCode.trim() === '') {
      setClientError('An invite code is required to create an account.');
      return;
    }
    setClientError(null);
    if (mode === 'register') {
      register.mutate({ email, password, remember, ...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}) });
    } else {
      login.mutate({ email, password, remember });
    }
  }

  return (
    <div className="gate">
      {/* The mark used to sit in a bare ring with a lot of dead space beneath
          it. Now it is a proper lockup — glyph, wordmark, and one line saying
          what this actually is, which is the only thing a first-time visitor
          needs from this screen. */}
      <div className="gate-brand">
        <span className="gate-mark" aria-hidden>
          <Logo size={40} />
        </span>
        <h1 className="gate-word">Atlas</h1>
        <p className="gate-tag">Your day, your habits, your life — in one place.</p>
      </div>

      <form className="gate-card" onSubmit={submit}>
        <div className="gate-tabs" role="group" aria-label="Sign in or create an account">
          <button
            type="button"
            className={`gate-tab ${mode === 'login' ? 'on' : ''}`}
            aria-label="Show the sign in form"
            aria-pressed={mode === 'login'}
            onClick={() => {
              setMode('login');
              setClientError(null);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`gate-tab ${mode === 'register' ? 'on' : ''}`}
            aria-label="Show the create account form"
            aria-pressed={mode === 'register'}
            onClick={() => {
              setMode('register');
              setClientError(null);
            }}
          >
            Create account
          </button>
        </div>

        <Input
          type="email"
          placeholder="Email"
          aria-label="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          required
        />
        <Input
          type="password"
          placeholder={mode === 'login' ? 'Password' : 'Password (min 8 characters)'}
          aria-label="Password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {mode === 'register' && inviteRequired && (
          <Input
            placeholder="Invite code"
            aria-label="Invite code"
            autoComplete="off"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            required
          />
        )}

        {/* On by default — being signed out every time you close the app is the
            most annoying thing a daily tool can do. The control exists to opt
            OUT on a shared machine, not to opt in. */}
        <label className="gate-remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>Keep me signed in</span>
        </label>

        <Button type="submit" disabled={busy}>
          {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}
