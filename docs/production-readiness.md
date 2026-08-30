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

## Found and fixed since, by running it

Three defects that a green build said nothing about. Recording them because each one is a *class* of
mistake this project keeps making, not a one-off.

| # | Issue | Root cause |
|---|---|---|
| G1 | **A transient network error put the first-run setup wizard over an established account's day** | The gate asked `(data?.length ?? 0) === 0` as soon as the four list queries stopped being *pending*. A failed query leaves `data` undefined, which `?? 0` cannot tell apart from an empty account. The wizard's job is to WRITE a routine, so the path offered after a dropped request was one that overwrites the working week you already had. Now gated on `isSuccess`. |
| G2 | **`/manifest.webmanifest` returned 500, so the PWA had no installable manifest** | Two files claimed the URL — the Phase 0 `app/manifest.ts` scaffold and the later, iOS-ready `public/manifest.webmanifest`. Next answers a public/page conflict with a hard 500 in dev, and prerendered the route alongside the static file in a build. The scaffold is deleted. |
| G3 | **Selecting today in the week strip failed AA at 4.43:1** | `--brand` text on a 10% tint of `--brand`. The exact trap CLAUDE.md documents, returned on a new surface. |
| G6 | **Paging to "tomorrow" did nothing on the autumn DST day** | Three places stepped a day with `+ 86_400_000`. A local day is not always 24 hours: measured in America/Toronto, 1 Nov 2026 00:00 plus a fixed day is 1 Nov **23:00** — the same date. So Today's pager sat still, `DayPager` labelled two consecutive days "Today", and `useDayEvents` asked for a 24-hour window on a 25-hour day, dropping that day's last hour of events. Spring is the mirror image: the anchor overshoots to 01:00 and the canvas starts an hour late. All three now use calendar arithmetic (`addDays`, `setDate`-based), which lives in `lib/dates.ts` as the single implementation. |
| G5 | **`PATCH /events/:id` could reverse an event, and the calendar hid it** | `CreateEventInput` refines `endAt >= startAt`; `UpdateEventInput` had no refinement and `CalendarService.update` passed the body straight to Prisma. Nothing crashed, which is why it lasted: `placeDayEvents` guards against a negative height by clamping the end to midnight, so a reversed event renders as running from its start to the end of the day — swallowing the rest of the calendar and squashing every later event into a narrow column. Fixed in both layers, because they fail differently: the DTO can only judge a patch carrying BOTH ends, and a patch moving ONE end past the stored other has to be checked against the row. |
| G4 | **An open goal's check button was 16×6px and had no circle drawn at all** | The base box (`width`/`height`/`border`/`border-radius`) was written as `.goal-row.done .goal-check`, so it only applied once the goal was *achieved*. The primary action on the page was an unstyled 6-pixel-tall sliver until after you had used it — and being invisible rather than merely small is why no scan and no screenshot pass had flagged it. |

**G1 is the one to learn from.** It is invisible on a fast, healthy local API and appears under
exactly the conditions a real user meets — a slow phone, a 429 from the 120/min throttler, an API
restart. It took ~5s of retries to appear, so the first regression spec written for it *passed
against the bug*: it asserted at t+2s, while the queries were still pending and the gate was
correctly false either way. A regression test that has not been watched to fail is not evidence.

---

## Blockers

### ~~B1 · No privacy policy or terms of service~~ — DONE
`/privacy` and `/terms` are live: static server components, no client JS, linked from the landing
footer, the sign-up form and the sitemap. The privacy policy states plainly that AI features send a
summary of your data to DeepSeek, which is the disclosure Google's OAuth review will look for.
**Still yours to do:** have a lawyer read both before you charge anyone money. They are written to be
accurate, not to be a substitute for advice.

### B2 · Rotate the Plaid production secret — **REQUIRES YOU**
It was pasted into a chat transcript. Assume it is compromised.
This is the one item on the list nobody can do on your behalf: rotating a production credential means
signing into the Plaid dashboard and generating a new secret. Paste the replacement into `.env` as
`PLAID_SECRET` and restart the API. Do it before Plaid production is switched on, not after.

### ~~B3 · No error tracking~~ — DONE, needs a DSN
`@sentry/node` is wired into `AllExceptionsFilter`, reporting every 5xx with the same `requestId` the
client is shown — so a user saying "it broke, here's the code" maps straight to a stack trace. The
session cookie and Authorization header are stripped before anything leaves the process.
**Inert until you set `SENTRY_DSN`.** Create a free Node project at sentry.io, paste the DSN into
`.env`, restart. The API logs which mode it is in on boot.

### B4 · The app runs on your PC
It must be awake and logged in. Fine for one tester; not somewhere another person's data should live.
**Fix:** `docker compose --profile full up -d` on a VPS plus one DNS change — the path is already
written up in `docs/ship-to-iphone.md`.

### ~~B5 · ~350 junk accounts~~ — DONE
440 accounts → **3**. 437 test accounts deleted by email domain (an allowlist, not a prefix rule).
Two things the dry run caught that a pattern-match would have destroyed:
- `phase2-test@example.com` matched a test prefix but held **the only live Google Calendar
  connection**. That credential was moved to `rileyhinsperger16@gmail.com` before the purge, and now
  decrypts there (the AES key is global, not per-user, so the row moves cleanly).
- **`aidanmageebusiness@gmail.com` is a real third account** with its own DeepSeek key, habits and
  notes. It was kept. If that is not someone you meant to have access, that is worth knowing.

---

## High — fix before it embarrasses you

