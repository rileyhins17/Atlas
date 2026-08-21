'use client';

import { useMemo, useState } from 'react';
import type { HabitCadence, HabitDTO } from '@atlas/shared';
import { Check, Flame, Repeat, X } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import {
  useCreateHabit,
  useDeleteHabit,
  useHabitHistory,
  useHabits,
  useLogHabit,
  useUpdateHabit,
} from '@/lib/hooks/habits';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Heatmap,
  Input,
  ListSkeleton,
  QueryState,
} from '@/components/ui';
import { IconButton } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { useSubmitLatch } from '@/lib/hooks/submit-latch';
import { localDayKey } from '@/lib/dates';

const HISTORY_DAYS = 84; // 12 weeks of heatmap

/** The open edit dialog's working copy — null when nothing is being edited. */
type HabitDraft = { id: string; name: string; target: string; cadence: HabitCadence };

export function HabitsPanel() {
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<HabitDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const habitsQuery = useHabits();
  const historyQuery = useHabitHistory(HISTORY_DAYS);
  const create = useCreateHabit();
  const latch = useSubmitLatch();
  const editLatch = useSubmitLatch();
  const log = useLogHabit();
  const update = useUpdateHabit();
  const remove = useDeleteHabit();

  const habits = habitsQuery.data ?? [];
  const historyByHabit = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const h of historyQuery.data ?? []) {
      map.set(h.habitId, new Map(h.days.map((d) => [d.day, d.count])));
    }
    return map;
  }, [historyQuery.data]);

  const error = create.error ? errorMessage(create.error, 'Failed to add habit') : null;

  // M5: warn on a duplicate name, never block it. Two habits called "Stretch"
  // is usually a slip of memory, so the first submit asks; but it is sometimes
  // deliberate (morning/evening), so the SAME submit repeated goes through. A
  // hard unique constraint would turn the legitimate case into a dead end.
  const [dupWarned, setDupWarned] = useState<string | null>(null);

  function addHabit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const duplicate = habits.some((h) => h.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate && dupWarned !== trimmed) {
      setDupWarned(trimmed);
      return;
    }

    setDupWarned(null);
    latch((release) =>
      create.mutate({ name: trimmed }, { onSuccess: () => setName(''), onSettled: release }),
    );
  }

  function openEdit(habit: HabitDTO) {
    setDraftError(null);
    setDraft({
      id: habit.id,
      name: habit.name,
      // Held as a string so the field can be empty mid-edit. A number input
      // bound to a number cannot be cleared to retype it — it snaps to 0, which
      // is below the DTO's minimum and rejects the save you were halfway through.
      target: String(habit.target),
      // HabitDTO types cadence as a bare string (it mirrors the column), while
      // UpdateHabitInput only accepts the two-value enum. Narrow here rather
      // than tightening the shared DTO: anything that is not 'weekly' is daily,
      // which is the same default CreateHabitInput applies.
      cadence: habit.cadence === 'weekly' ? 'weekly' : 'daily',
    });
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;

    const trimmed = draft.name.trim();
    if (!trimmed) {
      setDraftError('A habit needs a name.');
      return;
    }
    // Mirrors CreateHabitInput/UpdateHabitInput (int, 1–100). Checked here so a
    // typo answers instantly and inline instead of round-tripping to a 400.
    const target = Number(draft.target);
    if (!Number.isInteger(target) || target < 1 || target > 100) {
      setDraftError('Target must be a whole number between 1 and 100.');
      return;
    }

    setDraftError(null);
    editLatch((release) =>
      update.mutate(
        { id: draft.id, patch: { name: trimmed, target, cadence: draft.cadence } },
        { onSuccess: () => setDraft(null), onSettled: release },
      ),
    );
  }

  return (
    <>
      <PageHeader title="Habits" subtitle="Small daily wins, kept alive by your streak." />
      <form className="row" onSubmit={addHabit}>
        <Input
          placeholder="New habit (e.g. Gym, Read, Water)…"
          aria-label="New habit name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            // A changed name is a new question; the old warning no longer applies.
            if (dupWarned) setDupWarned(null);
          }}
        />
        <Button type="submit" disabled={create.isPending}>
          Add
        </Button>
      </form>
      {error && <div className="error">{error}</div>}
      {dupWarned && (
        // role=status so a screen reader hears why the first Add "did nothing".
        <p className="muted" role="status" style={{ margin: '6px 0 0', fontSize: 13 }}>
          You already track &ldquo;{dupWarned}&rdquo;. Press Add again to track it twice.
        </p>
      )}

      <div className="stack" style={{ marginTop: 14, gap: 12 }} aria-busy={habitsQuery.isPending}>
        <QueryState
          query={habitsQuery}
          errorFallback="Failed to load habits"
          wrapper={Card}
          skeleton={<ListSkeleton rows={3} />}
          empty={
            habits.length === 0 && (
              <EmptyState
                icon={Repeat}
                title="No habits yet"
                hint="Add one to start a streak — daily check-ins keep it alive."
              />
            )
          }
        >
          {habits.map((h) => (
            <HabitCard
              key={h.id}
              habit={h}
              counts={historyByHabit.get(h.id)}
              onCheckIn={() => log.mutate(h.id)}
              onEdit={() => openEdit(h)}
              onRemove={() => remove.mutate(h.id)}
            />
          ))}
        </QueryState>
      </div>

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => !open && setDraft(null)}
        title="Edit habit"
      >
        {draft ? (
          // noValidate so the inline error slot is the only error surface —
          // same reasoning as the calendar composer.
          <form className="stack" noValidate onSubmit={saveEdit}>
            <label className="field">
              <span className="field-label">Name</span>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
              />
            </label>

            <label className="field">
              <span className="field-label">Times per day</span>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={draft.target}
                onChange={(e) => setDraft({ ...draft, target: e.target.value })}
              />
            </label>

            <label className="field">
              <span className="field-label">Cadence</span>
              <select
                className="input"
                value={draft.cadence}
                onChange={(e) =>
                  setDraft({ ...draft, cadence: e.target.value as HabitCadence })
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>

            {draftError && <div className="error">{draftError}</div>}

            <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={update.isPending}>
                Save
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </>
  );
}

/** Last 7 local days (oldest first) with done-ness for the mini week grid. */
export function weekCells(
  counts: Map<string, number> | undefined,
  target: number,
  today: Date,
): Array<{ day: string; done: boolean; count: number }> {
  const cells: Array<{ day: string; done: boolean; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = localDayKey(d);
    const count = counts?.get(key) ?? 0;
    cells.push({ day: key, done: count >= Math.max(1, target), count });
  }
  return cells;
}

function HabitCard({
  habit,
  counts,
  onCheckIn,
  onEdit,
  onRemove,
}: {
  habit: HabitDTO;
  counts: Map<string, number> | undefined;
  onCheckIn: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const week = weekCells(counts, habit.target, new Date());
  return (
    <Card stack className={habit.doneToday ? 'habit-card done' : 'habit-card'}>
      <div className="row" style={{ gap: 13 }}>
        <button
          className={`check ${habit.doneToday ? '' : ''}`}
          aria-label={`Check in "${habit.name}"`}
          aria-pressed={habit.doneToday}
          onClick={onCheckIn}
        >
          <Check size={14} strokeWidth={3} aria-hidden />
        </button>
        <div className="stack" style={{ gap: 1, flex: 1, minWidth: 0 }}>
          {/* The name is the edit affordance, the way an event row is on the
              calendar. A separate pencil would be a fifth control on a row that
              already carries four. The label is explicit rather than the visible
              text, so it says what the control DOES and reads like its two
              siblings ("Check in …", "Archive …") instead of announcing a bare
              habit name and leaving the purpose to be guessed. */}
          <button
            type="button"
            className="habit-name"
            aria-label={`Edit habit "${habit.name}"`}
            onClick={onEdit}
          >
            {habit.name}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            {habit.todayCount}/{habit.target} today · {habit.cadence}
          </span>
        </div>
        <div className="week-grid" role="img" aria-label={`${habit.name}: last 7 days`}>
          {week.map((c) => (
            <span key={c.day} className={`week-dot ${c.done ? 'done' : ''}`} title={c.day} />
          ))}
        </div>
        {habit.streak > 0 && (
          <Badge className="streak" aria-label={`${habit.streak} day streak`}>
            <Flame size={13} aria-hidden />
            {habit.streak}
          </Badge>
        )}
        <IconButton label={`Archive "${habit.name}"`} onClick={onRemove}>
          <X size={16} aria-hidden />
        </IconButton>
      </div>
      {/* Half a year, not twelve weeks.
          The cells share the width they are given, so twelve columns drew a
          250px grid in a 600px card and left the rest blank — three habits and
          most of the screen was empty. Twenty-six columns fill the card at the
          same cell size, and the extra history is the part of a habit tracker
          worth looking at. */}
      <div className="habit-heatmap">
        <Heatmap
          counts={counts ?? new Map()}
          weeks={26}
          target={habit.target}
          label={`${habit.name} check-ins, last 26 weeks`}
        />
      </div>
    </Card>
  );
}
