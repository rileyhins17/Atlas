import { describe, expect, it } from 'vitest';
import { CryptoService } from '../src/core/crypto.service.js';

describe('CryptoService', () => {
  const crypto = new CryptoService();

  it('round-trips a string through encrypt/decrypt', () => {
    const plaintext = 'super-secret connector token 🔐';
    const payload = crypto.encrypt(plaintext);
    expect(payload).not.toContain(plaintext);
    expect(crypto.decrypt(payload)).toBe(plaintext);
  });

  it('round-trips JSON through encryptJson/decryptJson', () => {
    const value = { apiKey: 'sk-123', nested: { scopes: ['read', 'write'] }, n: 42 };
    const payload = crypto.encryptJson(value);
    expect(crypto.decryptJson(payload)).toEqual(value);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    expect(crypto.encrypt('same input')).not.toBe(crypto.encrypt('same input'));
  });

  it('rejects tampered ciphertext (GCM auth)', () => {
    const payload = crypto.encrypt('integrity matters');
    const buf = Buffer.from(payload, 'base64');
    buf[buf.length - 1]! ^= 0xff;
    expect(() => crypto.decrypt(buf.toString('base64'))).toThrow();
  });
});
