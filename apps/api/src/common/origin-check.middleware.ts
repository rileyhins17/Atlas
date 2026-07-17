import { ForbiddenException, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { loadEnv } from '../config/env.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defense-in-depth.
 *
 * The session cookie is already `sameSite: 'lax'`, which stops browsers sending
 * it on cross-site POST/PUT/PATCH/DELETE — that is the primary CSRF control.
 * This adds a second layer: if a mutating request arrives WITH an Origin header
 * (i.e. it came from a browser), that origin must be one we trust. Requests with
 * no Origin (curl, mobile clients, server-to-server) are allowed through, since
 * a browser attacker cannot suppress the Origin header on a cross-site request.
 */
@Injectable()
export class OriginCheckMiddleware implements NestMiddleware {
  private readonly allowed: Set<string>;

  constructor() {
    const env = loadEnv();
    this.allowed = new Set([env.WEB_ORIGIN]);
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    if (!MUTATING.has(req.method)) return next();

    const origin = req.header('origin');
    if (origin && !this.allowed.has(origin)) {
      throw new ForbiddenException('Cross-origin request rejected');
    }
    next();
  }
}
