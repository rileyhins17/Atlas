'use client';

import { useState } from 'react';
import { LoginInput, RegisterInput } from '@atlas/shared';
import { errorMessage } from '@/lib/api';
import { useAuthConfig, useLogin, useRegister } from '@/lib/hooks/auth';
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

  const heading = mode === 'login' ? 'Welcome back' : 'Create your account';
  const blurb =
    mode === 'login'
      ? 'Pick up where your day left off.'
      : 'Atlas plans around the hours you actually have.';

  return (
    <div className="gate">
      <div className="gate-inner">
        {/* Small, quiet mark. On this screen the heading is the hero — the
            brand only needs to identify, not dominate. */}
        <span className="gate-mark" aria-hidden>
          <Logo size={22} />
        </span>

        <h1 className="gate-heading">{heading}</h1>
        <p className="gate-blurb">{blurb}</p>

        <div className="gate-seg" role="group" aria-label="Sign in or create an account">
          <button
            type="button"
            className={`gate-seg-btn ${mode === 'login' ? 'on' : ''}`}
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
            className={`gate-seg-btn ${mode === 'register' ? 'on' : ''}`}
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

        {/* Labels ABOVE the fields, not placeholders inside them. A placeholder
            disappears the moment you type, so by the time anything is filled in
            the form no longer says what any of it is. */}
        <form className="gate-form" onSubmit={submit}>
          <label className="gate-field">
            <span className="gate-label">Email</span>
            <input
              className="gate-input"
              type="email"
              aria-label="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
          </label>

          <label className="gate-field">
            <span className="gate-label">Password</span>
            <input
              className="gate-input"
              type="password"
              aria-label="Password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {mode === 'register' && <span className="gate-hint">At least 8 characters.</span>}
          </label>

          {mode === 'register' && inviteRequired && (
            <label className="gate-field">
              <span className="gate-label">Invite code</span>
              <input
                className="gate-input"
                aria-label="Invite code"
                autoComplete="off"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required
              />
              <span className="gate-hint">Atlas is invite-only while in early access.</span>
            </label>
          )}

          <label className="gate-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Keep me signed in</span>
          </label>

          {error && (
            <div className="gate-error" role="alert">
              {error}
            </div>
          )}

          <button className="gate-submit" type="submit" disabled={busy}>
            {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
