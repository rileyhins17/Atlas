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
- **`corepack pnpm …` is not enough on a machine with no global pnpm — turbo needs it on PATH.** `corepack enable` writes its shims into `C:\Program Files\nodejs` and fails with `EPERM` without admin, and while `corepack pnpm build` then runs fine, **Turborepo spawns the package-manager binary itself**: every `build`/`typecheck`/`test` dies with `x Unable to find package manager binary: cannot find binary path` while a direct `eslint .` passes, which makes it look like a turbo bug. Fix without admin, into a directory already on PATH: `corepack enable --install-directory "C:\Users\riley\AppData\Roaming\npm" pnpm`.
- **`prisma generate` does not need `DATABASE_URL`, but `migrate deploy` does — and it will not read the repo-root `.env`.** `pnpm --filter @atlas/db migrate:deploy` runs with the CWD at `packages/db`, and Prisma only looks for `.env` beside the schema or in the CWD, so it fails `P1012 Environment variable not found: DATABASE_URL` with a perfectly good root `.env`. Set it inline for the command. (The API is unaffected — it loads the root file explicitly via node's `--env-file-if-exists=../../.env`.)
- **Docker Desktop's port proxy lags the container.** `docker compose up -d db` can report the container healthy and `docker port` can show `0.0.0.0:5432` while the host has nothing listening yet, so Prisma answers `P1001 Can't reach database server`. It resolves itself in a few seconds — retry before debugging the connection string.

## Shell (PowerShell)
- **A `.ps1` file with no UTF-8 BOM is read as ANSI by Windows PowerShell 5.1, and non-ASCII characters can break the PARSER.** `atlas-backup.ps1` failed with `Unexpected token 'pg_dump' in expression or statement` and `Missing closing '}'` pointing at lines that were perfectly valid — every construct parsed fine in isolation, and every line-prefix of the file parsed fine too. The cause is that 5.1 decodes a BOM-less script as Windows-1252, so the em-dashes and `──` box-drawing in the comments become multi-character sequences, and one of them produced a quote-like byte that swallowed the rest of the file into a string. **The fix is a UTF-8 BOM**, not removing the characters. Note the failure mode is *luck-dependent*: `db-switch.ps1` and `supabase-connect.ps1` had no BOM and hundreds of non-ASCII bytes and parsed anyway — they were mis-decoded the whole time, just not fatally. All of `infra/*.ps1` now carries a BOM. Write them with `[System.IO.File]::WriteAllText($p, $text, (New-Object System.Text.UTF8Encoding($true)))`; the editor tools here write UTF-8 *without* one.
- **git commit here-strings break on inner quotes.** A `@'...'@` message containing `"double quotes"` or `'` (e.g. `Atlas's`) gets word-split and git treats the words as pathspecs. Keep commit-message bodies quote-free (and apostrophe-free), or write the message to a file and use `git commit -F file`.

## Browser verification (Claude sessions, this machine)
- **Running `pnpm build` while `next dev` is running corrupts the dev server** — both write `apps/web/.next`, and the dev server then 500s with `ENOENT ... .next\server\vendor-chunks\...` and the page hangs on "Loading…". Fix: restart the web dev server after any `pnpm build` (or stop it first). The API dev server is unaffected (tsc emits to `dist/`).
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
- **`deepseek-v4-flash` is a REASONING model, and its thinking is billed against the SAME `max_tokens` as the answer.** The reply carries a `reasoning_content` field alongside `content`, and `completion_tokens_details.reasoning_tokens` counts against your budget first. Measured on a plan-day call: **700 of 800 tokens went to reasoning**, leaving 100 for the answer — so the JSON was cut off mid-object, `JSON.parse` failed, and the feature returned "Could not put a plan together just now." **every single time**. Nothing errors: the HTTP call is a happy 200 and the only tell is `finish_reason: "length"`. Two rules follow. (1) Size `maxTokens` for reasoning + answer, not just the answer — `chatCall` takes a per-call budget and anything whose output must be *complete* to be usable (JSON, a full brief) gets a real one; a shared 800 had also been silently truncating `daily_brief`. (2) Check `ChatResult.finishReason` — `parseChatCompletion` surfaces it and `chatCall` logs a warning on `'length'`, because a truncated reply is indistinguishable from a short one otherwise. Query `ai_usage` for rows whose `completionTokens` equals the cap to find truncation that already happened.
- **Parsing a model's JSON must survive truncation.** `parsePlanReply` (`modules/ai/plan-day.util.ts`) tries the outermost braces first, then falls back to salvaging the individual complete objects — a brace-counting scan that is string-aware, so a `{` inside a "why" sentence cannot end an object early. Note the scan must **step past** the unclosed outer envelope rather than stopping at it; the finished proposals are nested inside the thing that failed to close.

## Finance / Plaid (Phase 3)
- **`prisma migrate dev` on the Neon dev DB wants a DESTRUCTIVE RESET.** Neon auto-installs a `pg_session_jwt` extension that isn't in Atlas's migration history, so `migrate dev` sees "drift" and offers only `migrate reset` (drops the DB — all data lost). **Never reset.** Apply additive migrations without a reset: `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel ./prisma/schema.prisma --script` → inspect the SQL (must be purely additive; NO `DROP EXTENSION`/`DROP …`) → save as `prisma/migrations/<timestamp>_<name>/migration.sql` → `prisma migrate deploy` (deploy applies pending migrations and does NOT drift-check or reset) → `prisma generate`. This is exactly how `20260719160000_finance_plaid_fields` (adds `accounts.mask/institution`, `transactions.pending/merchantName`) was applied to the live DB with 112 users + 92 synced events intact.
- **Plaid's amount sign is the OPPOSITE of Atlas's.** Plaid `transaction.amount` is **positive when money leaves the account** (a debit/purchase); Atlas `transaction.amountMinor` is **negative = money out**. `plaidAmountToMinor(amount) = Math.round(-amount * 100)` inverts it. Getting this backwards makes every expense look like income and vice-versa — it's the single most important thing to get right in the sync, and it's unit-tested both directions in `packages/connectors/test/plaid.test.ts`. Currency resolves as `iso_currency_code ?? unofficial_currency_code ?? 'USD'` (CAD/USD are 2-decimal, so ×100 is correct; a zero-decimal currency would need special-casing).
- **Plaid connector is raw `fetch`, no `plaid` npm SDK** — Plaid is a plain JSON REST API and this matches `GoogleCalendarConnector`'s style, keeping the connector dependency-free and unit-testable with a stubbed `fetch`. The ONLY new dependency is web-side `react-plaid-link` (Plaid Link is a hosted iframe handshake — the browser side genuinely can't be reimplemented). Neither needs a `pnpm-workspace.yaml` `allowBuilds` entry.
- **All `PLAID_*` env is optional.** Unset `PLAID_CLIENT_ID`/`PLAID_SECRET` ⇒ the connector is unregistered, `/connectors/plaid/status` returns `configured:false`, and Settings shows "unavailable" — Atlas runs fine without Plaid (same pattern as Google). `PLAID_ENV` defaults to `sandbox`; `PLAID_COUNTRY_CODES` defaults to `US,CA` (Canadian banks need CA).
- **Verify the whole flow with no human via the sandbox.** `PlaidConnector.sandboxCreatePublicToken()` (sandbox only, institution `ins_109508`) mints a `public_token` server-side, so `sandbox public_token → /exchange → /sync` exercises the entire path — encrypted credential, account/transaction upserts, cursor persistence — without touching Plaid Link or a real bank. Link UI sandbox creds are `user_good` / `pass_good`.
- **One linked bank = one `credentials` row keyed by `label = itemId`** (the `label` column exists for exactly this: >1 of the same connector). The `/transactions/sync` **cursor** and the institution/mask live in that credential's `meta` (non-secret sync state), updated via `ConnectorsService.saveCredentialMeta` — never in the encrypted payload.
- **The Plaid webhook is a deliberate no-op for now.** `POST /connectors/plaid/webhook` is public (Plaid calls it server-to-server) but only ACKs (200) — it must verify Plaid's `Plaid-Verification` JWT (via `/webhook_verification_key/get`) BEFORE it may trigger a sync, or it's an unauthenticated action trigger. It's unreachable on localhost anyway; the manual "Sync now" button is the live path. When implementing it for real, also exclude it from `OriginCheckMiddleware` (server-to-server requests carry no browser Origin).

## Web Push (Phase 4 nudge delivery)
- **VAPID keys are self-issued — no external push account.** Generate once with `web-push` (`webpush.generateVAPIDKeys()`), store `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` in `.env`. All optional: unset ⇒ `PushService.isConfigured()` is false, `/push/public-key` returns `configured:false`, and the UI shows notifications as unavailable — Atlas runs fine without push.
- **Web push is NOT verifiable in `next dev` from this environment.** Two reasons: (1) `ServiceWorkerRegistrar` only registers the SW when `NODE_ENV==='production'`, and push requires a registered SW; (2) actual delivery goes through the browser vendor's push service and needs a real browser subscription. `lib/push.ts` self-registers `/sw.js` on enable (so it *can* work in dev), but you still can't curl a delivery. The **server side IS verifiable** (`/push/public-key` configured, `/push/subscribe` stores, bad payload → 400). End-to-end verify = deployed/prod app → Settings → Enable notifications → generate a brief → see the OS notification.
- **Prune stale subscriptions on 404/410.** `web-push` `sendNotification` throws a `WebPushError` with `statusCode`; 404/410 means the browser dropped the subscription, so delete that `push_subscriptions` row (else it's retried forever). Other status codes are logged, not deleted. Unit-tested in `apps/api/test/push.test.ts` by mocking `web-push`.
- **`applicationServerKey` type cast.** TS 5.7 types `Uint8Array` as generic over its buffer, so `urlBase64ToUint8Array(publicKey)` no longer matches `BufferSource` structurally even though it is one — cast `as BufferSource` at the `pushManager.subscribe` call.

## Raw-SQL rollups (modules/stats)
- **Unit tests cannot catch a wrong column name in `$queryRaw` — only a live call can.** The stats rollups shipped green (the pure assembler was fully tested) but 500'd on the first real request twice: `habit_logs` has **`loggedAt`**, not `createdAt`, and journal mood must key off **`entryDate`** (the day the entry is *about*) rather than `createdAt`. When adding a raw query, read the actual model in `schema.prisma` for the column name, then hit the endpoint with a seeded account before calling it done.
- **Bucket by the user's local day, and bind the timezone as a parameter:** `((("col" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date)::text`. `${tz}` must be a bound Prisma parameter (never string-interpolated — that's an injection hole). Verify tz-correctness with a row near the UTC boundary: for `America/Toronto`, an instant at `02:00Z` must land on the PREVIOUS local day.
- **`::int` / `::float` your aggregates.** Postgres returns `COUNT(*)` as bigint, which arrives in JS as a `BigInt` and breaks `JSON.stringify`. `COUNT(*)::int` and `AVG(x)::float` keep the DTO plain-number. Money sums stay bigint deliberately and are `Number()`-converted in the service.

## Scanning the onboarding wizard
- **The whole-app sweep cannot see it.** `life-os.spec.ts`'s thirteen-route sweep seeds a task to get past the first-run gate, so the one screen every account is guaranteed to see had no axe scan, no tap-target check and no overflow check. The scans live in `a-onboarding.spec.ts` instead, which already walks all three steps — a dedicated spec would cost a registration, and the suite sits at the 5/min throttle.
- **Register at desktop width, THEN resize to 390.** `register()` waits for `.sidebar-user-name` to be *visible* and the sidebar is `display: none` below 901px, so signing up at phone width waits out the full timeout on an element that resolves and is deliberately hidden.
- **An axe run without `reducedMotion: 'reduce'` reports contrast failures that are not real.** A throwaway probe using `browser.newContext()` (which does not inherit the config's `use`) found a serious `color-contrast` violation on step 1 that never reproduced: content animates in, and axe had sampled a button mid-fade. `playwright.config.ts` sets reduced motion for the suite for exactly this reason — any ad-hoc context needs it too, or you will go and change a colour that measures fine.

## Sparkline domains
- **A sparkline has no axis, so the DOMAIN is the only thing saying what the floor of the box means.** `Sparkline` defaults `min` to the series' own minimum, and `span` falls back to 1 when every point is equal — so **any** flat series lands on the floor. Measured at `height=88`: `[5,5,5,5]` and `[0,0,0,0]` both draw at `y=85`. "Five check-ins a week, every week" and "none at all" are the same picture.
- **Every count-like caller therefore passes `min={0}`**, which puts a steady 5 at the top (`y=3`) and leaves a genuine zero on the floor. This was fixed once for Task rhythm and Habit rhythm and *not* for Training volume, Weekly volume or the per-habit weekly line, so the same lie survived on three charts for months. Pinned now in `apps/web/test/sparkline.test.tsx`, asserting the coordinates rather than describing them.
- **A signed series needs zero in frame from BOTH ends** (`min={Math.min(0, ...pts)}`, `max={Math.max(0, ...pts)}`), not pinned as the floor. Net cash flow is the only one here: a week that spent more than it earned has to be able to sit *below* the line it is judged against, and pinning the floor at zero would push it out of the box.
- **The exception is the per-lift 1RM trend, and it is deliberate.** A working max moves in a narrow band far from zero, so anchoring it squashes a real 10kg gain into a flat line — and the misreading the anchor prevents cannot happen, because nobody's estimated max is near zero. It carries a comment saying so; don't "fix" it for consistency.

## Accessible colour tokens
- **`--success-role` is fill-grade, not text-grade.** It's tuned for rings/borders/backgrounds where 3:1 is enough. Small bold text needs 4.5:1 — the Progress delta chip failed axe at 2.98:1 using it. Use **`--success-text`** (`#4ade80` dark / `#0f6b32` light) for any green *text*. Note the tinted chip background darkens the effective contrast, so verify against the composite, not the page surface: a first fix at `#15803d` still measured 4.39:1.

## Dev server: "Cannot read properties of undefined (reading 'call')"
- **Cause: `next dev` running against a `.next` that `next build` produced.** They write incompatible chunk formats into the same directory, so the dev server serves half-production chunks and the page dies inside webpack's `options.factory` with `Cannot read properties of undefined (reading 'call')`. It looks like a code bug and is not one — the stack points at whatever page component happened to load first.
- **It bites specifically in this order:** stop dev → `pnpm build` (for e2e, which uses `next start`) → restart `pnpm dev`. That's the normal verification loop, so it recurs easily.
- **Fix / prevention: always `rm -rf apps/web/.next` when switching from a production build back to `next dev`.** Renaming or deleting components (which this project does often) makes it likelier, because stale chunks then reference modules that no longer exist — the console shows `Failed to read source code from …/OldName.tsx` for a file you already renamed.
- Confirm the fix by loading a page and checking the console is clean, not just that the server returns 200 — the crash is client-side, so curl reports a happy 200 while the browser shows a red error overlay.

## Recurrence (RRULE, v6)
- **RFC 5545 `COUNT` includes the seed occurrence (DTSTART).** `COUNT=1` means "the seed and nothing more" — there is no *next* occurrence. `COUNT=3` on a Jul-15 seed yields Jul 16 and Jul 17, not three more dates. `nextOccurrences` seeds its counter at 1 for exactly this reason. Getting it wrong makes every bounded series run one occurrence too long, and the off-by-one only shows up at the very end of a series — long after you'd notice.
- **Recurring events expand on READ, and expansion needs a bounded window.** `CalendarService.list` only expands when `to` is supplied: an open-ended list has no point at which to stop generating. The consequence is easy to miss — an unwindowed `GET /events` returns a weekly event **exactly once** (its stored root row) and looks like recurrence is broken. `useEvents()` therefore sends a 60-day window; `useDayEvents` already sent one. If you add another events query, give it a window or accept that it won't repeat.
- **Expanded occurrences are synthetic and must never be written to.** They carry `id = "<rootId>@<epochMs>"` and `isOccurrence: true`. PATCH/DELETE against that id 404s, so the UI disables destructive controls on them (per-instance exceptions — EXDATE / RECURRENCE-ID — are deliberately out of scope). Only the stored root row is editable, and editing it changes every future occurrence.
- **Materialisation for tasks is lazy: a series keeps exactly ONE open instance.** Completing it spawns the next inside `TasksService.spawnNextInstance`. There is no cron and nothing accumulates; a series you stop completing simply stops. Both `POST /tasks/:id/complete` *and* `PATCH /tasks/:id {status:'DONE'}` must call it — the web checkbox uses one and the AI tool the other, and wiring only one silently breaks half the app.
- **Always anchor the next date on the SERIES ROOT, never on the instance just completed.** "Monthly on the 31st" clamps to Feb 28; stepping from that clamped instance would pin the series to the 28th forever. Root-anchoring also makes `COUNT`/`UNTIL` countable, since the walk from the seed does the counting. Covered in `apps/api/test/tasks-recurrence.test.ts`.
- **A rule we can't parse is preserved verbatim and simply never expanded.** `parseRrule` returns null for anything outside the supported subset (DAILY/WEEKLY/MONTHLY + INTERVAL/BYDAY/COUNT/UNTIL), and every caller treats null as "store it, don't expand it". This is what keeps a Google round-trip from destroying an exotic rule. Don't "fix" a null return by rewriting the rule.

## Local dev hygiene
- **Dev servers stack up silently across sessions.** Five `@atlas/api dev` processes had accumulated from earlier sessions; only one can hold port 4000, so the others sit there holding file locks. The visible symptom is `prisma generate` failing with `EPERM: operation not permitted, rename … query_engine-windows.dll.node`. Check with `Get-Process node` (the `CommandLine` column tells you which is which) and kill them all before `prisma generate` or `pnpm build`, then start exactly one of each.
- **After killing dev servers, any background task that was watching them reports a failure.** That's the kill, not a real error — don't go debugging exit code 127 from a task you just terminated.
- **`tsc --watch` restarts the API mid-request.** A verification script fired right after `pnpm dev` can get `curl: (56) recv failure` while Nest is rebooting. Wait for `Nest application successfully started` in the dev log, or just retry once.
- **Seed scripts: the journal field is `body`, not `content`.** `POST /journal` with `content` returns `{"message":"Validation failed","issues":[{"path":"body","message":"Required"}]}` — and because the seed loop discarded the response, it looked like the stats mood query was broken rather than the seed. Echo at least one response body when seeding.
- **The heredoc escaping trap is still live and still costs a debug cycle.** Writing JS/TS through `python - <<'PY'` turns `\n` inside a single-quoted string into a REAL newline, producing `Unterminated string literal`. Hit twice more this session (`lib/progress.ts`, `test/progress.test.ts`). Use the Edit tool for anything containing escape sequences, or make the target a template literal where real newlines are legal.
- **Throwaway Playwright scripts must live INSIDE the workspace.** A script in the system temp dir can't resolve `playwright` under pnpm's strict linking. Put it in `apps/web/`, and import from **`@playwright/test`** — bare `playwright` is not a direct dependency.
- **Don't assert on a data-backed element straight after the shell mounts.** `.sidebar-user-name` appearing means you are signed in, not that the queries have resolved; the surface is still a skeleton. Counting `.freetime` at that moment reported zero and looked exactly like the bug that had just been fixed. Wait for the element itself.
- **A test that reloads right after a mutation races the server.** The recurring-task e2e clicked complete and immediately called `page.reload()`, so the new page's `GET /tasks` could beat the spawn of the next instance that the completion request was still doing — and, because a reload discards the pending refetch, the list then stayed wrong forever. It failed deterministically while the DB rows were correct every time. `await page.waitForResponse(...)` on the mutation before reloading, and prefer asserting the no-reload behaviour first since that is what the user actually sees.
- **The DeepSeek key is per-user in the `credentials` table, never in `.env`.** Anything that needs a live model call needs an account that has connected one (`POST /ai/connect/deepseek`). To verify without asking Riley for the key: decrypt an existing credential in-process with `APP_ENCRYPTION_KEY` (AES-256-GCM, `[12-byte IV][16-byte tag][ciphertext]`, base64) and POST it onto a throwaway account — the secret never has to leave the script.

## Fitness / training (v7)
- **`@@unique([userId, name])` does NOT dedupe the shared exercise catalog.** The seeded rows all have `userId = NULL`, and **Postgres treats NULLs as DISTINCT**, so the constraint never fires between two catalog rows — `createMany({ skipDuplicates: true })` had nothing to match on and re-inserted the whole catalog on **every API boot** (verified live: 64 rows for 32 exercises after two restarts). `FitnessService.seedCatalog` now reads the existing global names and inserts only what is missing. The same NULL-distinct behaviour is *desirable* in the other direction (two users may each add their own "Nordic Curl"), which is exactly why it is easy to reason about once and miss the consequence. Migration `20260725020000_dedupe_exercise_catalog` cleans up rows the earlier boots left behind, re-pointing any logged set at the survivor first.
- **A Nest handler returning `null` responds 200/201 with an EMPTY BODY, not 204.** `res.json()` throws on empty input, so `lib/api.ts`'s `request()` reads the body as text and returns `null` when it is empty. It must be **`null`, not `undefined`** — TanStack Query rejects an undefined query result (`Query data cannot be undefined`) and the page renders its *error* state where the empty state belongs. This bit `GET /fitness/workouts/active`, which legitimately returns null when no session is open. Regression-tested in `apps/web/test/api-client.test.ts`.
- **Weight is stored as integer GRAMS, never a float.** Volume is a sum over every set, so float kg accumulates visible drift, and 2.5 / 1.25 kg plate maths has to stay exact. Duration is seconds, distance is metres, same reasoning. The UI converts at the edge via `kgToGrams`/`gramsToKg`; nothing inside Atlas handles fractional kg.
- **Warm-ups are excluded from volume AND from records.** Counting them lets an empty-bar set inflate a session, which makes the number useless as a progress signal. `workoutVolumeGrams`/`bestWeightGrams`/`isPersonalRecord` all skip `warmup`, and a "PR" requires **strictly** beating the previous best — an app that celebrates every set teaches you to ignore the badge.
- **A PR must be judged against previous sessions *and* the earlier sets of the current one.** `lastPerformance` deliberately only reads FINISHED workouts (sets from the open session are what you're doing now, not what you're beating), so the component folds in the in-session sets itself. Without that, a first-ever exercise badges **every** ascending set as a record — caught live, not by tests.
- **Finishing a workout must write `null` into the active-session cache, not the finished workout.** The panel renders the logger whenever the active slot is truthy, so setting the finished session there leaves it on screen forever with no way back. Caught live; covered by the e2e now.
- **An empty session is deleted on finish rather than saved.** A workout you started and logged nothing into is a misfire, and keeping it makes the history lie about how often you trained. The endpoint therefore returns `null` in that case — see the empty-body note above.
- **The AI can start a workout but deliberately cannot log sets or finish one** (`FitnessAiAdapter.getToolSpecs`). A logged set is a factual claim about what your body did; if the model mishears "three sets of eight", the record is silently wrong and a training log you can't trust is worse than none. Starting a session is harmless and removes the only friction that matters ("I'm at the gym").

## Day planning / free time (v8)
- **Subtract events from a free window; never discard the window.** `openGaps` originally skipped any Open section that contained an event, which reads as "that time is claimed" but behaves as "that entire span is gone". Consequences found live: accepting one 90-minute proposal deleted the whole rest of the evening from Free time, and on a day off — where the `off` block carves the routine away and leaves ONE Open section spanning the day — a single booked event hid all 14 hours. Now each event's span is cut out of the window and the surviving slices are offered (still dropping anything under the 20-minute floor). An event with no end time claims a nominal 30 minutes; that path is only reachable from a blank `endAt` off the wire, since the DTO types it as required.
- **`off` is a carver, not a block.** It subtracts from every other segment for its window instead of adding a segment, so a vacation day stops reading as Work. It is also the one kind a dated block never *replaces* — dated blocks replace the weekly block of the same kind, and `off` has nothing to stand in for.
- **A weekday-only routine makes any assertion about "today" a weekend time-bomb.** Onboarding writes Work on weekdays only, so an e2e that asserts a Work block on the Today canvas passes Friday night and fails Saturday morning. Assert through the routine editor, which does not care what day it runs.

## Lint
- **`pnpm lint` did nothing for months because the config was never written.** ESLint 9, `@eslint/js` and `typescript-eslint` were all installed, but the only `lint` script was `apps/web`'s deprecated `next lint`, which with no config prompts interactively and exits 1 — and CI had no lint step to make that visible. The config now lives at the repo root (`eslint.config.mjs`, flat, one pass over every workspace) and CI runs it.
- **It is deliberately NOT type-aware.** `pnpm typecheck` already runs the compiler over 10 projects; a type-aware lint would repeat that work for several times the runtime. Lint is here for what the compiler cannot see.
- **`eslint-plugin-react-hooks` v7 also ships the React Compiler's rules**, which are far stricter than `rules-of-hooks`/`exhaustive-deps`. `set-state-in-effect`, `purity`, `immutability` and `globals` are turned off with the reasoning in the config: they flag correct, shipped, verified patterns here (reading `localStorage` or a URL param in a mount effect, `new Date()` during render). Don't switch them on without deciding to adopt the compiler.
- **`const x = query.data ?? []` defeats the `useMemo` it feeds.** A fresh array literal is a new identity on every render, so the dependency always changes. Four panels had this. Use a module-level `const NO_TASKS: TaskDTO[] = []` — stable identity, no extra hook.

## Learned task durations (v8.1)
- **The measurement is a reserved block plus a completion, not `createdAt` → `completedAt`.** Elapsed since creation is how long a task *sat*, not how long it *took* — a task created Monday and done in 20 minutes on Thursday would read as three days. `Event.taskId` links the block Atlas reserved to the task, so the block's `startAt` is when work began and `Task.completedAt` is when it ended. Without that link the two facts are unconnectable, which is why the accept-a-proposal path has to pass `taskId`.
- **Median, never mean, and refuse to answer below 2 samples.** One task left open over lunch drags an average somewhere useless; one data point is an anecdote, not a "usually". Samples under 2 minutes (ticking a box for work already done) and over 8 hours (you walked away) are dropped before the median, and estimates round to 5 minutes because false precision reads as a promise.
- **The maths lives in `@atlas/shared`, not the API.** The planner's prompt and the `usually 1h` chip must never disagree about what a task takes, and the only way to guarantee that is one implementation.
- **A client-supplied `taskId` must be ownership-checked.** `CalendarService.create` looks the task up scoped by `userId` before attaching it — otherwise one user could bind a block to another user's task and the duration learned from it would cross accounts.

## Rolling unfinished work forward (v8.2)
- **"Overdue" must be measured against the USER's midnight, not the server's.** `slipped` uses `localDayStartUtc(User.timezone)`. With a UTC server and a Toronto user, a server-midnight boundary is wrong for four hours every day — it would offer work that is still due today and teach the user to dismiss the card unread.
- **Roll to 23:59 local, never to midnight.** A task rolled to local midnight is instantly in the past again and shows up as overdue on the very next render.
- **Dropping ARCHIVES.** Deleting destroys the signal the AI is supposed to learn from, and marking it `DONE` is a lie that inflates every completion count on Progress. Archived rows are already excluded from `TasksService.list` (`status: { not: 'ARCHIVED' }`), so they vanish from the UI without pretending to be finished. Verify after any change that a dropped task still has `completedAt = null`.
- **Write one timeline row per task, not one per batch.** "I keep putting this specific thing off" is per-task knowledge; a single "dropped 3 tasks" row is unusable to the AI.
- **A selection set held in component state must be cleared after the batch action succeeds.** Found live: the task deliberately held back came back still deselected, which left the card rendering one task with both buttons disabled and no explanation. Anything left after an action is a fresh decision.

## Day bucketing: FIXED — one clock per user (v8.1)
- **`User.timezone` is now the single clock**, and the thing that made the old mismatch real was its `'UTC'` default: it was only ever corrected by finding the Proactive-AI card in Settings, so Today (browser-local) and Progress (`AT TIME ZONE User.timezone`) disagreed for every user outside UTC. Registration sends the device zone and `useTimezoneSync` pushes it whenever it differs, which repairs existing accounts too. If you add another day-bucketed surface, bucket it by `User.timezone` and it will agree with the rest by construction.
- **The zone is now client-supplied, so treat it as untrusted.** It is interpolated into `AT TIME ZONE` in raw SQL; `register` runs it through `safeTz` and `PATCH /settings` rejects an unknown zone with a 400.

## Day bucketing: the original mismatch (historical)
- **`/today` buckets by the BROWSER's local day; `/stats` buckets by `User.timezone`.** `buildDayCanvas` filters actuals with `localDayKey(at)` (browser `Date`), while `StatsService` uses `AT TIME ZONE ${tz}` from the user's stored timezone. When those disagree — the default `User.timezone` is `UTC` and most users never change it, or the user travels — **Today and Progress will disagree about which day something happened**. Surfaced while verifying fitness: a workout logged at `01:56Z` showed on Progress as today (account tz = UTC) but was absent from the Today canvas in a UTC−4 browser, because locally it was the previous evening. Nothing is *wrong* per surface (a "what does my day look like" view arguably should follow the device), but the mismatch is real and pre-existing across every domain, not just fitness. Fixing it means picking one clock for both and is a behavioural change worth doing deliberately.
- When verifying any day-scoped surface headlessly, **set the Playwright context's `timezoneId` to match the account's `User.timezone`**, or you will chase a bucketing "bug" that is only a clock mismatch between the test browser and the seeded account.

## Auth, sessions and the reverse proxy
- **The session cookie was missing `Secure` in production, and nothing reported it.** `secure` was derived from `NODE_ENV`, but the deployed API starts with a plain `node dist/main.js`, so NODE_ENV was never "production". It now derives from `req.secure`, which is the correct source behind a proxy. Symptom is not an error — it is "why do I keep having to log in".
- **Caddy overwrites `X-Forwarded-Proto` with its OWN listener scheme.** Behind the tunnel Caddy listens on plain http, so `req.secure` stayed false even with `trust proxy` set. `infra/Caddyfile.tunnel` pins `header_up X-Forwarded-Proto https` on the API route. Everything public is HTTPS — Cloudflare terminates TLS and `.app` is HSTS-preloaded — so stating it is accurate, not a fudge.
- **`remember` decides cookie PERSISTENCE, not lifetime.** With it, a dated cookie that survives a browser restart; without it, a session cookie that does not. It defaults to **true**: a daily-use personal app that logs you out whenever you close the tab is broken for its purpose. The checkbox exists to opt out on a shared machine.
- **Google Calendar cannot be connected mid-onboarding.** It is a full-page redirect to Google's consent screen, so every unsaved wizard answer would be lost. The offer therefore comes *after* `finish()` has persisted everything, as the last step.

## Playwright name matching
- **`getByRole(role, { name })` matches the accessible name as a SUBSTRING by default.** A submit button named "Create account" and a tab labelled "Show the create account form" both match `{ name: 'Create account' }`, producing a strict-mode violation that reads like a duplicate-element bug. Pass `exact: true` when two controls share wording. Live example: the habits page's "Add" submit collides with the sidebar's **"Ask or add… ⌘K"**.
- **`.sr-only` text is PART of the accessible name, so `exact: true` then fails.** A button rendering `{name}<span class="sr-only"> — edit habit</span>` is named `Gym — edit habit`, not `Gym` — visually-hidden text is clipped, not removed from the a11y tree. Prefer an explicit `aria-label` that says what the control does (`Edit habit "Gym"`), which is both a cleaner name and a stable hook.
- **`read_page`'s tree is not the accessible-name computation.** It showed the button above as `button "Gym"` with the hidden span as a separate child node, so the spec looked correct and failed anyway. Trust Playwright's own resolution over the inspector.

## The onboarding wizard, and "no data" vs "no answer"
- **A failed query is not an empty account.** `TodayView`'s first-run gate read `(data?.length ?? 0) === 0` the moment four list queries stopped being *pending*; an errored query leaves `data` undefined, so one bad response told an established account it was brand new and put the setup wizard over the top of its day. The wizard WRITES a routine, so the recovery path from a network blip was a flow that overwrites the real working week. Gate on `isSuccess`, never on `!isPending`, whenever "there is nothing here" triggers a destructive or hijacking UI.
- **It takes ~5 seconds to appear, which is why it reads as random.** The queries retry twice (1s/2s backoff) before settling into error, so the dock is still on screen at t+1s and t+3s and the wizard has taken over by t+7s. Any spec asserting before the retry policy gives up passes against the bug — the first version of the regression test did exactly that.
- **In the suite it showed up only after the thirteen-route axe sweep**, which is enough traffic to trip the 120/min throttler; the two specs that follow it then failed on a missing capture dock. A "flaky" failure that always follows the same heavy spec is a resource limit, not flake.

## Next: two files, one URL
- **A `public/` file and an app route with the same path is a hard 500 in dev** (`A conflicting public file and page file was found`), and a build will happily prerender the route *alongside* the static file without failing. Atlas had both `app/manifest.ts` (the Phase 0 scaffold) and `public/manifest.webmanifest` (the later iOS-ready one), so `<link rel="manifest">` on every page pointed at a 500 in dev and at an ambiguous winner in production. Nothing in `pnpm build` complains — request the URL.
- **Two controls with the same accessible name is a real a11y problem, not just a test problem.** The sign-in tabs now carry explicit `aria-label`s describing what they do ("Show the create account form") while the submit keeps the plain verb.

## Forms: a `<label>` that wraps a button steals every click (v9)
- **A `<label>` forwards a click anywhere inside it to its FIRST labelable descendant**, and `button` is labelable. `.fit-field` wrapped `<span>lb</span>` + a stepper of `− input +`, so the first labelable descendant was the "−" button — and tapping the weight box to type in it fired a decrement. The field filled with `0`, the typed digits landed after it, and 185 was entered as `0185`; reps did the same with `1`, turning 5 into 15. Never wrap a control cluster in a `<label>`. Use a `div` and let the input carry its own `aria-label`, or point `htmlFor` at the input explicitly.
- **`fill()` cannot see this class of bug.** Playwright's `fill()` sets `value` in one shot and dispatches a single input event — no click, no keystrokes. The fitness spec had passed for weeks against a field that a real person could not type into. **For any field a user types into rather than picks, drive it with `click()` + `pressSequentially()` at least once**, and assert that the click ALONE leaves the value unchanged.
- **A hard pixel width on a flex field will silently starve its children.** `.fit-field` was `width: 84px` around two 44px tap targets and an input: the buttons were squeezed below the AA size their own comment claims, and `width: 100%; min-width: 0` let the input collapse to 32px. Size the container from what it contains, and give a number input a `min-width` that fits its realistic digit count.

## A className with no CSS rule is not "unstyled" — it is browser-default (v10)
- **`.ov-title` and `.card-title` had no rule anywhere in `globals.css`.** They did not render plainly; they rendered as the browser's default `h2` — 1.5em, bold. On Today that made *"1 thing didn't happen"* larger than every other piece of text on the screen, so a nag was the loudest voice in the product. Nothing errors, nothing warns, and it looks deliberate.
- **Grep the stylesheet for any class you introduce, and grep the components for any class you delete.** Both directions rot silently. `.nav-desktop-only` was live CSS for a class no component had emitted in months.

## The sidebar is hidden below 901px (v10)
- **`.sidebar { display: none }` at `max-width: 900px`.** Anything reachable *only* from the sidebar does not exist on a phone, which is the primary target. "Everything" lived there alone, so Habits, Training, Writing, Money, Calendar and Settings had no navigation path at all on mobile — the only route in was the command bar, i.e. a search box you had to already know what to type into.
- **Whenever you add a destination, decide where it lives in BOTH navs.** The bottom bar now carries "Everything" as a fourth item.

## A controlled textarea's value IS its text content (v10)
- **React mirrors a controlled `<textarea>`'s value into the element's text, so `locator('.card', { hasText: typedText })` matches the COMPOSER**, not the saved row. The writing spec went green the instant the text was typed, then navigated on — and the navigation cancelled the in-flight POST. Measured: **zero journal rows in the database after a "passing" run**, exactly like the `fill()` trap above but with a correct-looking assertion.
- **Assert against a container that can only hold saved data.** The written list now has its own `.wr-list` hook, and the spec is scoped to it. If an assertion could conceivably match the input you just typed into, it is not testing persistence.

## Audit by looking, at both widths (v10)
- **`e2e/screenshots.spec.ts` (run with `SHOTS=1`) shoots every route at 1440px AND 390px**, plus the hour-by-hour canvas that no route reaches. It had drifted to five routes at desktop only, under names that no longer existed. Most of the design faults fixed in v10 were invisible in code review and obvious in a screenshot: a nav rendering as two columns because `.sidebar-nav` was `display: flex` with no direction; a 30-day heatmap drawing a 70px stamp in a 700px card; a sparkline whose domain defaulted to the series minimum, so a week of zeros drew a flat line through the middle of the chart and read as a steady nonzero rate.

## Contrast: --brand on a tint of --brand (v10)
- **`--brand` is tuned to sit on a SURFACE, not on a tint of itself.** Measured in light theme, `--brand` text on its own tint: 4.54/4.27/4.02 at 8%, 4.43/4.14/3.93 at 10%, 4.29/4.04/3.82 at 12% (white card / surface / sidebar) — and **3.74 on the 22% hover tint**. Dark is marginal at the same points (4.57 on a raised card, 3.83 on hover). Four separate rules had shipped with this pairing.
- **Use `--brand-on-tint`.** It exists for exactly this and clears 4.5:1 on every tint and surface the app pairs it with.
- **Axe will only catch some of them.** It found the task-row goal chip and missed three others, because two need particular application state and one only exists on `:hover`. Measure the pairing when you write it; do not wait for the scan.

## Killing :3000 to rebuild hands the live site to Playwright (v10)
- **`reuseExistingServer` cuts both ways.** The normal loop after a `pnpm build` is: stop the process on :3000 so the new bundle is served, then run the suite. But if :3000 is *down* when Playwright starts, Playwright starts the server itself — and **kills it when the run ends**. atlaslife.app then 502s until the two-minute "Atlas health" sweep notices. Seen live, more than once in one session (`infra/health.log` shows the repairs).
- **So restart the server yourself before running the suite, not after.** `powershell -File infra/atlas-health.ps1` brings back whatever is missing and is idempotent; Playwright then *reuses* it and leaves it running. If you do end up with a 502, that same script fixes it immediately rather than waiting for the sweep.

## Verifying against a stale bundle (v9)
- **`playwright.config.ts` starts `pnpm --filter @atlas/web start` with `reuseExistingServer: !CI`** — the BUILT app, and locally that is usually the live deployment already running. A source edit is invisible to the suite until `pnpm build` runs, so a fix "not working" may just be untested. Rebuild before concluding anything about a UI change, and remember `pnpm build` needs node stopped (it holds the Prisma DLL) — pause the "Atlas health" task first or the watchdog restarts node mid-build.

## A dead database used to take the whole origin down (Aug 2026)

**Symptom:** `atlaslife.app` loads, every client route renders, and **sign-in and
sign-up do nothing**. Measured from outside: `/` and `/today` return 200 with
`cf-cache-status: DYNAMIC` (so Next really is serving, not a cached copy), a
bogus path returns a real Next 404, and every `/api/*` path returns **502**.

**Cause:** `PrismaService.onModuleInit` called `$connect()` and let it throw. A
rejected module init rejects `NestFactory.create`, which rejects `bootstrap()`,
which exits the process — so nothing listens on :4000 and Caddy 502s all of
`/api/*`. Auth is pure API, so the product is unusable while the site looks up.

Reproduced both ways with an unreachable `DATABASE_URL`:

| | Result |
|---|---|
| Before | exit code 1, `P1001`, never listened |
| After | listens in ~70s, `/health` → `{"status":"degraded","db":"down","dbAtBoot":false}` |

**The rule:** *the origin must never be able to be taken down by something on
the other side of the internet.* `connectWithRetry` backs off for ~45s and then
**returns false rather than throwing**, so the API boots either way. Prisma
reconnects lazily, so `db` flips back to `ok` on its own when Neon returns.

`/health` stays **200 while degraded** on purpose. Its only consumer is the
watchdog, which restarts the API on >=400 — and restarting cannot fix a remote
database, so a 503 would just spin the process, 502ing every route instead of
only the ones that need data. The watchdog now writes `API up but DATABASE
UNREACHABLE` to `health.log` instead, because the previous failure reached a
human as "sign-in is broken" with a clean-looking log and nothing pointing at
the database.

**Not the cause, though it looked like one:** a missing `DIRECT_DATABASE_URL`.
`directUrl` is only read by migrate/generate — a client built without that env
var set connects fine. Verified before writing any fix for it.

## The watchdog and a 60-second sweep burned the database's monthly quota (Aug 2026)

**Symptom:** the fix above worked — the API stayed up — and the product was
still dead. Every query, **reads included**, came back:

```
Error querying the database: ERROR: Your account or project has exceeded the
compute time quota. Upgrade your plan to increase limits.
```

Not a hiccup and not something the app could retry its way out of: the data was
intact and unreachable until the quota reset or the plan changed.

**Cause:** a serverless Postgres bills for the time its compute is *awake* and
suspends itself after a few idle minutes. Two things in this repo made sure it
never got them:

| Caller | Interval | Ran when nobody was using Atlas |
|---|---|---|
| `infra/atlas-health.ps1` → `GET /health` → `SELECT 1` | 2 min | yes |
| `EmbeddingService.sweepPending` → `findMany({model:'pending'})` | 60 s | yes |

Neither is wrong in isolation. Together they meant a **three-user personal app
kept a compute awake 24 hours a day** — roughly 720 compute-hours a month
against a ~192-hour allowance, so the quota was gone in about a week of uptime.
The watchdog added to keep the site up is what took it down.

**The rule:** **an idle API makes no database calls.** Work that exists only to
serve user activity must be triggered by user activity.

`ActivityService` counts real requests (`ActivityMiddleware` marks everything
except `/health` — counting the liveness poll would make the API look
permanently busy and defeat the whole thing). `/health` re-probes only when
somebody has used the API since the last probe, and otherwise returns its last
known answer with the `dbCheckedAt` that earned it; `?probe=1` forces a live
check **for humans only — never put it in the watchdog**. `sweepPending`
returns immediately unless a request has arrived since its last run, with one
unconditional drain at boot for rows queued before a restart.

**A counter, not a timestamp.** Two events in the same millisecond are
indistinguishable by clock, and the loser is a queued row that never gets
embedded because the sweep believes it already covered it.

**What this could not catch, and still cannot:** `ProactiveService.sweep` runs
hourly and must, since its whole job is to act when you are *not* there. Each
wake costs the suspend threshold, so budget roughly 2 compute-hours a day for it
before any real traffic.

**And the first fix for it did nothing, for a reason worth remembering.**
`ActivityMiddleware` asked `req.path`. Express rewrites `req.url` — and with it
`req.path` — to be relative to the mount point while a mounted router runs, so
middleware attached through `forRoutes` sees `/` for a request to `/health`;
the watchdog's own poll was counted as somebody using the app and every gate
downstream stayed permanently open. It hides well: `RequestIdMiddleware` reads
the same field from an `res.on('finish')` callback, by which time Express has
put the original value back, so the request log prints `path: "/health"` while
the middleware three lines away saw something else — which is what made the
first diagnosis look wrong. **In middleware, read `originalUrl`.**

Behaviour, measured against the live origin both times:

| | Six `/health` polls, no other traffic |
|---|---|
| Reading `req.path` | `dbCheckedAt` moved on every poll |
| Reading `originalUrl` | one timestamp, unchanged; one real request then causes exactly one re-probe |

**Only a unit test can see this class of bug.** Both sweeps were functionally
perfect; what was wrong was how often they ran when nobody was there, and
nothing in a green suite, a healthy watchdog log or a working screen showed it.
`apps/api/test/idle-db.test.ts` asserts the negative directly — thirty health
polls and sixty sweep ticks against an idle API, zero queries.

## Service worker: never cache a URL that carries a query string

The App Router fetches its React payloads as ordinary same-origin GETs —
`/today?_rsc=1a2b3c`. They are not `/api/*` and not navigations, so they fell
into `sw.js`'s stale-while-revalidate branch and were cached BY URL. Ship a new
build and that same URL has to answer with a payload whose chunks no longer
exist; `cached || network` hands the stale one back first, and React throws
`Application error: a client-side exception has occurred` on a black screen —
in a home-screen PWA with no URL bar to reload from.

Rule: the worker caches only `/_next/static/*` (content-hashed, so a changed
file is a changed URL) plus real static assets by extension. **Anything with a
query string goes to the network, always.** `app/global-error.tsx` is the second
line: it clears caches, unregisters the worker and reloads once per session.

## Every AI domain summary must carry the row id

`calendar.delete` and `calendar.update` were unusable from the day they shipped,
and it looked like the model being unhelpful. The tools were fine; the CONTEXT
was not. `CalendarService.summarize` rendered `- Dentist — 2026-09-05 23:00`
with no id, so the model could name an event and had no way to address one.
Tasks, habits and goals all render `[id]` — each with a comment saying why —
and calendar was the only one that did not.

The same three lines had a second bug: `toISOString()` is **UTC**. A 7pm Toronto
event reached the model as `23:00` and was read straight back to the user as
11pm. Every summary that prints a time must format it in the user's timezone and
say which timezone that is.

If you add a domain, its summary needs `[id]` and local times, or half its tools
are decorative.

## An input under 16px makes the whole app pan, not just zoom

Known: iOS zooms the page when a field under 16px takes focus. The part that is
not obvious is what that looks like afterwards — the visual viewport stays
zoomed, so every later swipe PANS the page, including `position: fixed`
elements. Reported as "the display of the app moves around like it's a bigger
page", on screens with no overflow at all. Measured: zero horizontal overflow on
all thirteen routes while it was happening.

Fix the fields, not the viewport: pinning `maximumScale` stops the zoom and
fails WCAG 1.4.4 for everyone. `html, body` also carry `overflow-x: hidden` and
`overscroll-behavior-x: none`, and every `overflow-x: auto` container carries
`overscroll-behavior-x: contain` so a chip row or the week grid cannot drag the
page with it.

## runToolLoop must not swallow a failure that happened before any tool ran

The loop catches provider failures so that writes already applied keep their
`toolExecutions` — without that, "What Atlas changed" never renders and the undo
for a real deletion is unreachable.

But catching the FIRST call is a different thing: nothing has happened, the
error is the whole answer, and absorbing it turns a 424 "Atlas AI needs an API
key" into a 200 with an apology in it. That silently disarms the local capture
fallback, so a brand-new account's first capture writes nothing — the most
expensive bug this project has shipped, arriving by a new route. The guard is
`if (toolExecutions.length === 0) throw err;` and three e2e specs fail without
it.

## Switching DATABASE_URL without restoring takes the site down silently

The region move is two steps — point `.env` at the new project, and restore the
data into it — and doing only the first leaves a state that looks fine from
every angle except the one that matters.

`supabase-connect.ps1 -WriteOnly` rewrote `.env` to `ca-central-1`. The restore
was never run, so that project had no `public` schema at all. What followed:

- The site kept serving, because the running API held its connection from boot.
  It only broke when the process restarted hours later — so the failure appeared
  disconnected in time from the change that caused it.
- `/api/health` reported `db: ok` throughout. It tests that the connection
  works, not that the tables exist, and the connection was perfect.
- Every sign-in returned **500**, not 401 — `public.users does not exist` is an
  infrastructure error, not a credentials one, so it never reached the auth
  logic that would have said "invalid password".
- The 03:30 backup dumped the empty project and logged `ok`.

Recovery is a pointer, not a migration: `supabase-connect.ps1` writes
`.env.bak.<timestamp>` before it edits, and that file differs from the current
one **only** in the two DB URLs. Copy those two lines back, restart, done — the
data was never touched.

Two rules follow. Restore and verify counts BEFORE switching the pointer, never
after. And if the site is up but every login 500s, check which database `.env`
names before looking at anything in the auth code.
