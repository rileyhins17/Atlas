import { useMutation } from '@tanstack/react-query';
import { AccountApi } from '@/lib/api';

export function useExportAccountData() {
  return useMutation({ mutationFn: AccountApi.downloadExport });
}

export function useDeleteAccount() {
  return useMutation({ mutationFn: (password: string) => AccountApi.deleteAccount(password) });
}
