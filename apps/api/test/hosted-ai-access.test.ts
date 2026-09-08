import { beforeEach, expect, it, vi } from 'vitest';
const config = vi.hoisted(() => ({ ATLAS_DEEPSEEK_API_KEY: 'synthetic-owner-key-for-tests-only' }));
vi.mock('../src/config/env.js', () => ({ loadEnv: () => config }));
import { ConnectorsService } from '../src/core/connectors.service.js';

const granted = { aiAccessGrantedAt: new Date('2026-09-08T12:00:00Z'), aiAccessRevokedAt: null };
const findUser = vi.fn();
const findCredential = vi.fn();
const decrypt = vi.fn();
beforeEach(() => { findUser.mockReset(); findCredential.mockReset().mockResolvedValue(null); decrypt.mockReset(); });
function service() {
  return new ConnectorsService({ client: { user: { findUnique: findUser }, credential: { findUnique: findCredential } } } as never, { decryptJson: decrypt } as never);
}
it('uses the server key only for the requested account with an active grant', async () => {
  findUser.mockResolvedValue(granted);
  expect(await service().contextFor('invited-member', 'deepseek').getSecret()).toEqual({ apiKey: config.ATLAS_DEEPSEEK_API_KEY });
  expect(findUser).toHaveBeenCalledWith({ where: { id: 'invited-member' }, select: { aiAccessGrantedAt: true, aiAccessRevokedAt: true } });
  expect(decrypt).not.toHaveBeenCalled();
});
it.each([null, { aiAccessGrantedAt: null, aiAccessRevokedAt: null }, { ...granted, aiAccessRevokedAt: new Date() }])('does not supply a hosted key without an active grant: %j', async (user) => {
  findUser.mockResolvedValue(user);
  expect(await service().contextFor('not-entitled', 'deepseek').getSecret()).toBeNull();
});
it('keeps an existing personal credential independent of hosted eligibility', async () => {
  findUser.mockResolvedValue(null);
  findCredential.mockResolvedValue({ dataEnc: 'synthetic-ciphertext', status: 'active' });
  decrypt.mockReturnValue({ apiKey: 'synthetic-personal-key' });
  expect(await service().contextFor('personal-member', 'deepseek').getSecret()).toEqual({ apiKey: 'synthetic-personal-key' });
});
