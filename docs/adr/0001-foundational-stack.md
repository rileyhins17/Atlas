# ADR 0001 — Foundational stack & structure

**Status:** Accepted (2026-07) · **Context:** Phase 0

## Decision
TypeScript monorepo (pnpm workspaces + Turborepo, **ESM everywhere**). API = **NestJS 11**, DB = **Postgres + pgvector via Prisma 6**, Web = **Next.js 15 PWA**, deploy = **Docker Compose + Caddy** on a VPS, AI = **OpenRouter → deepseek-chat**.

## Why
- **NestJS** module/DI system *is* the plugin architecture we need (module = life-domain). Heavily documented → future AI sessions extend it easily.
- **One Postgres** covers relational + JSON + vector (pgvector) — no extra datastore. Prisma gives typed migrations.
- **Next.js PWA** = one codebase for phone + laptop, installable.
- **Monorepo + shared zod DTOs** keep the API and web in lockstep without a codegen step.

## Consequences / constraints
- **Build with `tsc`, never tsx/esbuild** for the API: Nest DI relies on `emitDecoratorMetadata`, which esbuild-based runners don't emit. ESM + `.js` import specifiers + packages export `dist`.
- Each backend package that uses Node globals needs its own `@types/node` (pnpm strict).
- Scheduling starts with in-process `@nestjs/schedule`; add BullMQ + Redis only when needed.

See `docs/GOTCHAS.md` for the concrete build pitfalls this implies.
