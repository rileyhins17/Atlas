import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type AuthedUser } from './auth.service.js';

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
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException('Not authenticated');
    const user = await this.auth.userFromToken(token);
    if (!user) throw new UnauthorizedException('Session invalid or expired');
    req.user = user;
    return true;
  }
}
