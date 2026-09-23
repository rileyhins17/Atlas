'use client';

import {
  Bell,
  CalendarClock,
  CalendarDays,
  Dumbbell,
  Landmark,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Watch,
} from 'lucide-react';
import { useGoogleStatus } from '@/lib/hooks/google';

import { PageHeader } from '@/components/PageHeader';
import { DataPrivacyPanel } from './DataPrivacyPanel';
import { NameSettingsCard } from './NameSettingsCard';
import { AiSettingsCard } from './AiSettingsCard';
import { ProactiveSettingsCard } from './ProactiveSettingsCard';
import { PlaidCard } from './PlaidCard';
import { RoutineEditor } from './RoutineEditor';
import { SettingsSection } from './SettingsSection';
import { TrackerManager } from '@/components/trackers/TrackerManager';
import { PaletteSettingsCard } from './PaletteSettingsCard';
import { StyleSettingsCard } from './StyleSettingsCard';
import { TrainingSettingsCard } from './TrainingSettingsCard';
import { GoogleCalendarCard } from '@/components/connectors/GoogleCalendarCard';
import { WearablesCard } from '@/components/connectors/WearablesCard';

export function SettingsPanel({ onSignOut }: { onSignOut: () => void }) {
  // Only the section hint needs status now; GoogleCalendarCard owns the flow.
  const google = useGoogleStatus();

  return (
    <>
      <PageHeader title="Settings" subtitle="Connections, your data, and your account." />

      {/* Your week first: it drives what Today calls free time, so it is the
          setting people actually come here to correct. */}
      <SettingsSection id="routine" icon={CalendarClock} title="Your week" hint="sleep, work and the shape of your day" defaultOpen>
        <RoutineEditor />
      </SettingsSection>

      <SettingsSection id="you" icon={UserRound} title="Your name" hint="how Atlas greets you">
        <NameSettingsCard />
      </SettingsSection>

      <SettingsSection id="ai" icon={Sparkles} title="Atlas AI" hint="model key and usage">
        <AiSettingsCard />
      </SettingsSection>

      <SettingsSection
        id="trackers"
        icon={SlidersHorizontal}
        title="Daily check-ins"
        hint="rate anything on a 1–10 scale"
      >
        <TrackerManager />
      </SettingsSection>

      <SettingsSection id="training" icon={Dumbbell} title="Training" hint="weight units">
        <TrainingSettingsCard />
      </SettingsSection>

      <SettingsSection id="proactive" icon={Bell} title="Briefs & notifications" hint="when Atlas checks in">
        <ProactiveSettingsCard />
      </SettingsSection>

      <SettingsSection
        id="google"
        icon={CalendarDays}
        title="Google Calendar"
        /* Three states, not two. `data ?? null` made a PENDING query read as
           "not connected", so anyone who was connected opened Settings and was
           told they were not, until the request came back. Saying nothing is
           the honest answer while the answer is unknown. */
        hint={
          google.isSuccess ? (google.data?.connected ? 'connected' : 'not connected') : undefined
        }
      >
        <GoogleCalendarCard />
      </SettingsSection>

      <SettingsSection id="wearables" icon={Watch} title="Fitbit & Pixel Watch" hint="sleep, steps, heart">
        <WearablesCard />
      </SettingsSection>

      {/* Its own section rather than buried under "Your data & account" with
          the light/dark toggle: a colour scheme is the thing people go looking
          for, and it was two levels down next to Delete account. */}
      <SettingsSection id="appearance" icon={Palette} title="Appearance" hint="style and colours">
        <div className="stack" style={{ gap: 14 }}>
          <StyleSettingsCard />
          <PaletteSettingsCard />
        </div>
      </SettingsSection>

      <SettingsSection id="banking" icon={Landmark} title="Banking" hint="connect an account">
        <PlaidCard />
      </SettingsSection>

      <SettingsSection id="data" icon={ShieldCheck} title="Your data & account" hint="appearance, sign out, export, delete">
        <DataPrivacyPanel onSignOut={onSignOut} />
      </SettingsSection>
    </>
  );
}
