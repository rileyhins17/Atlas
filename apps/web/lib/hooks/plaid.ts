'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlaidApi } from '@/lib/api';
import { qk } from './keys';

export function usePlaidStatus() {
  return useQuery({ queryKey: qk.plaidStatus, queryFn: PlaidApi.status });
}

/** Invalidate everything a sync/exchange can change: status, accounts, transactions. */
function invalidateFinance(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: qk.plaidStatus });
  void qc.invalidateQueries({ queryKey: qk.accounts });
  void qc.invalidateQueries({ queryKey: ['finance', 'transactions'] });
}

/** Exchange a Link public_token for a stored item (runs an initial sync server-side). */
export function usePlaidExchange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (publicToken: string) => PlaidApi.exchange(publicToken),
    onSuccess: () => invalidateFinance(qc),
  });
}

export function usePlaidSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: PlaidApi.sync,
    onSuccess: () => invalidateFinance(qc),
  });
}

export function usePlaidDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId?: string) => PlaidApi.disconnect(itemId),
    meta: { success: 'Bank disconnected', errorFallback: 'Failed to disconnect' },
    onSuccess: () => invalidateFinance(qc),
  });
}
