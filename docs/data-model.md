# Data model

Source of truth: `packages/db/prisma/schema.prisma`. All tables belong to a `User` (single-user today, multi-user ready). `type`/`kind`/`source` fields are Strings (not enums) wherever a future module might add values, so new modules never migrate shared tables.

## Tables
**Identity/auth**
- `users` — account (email, scrypt `passwordHash`, timezone).
- `sessions` — server-side sessions; stores `tokenHash` (sha256); raw token lives only in the `atlas_session` cookie.

**Secrets**
- `credentials` — per-connector encrypted secret (`dataEnc`, AES-256-GCM) + non-secret `meta`. Unique `(userId, connector, label)`.

**Domains**
- `tasks` — title, status (enum TODO/IN_PROGRESS/DONE/ARCHIVED), priority (enum), dueAt, tags[], optional `goalId`.
- `events` — calendar events; `source`+`externalId` unique for two-way sync.
- `habits` + `habit_logs` — cadence/target; logs are timestamped values.
- `goals` — long-term goals; tasks can link to a goal.
- `journal_entries` — dated body + optional mood + tags. `notes` — free-form.
- `accounts` + `transactions` — finance; money in **minor units** (BigInt cents), `source`+`externalId` unique.

**Cross-domain + AI**
- `timeline_events` — append-only life log: `type` (e.g. `task.created`), `source`, title, optional `refType`/`refId`/`payload`, `occurredAt`. The AI's primary read surface. Never put a `Date` in `payload` — ISO strings only.
- `embeddings` — pgvector `vector(768)` for semantic retrieval over any record (`ownerType`/`ownerId`). Prisma can't type the vector column; similarity search uses `$queryRaw` (Phase 2). Dimension is a placeholder — fine to change early before real data.
- `insights` — AI-derived knowledge / rolling summaries (`kind`, body, optional period window).
- `ai_questions` — the AI's questions to the user (OPEN/ANSWERED/DISMISSED) — the self-curation loop, surfaced as UI cards.
- `ai_usage` — cost ledger: per-call tokens + `costUsdMicros`, aggregated per UTC day for the daily cap.

## Conventions
- Money: integer minor units, never floats.
- JSON columns: cast to `Prisma.InputJsonValue` at the call site; JSON-safe values only.
- Extensions (`vector`, `pgcrypto`) are declared in the datasource and created by the first migration.
