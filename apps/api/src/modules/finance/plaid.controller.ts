import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { SyncResult } from '@atlas/connectors';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { PlaidSyncService, type PlaidItemSummary } from './plaid-sync.service.js';

const LinkTokenInput = z.object({ itemId: z.string().optional() });
const ExchangeInput = z.object({ publicToken: z.string().min(1) });
const DisconnectInput = z.object({ itemId: z.string().optional() });

type RequestWithRawBody = Request & { rawBody?: Buffer };

/**
 * Note: no class-level guard. The authed endpoints below each apply SessionGuard;
 * the webhook is intentionally public (Plaid calls it server-to-server).
 */
@Controller('connectors/plaid')
export class PlaidController {
  constructor(private readonly plaid: PlaidSyncService) {}

  @Get('status')
  @UseGuards(SessionGuard)
  async status(
    @CurrentUser() user: AuthedUser,
  ): Promise<{ configured: boolean; connected: boolean; items: PlaidItemSummary[] }> {
    const connected = await this.plaid.isConnected(user.id);
    return {
      configured: this.plaid.isConfigured(),
      connected,
      items: connected ? await this.plaid.listItems(user.id) : [],
    };
  }

  @Post('link-token')
  @UseGuards(SessionGuard)
  async linkToken(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(LinkTokenInput)) body: z.infer<typeof LinkTokenInput>,
  ): Promise<{ linkToken: string }> {
    return { linkToken: await this.plaid.createLinkToken(user.id, body.itemId) };
  }

  @Post('exchange')
  @UseGuards(SessionGuard)
  exchange(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(ExchangeInput)) body: z.infer<typeof ExchangeInput>,
  ): Promise<SyncResult> {
    return this.plaid.completeExchange(user.id, body.publicToken);
  }

  @Post('sync')
  @UseGuards(SessionGuard)
  sync(@CurrentUser() user: AuthedUser): Promise<SyncResult> {
    return this.plaid.sync(user.id);
  }

  @Post('disconnect')
  @UseGuards(SessionGuard)
  disconnect(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(DisconnectInput)) body: z.infer<typeof DisconnectInput>,
  ): Promise<{ ok: true }> {
    return this.plaid.disconnect(user.id, body.itemId);
  }

  /** Plaid → Atlas webhook (public, server-to-server), authenticated by Plaid's signature. */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('plaid-verification') verification: string | undefined,
    @Req() req: RequestWithRawBody,
  ): Promise<{ received: true }> {
    if (
      !this.plaid.isConfigured() ||
      !verification ||
      !req.rawBody ||
      !(await this.plaid.verifyWebhook(req.rawBody, verification))
    ) {
      throw new UnauthorizedException('Webhook verification failed');
    }
    return { received: true };
  }
}
