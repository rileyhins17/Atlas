# Atlas — production readiness

**Method.** Two harnesses, not opinion. An API stress pass (154 assertions across all 17 modules:
validation bounds, cross-user isolation, double-mutation, malformed bodies, burst writes) and a UI
pass driving all 11 routes at 390×844 with a real session, capturing console errors, failed
requests, layout overflow, unlabelled controls and tap-target sizes. Both harnesses were throwaway
and have been deleted; this file is what they found.

**Headline:** cross-user isolation is clean. User B could not read, patch, delete or complete a
single one of user A's rows across tasks, events, habits, notes, workouts and the account export.
That is the thing that would have been unrecoverable, and it holds.

Everything below is ordered by what blocks shipping.

---

## Fixed in this pass

| # | Issue | Root cause |
|---|---|---|
| F1 | **Every AI endpoint returned HTTP 500 for any user without an API key** — chat, brain-dump, daily-brief, weekly-review, plan-day, questions/generate | `DeepSeekConnector` threw a plain `Error`; nothing mapped it to a status, so `AllExceptionsFilter` made it a 500. This is the state of *every new signup*: the app's core feature answered "Internal server error". |
| F2 | **Every dialog in the app rendered underneath the capture dock**, hiding its primary button | `.dialog-overlay` / `.dialog-content` had no `z-index` at all, so the dock and bottom nav (z-40) painted over them. |
| F3 | Calendar overflowed horizontally on a phone — 537px of content in a 390px viewport | Two `datetime-local` inputs side by side; neither shrinks below ~260px. |
| F4 | Events could not be edited at all | `PATCH /events/:id` existed on the API but had no client method and no UI. A typo meant delete-and-retype. |
| F5 | The calendar could not show the past | The agenda hard-filtered `key < today`. Yesterday was unreachable. |
| F6 | Deleting an event was instant and irreversible | No confirm, no undo. |
| F7 | The calendar had zero e2e coverage | — |
| F8 | Google Calendar sync 500'd when not connected | Same plain-`Error` cause as F1. |

**How F1/F8 were fixed:** a typed `ConnectorNotConfiguredError` in `packages/connectors`, mapped in
`AllExceptionsFilter` to **424 Failed Dependency**. 424 deliberately — the web client treats 400 as
inline form validation and shows *no toast*, so a 400 would have been silent.

**Verification:** stress pass went from 7 hard failures to 0 (151/154). Full suite green: build 6/6,
typecheck 10/10, lint clean, 157 web unit tests, **e2e 21/21** including two new calendar specs.

---

## Blockers — before anyone other than you signs up

### B1 · No privacy policy or terms of service
Non-optional once a second person has an account, and Google OAuth verification will demand a
privacy-policy URL before Calendar leaves test mode.
**Fix:** two static routes under the existing landing-page pattern (server components, no client JS).
Half a day. Link both from the footer and the sign-up screen.

### B2 · Rotate the Plaid production secret
It was pasted into a chat transcript. Assume it is compromised.
**Fix:** rotate in the Plaid dashboard, update `.env`, restart. Do this before Plaid production is
switched on, not after.

### B3 · No error tracking
Right now a 500 in production is invisible unless you happen to read the console. `AllExceptionsFilter`
already logs structured JSON with a `requestId` — the plumbing is there, there is just no sink.
**Fix:** Sentry (free tier) in both API and web. The `requestId` already correlates the two.

### B4 · The app runs on your PC
It must be awake and logged in. Fine for one tester; not somewhere another person's data should live.
**Fix:** `docker compose --profile full up -d` on a VPS plus one DNS change — the path is already
written up in `docs/ship-to-iphone.md`.

### B5 · ~350 junk accounts
Almost entirely test residue, and my two harnesses added a handful more.
**Fix:** delete every account matching the test-email patterns (`e2e-`, `stress-`, `uistress-`,
`shot-`, `dur-`, `planday-`, `phase2-`, `atlas-verify-`) except your own. Do it *after* B2, since the
export path is the thing to sanity-check first.

---

## High — fix before it embarrasses you

### H1 · Offline renders a completely blank page
This is a PWA you intend to run from an iPhone home screen. Losing signal gives a white screen with
no explanation. Measured: `net::ERR_INTERNET_DISCONNECTED` → empty body.
**Fix:** a service-worker offline fallback route plus cache-first for the shell. The manifest and SW
registration already exist; only the fallback is missing.

### H2 · `email` and `password` have no maximum length
`z.string().email()` and `z.string().min(8)` with no `.max()`. A 100KB email is accepted and stored;
the body limit (1MB) is the only ceiling, and scrypt will happily derive over a 1MB input.
**Fix:** `.max(320)` on email (the RFC ceiling) and `.max(200)` on password, in
`packages/shared/src/dto/auth.ts`. One line each, and it closes a cheap CPU-exhaustion vector.

