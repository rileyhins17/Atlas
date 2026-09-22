# Fitbit & Pixel Watch (Google Health)

Atlas reads sleep, steps, resting heart rate, HRV and workouts from the
**Google Health API** — the replacement for the Fitbit Web API, which Google
shut down in September 2026. It is read-only: Atlas never writes health data.

## One-time setup (Google Cloud)

Uses the **same OAuth client** as Google Calendar. In the Google Cloud project
that holds it:

1. **Enable the API.** APIs & Services → Library → *Google Health API* → Enable.
2. **Add the scopes to the consent screen** (Google Auth Platform → Data access):
   - `.../auth/googlehealth.activity_and_fitness.readonly`
   - `.../auth/googlehealth.health_metrics_and_measurements.readonly`
   - `.../auth/googlehealth.sleep.readonly`
3. **Register the callback** under the OAuth client's *Authorized redirect
   URIs*, exactly:
   `https://atlaslife.app/api/connectors/google-health/callback`
   (Settings → Fitbit & Pixel Watch shows the exact string this server sends.)
4. **Add every person as a test user** (Audience → Test users) — including
   anyone Atlas is shared with. While the app is in Testing, only listed test
   users can connect.
5. **Apply the migration** on the production database:
   `pnpm --filter @atlas/db migrate:deploy` (it adds `wearable_days` and
   `wearable_activities`; additive only). Until it runs, only the watch
   endpoints fail — the rest of Atlas is unaffected.

No new env var is needed: the callback is derived from `GOOGLE_REDIRECT_URI`.
Set `GOOGLE_HEALTH_REDIRECT_URI` only to override it.

## What to expect while the app is in Testing

Every Google Health scope is **Restricted**. That has two consequences:

- **Refresh tokens expire after 7 days.** The watch stops syncing about weekly.
  Atlas notices (`credentials.status = 'revoked'`), stops trying, and shows a
  quiet *Reconnect* on Today and in Settings. One tap fixes it.
- **At most 100 users.** Fine for testing; not for selling.

Both go away only by **publishing the app**, which for Restricted scopes means
Google's app verification **plus an annual CASA security assessment** by a
third-party assessor. That is a pre-launch item, not a pre-Maya one.

## How it works

- `packages/connectors/src/google-health.ts` — the API client. Shapes follow
  the discovery document (`https://health.googleapis.com/$discovery/rest?version=v4`);
  note int64 fields (steps, bpm, minutes asleep) arrive as JSON **strings**.
- `apps/api/src/modules/wearables/` — OAuth routes under
  `/connectors/google-health/*`, data at `/wearables/summary`, the sync, and the
  AI adapter (`contextPriority` 85).
- **Sync is on open, not on a timer.** Opening Today or Training calls
  `POST /connectors/google-health/sync`; the server skips itself if it ran in the
  last 10 minutes. The first sync reads 30 days; later ones re-read 3 days
  behind the newest stored day, because Google revises recent days (sleep
  stages finish processing later, steps backfill when the watch syncs).
- **Sleep belongs to the day it ended**, so "last night" is today's row.
- **Watch workouts are not logged workouts.** They live in `wearable_activities`,
  never in `workouts`: a set someone logged is something they vouch for; a
  watch's guess is not. New ones appear on the timeline.
- Nothing polls Google in the background, so an idle Atlas makes no calls.
- **Webhooks are not implemented yet.** The API supports them (steps, sleep,
  weight…), but creating a subscriber needs project-level Cloud credentials,
  not a user grant. Sync-on-open covers the use case for now.
