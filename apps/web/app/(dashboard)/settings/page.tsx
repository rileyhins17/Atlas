'use client';

import { useQueryClient } from '@tanstack/react-query';
import { clearUserScopedCache } from '@/lib/hooks/auth';
import { SettingsPanel } from '@/components/panels/SettingsPanel';

export default function SettingsPage() {
  const qc = useQueryClient();
  return <SettingsPanel onSignOut={() => clearUserScopedCache(qc)} />;
}
