#!/usr/bin/env bash
#
# Setup script for a Codex cloud environment.
#
# Codex clones the repo, runs this once, then caches the container. Internet is
# available HERE and may not be afterwards, so everything that downloads has to
# happen in this file — an agent that discovers it cannot reach the network
# halfway through a task just fails in a confusing way.
#
# Paste the contents into the environment's setup script field, or point it at
# `bash infra/codex-setup.sh`.
#
# What this deliberately does NOT do: stand up Postgres. The e2e suite needs
# Postgres with pgvector and a built app, which is what the `e2e` job in
# .github/workflows/ci.yml is for. In the sandbox, run the four checks below and
# let CI run Playwright. Claiming an e2e pass you did not observe is worse than
# saying you could not run it.
set -euo pipefail

echo "== Node and pnpm =="
node --version
# pnpm's version is pinned by the packageManager field in package.json, so
# corepack resolves the right one rather than whatever is newest.
corepack enable
corepack prepare --activate

echo "== Install =="
# --frozen-lockfile so a resolution that drifted shows up here rather than as a
# mystery type error later.
pnpm install --frozen-lockfile

echo "== Prisma client =="
# Every typecheck depends on the generated client existing. This does not
# connect to anything and needs no DATABASE_URL.
pnpm --filter @atlas/db generate

echo "== Verify the toolchain actually works =="
# Run the cheap checks once now, so a broken environment is discovered during
# setup instead of being blamed on the first change someone makes.
pnpm lint
pnpm test

cat <<'DONE'

Environment ready.

The four checks that run here with no database and no .env:

  pnpm build
  pnpm typecheck --force
  pnpm lint
  pnpm test

Read AGENTS.md before changing code, HANDOFF.md for where the work stands, and
docs/GOTCHAS.md before debugging anything.
DONE
