'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
