# Invited, owner-funded Atlas AI

Requested by Riley on 8 September. This records the implementation contract,
baseline audit and current progress. Hosted access is not deployed or fully
verified yet.

The product contract is straightforward: enter an invite when joining Atlas,
then use chat, capture, planning and reviews without managing a provider key.
Existing members can redeem the invite from their authenticated account. Access
is attached to that account rather than resubmitting the code with each prompt.

## Verified starting points before implementation

- AuthController checks INVITE_CODE at registration when configured, but stores
  no evidence of a valid invite. Existing accounts cannot be assumed eligible.
- ConnectorsService.contextFor reads only the authenticated user's encrypted
  credential. DeepSeekConnector has no environment-key fallback.
- OrchestratorService.chatCall checks CostGuard and records usage by userId.
- WorkoutTemplatesService also calls DeepSeek directly for split naming. It
  checks and records usage separately; it must join the same hosted-access and
  admission path rather than being missed by an orchestrator-only change.
- CostGuard already has per-user and deployment-wide token ceilings. Its check
  happens before a call and recording after it; that alone does not provide a
  strict ceiling under concurrent calls. Address admission/reservation semantics
  before describing these limits as a hard shared-spend guarantee.
- AiController.status calls tokensUsedToday without userId, so it currently
  presents everyone's usage against a per-user cap.
- ProactiveService.eligibleUsers only selects personal DeepSeek credentials.
  Hosted members must be eligible without inventing duplicate key records.
- AiSettingsCard asks for a key when no personal provider is configured and
  lacks an explicit error branch for its status query.

## Implementation contract

1. Add durable, server-controlled eligibility with an additive migration.
   Registration grants it only after validating a configured invite. An
   authenticated, throttled redemption endpoint serves existing accounts. No
   mass-grant migration and no inference from account age or email.
2. Resolve hosted credentials only for eligible, non-revoked users. Keep the
   shared key in server configuration, never in response DTOs, browser storage,
   per-user credential copies, logs or test artifacts. Use synthetic keys and a
   mocked provider for CI; do not spend real provider credit to test the flow.
3. Retain existing personal-key accounts as a compatibility path. Hosted members
   see included AI status and their own allowance, not a provider setup form.
   Ineligible users see invite redemption; failures, exhausted allowance and
   temporary provider unavailability have distinct recoverable states.
4. Make all AI callers use the same authorization and admission path, including
   scheduled briefs and question generation. Retain ActivityService gating.
   Keep per-user limits and a deployment-wide limit with concurrency-aware
   accounting; expose only the current member's usage publicly.
5. Exercise new registration, existing-account redemption, wrong/missing invite,
   revoked access, cross-user isolation, shared-key non-disclosure, simultaneous
   calls, cap exhaustion, provider failure and the protected first-capture
   fallback. Verify the complete invited-user journey in CI without a personal
   key, in light and dark at 390px.

## Product direction

Atlas should guide the user from capture to a realistic next action, then help
them review what happened. AI is included assistance inside those tasks, with
clear proposals and saved outcomes; provider setup should not be a prerequisite
for getting value. The manual domain controls remain available when a provider
is unavailable or a budget is exhausted. Keep the original route, query-state,
accessibility and measured performance requirements; this feature does not
replace the broader redesign.

Deployment configuration is a separate final step after implementation and CI.
Do not inspect or copy an existing secret, rotate credentials, alter the live
origin or claim hosted AI is enabled as part of this source-only work.

## Implementation progress

Foundation checkpoint 11086ef adds nullable grant/revocation timestamps,
registration grants after validated invites, authenticated redemption and
grant-scoped shared credential selection. The offline migration diff was read
and contains only the two nullable additions. No migration was run against a
database. Eleven focused tests pass; invited credential selection was observed
failing before its fix. Its local gate passed 1556 unit tests.

The next changes connect Settings to redemption and included-access status,
handle failed status reads explicitly, and select active hosted members for
scheduled briefs while retaining the activity gate and 50-user bound. Three
Settings tests and one scheduled-eligibility test were observed failing before
their fixes. Full validation results are recorded at the commit checkpoint.

Still required: owner-facing access revocation controls, concurrency-aware
budget admission, real synthetic database migration/redemption proof, provider
isolation in CI, the full invited-user browser journey and visual measurements.
No shared key is configured here, and no real provider call has been made.
