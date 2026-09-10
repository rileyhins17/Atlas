import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { PlaidConnector, type PlaidConfig } from '../src/plaid.js';

const CONFIG: PlaidConfig = {
  clientId: 'client-id',
  secret: 'secret',
  env: 'sandbox',
  countryCodes: ['CA'],
  products: ['transactions'],
};

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicJwk = publicKey.export({ format: 'jwk' }) as {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
};
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function encoded(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function signedToken(
  body: Buffer,
  key: KeyObject = privateKey,
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
): string {
  const encodedHeader = encoded(JSON.stringify({ alg: 'ES256', kid: 'key-1', typ: 'JWT', ...header }));
  const encodedClaims = encoded(
    JSON.stringify({
      iat: Math.floor(Date.now() / 1000),
      request_body_sha256: createHash('sha256').update(body).digest('hex'),
      ...claims,
    }),
  );
  const signer = createSign('sha256');
  signer.update(`${encodedHeader}.${encodedClaims}`);
  signer.end();
  const signature = signer.sign({ key, dsaEncoding: 'ieee-p1363' });
  return `${encodedHeader}.${encodedClaims}.${encoded(signature)}`;
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse({ key: { ...publicJwk, alg: 'ES256', kid: 'key-1' } }));
});

describe('PlaidConnector.verifyWebhook', () => {
  it('accepts a valid ES256 signature and exact body hash', async () => {
    const connector = new PlaidConnector(CONFIG);
    const body = Buffer.from('{"webhook_type":"TRANSACTIONS","webhook_code":"SYNC_UPDATES_AVAILABLE"}');

    await expect(connector.verifyWebhook(body, signedToken(body))).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]![1] as { body: string };
    expect(JSON.parse(request.body)).toMatchObject({ client_id: 'client-id', secret: 'secret', key_id: 'key-1' });
  });

  it('rejects a body changed after signing', async () => {
    const connector = new PlaidConnector(CONFIG);
    const signedBody = Buffer.from('{"event":"signed"}');

    await expect(connector.verifyWebhook(Buffer.from('{"event":"tampered"}'), signedToken(signedBody))).resolves.toBe(false);
  });

  it('rejects stale claims and invalid algorithms before accepting the webhook', async () => {
    const connector = new PlaidConnector(CONFIG);
    const body = Buffer.from('{"event":"old"}');

    await expect(
      connector.verifyWebhook(body, signedToken(body, privateKey, { iat: Math.floor(Date.now() / 1000) - 301 })),
    ).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();
    await expect(connector.verifyWebhook(body, signedToken(body, privateKey, {}, { alg: 'HS256' }))).resolves.toBe(false);
    // The algorithm check is local; an invalid algorithm must not fetch a key.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
