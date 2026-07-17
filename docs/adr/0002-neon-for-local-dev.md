# ADR 0002 — Neon cloud Postgres for local dev

**Status:** Accepted (2026-07) · **Context:** Phase 0 verification

## Decision
Use a free **Neon** cloud Postgres as the local development database. Production (VPS) still uses the Dockerized `db` (pgvector) service from `infra/docker-compose.yml`.

## Why
Docker Desktop on the dev machine crashes on startup in its **Model Runner / "Inference manager"** feature (`dockerInference` socket), which takes down the whole engine, so no local Docker Postgres. Attempts to disable the feature via user settings did not stick (Docker rewrites them) and the locked `admin-settings.json` needs elevation. Rather than keep fighting a local-only tooling bug, we pointed `DATABASE_URL` at Neon. Neon supports pgvector + pgcrypto, so it's a faithful stand-in; the first migration and full end-to-end verification passed against it.

## Consequences
- `DATABASE_URL` in `.env` is a Neon connection string (gitignored). Dev data lives in the cloud.
- On the VPS, swap `DATABASE_URL` to the in-compose `db` service — no code changes.
- If Docker Desktop is fixed later (see `docs/GOTCHAS.md`), local Docker Postgres remains an option; nothing depends on Neon specifically.
