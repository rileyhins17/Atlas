'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';

/**
 * App-wide client providers. Currently the TanStack Query cache — the data
 * layer every panel will migrate onto (see docs/ui-hardening-plan.md).
 *
 * The client is created inside a `useState` initializer so it's stable across
 * re-renders but never shared between users on the server (one client per
 * browser session).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Session-cookie auth: a 401 means "log in", not "retry".
            retry: (failureCount, error) => {
              if (error instanceof Error && 'status' in error && (error as { status: number }).status === 401) {
                return false;
              }
              return failureCount < 2;
            },
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Atlas is self-hosted: the API can be reachable on localhost/LAN
            // while the OS reports offline (laptop with no internet). Default
            // 'online' would pause every fetch in that state; always attempt.
            networkMode: 'always',
          },
          mutations: {
            networkMode: 'always',
          },
        },
      }),
  );

  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    // Debug handles for driving/inspecting the cache from the console in dev.
    // focusManager matters for automation: retries pause while the tab is
    // unfocused, so headless drivers must setFocused(true) to see error states.
    (window as unknown as { __qc?: QueryClient }).__qc = queryClient;
    (window as unknown as { __focusManager?: typeof focusManager }).__focusManager = focusManager;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
