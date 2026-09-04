'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { DEFAULT_PALETTE, PALETTES, paletteSwatch } from '@/lib/theme/palettes';

const STORAGE_KEY = 'atlas-palette';

/**
 * Pick the app's colour scheme.
 *
 * Light and dark stayed one control — that is a question about the room you are
 * in. This is the other axis: which colours, in whichever of those you are
 * using. The two compose, so every palette exists in both.
 *
 * Applied instantly on click rather than behind a Save, because a colour scheme
 * is judged by looking at it. The document attribute is the source of truth and
 * localStorage only remembers it, which is the same arrangement the light/dark
 * toggle already uses — and it means the pre-paint script in the root layout
 * restores the choice with no flash.
 *
 * Every palette in the list is generated under a contrast constraint and
 * verified by test/palette-contrast.test.ts, so choosing one can never land a
 * person on text they cannot read. That check is what makes it safe to offer
 * ten of them rather than two.
 */
export function PaletteSettingsCard() {
  const [palette, setPalette] = useState<string | null>(null);
  const [mode, setMode] = useState<'dark' | 'light'>('dark');

  // Read from the document, not from storage: the script in the layout has
  // already resolved "no choice yet" against the system preference, and
  // re-deriving it here is how the two get to disagree.
  useEffect(() => {
    const root = document.documentElement;
    setPalette(root.getAttribute('data-palette') || DEFAULT_PALETTE);
    setMode(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    // The swatches have to follow the light/dark toggle, which is a plain
    // attribute write elsewhere in the tree rather than shared state.
    const observer = new MutationObserver(() => {
      setMode(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Nothing until mounted, so server and client markup agree.
  if (!palette) return null;

  function choose(id: string) {
    document.documentElement.setAttribute('data-palette', id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* private mode / storage disabled — the choice just won't persist */
    }
    setPalette(id);
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="prog-muted" style={{ margin: 0, fontSize: 13 }}>
        Ten schemes, each built in both light and dark. Light and dark stays where it was — this is
        which colours, in whichever of those you are using.
      </p>
      <ul className="pal-grid" role="radiogroup" aria-label="Colour scheme">
        {PALETTES.map((p) => {
          const [bg, inset, brand] = paletteSwatch(p, mode);
          const active = p.id === palette;
          return (
            <li key={p.id}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                className={`pal-card ${active ? 'on' : ''}`}
                onClick={() => choose(p.id)}
              >
                <span className="pal-swatch" aria-hidden style={{ background: bg }}>
                  <span className="pal-dot" style={{ background: inset }} />
                  <span className="pal-dot" style={{ background: brand }} />
                </span>
                <span className="pal-text">
                  <span className="pal-name">
                    {p.name}
                    {active && <Check size={14} aria-hidden className="pal-check" />}
                  </span>
                  <span className="pal-hint">{p.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
