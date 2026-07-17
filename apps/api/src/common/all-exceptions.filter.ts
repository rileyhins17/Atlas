import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithId } from './request-id.middleware.js';

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
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

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
    }

    const body = isHttp
      ? exception.getResponse()
      : { statusCode: status, message: 'Internal server error' };

    res.status(status).json(
      typeof body === 'string'
        ? { statusCode: status, message: body, requestId: req.requestId }
        : { ...(body as Record<string, unknown>), requestId: req.requestId },
    );
  }
}
