# Atlas web image (Next.js standalone). Build context = repo root.
# NOTE: first exercised at the VPS-deploy step; fix + log to docs/GOTCHAS.md if needed.
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@11.13.1
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Enable Next standalone output (Linux only; Windows blocks its symlink step).
ENV BUILD_STANDALONE=1
COPY . .
RUN pnpm --filter @atlas/shared build && pnpm --filter @atlas/web build

# Next.js standalone output = minimal self-contained server.
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
