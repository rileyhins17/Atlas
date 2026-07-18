import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Providers } from '@/app/providers';
import { ApiError } from '@/lib/api';
import { qk } from '@/lib/hooks/keys';

// Global error policy lives in the QueryClient (app/providers.tsx). These
// exercise it end-to-end: 400 stays inline (no toast), 401 with a live
// session clears the cache, anything else toasts.

let captured: QueryClient;

function Capture() {
  captured = useQueryClient();
  return null;
}

function Failing({ status }: { status: number }) {
  const qc = useQueryClient();
  useEffect(() => {
    // Simulate a live session so the 401 path treats it as expiry.
    qc.setQueryData(qk.me, { id: 'u1', email: 'a@b.com', displayName: null, timezone: 'UTC' });
  }, [qc]);

  const m = useMutation({
    mutationFn: async () => {
      throw new ApiError(status, 'boom');
    },
    meta: { errorFallback: 'Fallback' },
  });

  return <button onClick={() => m.mutate()}>go</button>;
}

function renderWithStatus(status: number) {
  return render(
    <Providers>
      <Capture />
      <Failing status={status} />
    </Providers>,
  );
}

async function clickAndSettle() {
  await userEvent.click(screen.getByText('go'));
  await waitFor(() =>
    expect(captured.getMutationCache().getAll().at(-1)?.state.status).toBe('error'),
  );
}

describe('global mutation error policy', () => {
  it('toasts on a 500 and keeps the session', async () => {
    renderWithStatus(500);
    await clickAndSettle();
    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(captured.getQueryData(qk.me)).not.toBeNull();
  });

  it('stays silent on a 400 (form owns it inline)', async () => {
    renderWithStatus(400);
    await clickAndSettle();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
    expect(captured.getQueryData(qk.me)).not.toBeNull();
  });

  it('clears the session on a 401 and does not toast', async () => {
    renderWithStatus(401);
    await clickAndSettle();
    await waitFor(() => expect(captured.getQueryData(qk.me)).toBeNull());
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });
});
