import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { DeleteAccountInput } from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard, SESSION_COOKIE, type AuthedRequest } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { AuthService } from '../../auth/auth.service.js';
import { AccountService } from './account.service.js';

/** JSON.stringify can't serialize BigInt (Account/Transaction minor-unit amounts). */
function bigintSafe(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

@Controller('account')
@UseGuards(SessionGuard)
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly auth: AuthService,
  ) {}

  /** Download everything Atlas holds about you, as a JSON file. */
  @Get('export')
  async exportData(@CurrentUser() user: AuthedUser, @Res() res: Response): Promise<void> {
    const data = await this.account.exportData(user.id);
    const filename = `atlas-export-${new Date().toISOString().slice(0, 10)}.json`;
    res
      .status(200)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      .send(JSON.stringify(data, bigintSafe, 2));
  }

  /**
   * Permanently delete the account. Password re-auth required. Throttled hard —
   * this is irreversible and there's no reason to call it in a burst.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('delete')
  async deleteAccount(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(DeleteAccountInput)) body: DeleteAccountInput,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.account.deleteAccount(user.id, body.password);
    // The session's user is gone (its row cascaded), but clear the cookie so the
    // browser doesn't keep presenting a dead token.
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await this.auth.logout(token).catch(() => undefined);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }
}
