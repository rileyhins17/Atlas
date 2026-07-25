'use client';

import { useMemo, useState } from 'react';
import type { RoutineBlockDTO, RoutineBlockInput, RoutineKind } from '@atlas/shared';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import {
  useAddRoutineBlock,
  useRemoveRoutineBlock,
  useRoutine,
  useUpdateRoutineBlock,
} from '@/lib/hooks/routine';
import { Button, Card, ErrorState, Input, ListSkeleton } from '@/components/ui';
import { minToTime, timeToMin, DAILY, WEEKDAYS } from '@/lib/onboarding';

/** Monday-first, matching the 7-bit day mask (bit 0 = Monday). */
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const KINDS: { value: RoutineKind; label: string }[] = [
  { value: 'work', label: 'Work' },
  { value: 'school', label: 'School' },
  { value: 'sleep', label: 'Sleep' },
  { value: 'meal', label: 'Meal' },
  { value: 'exercise', label: 'Exercise' },
  { value: 'winddown', label: 'Wind-down' },
  { value: 'custom', label: 'Other' },
];

/** Today as YYYY-MM-DD in the browser's local frame — `onDate` is a local date. */
function todayKey(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function describeDays(days: number): string {
  if (days === DAILY) return 'Every day';
  if (days === WEEKDAYS) return 'Weekdays';
  const on = DAY_NAMES.filter((_, i) => days & (1 << i));
  if (on.length === 0) return 'Never';
  return on.map((d) => d.slice(0, 3)).join(', ');
}

/** One editable row. Saves on blur/change — no separate save button to forget. */
function BlockRow({ block }: { block: RoutineBlockDTO }) {
  const update = useUpdateRoutineBlock();
  const remove = useRemoveRoutineBlock();
  const [label, setLabel] = useState(block.label);

  const patch = (p: Partial<RoutineBlockInput>) => update.mutate({ id: block.id, patch: p });
  const toggleDay = (i: number) => {
    const next = block.days ^ (1 << i);
    // A weekly block on zero days would silently vanish from every view, so the
    // last day can't be turned off — delete the block instead.
    if (next === 0) return;
    patch({ days: next });
  };

  const overnight = block.startMin > block.endMin;

  return (
    <div className={`routine-row ${block.kind === 'off' ? 'is-off' : ''}`}>
      <div className="routine-row-top">
        <Input
          className="routine-label"
          aria-label={`Name for ${block.label}`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            const v = label.trim();
            if (v && v !== block.label) patch({ label: v });
            else setLabel(block.label);
          }}
        />

        <select
          className="routine-kind"
          aria-label={`Type for ${block.label}`}
          value={block.kind}
          onChange={(e) => patch({ kind: e.target.value as RoutineKind })}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
          {/* 'off' is only ever created by the day-off action, but a row that
              already is one must still show its own type correctly. */}
          {block.kind === 'off' && <option value="off">Time off</option>}
        </select>

        <label className="routine-time">
          <span className="sr-only">Start time for {block.label}</span>
          <input
            type="time"
            value={minToTime(block.startMin)}
            onChange={(e) => patch({ startMin: timeToMin(e.target.value) })}
          />
        </label>
        <span className="routine-dash" aria-hidden>
          –
        </span>
        <label className="routine-time">
          <span className="sr-only">End time for {block.label}</span>
          <input
            type="time"
            value={minToTime(block.endMin)}
            onChange={(e) => patch({ endMin: timeToMin(e.target.value) })}
          />
        </label>

        <button
          type="button"
          className="routine-del"
          aria-label={`Delete ${block.label}`}
          disabled={remove.isPending}
          onClick={() => remove.mutate(block.id)}
        >
          <Trash2 size={14} aria-hidden />
        </button>
      </div>

      <div className="routine-row-bottom">
        {block.onDate ? (
          <span className="routine-oneoff">Just {block.onDate}</span>
        ) : (
          <div className="routine-days" role="group" aria-label={`Days for ${block.label}`}>
            {DAY_LABELS.map((d, i) => {
              const on = (block.days & (1 << i)) !== 0;
              return (
                <button
                  key={DAY_NAMES[i]}
                  type="button"
                  className={`routine-day ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  aria-label={DAY_NAMES[i]}
                  onClick={() => toggleDay(i)}
                >
                  {d}
                </button>
              );
            })}
          </div>
        )}
        {overnight && <span className="routine-hint">runs past midnight</span>}
      </div>
    </div>
  );
}

/**
 * The week, editable.
 *
 * This is what makes the day surfaces trustworthy: Today decides what counts as
 * free time from these blocks, so if it ever says you're open while you're at
 * work, this is the screen that fixes it. Before this existed, a routine
 * captured during onboarding could never be corrected.
 */
export function RoutineEditor() {
  const routine = useRoutine();
  const add = useAddRoutineBlock();

  const blocks = routine.data ?? [];
  const { weekly, dated } = useMemo(
    () => ({
      weekly: blocks.filter((b) => !b.onDate),
      dated: blocks.filter((b) => b.onDate),
    }),
    [blocks],
  );

  if (routine.isPending) return <ListSkeleton rows={4} circle={false} />;
  if (routine.isError) {
    return (
      <ErrorState
        message={errorMessage(routine.error, 'Failed to load your week')}
        onRetry={() => void routine.refetch()}
      />
    );
  }

  return (
    <Card stack>
      <div>
        <h2 className="card-title">Your week</h2>
        <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>
          Atlas uses this to know when you&rsquo;re actually free. Anything not covered here
          counts as open time.
        </p>
      </div>

      {weekly.length === 0 ? (
        <p className="prog-muted">
          Nothing set yet — add your sleep and work hours so your day stops reading as
          wide open.
        </p>
      ) : (
        <div className="routine-list">
          {weekly.map((b) => (
            <BlockRow key={b.id} block={b} />
          ))}
        </div>
      )}

      <div className="routine-actions">
        <Button
          variant="ghost"
          disabled={add.isPending}
          onClick={() =>
            add.mutate({
              label: 'New block',
              kind: 'work',
              days: WEEKDAYS,
              startMin: 9 * 60,
              endMin: 17 * 60,
            })
          }
        >
          <Plus size={14} aria-hidden /> Add to my week
        </Button>

        {/* Shift work and one-off days: a dated block overrides the weekly one of
            the same kind, so this doesn't need the weekly pattern edited. */}
        <Button
          variant="ghost"
          disabled={add.isPending}
          onClick={() =>
            add.mutate({
              label: 'Shift',
              kind: 'work',
              days: DAILY,
              onDate: todayKey(),
              startMin: 9 * 60,
              endMin: 17 * 60,
            })
          }
        >
          <Plus size={14} aria-hidden /> Working a one-off today
        </Button>

        <Button
          variant="ghost"
          disabled={add.isPending}
          onClick={() =>
            add.mutate({
              label: 'Day off',
              kind: 'off',
              days: DAILY,
              onDate: todayKey(),
              startMin: 0,
              endMin: 1439,
            })
          }
        >
          <CalendarOff size={14} aria-hidden /> I&rsquo;m off today
        </Button>
      </div>

      {dated.length > 0 && (
        <div className="routine-dated">
          <h3 className="section-title" style={{ marginBottom: 6 }}>
            Specific days
          </h3>
          <div className="routine-list">
            {dated.map((b) => (
              <BlockRow key={b.id} block={b} />
            ))}
          </div>
        </div>
      )}

      {weekly.length > 0 && (
        <p className="routine-summary">
          {weekly.map((b) => `${b.label} ${minToTime(b.startMin)}–${minToTime(b.endMin)} (${describeDays(b.days)})`).join(' · ')}
        </p>
      )}
    </Card>
  );
}
