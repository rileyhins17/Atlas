import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  DisconnectWearablesInput,
  WearablesSummaryQuery,
  type WearablesStatusDTO,
  type WearablesSummaryDTO,
  type WearablesSyncResultDTO,
} from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { appOrigin, loadEnv } from '../../config/env.js';
import { createOAuthState, verifyOAuthState } from '../calendar/oauth-state.js';
import { WearablesService } from './wearables.service.js';

/**
 * The Google Health connection: connect, sync, disconnect.
 *
 * The OAuth handshake mirrors GoogleController deliberately — same signed,
 * user-bound `state`, same "a browser gets a page, not a JSON 401" handling —
 * because the one thing worse than a second OAuth flow is a second OAuth flow
 * with different security properties.
 */
@Controller('connectors/google-health')
@UseGuards(SessionGuard)
export class GoogleHealthController {
  constructor(private readonly wearables: WearablesService) {}

  @Get('status')
  status(@CurrentUser() user: AuthedUser): Promise<WearablesStatusDTO> {
    return this.wearables.status(user.id);
  }

  @Get('start')
  start(@CurrentUser() user: AuthedUser): { url: string } {
    const state = createOAuthState(user.id, loadEnv().SESSION_SECRET);
    return { url: this.wearables.authUrl(state) };
  }

  @Get('callback')
  async callback(
    @CurrentUser() user: AuthedUser,
    @Res() res: Response,
    @Query('state') state?: string,
    @Query('code') code?: string,
    @Query('error') error?: string,
  ): Promise<void> {
    const back = `${appOrigin()}/settings`;
    if (error) {
      res.redirect(`${back}?health=denied#wearables`);
      return;
    }
    // Expired and forged states are answered identically on purpose — see
    // GoogleController.callback.
    const stateUserId = state && code ? verifyOAuthState(state, loadEnv().SESSION_SECRET) : null;
    if (!stateUserId || stateUserId !== user.id || !code) {
      res.redirect(`${back}?health=state#wearables`);
      return;
    }
    await this.wearables.completeOAuth(user.id, code);
    // Pull the first month straight away, so the page they land on has
    // something in it. A failure here must not strand them on an error page:
    // the connection itself succeeded, and the next open retries the sync.
    await this.wearables.sync(user.id, { force: true }).catch(() => undefined);
    res.redirect(`${back}?health=connected#wearables`);
  }

  /** Called when the app is opened; skips itself if it ran minutes ago. */
  @Post('sync')
  sync(@CurrentUser() user: AuthedUser): Promise<WearablesSyncResultDTO> {
    return this.wearables.sync(user.id);
  }

  @Post('disconnect')
  disconnect(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(DisconnectWearablesInput)) body: DisconnectWearablesInput,
  ): Promise<{ ok: true }> {
    return this.wearables.disconnect(user.id, body.forget);
  }
}

/** What the watch measured, for the screens that show it. */
@Controller('wearables')
@UseGuards(SessionGuard)
export class WearablesController {
  constructor(private readonly wearables: WearablesService) {}

  @Get('summary')
  summary(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(WearablesSummaryQuery)) query: WearablesSummaryQuery,
  ): Promise<WearablesSummaryDTO> {
    return this.wearables.summary(user.id, query.days);
  }
}
