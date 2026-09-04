'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { UserDTO } from '@atlas/shared';
import { ApiError, AuthApi } from '@/lib/api';
import { qk } from './keys';
import { clearSignedIn, markSignedIn } from '@/lib/session-hint';
import { setDisplayTimezone } from '@/lib/dates';

/**
 * Drop everything user-scoped from the cache and land on the auth gate.
 * Called on sign-out and account deletion so no data leaks into the next
 * session on a shared browser.
 */
export function clearUserScopedCache(qc: QueryClient): void {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
  qc.setQueryData(qk.me, null);
}

/** Session probe: resolves to the user, or null when not signed in (401). */
export function useMe() {
  return useQuery<UserDTO | null>({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        const user = await AuthApi.me();
        // Also set here, not only on sign-in: sessions that predate this — and
        // any browser that has simply not signed in since — would otherwise
        // never get the fast path despite being perfectly signed in.
        markSignedIn();
        // The whole UI formats times in the timezone Atlas holds for the user,
        // not the browser's. They agree for almost everyone; when they do not,
        // the browser's is the wrong one — the API already buckets every day,
        // every stat and every "is this today" by the stored value, so a device
        // set elsewhere used to put the screen hours out of step with the data
        // behind it, silently, and only for that person.
        setDisplayTimezone(user?.timezone);
        return user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          // The cookie is gone or rejected. Stop claiming this browser has a
          // session, or every future load draws a frame that resolves to the
          // sign-in screen.
          clearSignedIn();
          return null;
        }
        throw err;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: AuthApi.login,
    onSuccess: (user) => {
      qc.setQueryData(qk.me, user);
      markSignedIn();
    },
  });
}

/**
 * Whether sign-up needs an invite code. Public and cacheable — it is a property
 * of the deployment, not of the visitor.
 */
export function useAuthConfig() {
  return useQuery({
    queryKey: ['auth', 'config'],
    queryFn: AuthApi.config,
    staleTime: Infinity,
    retry: false,
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: AuthApi.register,
    onSuccess: (user) => {
      qc.setQueryData(qk.me, user);
      markSignedIn();
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: AuthApi.logout,
    onSuccess: () => {
      clearUserScopedCache(qc);
      clearSignedIn();
    },
  });
}
