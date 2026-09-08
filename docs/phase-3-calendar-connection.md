# Calendar connection status has a recovery path

The inline Google Calendar component on Calendar returned nothing while status
was pending or failed. A cached unavailable configuration also hid subsequent
read failures in both inline and compact layouts. Users had no explanation or
Retry action in those cases.

The inline component now announces its pending read and exposes the existing
ErrorState and Retry action after failure. Only a successful read confirming
that Google is unconfigured hides the optional domain-page connection prompt.
Manual events remain available independently of the connector.

Four regression assertions failed against the previous real component. All six
focused cases pass after the fix, covering pending inline status, recovery in
inline/compact/full layouts, and failed refreshes with cached unavailable data.
These tests use the actual query hook with an API mock, not copied JSX.

The appended life-os browser case simulates a connector-status outage, creates
a manual event through the UI and actual domain API, retries the status read,
reloads and verifies the saved event ID and title. It measures failure and
recovery at 390px in both themes, without contacting Google or starting OAuth.
The screenshot rig adds both-theme Calendar connection-error PNGs. Browser and
visual verification are outstanding because Actions is blocked before execution
by account billing. No provider integration or browser pass is claimed.

This slice follows PR #51 through 6f1631b. It changes no runtime dependency,
credential, production data, migration or deployment configuration.

Final local gates: build 6/6, forced typecheck 10/10, lint 0 errors with
3 existing warnings, 1640 unit tests (319 web, 916 shared, 346 API, 34 AI,
25 connectors).
