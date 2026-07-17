# ADR 0003 — AI providers: DeepSeek direct for chat, local model for embeddings

**Status:** Accepted (2026-07-17) · **Context:** Phase 2 (the AI brain) · **Amends:** ADR 0001

## Decision
- **Chat** calls DeepSeek's own API (`api.deepseek.com`) via `DeepSeekConnector`, with a **concrete model id** (`deepseek-v4-flash`), not OpenRouter and not an alias.
- **Embeddings** run **locally, in-process** (`LocalEmbedder` in `packages/ai`, `Xenova/bge-base-en-v1.5` via `@huggingface/transformers`). No API key, no per-call cost.
- `OpenRouterConnector` is **deleted**. Atlas talks to exactly one external AI provider.

## Why

**DeepSeek direct instead of OpenRouter.** ADR 0001 assumed OpenRouter as a router in front of DeepSeek. In practice the credits bought were DeepSeek *platform* credits, so routing through OpenRouter would have meant a second account, a second balance, and a middleman for the one model we use. The direct API is the same OpenAI-compatible shape, so the connector abstraction is unaffected — swapping providers later is still one file.

**A concrete model id, not the `deepseek-chat` alias.** The API resolves aliases server-side and echoes the *resolved* id back, and that echoed id is what `CostGuard` writes to `ai_usage` and prices against. Configuring the alias meant every row missed `MODEL_RATES` and silently priced at the placeholder fallback (a real ~47 micro-USD call logged as 1020). Pinning the id makes cost real. DeepSeek also removes the legacy aliases on 2026-07-24.

**Local embeddings instead of a second provider.** DeepSeek has no embeddings endpoint (`POST /embeddings` → 404), so semantic memory needed vectors from somewhere. Signing up for a second paid provider to embed a few journal entries conflicts with the project's premises — self-hosted, AI budget < $5/mo, and sensitive data (journal, finance) that shouldn't leave the box without a reason. A ~110MB model that embeds 2 texts in ~110ms costs nothing per call and keeps the data local. Measured retrieval quality is good: a genuinely related memory scores ~0.64 distance vs ~0.98 for an unrelated one, with no keyword overlap.

## Consequences / constraints
- **Model width is coupled to the schema.** bge-base-en-v1.5 emits 768 dims to match `embeddings.embedding vector(768)`. A different-width model needs a column migration; `LocalEmbedder` throws `EmbeddingDimensionError` rather than write a bad vector.
- **The embedding path has no cost guard**, deliberately: local inference is free, so there is no spend to bound. Every *chat* path still goes through `CostGuard`.
- **Ops:** the model downloads on first use and is then cached on disk. Bake it into the Docker image or pre-warm at boot (`LocalEmbedder.warmup()`) so the first VPS request isn't slow. It costs RAM in the API process — a factor on a cheap VPS.
- **pnpm friction** (see `docs/GOTCHAS.md`): `onnxruntime-node`/`protobufjs` need `allowBuilds`, and `@huggingface/transformers` imports `onnxruntime-common` without declaring it, needing a `packageExtensions` entry.
- **Pricing must track the provider.** Add a model's rate — including its cached-input rate — whenever the model changes, or costs silently fall back.
- If a future need arises for models DeepSeek doesn't serve, reintroduce a router connector then; the `Connector` + shared `chat.ts` types already allow it.
