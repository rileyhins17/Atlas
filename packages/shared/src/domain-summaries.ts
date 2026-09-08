import type { EventDTO } from './dto/event.js';
import type { WorkoutDTO } from './dto/fitness.js';
import type { GoalDTO } from './dto/goal.js';
import type { HabitDTO } from './dto/habit.js';
import type { RoutineBlockDTO } from './dto/routine.js';
import type { TrackerDTO } from './dto/trackers.js';
import type { AccountRecord, TransactionRecord, JournalRecord, NoteRecord, TaskRecord } from './response-serialization.js';
import { groupSetsByExercise, describeSet, gramsToKg } from './dto/fitness-util.js';
import { dayKeyInTz } from './time.js';
import { journalSnippet as snippet, routineClockLabel as fmt } from './service-calculations.js';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export type TrackerSummaryOverview = { tracker: TrackerDTO; points: { dayKey: string; value: number }[]; sentence: string | null };

export function summarizeCalendar(upcoming: EventDTO[], tz: string): string {
  if (upcoming.length === 0) return 'No upcoming events.';
  const when = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const lines = upcoming.map(
    (e) =>
      `- [${e.id}] ${e.title} — ${e.allDay ? 'all day' : when.format(new Date(e.startAt))}`,
  );
  return `Next ${upcoming.length} event(s), times in ${tz}:\n${lines.join('\n')}`;
}

export function summarizeFinance(accounts: AccountRecord[], recent: Pick<TransactionRecord, 'amountMinor'>[]): string {
  if (accounts.length === 0) return 'No financial accounts connected.';

  let outMinor = 0;
  let inMinor = 0;
  for (const t of recent) {
    const amt = Number(t.amountMinor);
    if (amt < 0) outMinor += amt;
    else inMinor += amt;
  }

  const lines = accounts.map((a) => {
    const bal = (Number(a.balanceMinor) / 100).toFixed(2);
    const where = a.institution ? ` (${a.institution}${a.mask ? ` ••${a.mask}` : ''})` : '';
    return `- [${a.id}] ${a.name}${where}: ${bal} ${a.currency}`;
  });
  const flow = `Last 7 days: out ${(outMinor / 100).toFixed(2)}, in ${(inMinor / 100).toFixed(2)}.`;
  return `Accounts (${accounts.length}):\n${lines.join('\n')}\n${flow}`;
}

export function summarizeFitness(open: WorkoutDTO | null, recent: WorkoutDTO[], tz: string): string {
  if (!open && recent.length === 0) return 'No workouts logged.';

  const lines: string[] = [`Workout dates in ${tz}:`];
  if (open) {
    lines.push(`In progress: [${open.id}] ${open.title} (${open.workingSets} sets so far).`);
  }
  for (const w of recent) {
    const when = dayKeyInTz(new Date(w.startedAt), tz);
    const top = groupSetsByExercise(w.sets)
      .slice(0, 3)
      .map((g) => {
        const best = g.sets.filter((s) => !s.warmup).at(-1);
        return best ? `${g.exerciseName} ${describeSet(best, g.kind)}` : g.exerciseName;
      })
      .join(', ');
    lines.push(`- [${w.id}] ${when}: ${w.title} — ${gramsToKg(w.volumeGrams)} kg volume${top ? ` (${top})` : ''}`);
  }
  return lines.join('\n');
}

export function summarizeGoals(goals: GoalDTO[], tz: string): string {
  const active = goals.filter((g) => g.status === 'active');
  if (active.length === 0) return 'No goals set.';
  const line = (g: GoalDTO) =>
    `- [${g.id}] ${g.title}` +
    (g.targetDate ? ` (by ${dayKeyInTz(new Date(g.targetDate), tz)})` : '') +
    ` — ${g.taskCount === 0 ? 'nothing linked yet' : `${g.doneTaskCount}/${g.taskCount} tasks done`}`;
  const short = active.filter((g) => g.horizon === 'short');
  const long = active.filter((g) => g.horizon === 'long');
  const parts: string[] = [];
  if (short.length > 0) parts.push(`Short-term goals:\n${short.map(line).join('\n')}`);
  if (long.length > 0) parts.push(`Long-term goals:\n${long.map(line).join('\n')}`);
  return `Goal dates in ${tz}:\n${parts.join('\n\n')}`;
}

