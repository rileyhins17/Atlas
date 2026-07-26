import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '../legal/legal-layout';

export const metadata: Metadata = {
  title: 'Terms of Service — Atlas',
  description: 'The terms you agree to by using Atlas, in plain language.',
  alternates: { canonical: 'https://atlaslife.app/terms' },
};

const CONTACT = 'rileyhinsperger@gmail.com';

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="26 July 2026">
      <p>
        These terms cover your use of Atlas at atlaslife.app. Using the service means you accept
        them. They are deliberately short.
      </p>

      <h2>The service</h2>
      <p>
        Atlas is a personal life-management app: tasks, calendar, habits, journal, notes, training
        and finance in one place, with an optional AI assistant. It is <strong>early-access
        software</strong>, currently invite-only, operated by one person. Features may change or be
        removed, and there is no uptime guarantee.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You need an invite code to register while Atlas is in early access.</li>
        <li>You are responsible for keeping your password secure and for activity under your account.</li>
        <li>One person per account. Do not share credentials.</li>
        <li>You must be at least 16.</li>
      </ul>

      <h2>Your content is yours</h2>
      <p>
        You keep all rights to everything you put into Atlas. You grant only the permission needed to
        run the service for you — storing your data, displaying it back, and sending the relevant
        parts to the AI provider when you use an AI feature. Nothing is used to train any model by
        Atlas, and nothing is sold.
      </p>
      <p>
        You can export everything as JSON, or delete your account, at any time from Settings.
      </p>

      <h2>Acceptable use</h2>
      <p>Do not use Atlas to:</p>
      <ul>
        <li>break the law, or store material that is illegal to possess;</li>
        <li>attack, overload or probe the service, or try to reach another account&apos;s data;</li>
        <li>resell or redistribute the service without permission.</li>
      </ul>
      <p>Accounts doing any of the above can be suspended without notice.</p>

      <h2>Third-party services</h2>
      <p>
        Connecting Google Calendar, Plaid or an AI provider means also accepting that provider&apos;s
        terms. Atlas is not responsible for their behaviour, availability or pricing. AI features run
        on your own API key, and the cost of that key is yours.
      </p>

      <h2>AI output</h2>
      <p>
        The assistant generates suggestions, summaries and schedules. It can be wrong. Nothing it
        produces is professional advice — medical, legal, financial or otherwise — and you should
        not treat its financial or health-related output as such. Check anything that matters.
      </p>

      <h2>Cost</h2>
      <p>
        Atlas is currently free during early access. If paid plans arrive, existing users will be
        told before being charged anything, and nothing will start billing silently.
      </p>

      <h2>No warranty, and limits</h2>
      <p>
        Atlas is provided &ldquo;as is&rdquo;, without warranty of any kind. To the maximum extent
        the law allows, the operator is not liable for indirect or consequential loss, lost profits,
        or lost data. Keep your own copies of anything you cannot afford to lose — the export in
        Settings exists for exactly this.
      </p>
      <p>Nothing here limits liability that cannot legally be limited.</p>

      <h2>Ending it</h2>
      <p>
        You may stop and delete your account at any time. The operator may suspend or end an account
        that breaks these terms, or discontinue the service — with reasonable notice and an
        opportunity to export your data, except where a breach makes that unsafe.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of the Province of Ontario and the federal laws of
        Canada applicable there.
      </p>

      <h2>Contact</h2>
      <p>
        {CONTACT}. See also the <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}
