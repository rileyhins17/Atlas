import * as Sentry from '@sentry/node';

let started = false;

/**
 * Error reporting, opt-in via `SENTRY_DSN`.
 *
 * Without a DSN this is a no-op and the app behaves exactly as before, so a
 * local dev run or a self-host needs no account and sends nothing. With one,
 * unhandled 5xx errors are reported with the same `requestId` the client is
 * shown, which is what makes a user's "it broke" report traceable to a stack.
 *
 * Must be called before Nest builds the app so the SDK can patch what it needs.
 */
export function initObservability(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || started) return started;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Errors are the point; tracing every request is not worth the quota on a
    // single-instance deployment.
    tracesSampleRate: 0,
    // The session cookie is the one thing that must never reach a third party.
    beforeSend(event) {
      if (event.request?.cookies) delete event.request.cookies;
      if (event.request?.headers) {
        delete event.request.headers.cookie;
        delete event.request.headers.authorization;
      }
      return event;
    },
  });

  started = true;
  return true;
}

/** Report an unhandled server error. No-op when Sentry was never initialised. */
export function reportServerError(
  error: unknown,
  context: { requestId?: string; method?: string; path?: string; userId?: string },
): void {
  if (!started) return;
  Sentry.withScope((scope) => {
    if (context.requestId) scope.setTag('requestId', context.requestId);
    if (context.method) scope.setTag('method', context.method);
    if (context.path) scope.setTag('path', context.path);
    // Id only — never the email, which is what would make this personal data.
    if (context.userId) scope.setUser({ id: context.userId });
    Sentry.captureException(error);
  });
}
