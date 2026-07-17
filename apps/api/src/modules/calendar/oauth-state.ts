import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const STATE_TTL_MS = 10 * 60_000;

interface StatePayload {
  userId: string;
  nonce: string;
  exp: number;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/**
 * OAuth `state`, signed and bound to the initiating user.
 *
 * This is the CSRF control for the OAuth handshake, and it defends both
 * directions: an attacker can't forge a state for someone else's session, so
 * they can neither start a flow on the user's behalf nor trick the user into
 * a callback that would attach the *attacker's* Google account to the user's
 * Atlas account (which would quietly pipe the victim's calendar to them).
 *
 * Signed rather than stored so it needs no table and no server affinity; the
 * short TTL bounds replay.
 */
export function createOAuthState(userId: string, secret: string): string {
  const payload: StatePayload = {
    userId,
    nonce: randomBytes(16).toString('base64url'),
    exp: Date.now() + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

/**
 * Returns the userId the state was issued to, or null if it's forged, tampered
 * with, malformed or expired. Callers MUST additionally check it matches the
 * session user.
 */
export function verifyOAuthState(state: string, secret: string): string | null {
  const [body, signature] = state.split('.');
  if (!body || !signature) return null;

  const expected = sign(body, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Compare in constant time, and only when lengths match (timingSafeEqual throws otherwise).
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
    if (typeof payload.userId !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null;
    return payload.userId;
  } catch {
    return null;
  }
}