export function summarizeHabits(habits: HabitDTO[]): string {
  if (habits.length === 0) return 'No habits tracked.';
  const lines = habits.map(
    // The id is what makes habits.update / habits.delete addressable.
    (h) =>
      `- [${h.id}] ${h.name}: ${h.doneToday ? 'done today' : 'not yet today'}, streak ${h.streak}d`,
  );
  return `${habits.length} habit(s):\n${lines.join('\n')}`;
}

export function summarizeJournal(recent: JournalRecord[], tz: string): string {
  if (recent.length === 0) return 'No journal entries yet.';
  const moods = recent.map((e) => e.mood).filter((m): m is number => m != null);
  const avg = moods.length ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : 'n/a';
  const lines = recent.map((entry) =>
    `- [${entry.id}] ${dayKeyInTz(entry.entryDate, tz)}: "${snippet(entry.body, 120)}"`,
  );
  return `${recent.length} recent entr(ies). Avg mood: ${avg}/5. Dates in ${tz}:\n${lines.join('\n')}`;
}

export function summarizeNotes(pinned: NoteRecord[], total: number): string {
  if (total === 0) return 'No notes yet.';
  if (pinned.length === 0) return `${total} note(s), none pinned as key facts.`;
  const lines = pinned.map((n) => `- [${n.id}] ${n.title ? `${n.title}: ` : ''}${n.body.slice(0, 100)}`);
  return `Key facts about the user (pinned notes):\n${lines.join('\n')}`;
}

export function summarizeRoutine(blocks: RoutineBlockDTO[]): string {
  if (blocks.length === 0) return 'No routine set. The user has not described their typical week.';

  const weekly = blocks.filter((b) => !b.onDate);
  const dated = blocks.filter((b) => b.onDate);

  const describe = (b: RoutineBlockDTO) => {
    const when = b.onDate
      ? b.onDate
      : b.days === 127
        ? 'daily'
        : DAY_LETTERS.filter((_, i) => b.days & (1 << i)).join('');
    const wrap = b.startMin > b.endMin ? ' (overnight)' : '';
    const off = b.kind === 'off' ? ' — NOT working, this clears the usual block' : '';
    // The id is what makes routine.remove_block addressable.
    return `- [${b.id}] ${b.label}: ${fmt(b.startMin)}–${fmt(b.endMin)} ${when}${wrap}${off}`;
  };

  const parts: string[] = [];
  if (weekly.length > 0) {
    parts.push(
      `Typical week (the user's routine — use this to time suggestions):\n${weekly.map(describe).join('\n')}`,
    );
  }
  if (dated.length > 0) {
    parts.push(`Specific days that differ from the usual week:\n${dated.map(describe).join('\n')}`);
  }
  return parts.join('\n\n');
}

export function summarizeTasks(open: number, dueSoon: Pick<TaskRecord, 'id' | 'title' | 'dueAt'>[], tz: string): string {
  if (open === 0) return 'No open tasks.';
  // The id is what makes tasks.update / tasks.delete usable at all — without
  // it the model can name a task but cannot address one.
  const lines = dueSoon.map(
    (t) => `- [${t.id}] ${t.title}${t.dueAt ? ` (due ${dayKeyInTz(t.dueAt, tz)})` : ''}`,
  );
  return `${open} open task(s). Dates in ${tz}. Next up:\n${lines.join('\n') || '(none with due dates)'}`;
}

export function summarizeTrackers(overview: TrackerSummaryOverview[]): string {
  if (overview.length === 0) return 'No personal trackers.';
  const lines = overview.map(({ tracker, points, sentence }) => {
    if (points.length === 0) return `- [${tracker.id}] ${tracker.name}: set up, not rated yet.`;
    const scale =
      tracker.lowLabel && tracker.highLabel
        ? ` (1 = ${tracker.lowLabel}, 10 = ${tracker.highLabel})`
        : '';
    return `- [${tracker.id}] ${sentence ?? `${tracker.name}: ${points.at(-1)!.value}/10`}${scale}`;
  });
  return lines.join('\n');
}
