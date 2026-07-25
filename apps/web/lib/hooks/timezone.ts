'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UserDTO } from '@atlas/shared';
import { browserTimezone, SettingsApi } from '@/lib/api';
import { qk } from './keys';

/**
 * Keep `User.timezone` in step with the device.
 *
 * Atlas has ONE clock per user, and this is what makes that true in practice.
 * The Today canvas buckets the day with the browser's local `Date`, while the
 * `/stats` rollups bucket server-side with `AT TIME ZONE <User.timezone>` —
 * two clocks that agree only if the stored zone IS the device's zone. It
 * defaulted to 'UTC' and was only ever corrected by finding a toggle in
 * Settings, so for every user outside UTC the two surfaces disagreed about
 * which day something happened.
 *
 * Syncing rather than picking one surface to "win" also does the right thing
 * on travel: the daily brief follows you to 7am local, and the day you are
 * looking at is the day you are living in.
 *
 * Best-effort and silent — a failed sync must never block the app, and it
 * retries on the next load.
 */
export function useTimezoneSync(me: UserDTO | null | undefined): void {
  const qc = useQueryClient();
  const attempted = useRef(false);

  useEffect(() => {
    if (!me || attempted.current) return;
    const tz = browserTimezone();
    if (!tz || tz === me.timezone) return;
    attempted.current = true;
    void SettingsApi.update({ timezone: tz })
      .then((settings) => {
        qc.setQueryData(qk.settings, settings);
        qc.setQueryData(qk.me, (prev: UserDTO | null | undefined) =>
          prev ? { ...prev, timezone: tz } : prev,
        );
        // Every stats window was bucketed against the old zone. Invalidate the
        // whole prefix, not one range — the user may have several cached.
        void qc.invalidateQueries({ queryKey: ['stats'] });
      })
      .catch(() => {
        // Silent by design: an unreachable API or a zone the server rejects
        // leaves the previous value in place, which is merely stale, not broken.
      });
  }, [me, qc]);
}
