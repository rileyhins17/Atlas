'use client';

import Link from 'next/link';
import { Footprints, HeartPulse, Moon, Watch } from 'lucide-react';
import { STEP_GOAL, formatDistance, formatSleep, type WearableDayDTO } from '@atlas/shared';
import { useWearablesAutoSync, useWearablesStatus, useWearablesSummary } from '@/lib/hooks/wearables';
import { formatAgo, localDayKey } from '@/lib/dates';
import { Skeleton } from '@/components/ui';

/**
 * The watch's numbers, shown only to someone who has one.
 *
 * Neither card nags. Without a connection they render nothing at all — a
 * "connect your Fitbit" box on the main screen of someone who does not own one
 * is an advert, not a feature. The way in is Settings.
 */

function useWatch(days: number) {
  const status = useWearablesStatus();
  const connected = Boolean(status.data?.connected && !status.data.needsReconnect);
  useWearablesAutoSync(connected);
  const summary = useWearablesSummary(days, connected);
  return { status, summary, connected };
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function ReconnectNote() {
  return (
    <section className="sf-card wear-card" aria-label="Your watch">
      <p className="sf-muted">
        Your watch stopped syncing — Google asks for a fresh sign-in now and then.{' '}
        <Link href="/settings#wearables" className="wear-link">
          Reconnect
        </Link>
      </p>
    </section>
  );
}

/** Soft Today: last night, steps so far, resting heart rate. */
export function BodyCard() {
  const { status, summary, connected } = useWatch(7);
  if (!status.data?.connected) return null;
  if (!connected) return <ReconnectNote />;

  const days = summary.data?.days ?? [];
  const today: WearableDayDTO | undefined = days.find((d) => d.dayKey === localDayKey(new Date()));
  const steps = today?.steps ?? null;
  const fill = steps === null ? 0 : Math.min(1, steps / STEP_GOAL);
  const rhr = [...days].reverse().find((d) => d.restingHeartRate !== null)?.restingHeartRate ?? null;

  return (
    <section className="sf-card wear-card" aria-labelledby="wear-body-title">
      <header className="sf-card-head">
        <h2 id="wear-body-title" className="sf-card-title">
          Your body
        </h2>
        <Link href="/fitness" className="sf-link">
          Details
        </Link>
      </header>

      {summary.isPending ? (
        <Skeleton height={84} />
      ) : summary.isError ? (
        <p className="sf-muted">Your watch data did not load. Try again shortly.</p>
      ) : days.length === 0 ? (
        <p className="sf-muted">Connected — the first sync is on its way.</p>
      ) : (
        <div className="wear-grid">
          <div className="wear-stat">
            <Moon size={18} aria-hidden className="wear-icon" />
            <span className="wear-label">Last night</span>
            <span className="wear-value">
              {today?.sleepMinutes != null ? formatSleep(today.sleepMinutes) : '—'}
            </span>
            <span className="wear-sub">
              {today?.sleepMinutes == null
                ? 'no sleep recorded'
                : today.deepMinutes != null
                  ? `deep ${formatSleep(today.deepMinutes)}`
                  : 'asleep'}
            </span>
          </div>

          <div className="wear-stat">
            <span
              className="wear-ring"
              aria-hidden
              style={{ '--fill': `${Math.round(fill * 360)}deg` } as React.CSSProperties}
            >
              <Footprints size={16} />
            </span>
            <span className="wear-label">Steps</span>
            <span className="wear-value">{steps !== null ? steps.toLocaleString() : '—'}</span>
            <span className="wear-sub">of {STEP_GOAL.toLocaleString()}</span>
          </div>

          <div className="wear-stat">
            <HeartPulse size={18} aria-hidden className="wear-icon" />
            <span className="wear-label">Resting</span>
            <span className="wear-value">{rhr !== null ? rhr : '—'}</span>
            <span className="wear-sub">bpm</span>
          </div>
        </div>
      )}

      {summary.data?.lastSyncedAt && (
        <p className="wear-updated">Updated {formatAgo(new Date(summary.data.lastSyncedAt))}</p>
      )}
    </section>
  );
}

/** Training: the week's averages, and the workouts the watch recorded. */
export function WatchActivityCard() {
  const { status, summary, connected } = useWatch(14);
  if (!status.data?.connected) return null;
  if (!connected) return <ReconnectNote />;

  const days = summary.data?.days ?? [];
  const week = days.slice(-7);
  const sleepAvg = average(week.flatMap((d) => (d.sleepMinutes === null ? [] : [d.sleepMinutes])));
  const stepsAvg = average(week.flatMap((d) => (d.steps === null ? [] : [d.steps])));
  const activities = summary.data?.activities ?? [];

  return (
    <section className="sf-card wear-card" aria-labelledby="wear-activity-title">
      <header className="sf-card-head">
        <h2 id="wear-activity-title" className="sf-card-title">
          <Watch size={18} aria-hidden className="wear-icon" /> From your watch
        </h2>
      </header>
      {summary.isPending ? (
        <Skeleton height={96} />
      ) : summary.isError ? (
        <p className="sf-muted">Your watch data did not load. Try again shortly.</p>
      ) : (
        <>
          <p className="wear-week">
            This week: {sleepAvg !== null ? `${formatSleep(sleepAvg)} sleep a night` : 'no sleep recorded'}
            {stepsAvg !== null ? ` · ${Math.round(stepsAvg).toLocaleString()} steps a day` : ''}
          </p>
          {activities.length === 0 ? (
            <p className="sf-muted">No workouts recorded by your watch in the last two weeks.</p>
          ) : (
            <ul className="wear-list">
              {activities.slice(0, 6).map((a) => (
                <li key={a.id} className="wear-row">
                  <span className="wear-row-name">{a.name}</span>
                  <span className="wear-row-when">{formatAgo(new Date(a.startAt))}</span>
                  <span className="wear-row-meta">
                    {[
                      a.activeMinutes != null ? `${a.activeMinutes} min` : null,
                      a.distanceMeters ? formatDistance(a.distanceMeters) : null,
                      a.avgHeartRate != null ? `${a.avgHeartRate} bpm` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
