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

/**
 * Every calendar the connected Google account keeps.
 *
 * Its own query rather than part of status: it costs a Google round-trip, and
 * status is polled by pages that only want to know whether the button says
 * Connect. `enabled` keeps it from firing at all before there is a connection.
 */
export function useGoogleCalendars(enabled: boolean) {
  return useQuery({
    queryKey: qk.googleCalendars,
    queryFn: GoogleApi.calendars,
    enabled,
  });
}

export function useSetGoogleCalendars() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: GoogleApi.setCalendars,
    // Unticking a calendar deletes the events it brought in, so the events
    // cache is as stale as the calendar list.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.googleCalendars });
      void qc.invalidateQueries({ queryKey: qk.events });
    },
  });
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
