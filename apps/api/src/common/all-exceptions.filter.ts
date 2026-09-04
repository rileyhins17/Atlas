import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import { ConnectorAuthExpiredError, ConnectorNotConfiguredError } from '@atlas/connectors';
import { DailyTokenCapError } from '@atlas/ai';
import type { Response } from 'express';
import type { RequestWithId } from './request-id.middleware.js';
import { reportServerError } from './observability.js';

/**
 * Catch-all error boundary. Client-facing errors (4xx from HttpException) pass
 * through with their message; anything unexpected becomes a generic 500 so we
 * never leak stack traces, SQL, or secrets to the client. The full error is
 * logged server-side with the request id for correlation.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithId>();

    const isHttp = exception instanceof HttpException;
    // "You have not connected this integration" is a user-fixable precondition,
    // not a server fault. 424 keeps it out of the 5xx logs and — unlike 400,
    // which the web client treats as inline form validation — still surfaces
    // the message to the user.
    // An expired grant lands in the same band: the integration cannot be used
    // right now and the user is the only one who can fix it. Same status as
    // "not connected" because the client handles both the same way — show the
    // message, offer the connect button — and the message says which it is.
    const notConfigured =
      exception instanceof ConnectorNotConfiguredError ||
      exception instanceof ConnectorAuthExpiredError;
    // Running out of AI budget is an expected daily condition with a clear
    // remedy, not a fault. It carried a genuinely useful message and NOTHING
    // caught it, so the filter flattened it to a 500 reading "Internal server
    // error" — for the one failure a user can actually understand. It also
    // poisoned the error budget: every cap hit was reported to Sentry as an
    // unhandled exception.
    //
    // 424 rather than 429 deliberately. It is the status the client already
    // reads as "this integration cannot be used right now, show the message",
    // and it is what arms the local capture fallback — which was the real
    // damage, because the fallback fired only on 424 and therefore switched
    // itself off at the exact moment cost mattered most.
    const outOfBudget = exception instanceof DailyTokenCapError;
    const userFixable = notConfigured || outOfBudget;
    const status = isHttp
      ? exception.getStatus()
      : userFixable
        ? HttpStatus.FAILED_DEPENDENCY
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          level: 'error',
          msg: 'unhandled_exception',
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          status,
          error: exception instanceof Error ? exception.message : String(exception),
          stack: exception instanceof Error ? exception.stack : undefined,
        }),
      );
      // Same requestId the client is shown, so "it broke, here's the code" maps
      // straight to a stack trace. No-op unless SENTRY_DSN is set.
      reportServerError(exception, {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        userId: (req as RequestWithId & { user?: { id?: string } }).user?.id,
      });
    }

    const body = isHttp
      ? exception.getResponse()
      : userFixable
        ? { statusCode: status, message: (exception as Error).message }
        : { statusCode: status, message: 'Internal server error' };

    res.status(status).json(
      typeof body === 'string'
        ? { statusCode: status, message: body, requestId: req.requestId }
        : { ...(body as Record<string, unknown>), requestId: req.requestId },
    );
  }
}
