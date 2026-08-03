import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import { ConnectorAuthExpiredError, ConnectorNotConfiguredError } from '@atlas/connectors';
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
    const status = isHttp
      ? exception.getStatus()
      : notConfigured
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
      : notConfigured
        ? { statusCode: status, message: (exception as Error).message }
        : { statusCode: status, message: 'Internal server error' };

    res.status(status).json(
      typeof body === 'string'
        ? { statusCode: status, message: body, requestId: req.requestId }
        : { ...(body as Record<string, unknown>), requestId: req.requestId },
    );
  }
}
