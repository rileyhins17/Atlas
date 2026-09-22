# Adding a life-domain module

A "module" is one life area (tasks, habits, journal, finance …). Adding one is mechanical — copy the **Tasks** module (`apps/api/src/modules/tasks/`), which is the reference implementation. Nothing in the core changes.

## Files to create (mirror `modules/tasks/`)
```
apps/api/src/modules/<domain>/
  <domain>.service.ts     business logic + writes TimelineEvents
  <domain>.controller.ts  REST endpoints, guarded by SessionGuard
  <domain>.ai.ts          DomainModule adapter: aiContext() + tools(), self-registers
  <domain>.module.ts      wires the above; imports AuthModule
```
Plus: shared DTOs in `packages/shared/src/dto/<domain>.ts` (zod), and register the module in `apps/api/src/app.module.ts`.

## Step by step
1. **DB**: add the model(s) to `packages/db/prisma/schema.prisma` if not already there (most core tables exist). **Never run `prisma migrate dev`** (drift makes it offer only a destructive reset): `migrate diff` → check it is additive → hand-write the migration → `migrate deploy` → `generate`.
2. **DTOs**: add zod input/output schemas to `packages/shared/src/dto/<domain>.ts`; export from `packages/shared/src/index.ts`. Use these with `ZodValidationPipe` on the controller and as web client types.
3. **Service**: inject `PrismaService` + `TimelineService`. Every create/update/delete that matters should call `this.timeline.write({ userId, type: '<domain>.<verb>', source: '<domain>', title, refType, refId })`. Add a `summarize(userId)` returning a short string.
4. **Controller**: `@Controller('<domain>')`, `@UseGuards(SessionGuard)`, use `@CurrentUser()` for the user, `ZodValidationPipe` on bodies.
5. **AI adapter** (`<domain>.ai.ts`): implement `DomainModule` (`id`, `contextPriority`, `aiContext(userId)`, `tools()`), inject `ModuleRegistryService`, call `this.registry.register(this)` in `onModuleInit`. `aiContext` returns `{ source, title, content: await service.summarize(userId), tokensEstimate: estimateTokens(content) }`.
6. **Module**: `@Module({ imports:[AuthModule], controllers:[...], providers:[Service, AiAdapter] })`.
7. **Register**: add the module to `AppModule.imports`.
8. **Web**: add a screen/section in `apps/web` using `lib/api.ts` patterns (a new `<Domain>Api` object + a component).

## Contracts (do not break)
- The AI never queries domain tables directly — it reads `aiContext()` summaries + the timeline + retrieval. Keep summaries SHORT (token budget).
- Tools the AI can call are returned from `tools()`, each built with `defineTool(spec, run)` (`core/domain-tool.ts`): the JSON-Schema spec the model sees and the handler that runs, side by side. The handler validates with the same zod DTO as the controller and returns `{ result, summary, undo }` — use `undoDelete` / `undoPatch` / `undoRecreate`, or `undo: null` when the write genuinely cannot be reversed. The AI module's `ToolRouterService` finds tools through the registry and never changes when a domain is added; two domains claiming one tool name fails at boot.
- All timeline `type` values are dotted `<domain>.<verb>`; `source` = the module id.

See `docs/architecture.md` for the why, and `apps/api/src/modules/tasks/` for the canonical example.
