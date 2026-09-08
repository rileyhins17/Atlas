import { Body, Controller, Get, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
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
@Controller('account')
@UseGuards(SessionGuard)
export class AccountController {
  private readonly logger = new Logger(AccountController.name);

  constructor(
    private readonly account: AccountService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Download everything Atlas holds about you, as a JSON file.
   *
   * Written to the socket as it is read, rather than assembled in memory and
   * sent in one piece. A long-standing account is tens of megabytes, this API
   * is one process serving everybody, and the people most likely to want an
   * export are the ones whose export is largest.
   *
   * Headers go out before the first chunk, so a failure partway through cannot
   * be turned into an error status — the download simply ends short. That is
   * the honest trade for not holding the whole thing in memory, and it is why
   * the error is logged loudly here rather than swallowed.
   */
  @Get('export')
  async exportData(@CurrentUser() user: AuthedUser, @Res() res: Response): Promise<void> {
    const filename = `atlas-export-${new Date().toISOString().slice(0, 10)}.json`;
    res
      .status(200)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    try {
      for await (const chunk of this.account.streamExport(user.id)) {
        // Respect backpressure: without this a fast database and a slow client
        // buffer the whole export in the socket, which is the memory problem
        // this streaming was meant to remove.
        if (!res.write(chunk)) {
          await new Promise<void>((resolve) => res.once('drain', resolve));
        }
      }
      res.end();
    } catch (err) {
      this.logger.error(
        `Export failed partway for user ${user.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      // The status line is long gone; destroying the socket is what tells the
      // client the file is incomplete instead of handing them a truncated JSON
      // document that looks finished.
      res.destroy();
    }
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
