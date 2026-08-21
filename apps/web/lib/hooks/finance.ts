'use client';

import { useQuery } from '@tanstack/react-query';
import { FinanceApi } from '@/lib/api';
import { qk } from './keys';
import { useInvalidatingMutation } from './mutation';

export function useAccounts() {
  return useQuery({ queryKey: qk.accounts, queryFn: FinanceApi.accounts });
}

export function useTransactions(accountId?: string) {
  return useQuery({
    queryKey: qk.transactions(accountId),
    queryFn: () => FinanceApi.transactions({ accountId, limit: 100 }),
  });
}

export function useUpdateTransaction() {
  return useInvalidatingMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      FinanceApi.updateTransaction(id, patch),
    invalidates: ['finance', 'transactions'],
  });
}
