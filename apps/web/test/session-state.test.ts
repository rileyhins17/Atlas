import { describe, expect, it } from 'vitest';
import { sessionState } from '@/lib/session-state';

describe('sessionState', () => {
  it('waits while the probe is in flight', () => {
    expect(sessionState({ isPending: true, isError: false, data: undefined })).toBe('booting');
  });

  it('signs in on a user, and out only on an explicit null (a 401)', () => {
    expect(sessionState({ isPending: false, isError: false, data: { id: 'u' } })).toBe('signed-in');
    expect(sessionState({ isPending: false, isError: false, data: null })).toBe('signed-out');
  });

  it('never reads a failed probe as signed out', () => {
    // A 429, a 500 or a dropped connection says nothing about the cookie.
    expect(sessionState({ isPending: false, isError: true, data: undefined })).toBe('unreachable');
  });

  it('keeps a known user through a failed refetch', () => {
    expect(sessionState({ isPending: false, isError: true, data: { id: 'u' } })).toBe('signed-in');
  });
});
