'use client';

import { useMutation } from '@tanstack/react-query';
import { AccountApi } from '@/lib/api';

export function useExportData() {
  return useMutation({
    mutationFn: AccountApi.downloadExport,
    meta: { success: 'Export downloaded', errorFallback: 'Export failed' },
  });
}

/** Caller clears the user-scoped cache on success (see clearUserScopedCache). */
export function useDeleteAccount() {
  return useMutation({ mutationFn: AccountApi.deleteAccount });
}
