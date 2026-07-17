import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * Assigns every request a correlation id and emits one structured JSON log line
 * per completed request. Keeps prod debuggable without leaking payloads — we log
 * metadata only, never bodies (journal/finance content is sensitive).
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const incoming = req.header(REQUEST_ID_HEADER);
    const id = incoming && incoming.length <= 100 ? incoming : randomUUID();
    req.requestId = id;
    res.setHeader(REQUEST_ID_HEADER, id);

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const line = {
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        msg: 'request',
        requestId: id,
        method: req.method,
        // Path only — query strings can carry identifiers we would rather not log.
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
      };
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(line));
    });

    next();
  }
}
