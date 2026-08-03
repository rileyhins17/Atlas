# Atlas — a design audit

Written 3 August 2026. Everything numeric here was **measured by driving the
app**, not estimated. Where I am giving an opinion rather than a measurement, it
says so.

---

## 0. The one-line diagnosis

**Atlas is a very good tool that has not decided what it is for.**

Every screen is competent. The engineering is better than most funded products
at this stage. But a new person opening it cannot answer "what is this *for*,
and what do I do first?" — because the interface answers "everything, anywhere,
in any order". That is not a polish problem and it will not be fixed by
restyling anything.

---

## 1. What I measured

Interactive controls visible on a 390px phone, on a real account:

| Screen | Controls | Words | Headings |
|---|---|---|---|
| /today | 25 | 105 | 4 |
| /tasks | 29 | 35 | 2 |
| /calendar | 30 | 63 | 1 |
| /goals | 20 | 36 | 1 |
| /habits | 19 | 29 | 1 |
| /journal | 24 | 31 | 1 |
| /notes | 21 | 35 | 1 |
| /fitness | 26 | 116 | 2 |
| /finance | 14 | 69 | 1 |
| /progress | 20 | 110 | 7 |
| /history | 26 | 25 | 2 |
| /settings | 23 | 97 | 2 |

**The flat line is the finding.** Every screen in the app presents between 19
and 30 controls. There is no calm screen and no dense screen — there is one
density, applied everywhere. Nothing in the interface says "this is the
important one", because visually nothing is.

For contrast, the products this is competing with have a deliberate range:
their home is sparse and their settings are dense. Atlas's home has 25 controls
and its settings have 23.

**Words are low and controls are high.** 25–116 words per screen against ~25
controls. That is the signature of a tool for someone who already knows the
system — not of a product that teaches you what it is while you use it.

---

## 2. Structural findings

### 2.1 There are three navigations running at once

1. **Section nav** — Today · Plan · Life · Money
2. **Tab strip** inside each section — up to four more
3. **Sidebar** on desktop, listing destinations again

Plus ⌘\ to collapse the sidebar. A person's mental model has to hold "which
section, then which tab", and the sidebar contradicts that by presenting the
leaves directly.

The four-section grouping was the right instinct — eleven peers was worse. But
the tab strip re-introduces the eleven, one layer down, and the sidebar
re-introduces them a third time.

### 2.2 There are four ways to talk to the AI

Measured — four separate user-facing surfaces:

- the **capture dock**, on every page
- the **⌘K command bar**, which also captures
- the **⌘J chat rail**
- the **asks bell**, where Atlas queues its own questions

Three of those four accept a sentence and file it. A new user cannot know which
one is "the" way, so the honest answer is that Atlas has no primary interface —
it has four secondary ones.

### 2.3 The same object is created in four places

A task can be created from: the tasks page, the capture dock, the command bar,
and a goal row. That is not automatically wrong — quick-add next to the list is
normal — but combined with 2.2 it means the first question a user asks
("where do I put this?") has four correct answers and no obvious one.

### 2.4 The first thing a new account meets is an eight-step wizard

`welcome → sleep → week → about → goals → context → habits → ai`

Eight steps before the product has demonstrated anything. It is skippable and
it is well built, but it asks for a meaningful amount of personal information
*before* delivering a single moment of value. Every step is a place to leave.

### 2.5 Section names describe the app's model, not the user's

"Plan", "Life", "Money", "Today" are the *architecture's* categories. Asked
cold, most people cannot place:

- a workout → Life
- a goal → Plan
- yesterday's spending → Money
- "what did I do last Tuesday" → Today (History)

Journal and Notes sit side by side under Life and are near-indistinguishable
from the outside — one is dated, one is not, and nothing on either page says so.

### 2.6 "Money" is a section with one page

The Money section contains exactly one tab. It is a top-level destination — a
quarter of the primary navigation — for a single screen that is, right now,
mostly a connect-your-bank prompt.

### 2.7 The premise is never stated inside the product

The landing page says it plainly: *"One graph, not seven apps… that is what
lets it notice the weeks you skip the gym are the weeks you sleep worse."*

Nothing inside the app says this. The connection card (new this week) is the
first and only place the product demonstrates it, and it needs a fortnight of
data before it can speak. Between signup and that moment, Atlas presents as
seven ordinary tools sharing a login.

### 2.8 Progress is a dashboard, and dashboards get read once

Seven headings, 110 words, no action on the page except the range chips and the
new decisions block. Charts answer "how am I doing" — a question people ask
about twice, then stop.

---

## 3. What I think is actually wrong (opinion, clearly labelled)

The app is organised **by data type**, and people do not experience their lives
as data types. Tasks, events, habits, journal entries, notes, workouts and
transactions are *Atlas's* nouns. A user's nouns are "today", "this week",
"this thing I'm trying to do", and "how am I doing".

Atlas already has three of those four — Today, Goals, Progress — but they are
peers of the data types rather than the frame around them. The result is that
the app's own best idea (one graph) is expressed as a *menu of seven silos*,
which is exactly the thing it says it is replacing.

**The strongest single move available:** make the seven domains stop being
destinations. They become where data lives, not where the user goes. The user
goes to Today (what now), a goal (what for), and Progress (how did it go).

That is a real product decision with real losses, which is why the rest of this
document is questions rather than a plan.

---

## 4. Smaller things worth fixing regardless

- **Journal vs Notes** — either merge, or state the difference on each page in
  one line.
- **The tab strip and the sidebar disagree.** Pick one as authoritative.
- **/history and /progress overlap** — both are "the past", one as a feed and
  one as charts, in the same section.
- **The capture dock is on every screen including the ones with their own
  add-field**, so /tasks has two places to type a task, ten centimetres apart.
- **Nothing onboards the ambient AI.** ⌘K and ⌘J are never mentioned in the
  product; a phone user has no keyboard shortcut at all and may never find the
  chat rail.
- **Settings holds "Your week"**, which is the single input that makes Today's
  free-time calculation correct — buried in the least-visited screen.

---

## 5. What is genuinely good and should not be touched

Stated because an audit that only lists faults gives a false picture:

- The **capture dock** is the best idea in the product. One box, any domain,
  plain language, undoable.
- The **honesty guardrails** — "too early to say" instead of an invented trend —
  are a real differentiator and rare.
- **Undo on every AI write**, now visible in a strip.
- The **connection card** premise.
- **Free-time awareness from a declared routine** rather than an empty calendar.
- Export, delete-for-real, BYO key. The privacy story is coherent and true.
