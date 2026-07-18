# UI hardening plan — to commercial grade

**Status:** Phases 1–4 COMPLETE (2026-07-17). 1: decomposition + primitives + TanStack Query. 2: skeletons, empty states, toasts + global error policy, optimistic updates, client zod. 3: real routes, AppShell, mobile bottom tab bar. 4: measured-contrast fixes (`--text-on-accent` — white failed AA on brand/danger fills), h2 outline, systematic ARIA (named row actions, aria-pressed, input labels, chat role=log, aria-busy), 24px+ touch targets, viewport-fit=cover + full safe-area padding. Remaining: Phase 5 (PWA/perf), Phase 6 (brand/visual identity), cross-cutting UI tests (component + Playwright + axe).
Stack decisions locked — see "Decided stack" at the bottom.

Atlas's backend is at the commercial bar (multi-tenant, tested, secure, AI brain live). The **UI is not** — it's a working prototype. This plan takes it to a paid-SaaS standard without a rewrite: it's incremental, each phase ships independently, and nothing here blocks feature work.

When we start building, load the `ui-ux-pro-max` skill — it carries the design intelligence (styles, palettes, component patterns) this plan assumes.

---

## Honest current state (the starting line)

| Area | Today | Gap to commercial grade |
|---|---|---|
| **Structure** | One `apps/web/app/page.tsx`, **1,229 lines**, every panel inline | No components, no reuse, unmaintainable as it grows |
| **Data layer** | Raw `fetch` + `useState`/`useEffect` in every panel | Each panel hand-rolls loading/error/refetch; no cache, no invalidation, no retry, no optimistic updates |
| **Feedback** | Mutations are silent; errors are inline strings | No toasts, no success confirmation, inconsistent error UX |
| **Navigation** | Tab state in `useState` | Not URL-addressable — back button, refresh, and deep links all break |
| **Loading** | `"Loading…"` text | No skeletons; layout shifts as data arrives |
| **Empty/error states** | Bare text (`"No tasks yet"`) | No guidance, no illustration, no retry affordance |
| **Design system** | ~10 CSS vars, dark-only | No spacing/type scale, no light mode, no motion tokens, no elevation |
| **Icons** | Emoji (`✕ 🔥 📌`) | Inconsistent across platforms; not a brand |
| **A11y** | Some `aria-label`s | No focus management, no modal focus trap, no keyboard audit, contrast unverified, no reduced-motion |
| **Responsive** | `max-width: 720px`, wrapping button row | Not mobile-first for a PWA; touch targets/safe-areas unaddressed |
| **PWA** | Manifest + icon only | No service worker → no offline shell, no install UX (it's *sold* as a PWA) |
| **Tests** | None for UI | No component tests, no visual regression, no a11y assertions |

---

## Phase 1 — Foundations (unblocks everything else) ✅ DONE 2026-07-17

Highest leverage. Do this first or every later phase fights the monolith.

1. **Decompose `page.tsx`.** Split into `app/(dashboard)/` routes + `components/` (one file per panel: `TasksPanel`, `HabitsPanel`, … + shared primitives). Target: no file over ~200 lines.
2. **Adopt a data-fetching layer** (TanStack Query recommended — see decisions). Replaces the repeated `useState(loading)/useEffect(fetch)/setError` in every panel with `useQuery`/`useMutation`. Gets cache, background refetch, retry, and mutation invalidation for free, and makes optimistic updates a one-liner. This single change removes most of the boilerplate and inconsistency.
3. **Primitive components:** `Button`, `Input`, `Textarea`, `Card`, `Modal`/`Dialog` (with focus trap), `Toast`, `Skeleton`, `EmptyState`, `Spinner`, `Badge/Pill`. One source of truth for every interactive element.
4. **Formalize design tokens:** spacing scale, type scale, radii, elevation/shadows, motion (durations + easings), plus semantic color roles (`--surface`, `--surface-raised`, `--text-primary`, `--text-muted`, `--border`, `--danger`, `--success`, `--focus-ring`). Light **and** dark from day one.

**Exit:** every existing panel rebuilt on the primitives + data layer, behaviour identical, no file over ~200 lines.

## Phase 2 — Core UX polish (the "feel") ✅ DONE 2026-07-17

5. **Skeleton loaders** per panel (match the real layout so there's no shift).
6. **Real empty states** — each panel gets a purposeful empty state with a next action ("No habits yet — add one to start a streak").
7. **Consistent error UX** — a toast/inline pattern that distinguishes network vs validation vs auth (401 → bounce to login) errors, with retry where it makes sense.
8. **Optimistic updates** for high-frequency actions: task complete, habit check-in. The row responds instantly and rolls back on failure.
9. **Toasts for mutations** — success and failure. Right now saving a note or adding an event gives no confirmation.
10. **Form UX** — inline field validation (reuse the shared zod DTOs client-side), submitting/disabled states, Enter-to-submit / Esc-to-cancel, autofocus on open, no double-submit.

## Phase 3 — Navigation & structure ✅ DONE 2026-07-17

11. **URL routes** (Next App Router) replacing `useState` tabs — `/today`, `/habits`, `/calendar`, `/journal`, `/notes`, `/ai`, `/settings`. Deep-linkable, back button works, refresh keeps place.
12. **Mobile-first nav** — a bottom tab bar on mobile (it's a PWA), top nav on desktop, replacing the wrapping button row.
13. **App shell** — persistent responsive header (brand, user menu, sign-out), consistent page padding + safe-area insets.

## Phase 4 — Accessibility & responsive ✅ DONE 2026-07-17

14. **A11y pass** — focus-visible rings everywhere; focus trap + restore in modals; keyboard-operable everything; systematic ARIA; verified color contrast (the dark palette needs checking); `prefers-reduced-motion`.
15. **Responsive pass** — real breakpoints, ≥44px touch targets, tables/wide content scroll inside their own container, iOS safe-area handling.

## Phase 5 — PWA & performance

16. **Service worker** — offline app shell + cached GETs (`next-pwa` or a hand-rolled SW). It's marketed as installable; today it isn't offline-capable.
17. **Install UX** — a tasteful "Add to home screen" prompt (deferred `beforeinstallprompt`).
18. **Performance budget** — code-split panels, lazy-load the heavy ones (Atlas AI), font-loading strategy, and a Lighthouse target (≥90 PWA/Perf/A11y/Best-practices) wired into CI.

## Phase 6 — Brand & visual identity

19. **Icon set** — adopt Lucide (or similar); retire emoji from UI chrome.
20. **Visual identity** — logo/wordmark, a cohesive illustration style for empty states, purposeful micro-interactions (check animations, streak celebrations), motion that respects reduced-motion.
21. **Dark/light polish** — both themes fully designed, not just token-swapped, with a user toggle + system default.

## Cross-cutting — quality bar (do alongside, not after)

- **Component tests** for primitives + a **Playwright** happy-path per route, with **a11y assertions** (`@axe-core/playwright`). This is the "e2e per module" item already tracked as debt — the UI work is the natural place to land it. ✅ DONE 2026-07-17: Vitest+RTL component/hook suite (`apps/web/test/*`) + Playwright/axe e2e (`apps/web/e2e/*`) on a pgvector CI job. Coverage is core-route breadth only so far — extend to the remaining panels as they change.
- **Storybook** (optional) for the primitives, so the design system is browsable and reviewable in isolation.

---

## Suggested sequencing

Phase 1 is the prerequisite for everything. After that, **Phase 2 delivers the most visible "this feels like a product" jump for the least work** — do it before Phase 3. Phases 4–6 can interleave. Ship each phase as its own PR so CI + review stay tractable.

Rough order of impact-per-effort: **1 → 2 → 3 → 4 → 5 → 6**, with the quality-bar items riding along from Phase 1.

---

## Decided stack (locked 2026-07-17)

1. **Data layer: TanStack Query.** Erases per-panel loading/error/refetch boilerplate; makes optimistic updates + cache invalidation trivial.
2. **Styling: evolve the current CSS-variable system into a full token set.** No Tailwind, no component library. Keeps churn low and the bundle lean.
3. **Primitives: build our own, on Radix for the fiddly ones.** Radix (unstyled, accessible) for `Dialog`, dropdowns, focus management; hand-rolled CSS for the trivial ones (`Button`, `Card`, `Input`). Accessibility for free where it's hard, no design-system lock-in.
4. **Icons: Lucide.** Replaces emoji in UI chrome; tree-shakeable.
5. **Theme: dark-only for now.** Build the token layer theme-ready (semantic roles, not raw hex) so light mode is a later token pass, not a rewrite — but don't design/ship light in Phase 1.

Dependencies to add (Phase 1): `@tanstack/react-query`, `@radix-ui/react-dialog` (+ other Radix primitives as needed), `lucide-react`.
