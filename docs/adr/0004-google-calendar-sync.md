# ADR 0004 — Google Calendar sync: two-way, Google wins, never delete remotely

**Status:** Accepted (2026-07-17) · **Context:** Phase 1 leftover / first real external connector · **Amends:** the `Connector` contract from ADR 0001

## Decision
- **Two-way sync, Google wins conflicts.** A pull overwrites the Atlas row. Atlas-authored events push once, then flip to `source='google-calendar'` + `externalId` and Google owns them thereafter.
- **Atlas never deletes from Google.** A local delete stays local. Only a deletion made in Google removes the Atlas row.
- **Reconciliation lives in the API module** (`GoogleSyncService`), not the connector. `Connector.sync()` is removed from the interface.
- **`ConnectorContext` gains `saveSecret()`** so OAuth connectors can persist refreshed tokens.
- **External ids are unique per user**, not globally.

## Why

**Google wins.** Google Calendar is where invitations, other people's edits, and every other client write land. Atlas is one of several writers; Google is the one everybody else shares. "Newest edit wins" sounds fairer but compares clocks across systems, and Google performs bulk/automatic updates (RSVPs, room changes) whose timestamps don't reflect user intent — letting Atlas clobber those on a timestamp race is worse than a simple, predictable rule. The cost of "Google wins" is that a local edit to a synced event is transient; that's acceptable and explained in the UI.

**Never delete remotely.** Deletion is the only irreversible operation here, and the blast radius is someone's real calendar — including events they don't own. No sync bug should be able to destroy that. The asymmetry is deliberate: imports and updates are recoverable by re-syncing; a deleted invite is not.

**Reconciliation outside the connector.** ADR 0001 says a connector plugs in an external API and never touches the DB — it only ever receives a `ConnectorContext` with `getSecret()`. The interface's optional `sync(ctx)` therefore couldn't do what its docs claimed (upsert into domain tables). Rather than punch a DB dependency through the connector layer, the owning module does reconciliation and the connector stays a pure API client. This also keeps the connector unit-testable with a stubbed `fetch`.

**`saveSecret()`.** OAuth access tokens expire (~1h). Refreshing is the connector's job (it knows the provider's token endpoint), but persisting is the host's (it owns the DB and the encryption key). `saveSecret()` is the minimum seam that keeps that split intact.

**Per-user external ids.** `@@unique([source, externalId])` was wrong: an external id is unique within an *account*, not globally. A calendar event shared between two Atlas users carries the same Google event id for both, so the second user's sync would collide with the first user's row — and an upsert would silently write across a tenant boundary. Now `@@unique([userId, source, externalId])`. Same fix applied pre-emptively to `Account`/`Transaction` (Phase 3, same pattern).

## Consequences / constraints
- A local edit to an already-synced event is overwritten on the next pull. Intended; surfaced in the Settings copy.
- Deleting an Atlas copy of a Google event doesn't remove it from Google, and it will be **re-imported** on the next sync. If users find that surprising, add an explicit "delete in Google too" action rather than making delete implicitly destructive.
- `access_type=offline` + `prompt=consent` are mandatory or Google returns no refresh token and sync breaks an hour after connecting. Refresh responses omit `refresh_token`, so the stored one is carried forward.
- Recurring events are expanded (`singleEvents=true`) into concrete instances rather than stored as RRULEs — Atlas never has to interpret recurrence, at the cost of row count.
- Sync is a manual button + a −30d/+365d window, capped at 50 pushes per run. No incremental `syncToken` yet; fine for one user, revisit if it gets slow.
- OAuth `state` is HMAC-signed with `SESSION_SECRET` and bound to the initiating user (10-min TTL) — stateless, so no table and no server affinity.
