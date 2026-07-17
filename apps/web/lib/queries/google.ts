import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GoogleApi } from '@/lib/api';

export const googleKeys = {
  status: ['google', 'status'] as const,
};

export function useGoogleStatus() {
  return useQuery({ queryKey: googleKeys.status, queryFn: GoogleApi.status });
}

export function useStartGoogleConnect() {
  return useMutation({ mutationFn: GoogleApi.start });
}

export function useSyncGoogle() {
  return useMutation({ mutationFn: GoogleApi.sync });
}

export function useDisconnectGoogle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: GoogleApi.disconnect,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: googleKeys.status }),
  });
}
