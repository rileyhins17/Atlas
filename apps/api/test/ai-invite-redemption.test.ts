import { beforeEach, expect, it, vi } from 'vitest';
const env = vi.hoisted(() => ({ INVITE_CODE: 'synthetic-invite' as string | undefined }));
vi.mock('../src/config/env.js', () => ({ loadEnv: () => env }));
import { AuthService } from '../src/auth/auth.service.js';
const updateMany = vi.fn();
const create = vi.fn();
function service() {
  return new AuthService({ client: { user: { updateMany, create, findUnique: async () => null } } } as never, {} as never);
}
beforeEach(() => {
  env.INVITE_CODE = 'synthetic-invite';
  updateMany.mockReset().mockResolvedValue({ count: 1 });
  create.mockReset().mockResolvedValue({ id: 'member', email: 'member@example.test', displayName: null, timezone: 'UTC' });
});
it('grants only the authenticated account and never clears revocation', async () => {
  await expect(service().redeemAiInvite('member', 'synthetic-invite')).resolves.toEqual({ ok: true });
  expect(updateMany).toHaveBeenCalledWith({ where: { id: 'member', aiAccessRevokedAt: null }, data: { aiAccessGrantedAt: expect.any(Date) } });
});
it('rejects an invalid invite without a write', async () => {
  await expect(service().redeemAiInvite('member', 'wrong')).rejects.toThrow('not valid');
  expect(updateMany).not.toHaveBeenCalled();
});
it('does not treat an unconfigured invite as open hosted access', async () => {
  env.INVITE_CODE = undefined;
  await expect(service().redeemAiInvite('member', '')).rejects.toThrow('not valid');
  expect(updateMany).not.toHaveBeenCalled();
});
it('rejects redemption for a revoked or absent account', async () => {
  updateMany.mockResolvedValue({ count: 0 });
  await expect(service().redeemAiInvite('member', 'synthetic-invite')).rejects.toThrow('unavailable');
});
it.each([false, true])('records registration eligibility only with a verified invite: %s', async (verified) => {
  await service().register({ email: 'member@example.test', password: 'synthetic-password', timezone: 'UTC', remember: true }, verified);
  expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ aiAccessGrantedAt: verified ? expect.any(Date) : null }) });
});
