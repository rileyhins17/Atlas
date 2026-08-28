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
 */
@Injectable()
export class ActivityMiddleware implements NestMiddleware {
  constructor(private readonly activity: ActivityService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    if (!req.path.startsWith(IGNORED_PREFIX)) this.activity.mark();
    next();
  }
}
