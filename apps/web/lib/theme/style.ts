'use client';

import { useEffect, useState } from 'react';

/**
 * The app's STYLE — the third appearance axis, alongside light/dark and the
 * colour palette.
 *
 *   classic  the default: dense, time-first, a planning surface.
 *   soft     rounded, warm and calm; a phone-first Today built around the
 *            day's plan, habits, how you feel and moving your body.
 *
 * A style changes shape, type, spacing and the Today layout. It never changes
 * what data exists or which routes resolve, so switching is always safe and
 * always reversible.
 *
 * Stored like the other two axes: the `data-style` attribute on <html> is the
 * source of truth, localStorage remembers it, and the pre-paint script in the
 * root layout restores it with no flash. Deliberately NOT a database column —
 * production applies migrations by hand, and a preference is not worth a
 * schema change that takes the site down until someone runs one.
 */
export type UiStyle = 'classic' | 'soft';

export const STYLE_STORAGE_KEY = 'atlas-style';

/** The palette soft mode suggests when it is first switched on. */
export const SOFT_PALETTE = 'blush';

export function isUiStyle(v: unknown): v is UiStyle {
  return v === 'classic' || v === 'soft';
}

export function readUiStyle(): UiStyle {
  if (typeof document === 'undefined') return 'classic';
  const v = document.documentElement.getAttribute('data-style');
  return isUiStyle(v) ? v : 'classic';
}

/**
 * Switch style now and remember it.
 *
 * Turning soft on also moves to its palette — the look is the pair — but only
 * from the default palette: someone who already chose colours keeps them.
 */
export function applyUiStyle(style: UiStyle, opts: { defaultPalette: string }): void {
  const root = document.documentElement;
  root.setAttribute('data-style', style);
  try {
    localStorage.setItem(STYLE_STORAGE_KEY, style);
  } catch {
    /* private mode — the choice just won't persist */
  }
  if (style === 'soft' && (root.getAttribute('data-palette') ?? opts.defaultPalette) === opts.defaultPalette) {
    root.setAttribute('data-palette', SOFT_PALETTE);
    try {
      localStorage.setItem('atlas-palette', SOFT_PALETTE);
    } catch {
      /* as above */
    }
  }
}

/**
 * The current style, following changes made anywhere in the tree.
 *
 * `null` until mounted: the attribute does not exist on the server, and a
 * component that guessed would render the wrong layout for one frame and then
 * swap — on the app's main screen.
 */
export function useUiStyle(): UiStyle | null {
  const [style, setStyle] = useState<UiStyle | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    setStyle(readUiStyle());
    const observer = new MutationObserver(() => setStyle(readUiStyle()));
    observer.observe(root, { attributes: true, attributeFilter: ['data-style'] });
    return () => observer.disconnect();
  }, []);
  return style;
}
