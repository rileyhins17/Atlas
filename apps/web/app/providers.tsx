'use client';

import { useState, type ReactNode } from 'react';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
  focusManager,
} from '@tanstack/react-query';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { ApiError, errorMessage } from '@/lib/api';
import { clearUserScopedCache } from '@/lib/hooks/auth';
import { qk } from '@/lib/hooks/keys';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Toast this on success (mutations with their own UI feedback omit it). */
      success?: string;
      /** Toast fallback when the API gives no message. */
      errorFallback?: string;
    };
  }
}

/**
 * Error policy (see docs/ui-hardening-plan.md Phase 2):
 * - 401 with a live session → session expired: clear the cache, land on the
 *   auth gate. (A 401 with no session is a failed login — stays inline.)
 * - 400 → validation: the form's inline error slot handles it, no toast.
 * - anything else (network, 5xx) → error toast.
 * Successes toast when the mutation declares `meta.success`.
 */
function QueryProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();

  const [queryClient] = useState(() => {
    const handleAuthError = (error: unknown) => {
      if (error instanceof ApiError && error.status === 401 && qc.getQueryData(qk.me)) {
        clearUserScopedCache(qc);
      }
    };

    const qc: QueryClient = new QueryClient({
      queryCache: new QueryCache({
        onError: handleAuthError,
      }),
      mutationCache: new MutationCache({
        onSuccess: (_data, _vars, _ctx, mutation) => {
          const message = mutation.meta?.success;
          if (message) toast(message, 'success');
        },
        onError: (error, _vars, _ctx, mutation) => {
          handleAuthError(error);
          if (error instanceof ApiError && (error.status === 400 || error.status === 401)) return;
          toast(errorMessage(error, mutation.meta?.errorFallback ?? 'Something went wrong'), 'error');
        },
      }),
      defaultOptions: {
        queries: {
          // Session-cookie auth: a 401 means "log in", not "retry".
          retry: (failureCount, error) => {
            if (error instanceof ApiError && error.status === 401) return false;
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
    });
    return qc;
  });

  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    // Debug handles for driving/inspecting the cache from the console in dev.
    // focusManager matters for automation: retries pause while the tab is
    // unfocused, so headless drivers must setFocused(true) to see error states.
    (window as unknown as { __qc?: QueryClient }).__qc = queryClient;
    (window as unknown as { __focusManager?: typeof focusManager }).__focusManager = focusManager;
  }

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/**
 * App-wide client providers. The QueryClient lives in component state so it's
 * stable across re-renders but never shared between users on the server (one
 * client per browser session). ToastProvider sits outside so the mutation
 * cache's global success/error handlers can toast.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <QueryProvider>{children}</QueryProvider>
    </ToastProvider>
  );
}
