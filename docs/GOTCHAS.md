# GOTCHAS — solved once, never rediscover

Append every new setup/build snag here (root cause + fix) so no future thread wastes tokens re-hitting it. The canonical short list also lives in `../CLAUDE.md`; this file is the long form.

## Toolchain / install
- **pnpm ignores dependency build scripts** → `ERR_PNPM_IGNORED_BUILDS`, Prisma engine missing at runtime. **Fix:** add an `allowBuilds:` map (pnpm 11 key) in `pnpm-workspace.yaml` with `'@prisma/client': true`, `'@prisma/engines': true`, `prisma: true`. Add any future script-needing dep there — local embeddings also needed `onnxruntime-node` (native binary) and `protobufjs` (install-time codegen).
- **`@huggingface/transformers` throws `ERR_MODULE_NOT_FOUND: Cannot find package 'onnxruntime-common'` at boot.** Root cause: a **phantom dependency** — `transformers.node.mjs` imports `onnxruntime-common` but the package only declares `onnxruntime-node`/`onnxruntime-web` (which depend on `-common`). That works under a hoisted `node_modules` but not under pnpm's strict linking, because Node resolves the import starting from the transformers package's **own** dir in the `.pnpm` store. **Adding `onnxruntime-common` to `packages/ai` does NOT fix it** — it must be visible to *transformers*. **Fix:** declare it on the package's behalf in `pnpm-workspace.yaml`:
  ```yaml
  packageExtensions:
    '@huggingface/transformers':
      dependencies:
        onnxruntime-common: '1.24.3'
  ```
  Verify with `ls node_modules/.pnpm/@huggingface+transformers@*/node_modules/` — `onnxruntime-common` should be listed. Same trick applies to any dependency with a phantom import.
- **`pnpm install` rewrites `allowBuilds` with placeholders** (`onnxruntime-node: set this to true or false`) when it meets a new script-needing dep, producing duplicate YAML keys and a parse error on the next install. Delete the placeholder lines, keep your `true`/`false` ones.
- **PowerShell shows red `NativeCommandError` / a `pnpm.ps1` error block even on success** — it wraps native stderr. Judge success by the actual ✔/output, not the red text. Never `2>&1` a native exe in PowerShell here.
- Launch working dir is usually `C:\`; project is `C:\Users\riley\atlas`.

## Shell (PowerShell)
- **git commit here-strings break on inner quotes.** A `@'...'@` message containing `"double quotes"` or `'` (e.g. `Atlas's`) gets word-split and git treats the words as pathspecs. Keep commit-message bodies quote-free (and apostrophe-free), or write the message to a file and use `git commit -F file`.

## Browser verification (Claude sessions, this machine)
- **The in-app Browser pane (`mcp__Claude_Browser__*`) cannot take screenshots of the Atlas web app** — `computer{action:"screenshot"}` times out after 30s every time (fresh tabs included), even though navigation, clicks, `form_input`, and `read_page` all work fine. Verify behaviour with `read_page` (accessibility tree), and when an actual screenshot is needed use the **Claude in Chrome** tools (`mcp__claude-in-chrome__*`) on `http://localhost:3000` instead. Note Chrome's CDP screenshot can also time out once right after a navigation/login — retry once and it works.

## TypeScript / build
- **Node globals (`fetch`, `AbortSignal`, `process`, `Buffer`) → `TS2304 Cannot find name`.** pnpm is strict (no hoist), so EVERY package that uses them needs its own `@types/node` devDep. Added to db, ai, connectors, api.
- **Prisma `Json` columns reject `Record<string,unknown>` / `unknown`.** Cast at the prisma call to `Prisma.InputJsonValue` (`import type { Prisma } from '@atlas/db'`). Never store a `Date` in JSON — `.toISOString()` first.
- **NestJS must be compiled with `tsc`, NOT `tsx`/esbuild.** Nest DI needs `emitDecoratorMetadata` (`design:paramtypes`); esbuild/tsx don't emit it → DI breaks. Whole repo is ESM + tsc; api dev uses `concurrently` (tsc --watch + node --watch).
- **ESM discipline:** every package.json `"type": "module"`; relative `.ts` imports use `.js` extensions; packages export built `dist` (not `src`); turbo `^build` orders dep builds.

