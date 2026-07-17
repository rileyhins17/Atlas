import { describe, expect, it, vi } from 'vitest';
import { createOAuthState, verifyOAuthState } from '../src/modules/calendar/oauth-state.js';

const SECRET = 'test-secret-0123456789abcdef';

describe('OAuth state', () => {
  it('round-trips the issuing user', () => {
    const state = createOAuthState('user-1', SECRET);
    expect(verifyOAuthState(state, SECRET)).toBe('user-1');
  });

  it('issues a different state each time', () => {
    // A fixed state would be replayable across flows.
    expect(createOAuthState('user-1', SECRET)).not.toBe(createOAuthState('user-1', SECRET));
  });

  it('rejects a state signed with a different secret', () => {
    const state = createOAuthState('user-1', 'some-other-secret');
    expect(verifyOAuthState(state, SECRET)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    // The whole point: an attacker must not be able to swap in their own userId
    // and have Atlas attach their Google account to someone else.
    const state = createOAuthState('user-1', SECRET);
    const [, signature] = state.split('.');
    const forged = Buffer.from(JSON.stringify({ userId: 'victim', nonce: 'x', exp: Date.now() + 60_000 })).toString('base64url');
    expect(verifyOAuthState(`${forged}.${signature}`, SECRET)).toBeNull();
  });

  it('rejects an expired state', () => {
    vi.useFakeTimers();
    try {
      const state = createOAuthState('user-1', SECRET);
      vi.advanceTimersByTime(11 * 60_000);
      expect(verifyOAuthState(state, SECRET)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects malformed states without throwing', () => {
    for (const bad of ['', 'nodot', 'a.b', '.', 'x.', '.y', 'not-base64!!.sig']) {
      expect(verifyOAuthState(bad, SECRET)).toBeNull();
    }
  });

  it('rejects a signature of the wrong length without throwing', () => {
    // timingSafeEqual throws on length mismatch — guard must run first.
    const state = createOAuthState('user-1', SECRET);
    const [body] = state.split('.');
    expect(verifyOAuthState(`${body}.short`, SECRET)).toBeNull();
  });
});
