import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthedRequest } from './session.guard.js';
import type { AuthedUser } from './auth.service.js';

/** Injects the authenticated user (set by SessionGuard) into a handler param. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthedUser => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) throw new Error('CurrentUser used without SessionGuard');
    return req.user;
  },
);