## CI (GitHub Actions)
- **`pnpm/action-setup@v4` errors "Multiple versions of pnpm specified"** when the workflow passes `version:` AND package.json has a `packageManager` field. Fix: omit `version:` in the action — it reads `packageManager` (pinned `pnpm@11.13.1`) automatically.
- **Vitest pulls esbuild**, which has a build script; `esbuild: true` is in `allowBuilds` in `pnpm-workspace.yaml` so `pnpm install --frozen-lockfile` stays non-interactive in CI.

## Docker Desktop (this machine)
- **Docker Desktop crashes on boot: "initializing Inference manager … remove …\Docker\run\dockerInference: The file cannot be accessed".** Docker's Model Runner / "Docker AI" feature is broken here and takes the whole engine down, so every `docker` call then hangs on the named pipe. **Fix (permanent):** with Docker fully stopped, set `"EnableDockerAI": false` and `"InferenceCanUseGPUVariant": false` in `C:\Users\riley\AppData\Roaming\Docker\settings-store.json`, then relaunch. Deleting the stale socket does NOT fix it (the socket file can't be removed even with all procs killed; renaming `...\Docker\run` → `run.old` clears it but the feature just recrashes). Do not re-enable Docker AI.
- To stop a Docker crash loop: `Stop-Service com.docker.service -Force`; `Stop-Process` on `Docker Desktop`,`com.docker.backend`,`com.docker.build`.
- Bringing Postgres up: `docker compose --env-file .env -f infra/docker-compose.yml up -d db` (from repo root). Engine can take 1–4 min to be ready after launch.

## Runtime / DB (expected — verify when reached)
- First migration must `CREATE EXTENSION` `vector` + `pgcrypto`. Prisma `postgresqlExtensions` preview should add them; if the generated SQL lacks them, prepend `CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto;`. The `pgvector/pgvector:pg17` image ships `vector`.

## AI providers & cost
- **Never configure a provider *alias* as the model id.** `AI_MODEL=deepseek-chat` resolves server-side to `deepseek-v4-flash`, and the API echoes the **resolved** id back. `CostGuard.record()` stores that echoed id, so it missed `MODEL_RATES` and every row silently priced at the FALLBACK rate — a call really costing ~47 micro-USD was logged as 1020. Pin a concrete id (`deepseek-v4-flash`) and add its rate at the same time. DeepSeek removes the legacy `deepseek-chat`/`deepseek-reasoner` aliases on **2026-07-24**.
- **DeepSeek prefix-cache hits are ~98% cheaper, and Atlas hits them constantly** (~95% of prompt tokens — every call re-sends the same context block). The API returns `prompt_cache_hit_tokens`; `parseChatCompletion` reads it (also accepting OpenAI's nested `prompt_tokens_details.cached_tokens`) into `ChatUsage.cachedPromptTokens`, which `estimateCostMicros` bills at `cachedInputMicros`. Ignoring it overstates spend ~3.5x.
- **Message order decides the cache hit rate — put volatile content LAST.** It's a *prefix* cache: everything from the first differing token onward is billed full price. Semantic recall changes on every message, so putting it in the system prompt (position 1) invalidated the entire prefix, including history — **measured 0% cache hit vs ~92% with the identical content appended to the final user message instead**. Confirmed in `ai_usage`: the same chat cost 182µ¢ with recall in the system message and 135µ¢ (89% cached) after moving it. Keep the order **static instructions → module context → history → user message (+ any per-message extras)**. Anything per-request that lands early silently triples cost, with no error to notice.
- **Ceil on fractional rates needs rounding first.** `Math.ceil(0.14*600000 + 0.0028*400000)` yields 85121 instead of 85120 because of binary-float noise. `estimateCostMicros` does `Number(total.toFixed(6))` before `Math.ceil`.
- **DeepSeek's function-calling API rejects dotted tool names** (`Invalid 'tools[0].function.name': ... '^[a-zA-Z0-9_-]+$'`). Atlas's specs use dots (`tasks.create`), so `packages/ai/src/tools.ts` maps them to `tasks__create` at the provider boundary and back before routing. Check a new provider's name pattern before assuming dots are fine.
- **DeepSeek has no embeddings API** (`POST /embeddings` → 404). Embeddings run locally — see `docs/adr/0003-ai-providers.md`. `LocalEmbedder`'s model width (768) is coupled to `embeddings.embedding vector(768)`; changing models means migrating the column.
