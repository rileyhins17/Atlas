# Session and invite-configuration recovery

AppShell previously rendered sign-in after a failed session probe with no cached
user, although useMe distinguishes a real 401 (null) from other errors. The shell
now explains the failed session check and offers Retry. A failed refresh with a
cached user retains the existing frame and shows a retry notice. Confirmed
signed-out and initial loading screens now have a main landmark.

AuthGate previously assumed inviteRequired=false while configuration was
unavailable. Registration now waits for a successful configuration response and
shows loading or Retry. Sign-in remains independent of registration configuration.
Email/password/invite drafts stay in component state through config recovery.
The server's existing invite enforcement is unchanged; this corrects misleading
client state, not an authorization bypass.

Observed three session/config regressions fail first, then observed the missing
signed-out main landmark fail separately. Six focused tests cover those cases,
sign-in independence and retained credentials. The browser case simulates a 503
session probe, retries into the real signed-in app, then simulates a signed-out
session and unavailable registration config. It verifies disabled registration,
retained synthetic credentials and an invite field after config recovery, and
measures both states at 390px in light and dark. It does not register another
account or claim to prove real invite redemption; that journey remains separate.

Depends on unmerged PR #46 through fbd8965. No runtime dependencies, migrations,
credentials or production configuration changes are included. Sign-up's existing
18px checkbox is now 24px; consent links have a 24px minimum target. The screenshot
rig captures session recovery and invite sign-up in both themes using synthetic
responses and no additional account registration.

Initial full validation caught two unsupported Testing Library assertion options
and an older password-validation fixture without an auth-config response. Those
test defects were corrected; password validation still checks the real form and
confirms no registration request is sent. Local build, forced typecheck, lint and
1606 unit tests passed. Full browser and strict-state accessibility results remain
pending CI.
