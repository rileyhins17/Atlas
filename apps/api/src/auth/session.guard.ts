import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type AuthedUser } from './auth.service.js';
import { UserTimezoneService } from '../core/user-timezone.service.js';

export const SESSION_COOKIE = 'atlas_session';

export interface AuthedRequest extends Request {
  user?: AuthedUser;
  cookies: Record<string, string>;
}

/**
 * Rejects any request without a valid session cookie and attaches the resolved
 * user to the request. Apply with `@UseGuards(SessionGuard)`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly timezones: UserTimezoneService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException('Not authenticated');
    const user = await this.auth.userFromToken(token);
    if (!user) throw new UnauthorizedException('Session invalid or expired');
    req.user = user;
    // The session query already read the timezone, so seeding the cache
    // here costs nothing and keeps it correct: every authenticated request
    // refreshes it from the authoritative row, so it cannot go stale.
    this.timezones.prime(user.id, user.timezone);
    return true;
  }
}
