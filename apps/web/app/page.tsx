'use client';

import { useMe } from '@/lib/hooks/auth';
import { AuthGate } from '@/components/AuthGate';
import { Dashboard } from '@/components/Dashboard';

export default function Home() {
  const me = useMe();

  if (me.isPending) {
    return (
      <div className="container center">
        <span className="muted">Loading…</span>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="brand">
        <h1>Atlas</h1>
        <span className="tag">your life, in one place</span>
      </div>
      {me.data ? <Dashboard user={me.data} /> : <AuthGate />}
    </div>
  );
}
