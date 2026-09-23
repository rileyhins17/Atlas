'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_STYLE, type UiStyle } from './style-default';

/**
 * The app's STYLE — the third appearance axis, alongside light/dark and the
 * colour palette.
 *
 *   soft     the default: rounded, warm and calm; a phone-first Today built
 *            around the day's plan, habits, how you feel and moving your body.
 *   classic  dense and time-first, a planning surface — kept for anyone who
 *            prefers it, one tap away in Settings.
 *
 * A style changes shape, type, spacing and the Today layout. It never changes
 * what data exists or which routes resolve, so switching is always safe and
 * always reversible.
 *
 * Stored like the other two axes: the `data-style` attribute on <html> is the
 * source of truth, localStorage remembers it, and the pre-paint script in the
 * root layout restores it with no flash. Only an explicit "classic" is ever
 * stored as anything other than the default, so moving the default moved
 * everyone who never chose. Deliberately NOT a database column — production
 * applies migrations by hand, and a preference is not worth a schema change
 * that takes the site down until someone runs one.
 */
export { DEFAULT_STYLE, type UiStyle };

export const STYLE_STORAGE_KEY = 'atlas-style';

export function isUiStyle(v: unknown): v is UiStyle {
  return v === 'classic' || v === 'soft';
}

export function readUiStyle(): UiStyle {
  if (typeof document === 'undefined') return DEFAULT_STYLE;
  const v = document.documentElement.getAttribute('data-style');
  return isUiStyle(v) ? v : DEFAULT_STYLE;
}

/** Switch style now and remember it. */
export function applyUiStyle(style: UiStyle): void {
  document.documentElement.setAttribute('data-style', style);
  try {
    localStorage.setItem(STYLE_STORAGE_KEY, style);
  } catch {
    /* private mode — the choice just won't persist */
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
