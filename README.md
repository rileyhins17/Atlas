# Atlas — Personal Life OS

One unified data layer for tasks, calendar, habits, journal, and finance, with a cheap cross-domain AI (DeepSeek) that briefs, auto-organizes, nudges, and asks you questions to fill its own gaps. Self-hosted, phone + laptop, AI budget < $5/mo (measured: ~$0.00005 per chat).

> **Working on this repo (human or Claude)? Read [`CLAUDE.md`](./CLAUDE.md) first** — it is the living context anchor: current status, the exact next action, and every gotcha already solved. Keep it and [`docs/GOTCHAS.md`](./docs/GOTCHAS.md) updated at the end of each work session.

## Status
**Phases 0–2 complete and verified end-to-end.** Monorepo builds green; DB migrated; auth, tasks, habits, journal, notes and calendar all work over HTTP and in the browser. The AI brain is live: chat with tool-calling, brain-dump auto-organize, daily briefs, AI-generated questions, and local semantic memory (pgvector). Next: Google Calendar sync + the productization track. See `CLAUDE.md` → "Current status" / "NEXT ACTION" and `docs/roadmap.md`.

> Local dev DB is **Neon** (cloud Postgres) because Docker Desktop is broken on the dev machine; the VPS uses Docker Postgres. See `docs/adr/0002-neon-for-local-dev.md`.

## Stack
TypeScript monorepo (pnpm workspaces + Turborepo, ESM). API: NestJS 11 (built with `tsc`). DB: Postgres + pgvector via Prisma 6. Web: Next.js 15 PWA. Deploy: Docker Compose + Caddy on a VPS; Cloudflare DNS.

## Layout
- `packages/db` — Prisma schema (core data model) + client. Import DB only via `@atlas/db`.
- `packages/shared` — zod DTOs, enums, AI contracts (browser-safe).
- `packages/connectors` — `Connector` interface + DeepSeek client (chat).
- `packages/ai` — pricing, cost guard, context builder, tool loop, local embedder.
- `apps/api` — NestJS (core, auth, modules/{tasks,habits,journal,notes,calendar,ai}).
- `apps/web` — Next.js PWA (auth + Today).
- `infra` — Docker Compose, Caddy, Dockerfiles (TODO).
- `docs` — architecture, data model, roadmap, guides, ADRs, GOTCHAS.

## Quickstart (local, once infra exists)
```bash
pnpm install
cp .env.example .env            # then fill SESSION_SECRET + APP_ENCRYPTION_KEY (64 hex each)
docker compose -f infra/docker-compose.yml up -d db
pnpm --filter @atlas/db prisma migrate dev --name init
pnpm build
pnpm --filter @atlas/api dev    # http://localhost:4000
pnpm --filter @atlas/web dev    # http://localhost:3000
```

## Architecture in one breath
Module = life-domain (self-registers into the AI brain). Connector = external API key (encrypted). Every mutation writes a `timeline_events` row the AI reads. The AI writes back `insights` + `ai_questions`. Spend is capped by a daily token guard. Full detail in `CLAUDE.md` and `docs/`.
