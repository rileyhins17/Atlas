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
    onSuccess: (data) => qc.setQueryData(qk.settings, data),
  });
}
