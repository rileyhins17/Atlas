/**
 * What the signed-in frame should show, from the session probe alone.
 *
 * The probe answers `null` for a 401 — the only answer that means "not signed
 * in" — and THROWS for everything else. So a failure is not an answer about
 * the session: a 429 from the throttler, a 500 or a dropped connection says
 * nothing about whether the cookie is good. Treating it as signed out put the
 * sign-in form in front of someone who was signed in, which reads as "Atlas
 * logged me out" and invites typing a password into a screen that was never
 * needed. Measured in CI: one 429 burst on /auth/me did exactly that for a
 * minute.
 */
export type SessionState = 'booting' | 'signed-out' | 'unreachable' | 'signed-in';

export function sessionState(probe: {
  isPending: boolean;
  isError: boolean;
  data: unknown;
}): SessionState {
  if (probe.isPending) return 'booting';
  if (probe.data) return 'signed-in';
  if (probe.isError) return 'unreachable';
  return 'signed-out';
}