### ~~H1 · Offline renders a completely blank page~~ — DONE, and now tested
`sw.js` precaches `/offline.html` and answers a failed navigation with it. **Verified live against a
production build** (the SW is a deliberate no-op outside it): the worker activates, the cache holds
`/offline.html`, and `/today` with the network cut renders "You're offline" and a Retry button
instead of an empty page.

It had been fixed for a while and this file still said it was open — the shell existed and nothing
asserted it, which is how it stayed uncertain. There is an e2e spec now. It registers `sw.js` itself
rather than waiting for `ServiceWorkerRegistrar`, so it runs against dev and built alike, and it
lives in its own browser context so a service worker cannot outlive it and sit in front of the rest
of the suite. It also asserts the offline page LETS GO when the network returns, which is the
failure mode `sw.js`'s own header records: it once served that page to online users by following the
Google OAuth callback's redirect.

### ~~H2 · `email` and `password` have no maximum length~~ — DONE
Now `.max(320)` on email (the RFC 5321 ceiling) and `.max(200)` on password. Verified live: a 100KB
email and a 100KB password both return 400 at the boundary instead of reaching scrypt.

### ~~H3 · Double-submit creates duplicate rows~~ — DONE
`isPending` was never enough — it only flips true *after* a render, so two clicks in the same frame
both read `false`. `useSubmitLatch` closes a ref synchronously and reopens on `onSettled`. Applied to
tasks (both composers), habits, notes, journal and the calendar.

### ~~H4 · An invalid RRULE is accepted and silently does nothing~~ — DONE
`RruleString` refines the field through the existing `parseRrule`, so `FREQ=NONSENSE;;;` is now
rejected instead of being stored and silently never recurring. Safe because Google sync writes
through Prisma directly and never through these DTOs — the preserve-unknown-rules guarantee for syncs
is untouched.

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
| ~~M1~~ | ~~Habits and notes have `PATCH` on the API but no UI.~~ **HABITS DONE** — the name opens an edit Dialog (name, times-per-day, cadence), mirroring the calendar. **Notes still open**, and deliberately so: notes share the writing surface with journal entries, journal has no update at *any* layer (see M2), so an edit affordance on half the rows is a product decision rather than a missing client method. Decide M2 first. | — |
| ~~M2~~ | ~~Journal is append-only end to end.~~ **DECIDED — it is not.** Journal gained `PATCH /journal/:id` and both halves of the writing surface are editable in place, because having notes correctable and yesterday's entry not was an inconsistency with nothing on screen to explain it. Delete is still deliberately absent: an edit leaves a trail (`journal.updated` on the timeline), a delete would not. **This closes M1's remaining half too.** |
| ~~M3~~ | ~~`/tasks` search input is 19px tall; `/notes` has an 18×18 checkbox.~~ **DONE** — both were already fixed, but a sweep of *every* interactive control on all thirteen routes at 390px found four others that were not: the goals check at **16×6** (see G4), the goal title at 19px, the habit name at 21px, and "Track a habit" — the only thing to tap on an empty Today — at 16px. All now clear 24px, and the phone-width spec measures it on every route so the next one cannot ship quietly. | — |
| M4 | Zero-length and 365-day events are both accepted. **Partly addressed:** the worse case turned out to be a REVERSED event, which `create` had always refused and `update` did not — see G5. Zero-length is left legal on purpose: a reminder pinned to an instant is a real thing, and `create` has always allowed it. | The remaining half is cosmetic — warn on a `0m` duration in the composer. |
| ~~M5~~ | ~~Duplicate habit names are allowed.~~ **DONE** — the first Add on a name you already track warns and creates nothing; pressing Add again on the *same* name goes through. Deliberately not a constraint: two habits called "Stretch" is usually a slip of memory but sometimes on purpose (morning/evening), and a warning you cannot override is a block wearing different clothes. Case-insensitive, and editing the box clears the warning so a stale one cannot swallow the next legitimate submit. | — |
| ~~M6~~ | ~~Two workouts can be active at once.~~ **Already fixed** — `FitnessService.start` returns the open session rather than creating a second. Confirmed against the running API: two consecutive `POST /fitness/workouts` return the same id. | — |
| ~~M7~~ | ~~A zero-length routine block passes validation.~~ **DONE** — rejected now, while a block that wraps past midnight (sleep) still works, and a patch moving one end at a time is still allowed. | — |
| M8 | The embedding sweep runs in-process with no lock — two API replicas would both run it. | Harmless today (single instance); needs an advisory lock before B4's VPS move ever scales past one. |
| ~~M9~~ | ~~Times render without AM/PM under some locales, making morning and evening indistinguishable.~~ **NOT A BUG — do not "fix" this.** The `0:30`/`3:00` in the original finding is a 24-hour clock, and it is unambiguous: under `en-GB`/`de-DE`/`fr-FR`/`ja-JP` the same formatter renders 3pm as `15:00` and 9:45pm as `21:45`, so nothing collides. Measured across seven locales. Pinning `hour12: true` would make it **worse** — it would force a 12-hour clock on every user whose locale is 24-hour. `formatClock` following the locale is correct; a user-facing preference would be a feature, not a fix. |
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

## What is left

1. **B2** rotate the Plaid secret — **yours to do**, and the only item nobody else can.
2. Paste a **`SENTRY_DSN`** into `.env` so B3 actually reports. One line, then restart.
3. **H5** verify Google live, **H6** Plaid webhook signature.
4. **B4** move to a VPS.
5. ~~**M2** decide whether journal is append-only~~ — decided, and **M1** is closed with it.
6. **M3–M10** as they annoy you.

Everything in steps 1–3 of the original order is done except B2, which needs your Plaid login, and
the DSN paste. A second person can now have an account without that being reckless — legal pages
exist, errors are reportable, isolation is proven, and the input bounds that were open are closed.
