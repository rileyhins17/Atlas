# ADR 0005 — Finance domain + Plaid connector (Canadian banks), pull-only

**Status:** Accepted (2026-07-19) · **Context:** Phase 3 — money as a life-domain · **Builds on:** the `Connector`/`DomainModule` contracts (ADR 0001) and the sync split (ADR 0004)

## Decision
- **A provider-agnostic `finance` domain** (`apps/api/src/modules/finance`) owns accounts + transactions, writes the timeline, and feeds the AI a balances/cash-flow summary. It knows nothing about Plaid.
- **Plaid is the first aggregator**, behind a `PlaidConnector` (`packages/connectors`, raw `fetch`, no `plaid` SDK). A future Flinks/Salt Edge connector drops in without touching the domain.
- **Pull-only.** Bank data flows bank → Atlas and never back. There is no push half; Atlas never writes to a bank.
- **One linked bank ("item") = one `credentials` row** keyed by `label = itemId`, so a user can link several banks. The sync **cursor** + institution/mask live in that credential's `meta`.
- **Reconciliation in the module** (`PlaidSyncService`), not the connector — same rule as ADR 0004.
- **AI reads money, does not move it.** `finance` exposes `aiContext` but **no tool specs**. No model-initiated financial writes for now.

## Why
**Plaid over Flinks/Salt Edge.** Canada has no consumer bank APIs (open banking legislated, not live), so an aggregator is the only path to RBC/TD/Scotia/BMO/CIBC/Tangerine. Flinks has the deepest Canadian coverage but is enterprise-only (no self-serve, no free dev tier). Plaid is the only aggregator with Canadian coverage **and** a free, self-serve sandbox → production path — you can build and verify without talking to sales. Salt Edge is the documented backup.

**Provider-agnostic domain.** The value (a money domain the AI reads, on the unified timeline) is independent of who supplies the data. Binding the domain to Plaid's shapes would make a later switch a rewrite. The connector boundary already exists (ADR 0001); finance just uses it.

**Pull-only.** Unlike a calendar, there is no meaningful "write back to the bank." Removing the push half removes the entire class of "Atlas corrupted my bank record" risks for free.

**Item = credential (by label).** The `credentials.label` column exists precisely so a user can hold more than one of the same connector. Plaid issues one access token per linked institution; mapping item→credential(label) is the natural fit and keeps multi-bank support free. The cursor belongs in `meta` because it is non-secret sync state, not a credential.

**No AI write tools.** A model writing financial records (wrong amount, wrong sign, hallucinated merchant) is a materially worse failure than a wrong task. Reading balances to reason ("can I afford X?") is safe and useful; writing is deferred until there's a reason and a guardrail.

## Consequences / constraints
- **Sign convention is load-bearing.** Plaid `amount` is **positive = money out**; Atlas `amountMinor` is **negative = money out**. `plaidAmountToMinor` inverts it. Get it wrong and every expense looks like income. Unit-tested both directions.
- **Sandbox first.** All code is env-driven (`PLAID_ENV`); nothing is sandbox-specific. Verifying end-to-end needs only sandbox keys — `sandbox/public_token/create` drives the whole exchange→sync path with no human and no real bank. Production (real Canadian bank) is a config flip + Plaid's production approval + a registered `PLAID_REDIRECT_URI` for OAuth banks.
- **Incremental sync via `/transactions/sync` cursor.** A fresh item can answer `PRODUCT_NOT_READY`; the sync catches it, records a soft error, and succeeds on the next run.
- **Plaid "wins" on modified transactions** (overwrites the Atlas row), mirroring the calendar rule. A user's manual category edit on a Plaid-sourced transaction can be overwritten on a later modify event — acceptable for now.
- **Webhook is deferred.** `POST /connectors/plaid/webhook` exists but is a no-op acknowledger: it must verify Plaid's JWT before it is allowed to trigger a sync, and it's unreachable on localhost anyway. Manual "Sync now" is the live path (same UX as Google).
- **Additive migration only** — `accounts.mask/institution`, `transactions.pending/merchantName`, all nullable. Applied via `migrate deploy` (not `migrate dev`) because the Neon dev DB's Neon-managed `pg_session_jwt` extension trips `migrate dev`'s drift check into a destructive reset (see GOTCHAS).
