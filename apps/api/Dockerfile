# Atlas API image (monorepo-aware). Build context = repo root.
# NOTE: exercised for the first time at the VPS-deploy step; if it needs a tweak,
# fix it there and log it in docs/GOTCHAS.md.
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# openssl is required by Prisma's query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.13.1
WORKDIR /app

# --- Install deps (cached on manifest changes) ---
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/connectors/package.json packages/connectors/
COPY packages/ai/package.json packages/ai/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# --- Build ---
FROM deps AS build
COPY . .
RUN pnpm --filter @atlas/db generate \
  && pnpm --filter @atlas/db --filter @atlas/shared --filter @atlas/connectors --filter @atlas/ai --filter @atlas/api build

# --- Runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app
# Apply pending migrations, then start the API.
CMD ["sh", "-c", "pnpm --filter @atlas/db exec prisma migrate deploy && node apps/api/dist/main.js"]
