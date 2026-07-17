import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.util.js';

describe('password hashing', () => {
  it('hashes then verifies the same password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(stored.startsWith('scrypt$')).toBe(true);
    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('right-password');
    await expect(verifyPassword('wrong-password', stored)).resolves.toBe(false);
  });

  it('produces a unique salt per hash', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });

  it('rejects malformed stored values', async () => {
    await expect(verifyPassword('anything', 'not-a-valid-record')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'bcrypt$aa$bb')).resolves.toBe(false);
  });
});