### H3 · Double-submit creates duplicate rows
Two rapid clicks on the task composer produced two identical tasks. `isPending` guards the button
visually but the second click lands before React re-renders.
**Fix:** disable on submit via the mutation's own `isPending` *and* guard the handler — the calendar
composer now does the latter; apply the same to tasks, habits, notes and journal.

### H4 · An invalid RRULE is accepted and silently does nothing
`recurrence: z.string().max(500)` is length-checked but never parsed. `FREQ=NONSENSE;;;` stores fine
and then never recurs, with no error anywhere.
**Fix:** refine the field with the existing `parseRrule` from `packages/shared`. Keep the
preserve-unknown-rules behaviour for Google round-trips, but reject input that parses to nothing when
it came from a client rather than a sync.

### H5 · Google Calendar token refresh and delete propagation are unverified live
Both are written but neither has been exercised against a real expired token or a real remote delete.
This is the single largest untested surface in the app.
**Fix:** force a token expiry (or wait one out), then run a sync; separately delete an event in
Google and confirm it disappears in Atlas. Until that is done, treat the integration as unproven.

### H6 · The Plaid webhook does not verify Plaid's signature
`POST /connectors/plaid/webhook` is public by necessity and currently accepts anything.
**Severity today is low** — it is a no-op that returns `{received:true}` — but it must not stay that
way once it triggers a sync. The code already carries a `DEFERRED` note saying so.
**Fix:** verify the `Plaid-Verification` JWT against `/webhook_verification_key/get` before the
handler does any work.

---

## Medium — quality gaps, none dangerous

| # | Finding | Fix |
|---|---|---|
| M1 | **Habits and notes have `PATCH` on the API but no UI** — the same gap just fixed for events. You cannot rename a habit or edit a note. | Add `update` to `HabitsApi`/`NotesApi` and wire an edit affordance, mirroring the calendar. |
| M2 | Journal is append-only end to end — no edit, no delete, at any layer. | Decide deliberately: append-only is defensible for a journal, but it should be a stated choice, not an omission. |
| M3 | `/tasks` search input is **19px tall**; `/notes` has an 18×18 checkbox. Both under the 24px AA minimum. | Raise to 24px minimum, 44px for the search field. |
| M4 | Zero-length and 365-day events are both accepted. | Not wrong, but a `0m` event is almost always a mistake — warn rather than block. |
| M5 | Duplicate habit names are allowed. | Warn on create if the name already exists; a hard constraint would be annoying. |
| M6 | Two workouts can be active at once. | `POST /fitness/workouts` should return the existing active workout instead of creating a second. |
| M7 | A zero-length routine block (`startMin === endMin`) passes validation. | Refine to require `startMin !== endMin`. |
| M8 | The embedding sweep runs in-process with no lock — two API replicas would both run it. | Harmless today (single instance); needs an advisory lock before B4's VPS move ever scales past one. |
| M9 | Times render without AM/PM under some locales (`0:30`, `3:00`), making morning and evening indistinguishable. | Pin `hour12` explicitly in `formatClock`, or follow a user setting. |
| M10 | The week strip runs Mon–Sun, so on a **Sunday** you see zero upcoming days. | Either roll the strip from today, or show "next event" in the empty state. Deliberate trade-off: fixed weeks match the routine model's Monday-based day bits, and one tap pages forward. |

---

## Corrections to my own findings

Two things my harness reported that turned out to be wrong. Recording them so they do not get
"fixed" later by someone trusting the raw output:

- **"No write rate limiting."** There *is* a global throttler — `ThrottlerModule` at 120 req/min,
  with auth tightened to 5/min (register) and 10/min (login). My burst of 40 was legitimately under
  the limit.
- **"A 100,000kg set is accepted."** The field is `weightGrams`, not `weightKg`, and it is already
  capped at 500,000g (500kg). My harness sent a field name that does not exist, so it was ignored.

---

## Suggested order

1. **B2** rotate Plaid, **B5** purge accounts — an hour, and B2 is time-sensitive.
2. **H2, H3, H4, M7** — validation and double-submit. All small, all in DTOs or handlers.
3. **B1** legal pages, **B3** Sentry — the two things that gate a second user.
4. **H1** offline fallback — the one most likely to be noticed on a phone.
5. **H5** verify Google live, **H6** Plaid webhook signature.
6. **B4** move to a VPS.
7. **M1–M10** as they annoy you.

Steps 1–3 are what stand between "works for Riley" and "another person can safely have an account".
