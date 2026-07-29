# Atlas — the commercial master plan

Written 28 July 2026, from a full audit rather than impressions. Every claim
here is either measured or marked as an assumption.

---

## 0. A warning about audits, including this one

Three things I confidently reported as missing in earlier passes turned out to
exist:

- **The weekly review** was "generated and displayed nowhere". It has always
  rendered on Progress. My grep searched the endpoint name; the code filters on
  the kind string.
- **Search** was "the biggest actual absence". A full search module exists,
  spans tasks/notes/events/goals/journal, and is wired into ⌘K.
- A follow-up "bug" where search returned no result type was **my probe reading
  the wrong field** (`domain`, not `type`).

The pattern: I audited by grepping for names instead of running the thing. The
correction rate matters, because a plan built on a wrong audit wastes the
scarcest resource here, which is your time. **Everything below was checked by
running it.** Where I could not check, it says so.

---

## 1. What Atlas actually is today

Measured: 34,000 lines, 16 API modules, 18 routes, 15 migrations, 494 unit
tests, 30 e2e, CI green.

**Working and verified live:** four-section navigation · capture that writes to
any domain from one sentence · AI create/edit/delete across tasks, calendar,
habits, notes, goals and your working week, every write reversible · goals split
short/long term · training with saved days, lb/kg, finish summary, strength
trend on estimated 1RM · recurrence · Google Calendar two-way sync · Plaid on
production credentials · cross-domain search · daily brief and weekly review ·
privacy policy and terms · a watchdog that restarts the stack when the PC sleeps.

**Verified secure:** 172-assertion API pass, zero hard failures. User B cannot
reach user A's data by any route tried, across every domain including the new
ones. Search is inert against SQL- and regex-shaped input.

This is not a prototype. It is a working product with an unusually good
engineering floor for a solo build. That is precisely why the remaining gaps are
worth naming bluntly: the code is not the problem.

---

## 2. The commercial problem, stated plainly

**Nobody can buy this.** Not "billing is unimplemented" — there is no path at all
from a stranger wanting Atlas to Atlas having their money. Invite-only sign-up,
no pricing page, no checkout, and it runs on your desktop, so every customer's
data lives or dies with your PC being awake. That is the entire commercial
story right now, and no amount of feature work changes it.

**The thing that would justify buying it is invisible.** Atlas's pitch is that
the silos become one graph — nothing else knows your sleep schedule, your
training volume and your overdue tasks at once. That is true of the data model
and false of the interface. Progress shows per-domain statistics side by side.
Nothing on any screen ever connects two domains. A visitor sees a competent
todo-plus-calendar-plus-gym app, which is a category with Notion, Todoist,
Sunsama, Motion and Reclaim already in it, all better funded.

**You are flying blind.** No analytics, so you cannot tell whether anyone opens
it twice. `SENTRY_DSN` is unset, so when it breaks for someone else you find out
if they tell you. For a product you intend to sell, not knowing when it breaks
is worse than most bugs.

---

## 3. The plan

Four phases. Each is defined by what becomes **true** at the end, not by a task
list, and each is ordered so the next one is worth doing.

### Phase 1 — Make it real infrastructure (≈1 week)

*Ends when: Atlas survives your laptop being closed, and you learn about
failures before your users do.*

1. **Move to a VPS.** `docker compose --profile full up -d` plus one DNS change;
   the path is already written in `docs/ship-to-iphone.md`. Until this happens,
   nothing else in this plan is worth starting — you cannot sell software that
   is down when you go on holiday.
2. **Paste a `SENTRY_DSN`.** The wiring is done and reports every 5xx with the
   same request id the user is shown. One line of `.env`.
3. **Rotate the Plaid production secret.** It is in a chat transcript.
4. **Add product analytics** (Plausible or PostHog, self-hostable). Three events
   are enough to start: signed up, completed onboarding, came back on day 2.
   Without day-2 retention you are guessing about everything below.
5. **Verify Google token refresh against a genuinely expired token.** It is the
   largest untested surface in the app and it fails silently.

### Phase 2 — Make the difference visible (≈2 weeks)

*Ends when: someone can see, in one screen, something no other app could have
told them.*

This is the phase that decides whether Atlas is a business or a nice personal
tool. Everything here exists to make the graph felt.

1. **The connection card.** One card on Today that states a real cross-domain
   observation: *"You slept under 6 hours on 4 of the 5 days you skipped the
   gym."* Rules first, not the model — a handful of hand-written correlations
   over data you already store, so it is instant, free and never hallucinates.
   Show nothing when the data is thin; the existing honesty guardrail already
   does this well and it is a genuine differentiator.
2. **Link tasks to goals in the UI.** `Task.goalId` exists and the API accepts
   it, but nothing lets you set it, so every goal reads "nothing linked yet"
   forever and the progress bar is structurally unable to fill. This is the one
   place Atlas already models a cross-domain relationship and it is unreachable.
3. **A weekly ritual, not a weekly artifact.** The weekly review generates and
   renders. Turn it into something you *do*: what slipped, what to drop, what to
   move — with buttons that act. Reviews you read change nothing; reviews you
   act on create the habit that makes a subscription stick.
4. **Render the undo strip.** Every AI write already returns a server-built
   inverse and the capture toast now uses it — but a running "what Atlas changed
   today" list is what makes people trust an AI with delete permission.

### Phase 3 — Make it sellable (≈2 weeks)

*Ends when: a stranger can find Atlas, understand it, sign up and pay, without
you involved.*

1. **Import.** Export exists; nothing comes in. Todoist and Google Tasks for
   tasks, a CSV for anything else. Every user you want already has their life in
   another tool, and "start from an empty app" is the most common reason a
   trial dies on day one.
2. **Fix the cold start.** A new account is empty and, without an API key, the
   AI is silent. The key now has an onboarding step — go further: seed a
   demonstrable first day so the first screen shows Atlas doing something rather
   than an empty state explaining what it would do.
3. **Billing.** Stripe Checkout, one plan, a real trial. Deliberately last in
   this phase: charge for the moment in Phase 2, not for the feature list.
4. **Open sign-up** behind the existing invite gate as a switch, with the legal
   pages already in place.

### Phase 4 — Earn the second month (ongoing)

*Ends when: retention is a number you watch, not a hope.*

Proactive notifications that are worth receiving (the push and proactive
engines are built and wired) · the mobile PWA install path · per-domain depth
driven by where analytics say people actually spend time.

---

## 4. What NOT to build

Discipline here matters more than the plan.

- **Not more domains.** Seven is already more than most people will adopt. An
  eighth adds surface, not value.
- **Not collaboration or sharing.** It doubles the security surface and Atlas's
  premise is singular and personal.
- **Not a native app.** The PWA installs. A store presence buys nothing until
  people are paying.
- **Not your own AI billing.** BYO key is a genuine feature: it keeps your
  margins clean and your privacy story honest. Say so on the pricing page.
- **Not a UI rewrite.** The four-section navigation is good. Leave it.

---

## 5. The honest risk

The hard part is not engineering. Atlas is better built than most funded
products at this stage. The risk is that "one app for your whole life" is a
category where users must abandon several tools at once, and almost nobody
does — which is why the connection card in Phase 2 is the crux of the whole
plan. If Atlas cannot regularly tell you something no single-purpose app could,
it is competing on breadth against companies with more engineers than you have
users, and breadth is the one axis where that fight is unwinnable.

If Phase 2 lands and the observations are genuinely good, everything else is
execution. If it lands and they feel obvious, that is worth knowing before
building a billing system — and it is the cheapest phase here.
