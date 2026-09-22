'use client';

import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WearablesApi } from '@/lib/api';
import { qk } from './keys';

export function useWearablesStatus() {
  return useQuery({ queryKey: qk.wearablesStatus, queryFn: WearablesApi.status });
}

/**
 * The last `days` of what the watch measured.
 *
 * Only fetched for someone who has connected one: everyone else would be
 * paying a round trip, on the main screen, for an empty answer.
 */
export function useWearablesSummary(days = 14, enabled = true) {
  return useQuery({
    queryKey: qk.wearablesSummary(days),
    queryFn: () => WearablesApi.summary(days),
    enabled,
  });
}

/** Resolves to the consent-screen URL; the caller performs the navigation. */
export function useWearablesConnectStart() {
  return useMutation({ mutationFn: WearablesApi.start });
}

export function useWearablesSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: WearablesApi.sync,
    // Callers show sync errors where they make sense (Settings). A toast on
    // every app open, once a week when Google expires the grant, is a nag.
    meta: { ownErrorToast: true },
    onSuccess: (result) => {
      // A skipped sync changed nothing, so nothing needs refetching.
      if (!result.ran) return;
      void qc.invalidateQueries({ queryKey: ['wearables'] });
      // New watch workouts land on the timeline too.
      if (result.newActivities > 0) void qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}

export function useWearablesDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (forget: boolean) => WearablesApi.disconnect(forget),
    meta: { success: 'Watch disconnected', errorFallback: 'Failed to disconnect' },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wearables'] }),
  });
}

/**
 * Pull fresh watch data when a screen that shows it is opened.
 *
 * Opening the app is the trigger rather than a timer, because an idle API must
 * make no database calls (CLAUDE.md) — and the server skips itself if it ran
 * minutes ago, so mounting this on several screens costs nothing. Once per
 * mount: a sync is not something to retry in a loop if Google is unhappy.
 * Failures are silent here on purpose; Settings shows the connection's real
 * state, including an expired grant.
 */
export function useWearablesAutoSync(connected: boolean) {
  const qc = useQueryClient();
  const sync = useWearablesSync();
  const fired = useRef(false);
  useEffect(() => {
    if (!connected || fired.current) return;
    fired.current = true;
    sync.mutate(undefined, {
      // An expired grant is recorded server-side; refetching status turns it
      // into a Reconnect prompt rather than silence.
      onError: () => void qc.invalidateQueries({ queryKey: qk.wearablesStatus }),
    });
  }, [connected, sync, qc]);
}
