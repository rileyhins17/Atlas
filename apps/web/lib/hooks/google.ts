'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GoogleApi } from '@/lib/api';
import { qk } from './keys';
import { useInvalidatingMutation } from './mutation';

export function useGoogleStatus() {
  return useQuery({ queryKey: qk.googleStatus, queryFn: GoogleApi.status });
}

/** Resolves to the consent-screen URL; the caller performs the navigation. */
export function useGoogleConnectStart() {
  return useMutation({ mutationFn: GoogleApi.start });
}

export function useGoogleSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: GoogleApi.sync,
    // Sync writes into the events table.
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.events }),
  });
}

export function useGoogleDisconnect() {
  return useInvalidatingMutation({
    mutationFn: GoogleApi.disconnect,
    invalidates: qk.googleStatus,
    success: 'Google Calendar disconnected',
    errorFallback: 'Failed to disconnect',
  });
}
