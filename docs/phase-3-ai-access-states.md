# Invites remain available to personal-key accounts

The personal-provider branch took precedence over invite activation and hosted
revocation, hiding both from existing personal-key accounts. Invite activation
and revocation now take priority in the access section, while confirmed personal
connection information remains visible separately. Paused personal AI no longer
claims that chat/capture are live. Usage is described across the account rather
than attributed to a specific provider credential.

Three actual-hook regressions failed first. Eight real-query/mutation cases now
pass, alongside three existing hook-mocked tests. They cover pending access,
failed status/Retry, approved-but-unavailable hosted AI, paused hosted AI,
revocation with a personal connection, personal-account invite activation,
failed-invite retention/retry into included access, and paused personal AI.

The browser case uses synthetic status and invite responses. It exercises
personal-account activation failure/retry, included access, revocation,
unavailable service and paused service at 390px in both themes. Full and
independent selection are configured. It does not prove server authorization,
real invite redemption, provider selection, usage enforcement or persistence;
those remain distinct gates. Browser execution is unverified while Actions is
billing-blocked. No actual credential is read, entered or changed.

This follows unmerged PR #62 through 8ebc3bf. No production data, migrations,
runtime dependencies or deployment changes.

Ordered local gates passed: build 6/6, forced typecheck 10/10, lint zero errors
with three existing warnings, and 1707 unit tests including 386 web tests.
