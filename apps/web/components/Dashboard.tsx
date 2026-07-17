'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UserDTO } from '@atlas/shared';
import { clearUserScopedCache, useLogout } from '@/lib/hooks/auth';
import { Button } from '@/components/ui';
import { AtlasAsks } from '@/components/AtlasAsks';
import { TasksPanel } from '@/components/panels/TasksPanel';
import { HabitsPanel } from '@/components/panels/HabitsPanel';
import { CalendarPanel } from '@/components/panels/CalendarPanel';
import { JournalPanel } from '@/components/panels/JournalPanel';
import { NotesPanel } from '@/components/panels/NotesPanel';
import { AiPanel } from '@/components/panels/AiPanel';
import { SettingsPanel } from '@/components/panels/SettingsPanel';

type Tab = 'today' | 'habits' | 'calendar' | 'journal' | 'notes' | 'ai' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'habits', label: 'Habits' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'journal', label: 'Journal' },
  { id: 'notes', label: 'Notes' },
  { id: 'ai', label: 'Atlas AI' },
  { id: 'settings', label: 'Settings' },
];

export function Dashboard({ user }: { user: UserDTO }) {
  const [tab, setTab] = useState<Tab>('today');
  const qc = useQueryClient();
  const logout = useLogout();

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">Hi, {user.displayName ?? user.email}</span>
        <Button variant="ghost" onClick={() => logout.mutate()}>
          Sign out
        </Button>
      </div>

      <AtlasAsks />

      <div className="row" style={{ gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? 'primary' : 'secondary'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === 'today' && <TasksPanel />}
      {tab === 'habits' && <HabitsPanel />}
      {tab === 'calendar' && <CalendarPanel />}
      {tab === 'journal' && <JournalPanel />}
      {tab === 'notes' && <NotesPanel />}
      {tab === 'ai' && <AiPanel />}
      {tab === 'settings' && <SettingsPanel onSignOut={() => clearUserScopedCache(qc)} />}
    </>
  );
}
