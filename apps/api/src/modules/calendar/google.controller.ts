import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { SyncResult } from '@atlas/connectors';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { appOrigin, loadEnv } from '../../config/env.js';
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
      // Surfaced so the person configuring Google can copy it exactly.
      // `redirect_uri_mismatch` is Google refusing before Atlas is involved,
      // and it is unfixable from inside the app — but it is trivially fixable
      // by someone who can see the string Atlas actually sends. Not a secret:
      // it is a public callback path that appears in the browser's URL bar
      // during consent.
      redirectUri: this.google.redirectUri(),
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
    const webOrigin = appOrigin();

    // The user declined consent, or Google refused.
    if (error) {
      res.redirect(`${webOrigin}/settings?google=denied`);
      return;
    }
    if (!state || !code) {
      res.redirect(`${webOrigin}/settings?google=state`);
      return;
    }

    // An expired or mismatched state is EXPECTED — the window is bounded and a
    // person can easily exceed it. Throwing rendered a raw JSON 401 on a black
    // page, which is an unrecoverable-looking answer to a recoverable problem;
    // the browser is a browser here, not a fetch(), so it gets a page.
    //
    // Expired and forged are handled identically on purpose: telling a caller
    // which one it was is exactly the hint an attacker would want.
    const stateUserId = verifyOAuthState(state, loadEnv().SESSION_SECRET);
    if (!stateUserId || stateUserId !== user.id) {
      res.redirect(`${webOrigin}/settings?google=state`);
      return;
    }

    await this.google.completeOAuth(user.id, code);
    res.redirect(`${webOrigin}/settings?google=connected`);
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
