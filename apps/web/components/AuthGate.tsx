'use client';

import { useState } from 'react';
import { LoginInput, RegisterInput } from '@atlas/shared';
import { errorMessage } from '@/lib/api';
import { useLogin, useRegister } from '@/lib/hooks/auth';
import { Button, Input } from '@/components/ui';

export function AuthGate() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const login = useLogin();
  const register = useRegister();

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
    setClientError(null);
    active.mutate({ email, password });
  }

  return (
    <div className="center">
      <form className="card stack" style={{ width: 340 }} onSubmit={submit}>
        <h2 className="section-title" style={{ margin: 0 }}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </h2>
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
          placeholder="Password (min 8 chars)"
          aria-label="Password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
        {error && <div className="error">{error}</div>}
        <Button
          variant="ghost"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setClientError(null);
          }}
        >
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </Button>
      </form>
    </div>
  );
}
