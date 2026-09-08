# Adding a life-domain module

A "module" is one life area (tasks, habits, journal, finance …). Adding one is mechanical — copy the **Tasks** module (`apps/api/src/modules/tasks/`), which is the reference implementation. Nothing in the core changes.

## Files to create (mirror `modules/tasks/`)
```
apps/api/src/modules/<domain>/
  <domain>.service.ts     orchestration/persistence + writes TimelineEvents
  <domain>.controller.ts  REST endpoints, guarded by SessionGuard
  <domain>.ai.ts          RegisteredDomainModule adapter: metadata + getToolSpecs()
  <domain>.module.ts      wires the above; imports AuthModule
```
Plus: shared DTOs in `packages/shared/src/dto/<domain>.ts` (zod), and register the module in `apps/api/src/app.module.ts`.

## Step by step
1. **DB**: add the model(s) to `packages/db/prisma/schema.prisma` if needed. Follow `AGENTS.md` section 6: inspect a migration diff, confirm it is additive, hand-write the commented SQL, then deploy and generate. Never run `prisma migrate dev`.
2. **DTOs**: add zod input/output schemas to `packages/shared/src/dto/<domain>.ts`; export from `packages/shared/src/index.ts`. Use these with `ZodValidationPipe` on the controller and as web client types.
3. **Service**: inject `PrismaService` + `TimelineService`. Keep pure calculations and parsing in `packages/shared`; the service scopes queries by owner and coordinates persistence. Every create/update/delete that matters should call `this.timeline.write({ userId, type: '<domain>.<verb>', source: '<domain>', title, refType, refId })`. Add a bounded `summarize(userId)` with row ids and user-local dates/times.
4. **Controller**: `@Controller('<domain>')`, `@UseGuards(SessionGuard)`, use `@CurrentUser()` for the user, `ZodValidationPipe` on bodies.
5. **AI adapter** (`<domain>.ai.ts`): extend `RegisteredDomainModule`. Declare `id`, `contextTitle`, an explicit `contextPriority`, and `getToolSpecs()`. Keep the concrete service and registry in the decorated constructor and call `super(registry, service)`. The base class owns `onModuleInit` registration and `aiContext`; do not copy those methods into each domain. The framework-independent `DomainModule` interface lives in `@atlas/shared`.
6. **Module**: `@Module({ imports:[AuthModule], controllers:[...], providers:[Service, AiAdapter] })`.
7. **Register**: add the module to `AppModule.imports`.
8. **Web**: add a screen/section in `apps/web` using `lib/api.ts` patterns (a new `<Domain>Api` object + a component).

## Contracts (do not break)
- The AI never queries domain tables directly — it reads `aiContext()` summaries + the timeline + retrieval. Keep summaries SHORT (token budget).
- Tools the AI can call are declared in `getToolSpecs()` as JSON-Schema; the actual handler is wired in Phase 2's tool router to the service method.
- All timeline `type` values are dotted `<domain>.<verb>`; `source` = the module id.
- Application and domain packages import generated database types and values from `@atlas/db`. ESLint rejects direct `@prisma/client` imports, including its subpaths.

See `docs/architecture.md` for the why, and `apps/api/src/modules/tasks/` for the canonical example.
