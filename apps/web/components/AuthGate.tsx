'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { useLogin, useRegister } from '@/lib/hooks/auth';
import { Button, Input } from '@/components/ui';

export function AuthGate() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const register = useRegister();

  const active = mode === 'login' ? login : register;
  const busy = active.isPending;
  const error = active.error
    ? active.error instanceof ApiError
      ? active.error.message
      : 'Something went wrong'
    : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    active.mutate({ email, password });
  }

  return (
    <div className="center">
      <form className="card stack" style={{ width: 340 }} onSubmit={submit}>
        <div className="section-title" style={{ margin: 0 }}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </div>
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          type="password"
          placeholder="Password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
        {error && <div className="error">{error}</div>}
        <Button variant="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </Button>
      </form>
    </div>
  );
}
