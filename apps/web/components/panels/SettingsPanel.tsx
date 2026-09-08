'use client';


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
import { TrainingSettingsCard } from './TrainingSettingsCard';
import { GoogleCalendarCard } from '@/components/connectors/GoogleCalendarCard';

export function SettingsPanel({ onSignOut }: { onSignOut: () => void }) {
  return (
    <>
      <PageHeader title="Settings" subtitle="Make Atlas fit your life." />
      <nav className="settings-shortcuts" aria-label="Settings shortcuts">
        <a className="btn secondary" href="#routine">Edit my week</a>
        <a className="btn secondary" href="#ai">AI access & usage</a>
        <a className="btn secondary" href="#data">My data</a>
      </nav>
      <div className="settings-groups">
        <section className="settings-group" aria-labelledby="settings-account-heading">
          <h2 id="settings-account-heading">Your account</h2>
          <p className="muted">Personal details, appearance and control of your data.</p>
          <SettingsSection id="you" title="Your name" hint="how Atlas greets you"><NameSettingsCard /></SettingsSection>
          <SettingsSection id="appearance" title="Appearance" hint="theme and colour"><PaletteSettingsCard /></SettingsSection>
          <SettingsSection id="ai" title="Atlas AI" hint="access and usage"><AiSettingsCard /></SettingsSection>
          <SettingsSection id="data" title="Your data & account" hint="export, sign out or delete"><DataPrivacyPanel onSignOut={onSignOut} /></SettingsSection>
        </section>
        <section className="settings-group" aria-labelledby="settings-day-heading">
          <h2 id="settings-day-heading">Your day</h2>
          <p className="muted">The routine, preferences and check-ins behind your plan.</p>
          <SettingsSection id="routine" title="Your week" hint="edit sleep, work and recurring time"><RoutineEditor /></SettingsSection>
          <SettingsSection id="training" title="Training" hint="weight units"><TrainingSettingsCard /></SettingsSection>
          <SettingsSection id="trackers" title="Daily check-ins" hint="choose what you track"><TrackerManager /></SettingsSection>
          <SettingsSection id="proactive" title="Briefs & notifications" hint="when Atlas checks in"><ProactiveSettingsCard /></SettingsSection>
        </section>
        <section className="settings-group" aria-labelledby="settings-connections-heading">
          <h2 id="settings-connections-heading">Connections</h2>
          <p className="muted">Bring in your calendar and bank activity when you want to.</p>
          <SettingsSection id="google" title="Google Calendar" hint="connection and calendar selection"><GoogleCalendarCard /></SettingsSection>
          <SettingsSection id="banking" title="Banking" hint="linked accounts and sync"><PlaidCard /></SettingsSection>
        </section>
      </div>
    </>
  );
}
