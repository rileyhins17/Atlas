'use client';

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
