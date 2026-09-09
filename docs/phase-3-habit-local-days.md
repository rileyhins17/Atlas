# Habit calendars use the account local day

An evening check-in could count toward tomorrow: UI calendar labels were local,
but API history, count and streak calculation used UTC. The service now resolves
the account timezone once per read, groups timestamp values in that bound zone,
and passes the same zone and instant into shared serialization. History uses
complete local dates, including today. Existing logs are not rewritten and
weekly cadence behavior is unchanged.

Five regressions were observed red: three shared day/count/streak cases and two
API DST window/bound-parameter cases. After the change, 18 shared and 10 API
focused tests passed. The API tests mock Prisma and do not prove SQL execution.

A CI-only script exercises actual public service reads against disposable
pgvector Postgres with synthetic Toronto evening, Tokyo morning and spring/fall
DST rows. It checks history, today's count, streak, tenant isolation, one-day
windows and unchanged raw logs. Exact local test URLs are required; no production
backup or environment files are read. The existing authenticated habit-history
browser test remains in the full and independent CI selections. No fresh SQL or
Playwright pass is claimed while Actions billing prevents jobs starting.

This slice follows unmerged PR #64 through 31a8f57. No migration, dependency,
credential, live infrastructure or production data changes.

Ordered local gates passed: build 6/6, forced typecheck 10/10, lint zero errors
with three existing warnings, and 1,717 unit tests (919 shared, 350 API,
389 web, 34 AI and 25 connectors). CI SQL and browser execution is pending.
