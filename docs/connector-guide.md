# Adding a connector (external API key)

A "connector" is Atlas's plug for one external service **that needs a credential** (Google Calendar, a bank feed, DeepSeek, weather …). Reference implementation: `packages/connectors/src/deepseek.ts`.

If a capability needs no secret and no external call, it is **not** a connector — e.g. embeddings run on a local in-process model (`LocalEmbedder` in `packages/ai`), so they live in the AI package, not here.

## Contract (`packages/connectors/src/connector.ts`)
Implement `Connector`:
- `id`, `label`, `capabilities` (tags like `["calendar.read","calendar.write"]`)
- `credentialSchema` — a zod schema for the secret payload (e.g. `{ apiKey }` or OAuth `{ accessToken, refreshToken, expiresAt }`)
- `verify(ctx)` — check the stored credential works
- optional `sync(ctx)` — pull external data into Atlas domain tables

A connector **never** touches the DB or the encryption key. It receives a `ConnectorContext` with `getSecret()` that returns the decrypted payload on demand.

## Steps
1. Create `packages/connectors/src/<name>.ts` implementing `Connector`; export it from `packages/connectors/src/index.ts`.
2. Register it in `apps/api/src/core/connectors.service.ts` (constructor, like `deepseek`).
3. Store credentials with `ConnectorsService.saveCredential(userId, '<id>', secret, { meta })` — it AES-256-GCM encrypts before writing to the `credentials` table. Retrieve a bound context with `ConnectorsService.contextFor(userId, '<id>')`.
4. For OAuth connectors (Google Calendar): add controller routes for the OAuth redirect + callback; on callback exchange the code and `saveCredential` the tokens; store non-secret info (scopes, account email) in `meta`.
5. If the connector imports data, write a `sync(ctx)` that upserts into the domain table (use `externalId` + `source` unique keys already in the schema) and writes a `TimelineEvent` per change.

## Notes
- DeepSeek doubles as the AI provider: besides the `Connector` methods it exposes `chat()`. Production AI calls must go through `CostGuard` in `@atlas/ai` (assert cap → chat → record usage), never call `chat()` directly.
- Configure AI providers with a **concrete model id**, never a convenience alias — the API resolves aliases server-side and echoes back the real id, which is what `CostGuard` prices against. An id missing from `MODEL_RATES` silently bills at the fallback rate. Add the rate when you add the model, including its cached-input rate if the provider has a prompt cache.
- "Tons of API keys" = rows in `credentials`, managed from a Settings screen (Phase 2+). One connector can have multiple credentials via `label`.
