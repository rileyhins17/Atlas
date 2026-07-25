import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

/**
 * The public front door.
 *
 * This route used to redirect straight to /today, which meant every page in the
 * app sat behind auth and a crawler could see literally nothing — no title, no
 * copy, no reason to rank anything. That was the real SEO problem, and no domain
 * name fixes it.
 *
 * Deliberately a plain server component: no client JS, no data fetching, no
 * session check. It renders identically for a person and for a bot, which is the
 * entire point. (An auto-redirect for signed-in visitors is not possible here
 * anyway — the session cookie is httpOnly, so client script cannot see it — and
 * a server-side check would hide this page from indexing the moment anyone was
 * logged in. Signed-in users just click through; their session is still live.)
 */
export const metadata: Metadata = {
  title: 'Atlas — the life OS that actually knows your life',
  description:
    'One place for your day, tasks, habits, training and money — with an AI that plans around the hours you actually have, not the ones your calendar pretends are free.',
  alternates: { canonical: 'https://atlaslife.app/' },
  openGraph: {
    title: 'Atlas — the life OS that actually knows your life',
    description:
      'Your day, tasks, habits, training and money in one place, with an AI that plans around the hours you actually have.',
    url: 'https://atlaslife.app/',
    siteName: 'Atlas',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'Atlas — your life OS' },
};

const FEATURES = [
  {
    title: 'It knows when you are actually free',
    body: 'Tell Atlas your sleep and work hours once. It stops calling 2pm on a Tuesday "open time" just because nothing is in your calendar — because most people never put work in their calendar.',
  },
  {
    title: 'Plans your day, then asks',
    body: 'One tap fits your open tasks into the gaps you really have. Every suggestion is a proposal you accept or ignore — nothing lands on your calendar behind your back.',
  },
  {
    title: 'Learns how long things take you',
    body: 'Atlas watches what you finish and when, so its estimates come from your own history instead of a guess. The longer you use it, the better it plans.',
  },
  {
    title: 'One graph, not seven apps',
    body: 'Tasks, calendar, habits, journal, training and money share a single timeline. That is what lets it notice the weeks you skip the gym are the weeks you sleep worse.',
  },
  {
    title: 'Honest about thin data',
    body: 'A new account gets "it is too early to say", not an invented trend. Atlas will not connect two unrelated things just to sound clever.',
  },
  {
    title: 'Yours, and portable',
    body: 'Export everything as JSON whenever you like, and delete your account for real. Self-hostable, so the data can live on your own machine.',
  },
];

export default function Landing() {
  return (
    <main className="landing">
      <header className="landing-nav">
        <span className="landing-brand">
          <Logo size={26} />
          <span>Atlas</span>
        </span>
        <Link href="/today" className="landing-signin">
          Sign in
        </Link>
      </header>

      <section className="landing-hero">
        <h1>
          The life OS that actually
          <br />
          knows your life.
        </h1>
        <p className="landing-sub">
          Your day, tasks, habits, training and money in one place — with an AI that plans
          around the hours you genuinely have, not the ones your calendar pretends are free.
        </p>
        <Link href="/today" className="landing-cta">
          Open Atlas
        </Link>
        <p className="landing-note">Invite only while it is in early access.</p>
      </section>

      <section className="landing-grid" aria-label="What Atlas does">
        {FEATURES.map((f) => (
          <article key={f.title} className="landing-card">
            <h2>{f.title}</h2>
            <p>{f.body}</p>
          </article>
        ))}
      </section>

      <section className="landing-close">
        <h2>Built for the day you are actually having.</h2>
        <p>
          Most planners assume an empty calendar and infinite willpower. Atlas starts from your
          real week — when you sleep, when you work, what you already committed to — and works
          with what is left.
        </p>
        <Link href="/today" className="landing-cta">
          Open Atlas
        </Link>
      </section>

      <footer className="landing-foot">Atlas — a personal life OS.</footer>
    </main>
  );
}
