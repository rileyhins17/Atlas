'use client';

import { useEffect, useState } from 'react';

/**
 * The last line of defence, and the only thing between a bad cache and a black
 * screen reading "Application error: a client-side exception has occurred".
 *
 * That is what Next renders when nothing catches — no branding, no explanation,
 * and no way out except knowing to clear the site data, which nobody outside
 * this repo knows to do. Atlas is installed to a home screen, so there is not
 * even a URL bar to reload from.
 *
 * It heals itself first and asks second. Every realistic cause of a hard client
 * exception here is a stale artefact — a service-worker cache holding assets
 * from a build that no longer exists — and the fix for all of them is the same:
 * drop the caches, drop the worker, load again. Guarded by a sessionStorage
 * flag so a genuine code bug shows the message instead of reloading forever.
 */
const RECOVERED = 'atlas:recovered';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [healing, setHealing] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function heal() {
      // Once per session. A second crash after a clean reload is a real bug,
      // and reloading again would only hide it behind a flicker.
      let already = true;
      try {
        already = sessionStorage.getItem(RECOVERED) === '1';
        if (!already) sessionStorage.setItem(RECOVERED, '1');
      } catch {
        // Private mode, or storage blocked. Show the message rather than
        // risking a reload loop we cannot detect.
      }
      if (already) {
        if (!cancelled) setHealing(false);
        return;
      }

      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch {
        // Best effort: reloading is still worth trying.
      }
      window.location.reload();
    }

    void heal();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: '#faf9f7',
          color: '#1c1a17',
          font: '400 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <main style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 650 }}>
            {healing ? 'Getting Atlas back' : 'Atlas hit a problem'}
          </h1>
          <p style={{ margin: '0 0 20px', color: '#6b6459' }}>
            {healing
              ? 'Clearing what was cached and loading again — one moment.'
              : 'Nothing you did caused this, and nothing you saved has been lost. Try again, and if it keeps happening the reference below will say why.'}
          </p>

          {!healing && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={reset}
                style={{
                  minHeight: 44,
                  padding: '0 18px',
                  borderRadius: 999,
                  border: 'none',
                  background: '#c2410c',
                  color: '#fff',
                  font: 'inherit',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
              <a
                href="/today"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 44,
                  padding: '0 18px',
                  borderRadius: 999,
                  border: '1px solid #ddd6cc',
                  color: 'inherit',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                Go to Today
              </a>
            </div>
          )}

          {!healing && error.digest && (
            <p style={{ marginTop: 18, fontSize: 12, color: '#8b8377' }}>
              Reference: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
