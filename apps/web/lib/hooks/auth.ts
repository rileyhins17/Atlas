'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { UserDTO } from '@atlas/shared';
import { ApiError, AuthApi } from '@/lib/api';
import { qk } from './keys';

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
        return await AuthApi.me();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
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
    onSuccess: (user) => qc.setQueryData(qk.me, user),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: AuthApi.register,
    onSuccess: (user) => qc.setQueryData(qk.me, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: AuthApi.logout,
    onSuccess: () => clearUserScopedCache(qc),
  });
}
