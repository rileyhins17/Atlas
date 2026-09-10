import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { PlaidController } from '../src/modules/finance/plaid.controller.js';

function makeController(configured = true) {
  const verifyWebhook = vi.fn().mockResolvedValue(true);
  const controller = new PlaidController({
    isConfigured: vi.fn(() => configured),
    verifyWebhook,
  } as never);
  return { controller, verifyWebhook };
}

type WebhookRequest = Parameters<PlaidController['webhook']>[1];
const request = (rawBody?: Buffer) => ({ ...(rawBody ? { rawBody } : {}) }) as WebhookRequest;

describe('PlaidController.webhook', () => {
  it('requires the signature and raw request bytes', async () => {
    const { controller, verifyWebhook } = makeController();

    await expect(controller.webhook(undefined, request(Buffer.from('{}')))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(controller.webhook('signature', request())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifyWebhook).not.toHaveBeenCalled();
  });

  it('does not acknowledge an unconfigured connector', async () => {
    const { controller, verifyWebhook } = makeController(false);

    await expect(controller.webhook('signature', request(Buffer.from('{}')))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifyWebhook).not.toHaveBeenCalled();
  });

  it('acknowledges only after the connector verifies the exact body', async () => {
    const { controller, verifyWebhook } = makeController();
    const rawBody = Buffer.from('{"event":"signed"}');

    await expect(controller.webhook('signature', request(rawBody))).resolves.toEqual({ received: true });
    expect(verifyWebhook).toHaveBeenCalledWith(rawBody, 'signature');
  });

  it('returns an authorization failure when verification rejects the token', async () => {
    const { controller, verifyWebhook } = makeController();
    verifyWebhook.mockResolvedValue(false);

    await expect(controller.webhook('bad-signature', request(Buffer.from('{}')))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
