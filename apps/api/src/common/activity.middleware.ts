import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ActivityService } from '../core/activity.service.js';

/** Liveness polling is not use of the app, and must not look like it. */
const IGNORED_PREFIX = '/health';

/**
 * Records that somebody actually used the API. See ActivityService for why the
 * background sweeps need to know.
 *
 * `/health` is excluded deliberately: the watchdog polls it every two minutes
 * forever, so counting it would mean the API always looks busy and nothing
 * would ever go idle — which is the exact bug this is here to prevent.
 *
 * READ `originalUrl`, NEVER `req.path`. Express rewrites `req.url` (and with it
 * `req.path`) to be relative to the mount point while a mounted router runs, so
 * middleware attached through `forRoutes` sees `/` for a request to `/health`
 * and counts the watchdog as a user. Measured, and it is a nasty one to spot:
 * `RequestIdMiddleware` reads the same field from an `res.on('finish')`
 * callback, by which time Express has put the original value back — so the
 * request log says `/health` while this middleware saw something else.
 */
@Injectable()
export class ActivityMiddleware implements NestMiddleware {
  constructor(private readonly activity: ActivityService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const [path] = (req.originalUrl || req.url || '').split('?');
    if (!path?.startsWith(IGNORED_PREFIX)) this.activity.mark();
    next();
  }
}
