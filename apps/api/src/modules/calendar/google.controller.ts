import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { SyncResult } from '@atlas/connectors';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { loadEnv } from '../../config/env.js';
import { GoogleSyncService } from './google-sync.service.js';
import { createOAuthState, verifyOAuthState } from './oauth-state.js';

@Controller('connectors/google')
@UseGuards(SessionGuard)
export class GoogleController {
  constructor(private readonly google: GoogleSyncService) {}

  @Get('status')
  async status(@CurrentUser() user: AuthedUser) {
    return {
      configured: this.google.isConfigured(),
      connected: await this.google.isConnected(user.id),
    };
  }

  /**
   * Returns the Google consent URL for the browser to navigate to. Deliberately
   * JSON rather than a redirect: the caller is a fetch() from the SPA, and an
   * opaque cross-origin redirect there is awkward to handle.
   */
  @Get('start')
  start(@CurrentUser() user: AuthedUser): { url: string } {
    const state = createOAuthState(user.id, loadEnv().SESSION_SECRET);
    return { url: this.google.authUrl(state) };
  }

  /**
   * Google redirects the browser here. It's a top-level GET, so the sameSite=lax
   * session cookie rides along and SessionGuard can identify the user.
   *
   * `state` must both verify and belong to the session user — otherwise someone
   * could get a user to attach an attacker-controlled Google account.
   */
  @Get('callback')
  async callback(
    @CurrentUser() user: AuthedUser,
    @Res() res: Response,
    @Query('state') state?: string,
    @Query('code') code?: string,
    @Query('error') error?: string,
  ): Promise<void> {
    const webOrigin = loadEnv().WEB_ORIGIN;

    // The user declined consent, or Google refused.
    if (error) {
      res.redirect(`${webOrigin}/?google=denied`);
      return;
    }
    if (!state || !code) throw new BadRequestException('Missing OAuth state or code');

    const stateUserId = verifyOAuthState(state, loadEnv().SESSION_SECRET);
    if (!stateUserId || stateUserId !== user.id) {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    await this.google.completeOAuth(user.id, code);
    res.redirect(`${webOrigin}/?google=connected`);
  }

  /** Run a two-way sync now. */
  @Post('sync')
  sync(@CurrentUser() user: AuthedUser): Promise<SyncResult> {
    return this.google.sync(user.id);
  }

  @Post('disconnect')
  disconnect(@CurrentUser() user: AuthedUser): Promise<{ ok: true }> {
    return this.google.disconnect(user.id);
  }
}
