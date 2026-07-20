import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
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

  /**
   * Plaid → Atlas webhook (public, server-to-server). DEFERRED: this must verify
   * Plaid's JWT (`Plaid-Verification` header via /webhook_verification_key/get)
   * BEFORE it is allowed to trigger any sync — an unverified endpoint that acts
   * on request would let anyone force syncs. Until that verification is wired,
   * this only acknowledges receipt (200) and does nothing. Not reachable on
   * localhost anyway; the manual "Sync now" button is the live path today.
   */
  @Post('webhook')
  @HttpCode(200)
  webhook(): { received: true } {
    return { received: true };
  }
}
