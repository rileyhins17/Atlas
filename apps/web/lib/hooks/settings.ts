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
 * Storage is always integer grams, so this only decides what is rendered and
 * what the entry field means — it is safe for this to be briefly wrong during
 * the first paint, because no value is ever written in display units.
 */
export function useWeightUnit(): WeightUnit {
  const settings = useSettings();
  return settings.data?.weightUnit ?? 'lb';
}
