# GOTCHAS — solved once, never rediscover

Append every new setup/build snag here (root cause + fix) so no future thread wastes tokens re-hitting it. The canonical short list also lives in `../CLAUDE.md`; this file is the long form.

## Toolchain / install
- **pnpm ignores dependency build scripts** → `ERR_PNPM_IGNORED_BUILDS`, Prisma engine missing at runtime. **Fix:** add an `allowBuilds:` map (pnpm 11 key) in `pnpm-workspace.yaml` with `'@prisma/client': true`, `'@prisma/engines': true`, `prisma: true`. Add any future script-needing dep there.
- **PowerShell shows red `NativeCommandError` / a `pnpm.ps1` error block even on success** — it wraps native stderr. Judge success by the actual ✔/output, not the red text. Never `2>&1` a native exe in PowerShell here.
- Launch working dir is usually `C:\`; project is `C:\Users\riley\atlas`.

## TypeScript / build
- **Node globals (`fetch`, `AbortSignal`, `process`, `Buffer`) → `TS2304 Cannot find name`.** pnpm is strict (no hoist), so EVERY package that uses them needs its own `@types/node` devDep. Added to db, ai, connectors, api.
- **Prisma `Json` columns reject `Record<string,unknown>` / `unknown`.** Cast at the prisma call to `Prisma.InputJsonValue` (`import type { Prisma } from '@atlas/db'`). Never store a `Date` in JSON — `.toISOString()` first.
- **NestJS must be compiled with `tsc`, NOT `tsx`/esbuild.** Nest DI needs `emitDecoratorMetadata` (`design:paramtypes`); esbuild/tsx don't emit it → DI breaks. Whole repo is ESM + tsc; api dev uses `concurrently` (tsc --watch + node --watch).
- **ESM discipline:** every package.json `"type": "module"`; relative `.ts` imports use `.js` extensions; packages export built `dist` (not `src`); turbo `^build` orders dep builds.

## Docker Desktop (this machine)
- **Docker Desktop crashes on boot: "initializing Inference manager … remove …\Docker\run\dockerInference: The file cannot be accessed".** Docker's Model Runner / "Docker AI" feature is broken here and takes the whole engine down, so every `docker` call then hangs on the named pipe. **Fix (permanent):** with Docker fully stopped, set `"EnableDockerAI": false` and `"InferenceCanUseGPUVariant": false` in `C:\Users\riley\AppData\Roaming\Docker\settings-store.json`, then relaunch. Deleting the stale socket does NOT fix it (the socket file can't be removed even with all procs killed; renaming `...\Docker\run` → `run.old` clears it but the feature just recrashes). Do not re-enable Docker AI.
- To stop a Docker crash loop: `Stop-Service com.docker.service -Force`; `Stop-Process` on `Docker Desktop`,`com.docker.backend`,`com.docker.build`.
- Bringing Postgres up: `docker compose --env-file .env -f infra/docker-compose.yml up -d db` (from repo root). Engine can take 1–4 min to be ready after launch.

## Runtime / DB (expected — verify when reached)
- First migration must `CREATE EXTENSION` `vector` + `pgcrypto`. Prisma `postgresqlExtensions` preview should add them; if the generated SQL lacks them, prepend `CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto;`. The `pgvector/pgvector:pg17` image ships `vector`.
