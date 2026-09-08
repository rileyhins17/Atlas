# Notification removal reports the actual result

disablePush swallowed both the Atlas endpoint-removal failure and the browser
unsubscribe failure, then always returned disabled. Settings could announce
success even while the browser still held its subscription.

Removal now waits for the server and browser in sequence and propagates either
failure. If the server fails, the browser endpoint remains available for retry.
If the server succeeds but the browser fails, the same disable action can retry
the idempotent server removal and finish browser cleanup. Settings retains a
persistent error and clears it when the user retries; success changes the action
to Enable only after the removal operations resolve.

A resolved false browser result is still accepted: the subscription can already
be deactivated, as specified by the [W3C Push API unsubscribe algorithm](https://www.w3.org/TR/push-api/#dom-pushsubscription-unsubscribe).
No browser subscription means there is no endpoint to send for removal.

Three regression cases were observed failing first. Seven focused tests pass,
covering server failure, browser failure/retry, already-deactivated and absent
subscriptions, plus persistent component error/retry and existing settings cases.

The new browser case simulates the browser subscription and intercepts all
unsubscribe requests. It fails server removal first, confirms no browser removal
occurred, fails browser removal next, then retries and checks the recovered UI
and synthetic state after reload. Both themes are measured at 390px; the
screenshot rig also captures the failure state. This proves a UI recovery path
when run, not real push delivery or production subscription removal. Browser and
PNG results remain unverified because Actions is blocked before execution by
account billing.

This follows PR #53 through edd7430. It makes no production data, credential,
runtime dependency, migration or deployment change. Enabling notifications with
a browser subscription but a failed server registration remains a separate
consistency gap; this slice does not claim end-to-end push readiness.

Local gates: build 6/6, forced typecheck 10/10, lint 0 errors with 3 existing
warnings, 1648 unit tests (327 web, 916 shared, 346 API, 34 AI, 25 connectors).
