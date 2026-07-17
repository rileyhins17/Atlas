import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserDTO } from '@atlas/shared';
import { AuthApi } from '@/lib/api';

export const authKeys = {
  me: ['auth', 'me'] as const,
};

export function useMe() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: AuthApi.me,
    retry: false,
  });
}

function useSetUser() {
  const queryClient = useQueryClient();
  return (user: UserDTO) => queryClient.setQueryData(authKeys.me, user);
}

export function useLogin() {
  const setUser = useSetUser();
  return useMutation({
    mutationFn: AuthApi.login,
    onSuccess: setUser,
  });
}

export function useRegister() {
  const setUser = useSetUser();
  return useMutation({
    mutationFn: AuthApi.register,
    onSuccess: setUser,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: AuthApi.logout,
    // Wipe every cached query on sign-out — nothing from this user's session
    // (tasks, journal, chat history, ...) should be visible to whoever signs
    // in next on the same device.
    onSuccess: () => queryClient.clear(),
  });
}
