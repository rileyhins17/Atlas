'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * One collapsible group on Settings.
 *
 * Settings measured 2912px tall with 61 interactive controls in a single flat
 * scroll — everything equally prominent, so nothing was. Grouping turns it into
 * a short menu you drill into. Only the section you care about is expanded, so
 * the page opens at roughly one screen instead of eight.
 *
 * Open/closed state persists per section: whichever one you actually use should
 * still be open next time, rather than resetting to someone else's idea of a
 * default.
 */
export function SettingsSection({
  id,
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const storageKey = `atlas-settings-${id}`;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) setOpen(stored === '1');
  }, [storageKey]);

  // A deep link (/settings#routine) must open the section it points at,
  // otherwise the link lands on a collapsed header and looks broken.
  useEffect(() => {
    if (window.location.hash === `#${id}`) {
      setOpen(true);
      // Let it expand before scrolling, or we scroll to the collapsed height.
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    }
  }, [id]);

  function toggle() {
    setOpen((v) => {
      localStorage.setItem(storageKey, v ? '0' : '1');
      return !v;
    });
  }

  return (
    <section className="set-section" id={id}>
      <button
        type="button"
        className="set-head"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={toggle}
      >
        <ChevronDown size={16} aria-hidden className={open ? 'open' : ''} />
        <span className="set-title">{title}</span>
        {hint && <span className="set-hint">{hint}</span>}
      </button>
      {open && (
        <div className="set-body" id={`${id}-body`}>
          {children}
        </div>
      )}
    </section>
  );
}
