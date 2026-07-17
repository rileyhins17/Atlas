# Adding a connector (external API key)

A "connector" is Atlas's plug for one external service (Google Calendar, a bank feed, OpenRouter, weather …). Reference implementation: `packages/connectors/src/openrouter.ts`.

## Contract (`packages/connectors/src/connector.ts`)
Implement `Connector`:
- `id`, `label`, `capabilities` (tags like `["calendar.read","calendar.write"]`)
- `credentialSchema` — a zod schema for the secret payload (e.g. `{ apiKey }` or OAuth `{ accessToken, refreshToken, expiresAt }`)
- `verify(ctx)` — check the stored credential works
- optional `sync(ctx)` — pull external data into Atlas domain tables

A connector **never** touches the DB or the encryption key. It receives a `ConnectorContext` with `getSecret()` that returns the decrypted payload on demand.

## Steps
1. Create `packages/connectors/src/<name>.ts` implementing `Connector`; export it from `packages/connectors/src/index.ts`.
2. Register it in `apps/api/src/core/connectors.service.ts` (constructor, like `openrouter`).
3. Store credentials with `ConnectorsService.saveCredential(userId, '<id>', secret, { meta })` — it AES-256-GCM encrypts before writing to the `credentials` table. Retrieve a bound context with `ConnectorsService.contextFor(userId, '<id>')`.
4. For OAuth connectors (Google Calendar): add controller routes for the OAuth redirect + callback; on callback exchange the code and `saveCredential` the tokens; store non-secret info (scopes, account email) in `meta`.
5. If the connector imports data, write a `sync(ctx)` that upserts into the domain table (use `externalId` + `source` unique keys already in the schema) and writes a `TimelineEvent` per change.

## Notes
- OpenRouter doubles as the AI provider: besides the `Connector` methods it exposes `chat()`. Production AI calls must go through `CostGuard` in `@atlas/ai` (assert cap → chat → record usage), never call `chat()` directly.
- "Tons of API keys" = rows in `credentials`, managed from a Settings screen (Phase 2+). One connector can have multiple credentials via `label`.
