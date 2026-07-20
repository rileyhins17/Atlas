import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PushSubscriptionInput, PushUnsubscribeInput } from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { PushService } from './push.service.js';

@Controller('push')
@UseGuards(SessionGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('public-key')
  publicKey(): { configured: boolean; publicKey: string | null } {
    return { configured: this.push.isConfigured(), publicKey: this.push.publicKey() };
  }

  @Post('subscribe')
  async subscribe(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(PushSubscriptionInput)) body: PushSubscriptionInput,
  ): Promise<{ ok: true }> {
    await this.push.subscribe(user.id, body);
    return { ok: true };
  }

  @Post('unsubscribe')
  async unsubscribe(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(PushUnsubscribeInput)) body: PushUnsubscribeInput,
  ): Promise<{ ok: true }> {
    await this.push.unsubscribe(user.id, body.endpoint);
    return { ok: true };
  }
}
