'use client';

import { useGoogleStatus } from '@/lib/hooks/google';

import { PageHeader } from '@/components/PageHeader';
import { DataPrivacyPanel } from './DataPrivacyPanel';
import { NameSettingsCard } from './NameSettingsCard';
import { AiSettingsCard } from './AiSettingsCard';
import { ProactiveSettingsCard } from './ProactiveSettingsCard';
import { PlaidCard } from './PlaidCard';
import { RoutineEditor } from './RoutineEditor';
import { SettingsSection } from './SettingsSection';
import { TrainingSettingsCard } from './TrainingSettingsCard';
import { GoogleCalendarCard } from '@/components/connectors/GoogleCalendarCard';

export function SettingsPanel({ onSignOut }: { onSignOut: () => void }) {
  // Only the section hint needs status now; GoogleCalendarCard owns the flow.
  const status = useGoogleStatus().data ?? null;

  return (
    <>
      <PageHeader title="Settings" subtitle="Connections, your data, and your account." />

      {/* Your week first: it drives what Today calls free time, so it is the
          setting people actually come here to correct. */}
      <SettingsSection id="routine" title="Your week" hint="sleep, work and the shape of your day" defaultOpen>
        <RoutineEditor />
      </SettingsSection>

      <SettingsSection id="you" title="Your name" hint="how Atlas greets you">
        <NameSettingsCard />
      </SettingsSection>

      <SettingsSection id="ai" title="Atlas AI" hint="model key and usage">
        <AiSettingsCard />
      </SettingsSection>

      <SettingsSection id="training" title="Training" hint="weight units">
        <TrainingSettingsCard />
      </SettingsSection>

      <SettingsSection id="proactive" title="Briefs & notifications" hint="when Atlas checks in">
        <ProactiveSettingsCard />
      </SettingsSection>

      <SettingsSection
        id="google"
        title="Google Calendar"
        hint={status?.connected ? 'connected' : 'not connected'}
      >
        <GoogleCalendarCard />
      </SettingsSection>

      <SettingsSection id="banking" title="Banking" hint="connect an account">
        <PlaidCard />
      </SettingsSection>

      <SettingsSection id="data" title="Your data & account" hint="appearance, sign out, export, delete">
        <DataPrivacyPanel onSignOut={onSignOut} />
      </SettingsSection>
    </>
  );
}
