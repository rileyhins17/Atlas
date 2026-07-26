import type { ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

/**
 * Shared chrome for /privacy and /terms.
 *
 * Deliberately a plain server component with no client JS and no session
 * check, exactly like the landing page — these have to be readable by a
 * crawler, by Google's OAuth reviewer, and by someone deciding whether to sign
 * up, none of whom have an account.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="legal">
      <header className="landing-nav">
        <Link href="/" className="landing-brand">
          <Logo size={26} />
          <span>Atlas</span>
        </Link>
        <Link href="/today" className="landing-signin">
          Sign in
        </Link>
      </header>

      <article className="legal-body">
        <h1>{title}</h1>
        <p className="legal-updated">Last updated {updated}</p>
        {children}
      </article>

      <footer className="landing-foot">
        <Link href="/">Atlas</Link> · <Link href="/privacy">Privacy</Link> ·{' '}
        <Link href="/terms">Terms</Link>
      </footer>
    </main>
  );
}
