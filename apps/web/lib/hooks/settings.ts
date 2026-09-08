'use client';

import type { WeightUnit } from '@atlas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingsApi } from '@/lib/api';
import { qk } from './keys';

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: SettingsApi.get });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: SettingsApi.update,
    onSuccess: (data) => {
      qc.setQueryData(qk.settings, data);
      // `displayName` and `timezone` live on /auth/me as well, and that is the
      // copy the Today greeting and the sidebar read. Without this, saving your
      // name updates the settings form and nothing else on screen — the change
      // looks like it did not take.
      void qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

/**
 * The user's weight unit, defaulting to lb while settings load.
 *
 * This fallback is for read-only display. Entry forms must wait for settings
 * and retain the unit associated with their draft before converting to grams.
 */
export function useWeightUnit(): WeightUnit {
  const settings = useSettings();
  return settings.data?.weightUnit ?? 'lb';
}
