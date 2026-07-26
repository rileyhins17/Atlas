import type { Metadata } from 'next';
import { LegalPage } from '../legal/legal-layout';

export const metadata: Metadata = {
  title: 'Privacy Policy — Atlas',
  description:
    'What Atlas stores, who it is shared with, how long it is kept, and how to export or delete it.',
  alternates: { canonical: 'https://atlaslife.app/privacy' },
};

const CONTACT = 'rileyhinsperger@gmail.com';

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="26 July 2026">
      <p>
        Atlas is a personal life-management app operated by Riley Hinsperger. This page describes
        exactly what it stores, who else can see it, and how to get it back or delete it. It is
        written to be read, not to be survived.
      </p>

      <h2>What Atlas stores</h2>
      <p>Only what you put in, plus what is needed to keep you signed in:</p>
      <ul>
        <li>
          <strong>Your account</strong> — email address, a password hash (scrypt; the password
          itself is never stored or recoverable), display name and timezone.
        </li>
        <li>
          <strong>Your content</strong> — tasks, calendar events, habits and check-ins, journal
          entries, notes, workouts, and any financial accounts or transactions you add or import.
        </li>
        <li>
          <strong>Activity</strong> — a timeline of changes you make, used to give the assistant
          recent context, and a record of AI token usage so spending can be capped.
        </li>
        <li>
          <strong>Connection credentials</strong> — API keys and OAuth tokens for services you
          choose to connect. These are encrypted at rest with AES-256-GCM under a key held only by
          the server.
        </li>
      </ul>
      <p>
        Atlas sets a single cookie: an <code>httpOnly</code> session cookie. There is no
        advertising, no analytics, no tracking pixels, and no third-party scripts on any page.
      </p>

      <h2>Who else sees your data</h2>
      <p>
        Atlas does not sell your data and does not share it for advertising. It is processed by a
        small number of services, each doing one job:
      </p>
      <ul>
        <li>
          <strong>DeepSeek</strong> (AI provider) — <em>this is the important one.</em> When you use
          any AI feature, Atlas sends a compact summary of your relevant data (recent activity,
          upcoming items, counts and your typical schedule) so the model can answer usefully. Do not
          put anything in Atlas you would not want processed by an AI provider. AI features only run
          when you supply your own API key, so nothing is sent until you connect one.
        </li>
        <li>
          <strong>Neon</strong> — hosts the PostgreSQL database your data lives in.
        </li>
        <li>
          <strong>Cloudflare</strong> — DNS and the encrypted tunnel that serves the site.
        </li>
        <li>
          <strong>Google</strong> — only if you connect Google Calendar. Atlas reads and writes
          calendar events on your behalf and stores nothing from your Google account beyond the
          tokens and the events themselves.
        </li>
        <li>
          <strong>Plaid</strong> — only if you connect a bank. Plaid holds the bank credentials;
          Atlas never sees them and stores only the resulting account and transaction records.
        </li>
      </ul>

      <h2>Where it is held</h2>
      <p>
        Data is stored in the database region configured for the deployment and served through
        Cloudflare&apos;s global network. If you are outside that region, your data is transferred
        and processed there.
      </p>

      <h2>How long it is kept</h2>
      <p>
        Your content is kept until you delete it or delete your account. Deleting your account
        removes your account row and everything linked to it, including connection credentials.
        Deletion is immediate and cannot be undone. Backups, where they exist, roll off within 30
        days.
      </p>

      <h2>Your rights</h2>
      <ul>
        <li>
          <strong>Export</strong> — Settings gives you a complete JSON export of everything Atlas
          holds about you, at any time, without asking anyone.
        </li>
        <li>
          <strong>Deletion</strong> — Settings also deletes your account outright.
        </li>
        <li>
          <strong>Correction and access</strong> — every screen that shows your data lets you edit
          it. If you want something Atlas does not expose, email {CONTACT}.
        </li>
        <li>
          Depending on where you live, you may have further rights under the GDPR, PIPEDA or similar
          law — including objecting to processing or complaining to a regulator.
        </li>
      </ul>

      <h2>Security, honestly stated</h2>
      <p>
        Passwords are hashed with scrypt and never stored in plain text. Connection credentials are
        encrypted at rest. Traffic is HTTPS end to end, and the session cookie is{' '}
        <code>httpOnly</code>, <code>Secure</code> and <code>SameSite=Lax</code>. Every query is
        scoped to the signed-in account.
      </p>
      <p>
        Atlas is early-access software run by one person. It has not had an independent security
        audit. Please do not store anything here whose disclosure would seriously harm you.
      </p>

      <h2>Children</h2>
      <p>Atlas is not intended for anyone under 16, and accounts are not knowingly created for them.</p>

      <h2>Changes</h2>
      <p>
        If this policy changes materially, the date above changes and, where the change affects how
        your data is used, you will be told in the app before it takes effect.
      </p>

      <h2>Contact</h2>
      <p>Questions, requests or complaints: {CONTACT}.</p>
    </LegalPage>
  );
}
