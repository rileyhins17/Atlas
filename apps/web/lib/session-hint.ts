const KEY = 'atlas.hasSignedIn';

/**
 * Has this browser ever been signed in to Atlas?
 *
 * NOT authentication, and it must never be treated as any part of it. The
 * session lives in an httpOnly cookie that JavaScript cannot read, which is
 * exactly right and also means the app cannot tell a returning user from a
 * first-time visitor until `/auth/me` answers. That round trip is ~900ms
 * against a hosted database, and for the whole of it every returning user gets
 * a centred logo saying "Waking Atlas…".
 *
 * This is the one bit that CAN be known locally: someone who has signed in on
 * this browser before is overwhelmingly likely to still be signed in, so the
 * shell can spend that time drawing their app instead of a splash screen.
 *
 * Being wrong is harmless in both directions. A wrong "true" shows an empty app
 * frame for a moment before the sign-in screen replaces it; a wrong "false"
 * shows the splash that everyone used to get. Neither reveals anything and
 * neither grants anything — the server decides what the cookie is worth.
 */
export function hasSignedInBefore(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    // Private mode: fall back to the old behaviour rather than guessing.
    return false;
  }
}

export function markSignedIn(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* private mode */
  }
}

/**
 * Cleared on sign-out so the next visit gets the splash rather than a frame
 * that resolves to the sign-in screen — on a shared machine, showing the shape
 * of someone's app after they deliberately left is the wrong impression to
 * give, even though it contains none of their data.
 */
export function clearSignedIn(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
