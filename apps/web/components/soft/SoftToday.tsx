'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Clock, Dumbbell, Plus, Sparkles } from 'lucide-react';
import type { HabitDTO, TaskDTO } from '@atlas/shared';
import { useMe } from '@/lib/hooks/auth';
import { useCompleteTask, useCreateTask, useTasks } from '@/lib/hooks/tasks';
import { useHabits, useLogHabit } from '@/lib/hooks/habits';
import { useRoutine } from '@/lib/hooks/routine';
import { useDayEvents } from '@/lib/hooks/events';
import { useActiveWorkout, useStartWorkout, useWorkoutHistory, useWorkoutTemplates } from '@/lib/hooks/fitness';
import { useSubmitLatch } from '@/lib/hooks/submit-latch';
import { buildDayCanvas, buildDayOverview } from '@/lib/canvas';
import { firstNameFrom } from '@/lib/name';
import { fmt, formatAgo, formatClock, greeting, startOfDay } from '@/lib/dates';
import {
  dayProgress,
  daySummary,
  dayTimeline,
  endOfToday,
  habitFill,
  suggestedTemplate,
  todaysPlan,
  type TimelineEntry,
} from '@/lib/soft-today';
import { Skeleton } from '@/components/ui';
import { MoodCheckIn } from '@/components/canvas/MoodCheckIn';
import { TrackerCheckIn } from '@/components/trackers/TrackerCheckIn';
import { BodyCard } from '@/components/wearables/WatchCards';

/**
 * Today, in soft style — the app's default home.
 *
 * Classic Today is a planning surface: the whole day hour by hour, free-time
 * windows, slipped work, the AI brief — everything at once. Soft answers what
 * you open it for on a phone, in the order you want it, and leaves the
 * hour-by-hour one tap away:
 *
 *   how the day is going     a ring of what is done, and what is on now
 *   what I am keeping up     habits, a swipeable row, one tap each
 *   how I am                 the check-ins
 *   what the day holds       one timeline: the calendar and the plan together
 *   moving                   today's training day, one tap to start
 *
 * Nothing here is new data. It reads the same queries as classic Today, so the
 * two can never disagree about your day.
 */
export function SoftToday() {
  const me = useMe();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const tasks = useTasks();
  const habits = useHabits();
  const plan = useMemo(() => todaysPlan(tasks.data ?? [], now), [tasks.data, now]);
  const habitsLeft = (habits.data ?? []).filter((h) => !h.doneToday).length;
  const name = firstNameFrom(me.data?.displayName, me.data?.email);

  return (
    <div className="sf-today">
      <header className="sf-hello">
        <p className="sf-date">
          {now.toLocaleDateString('en-US', fmt({ weekday: 'long', month: 'long', day: 'numeric' }))}
        </p>
        <h1 className="sf-greeting">
          {greeting(now)}
          {name ? `, ${name}` : ''}
        </h1>
        {/* Only once both answers are in: a count from a pending query is a
            guess, and "a clear day" said to someone with a full one is worse
            than a moment of nothing. */}
        {tasks.isSuccess && habits.isSuccess && (
          <p className="sf-summary">
            {daySummary(plan.today.length, habitsLeft, habits.data.length)}
          </p>
        )}
      </header>

      {/* Two columns on a wide screen — the day on the left, what you keep
          up on the right. On a phone the columns dissolve and the cards
          interleave in the order the list at the top of this file gives. */}
      <div className="sf-cols">
        <div className="sf-col">
          <DayHero now={now} plan={plan} habits={habits.data} ready={tasks.isSuccess && habits.isSuccess} />
          <PlanCard plan={plan} loading={tasks.isPending} failed={tasks.isError} now={now} />
        </div>
        <div className="sf-col">
          <HabitsCard habits={habits.data} loading={habits.isPending} failed={habits.isError} />
          <div className="sf-checkins">
            <MoodCheckIn />
            <TrackerCheckIn />
          </div>
          <MoveCard />
          {/* Renders nothing unless a watch is connected. */}
          <BodyCard />
        </div>
      </div>

      <Link href="/calendar" className="sf-whole-day">
        <Clock size={16} aria-hidden />
        See the whole day, hour by hour
        <ArrowRight size={16} aria-hidden />
      </Link>
    </div>
  );
}

/**
 * The top of the day: a ring of how much of it is done, beside what is on
 * right now and what comes next — from the same canvas classic uses.
 */
function DayHero({
  now,
  plan,
  habits,
  ready,
}: {
  now: Date;
  plan: ReturnType<typeof todaysPlan>;
  habits: HabitDTO[] | undefined;
  ready: boolean;
}) {
  const dayStart = useMemo(() => startOfDay(now), [now]);
  const routine = useRoutine();
  const tasks = useTasks();
  const events = useDayEvents(dayStart);

  const overview = useMemo(() => {
    const canvas = buildDayCanvas(dayStart, routine.data ?? [], events.data ?? [], tasks.data ?? [], [], now);
    return buildDayOverview(canvas, now);
  }, [dayStart, routine.data, events.data, tasks.data, now]);

  if (!ready || routine.isPending || events.isPending) {
    return <Skeleton height={148} />;
  }

  const progress = dayProgress(plan, habits ?? []);
  const current =
    overview.current?.type === 'event'
      ? { title: overview.current.title, until: overview.current.end }
      : overview.now
        ? { title: overview.now.label, until: overview.now.until }
        : null;
  // `next` is an event or a task; actuals are history and never "next".
  const next = overview.next && overview.next.type !== 'actual' ? overview.next : null;

  // The ring is drawn with a stroke on a circle of circumference 2πr.
  const r = 42;
  const c = 2 * Math.PI * r;

  return (
    <section className="sf-card sf-hero" aria-label="Your day so far">
      <div
        className="sf-ring"
        role="img"
        aria-label={
          progress.total === 0
            ? 'Nothing planned for today yet'
            : `${progress.done} of ${progress.total} done today`
        }
      >
        <svg viewBox="0 0 100 100" aria-hidden>
          <circle className="sf-ring-track" cx="50" cy="50" r={r} />
          <circle
            className="sf-ring-fill"
            cx="50"
            cy="50"
            r={r}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - progress.fraction)}
          />
        </svg>
        <span className="sf-ring-text" aria-hidden>
          <span className="sf-ring-num">{progress.total === 0 ? '–' : progress.done}</span>
          <span className="sf-ring-of">{progress.total === 0 ? 'to do' : `of ${progress.total}`}</span>
        </span>
      </div>

      <div className="sf-hero-side">
        {current ? (
          <div className="sf-now">
            <span className="sf-kicker">Right now</span>
            <span className="sf-now-title">{current.title}</span>
            {current.until && <span className="sf-muted">until {formatClock(current.until)}</span>}
          </div>
        ) : null}
        <div className="sf-next">
          <span className="sf-kicker">Up next</span>
          {next ? (
            <span className="sf-next-title">
              {next.title}
              <span className="sf-time">{formatClock(next.at)}</span>
            </span>
          ) : (
            <span className="sf-muted">Nothing else scheduled today.</span>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * "Your day": the calendar and today's timed tasks as ONE timeline, then what
 * is due sometime today, then what carried over — with a way to add to it.
 * Events are shown, not ticked: they happen whether or not you tap them.
 */
function PlanCard({
  plan,
  loading,
  failed,
  now,
}: {
  plan: ReturnType<typeof todaysPlan>;
  loading: boolean;
  failed: boolean;
  now: Date;
}) {
  const complete = useCompleteTask();
  const create = useCreateTask();
  const latch = useSubmitLatch();
  const [draft, setDraft] = useState('');
  const dayStart = useMemo(() => startOfDay(now), [now]);
  const events = useDayEvents(dayStart);
  const timeline = useMemo(() => dayTimeline(events.data ?? [], plan, now), [events.data, plan, now]);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title || create.isPending) return;
    latch((release) =>
      create.mutate(
        { title, dueAt: endOfToday(now) },
        { onSuccess: () => setDraft(''), onSettled: release },
      ),
    );
  }

  const empty =
    timeline.timed.length === 0 &&
    timeline.anytime.length === 0 &&
    plan.earlier.length === 0 &&
    plan.doneToday.length === 0;

  return (
    <section className="sf-card sf-plan" aria-labelledby="sf-plan-title">
      <header className="sf-card-head">
        <h2 id="sf-plan-title" className="sf-card-title">
          Your day
        </h2>
        <Link href="/tasks" className="sf-link">
          All tasks
        </Link>
      </header>

      {loading || events.isPending ? (
        <Skeleton height={80} />
      ) : failed ? (
        <p className="sf-muted">Your tasks did not load. Pull to refresh, or try again shortly.</p>
      ) : (
        <>
          {timeline.timed.length > 0 && (
            <ol className="sf-timeline" aria-label="Today, in order">
              {timeline.timed.map((entry) => (
                <TimelineLine
                  key={`${entry.kind}-${entry.id}`}
                  entry={entry}
                  onDone={() => complete.mutate(entry.id)}
                />
              ))}
            </ol>
          )}

          <ul className="sf-tasks">
            {timeline.anytime.length > 0 && <li className="sf-group">Anytime today</li>}
            {timeline.anytime.map((t) => (
              <TaskLine key={t.id} task={t} earlier={false} onDone={() => complete.mutate(t.id)} />
            ))}
            {plan.earlier.length > 0 && <li className="sf-group">Carried over</li>}
            {plan.earlier.map((t) => (
              <TaskLine key={t.id} task={t} earlier onDone={() => complete.mutate(t.id)} />
            ))}
            {plan.doneToday.map((t) => (
              <li key={t.id} className="sf-task is-done">
                <span className="sf-tick done" aria-hidden>
                  <Check size={14} />
                </span>
                <span className="sf-task-title">{t.title}</span>
              </li>
            ))}
            {empty && <li className="sf-empty">Nothing planned yet — add the first thing below.</li>}
          </ul>
        </>
      )}

      <form className="sf-add" onSubmit={add}>
        <input
          className="sf-input"
          placeholder="Add something to today"
          aria-label="Add something to today"
          value={draft}
          maxLength={300}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="submit"
          className="sf-add-btn"
          aria-label="Add to today"
          disabled={!draft.trim() || create.isPending}
        >
          <Plus size={18} aria-hidden />
        </button>
      </form>
    </section>
  );
}

/** One moment on the timeline: an event you attend, or a task you tick. */
function TimelineLine({ entry, onDone }: { entry: TimelineEntry; onDone: () => void }) {
  return (
    <li className={`sf-tl is-${entry.state} is-${entry.kind}`}>
      <span className="sf-tl-time">{formatClock(entry.start)}</span>
      <span className="sf-tl-dot" aria-hidden />
      <span className="sf-tl-body">
        <span className="sf-tl-title">{entry.title}</span>
        {entry.kind === 'event' && (
          <span className="sf-tl-meta">
            {entry.state === 'now' ? 'now · ' : ''}until {formatClock(entry.end)}
          </span>
        )}
      </span>
      {entry.kind === 'task' && (
        <button
          type="button"
          className="sf-tick"
          aria-label={`Complete "${entry.title}"`}
          onClick={onDone}
        >
          <Check size={14} aria-hidden />
        </button>
      )}
    </li>
  );
}

function TaskLine({ task, earlier, onDone }: { task: TaskDTO; earlier: boolean; onDone: () => void }) {
  const due = new Date(task.dueAt!);
  return (
    <li className="sf-task">
      <button
        type="button"
        className="sf-tick"
        aria-label={`Complete "${task.title}"`}
        onClick={onDone}
      >
        <Check size={14} aria-hidden />
      </button>
      <span className="sf-task-title">{task.title}</span>
      {earlier && <span className="sf-task-when is-earlier">from {formatAgo(due)}</span>}
    </li>
  );
}

function HabitsCard({
  habits,
  loading,
  failed,
}: {
  habits: HabitDTO[] | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const log = useLogHabit();

  return (
    <section className="sf-card sf-habits-card" aria-labelledby="sf-habits-title">
      <header className="sf-card-head">
        <h2 id="sf-habits-title" className="sf-card-title">
          Habits
        </h2>
        <Link href="/habits" className="sf-link">
          {habits && habits.length > 0 ? 'Edit' : 'Add a habit'}
        </Link>
      </header>
      {loading ? (
        <Skeleton height={96} />
      ) : failed ? (
        <p className="sf-muted">Your habits did not load. Try again shortly.</p>
      ) : !habits || habits.length === 0 ? (
        <p className="sf-muted">
          Water, reading, a walk — pick one small thing to keep up and it lives here.
        </p>
      ) : (
        <ul className="sf-habits">
          {habits.map((h) => {
            const fill = habitFill(h);
            const full = h.todayCount >= h.target;
            return (
              <li key={h.id}>
                <button
                  type="button"
                  className={`sf-habit ${full ? 'is-done' : ''}`}
                  aria-label={
                    full
                      ? `${h.name}: done today`
                      : `Check in ${h.name} (${h.todayCount} of ${h.target} today)`
                  }
                  aria-pressed={full}
                  disabled={full && h.target === 1}
                  onClick={() => log.mutate(h.id)}
                >
                  <span
                    className="sf-habit-ring"
                    aria-hidden
                    style={{ '--fill': `${Math.round(fill * 360)}deg` } as React.CSSProperties}
                  >
                    <span className="sf-habit-core">
                      {full ? <Check size={20} /> : h.target > 1 ? `${h.todayCount}/${h.target}` : null}
                    </span>
                  </span>
                  <span className="sf-habit-name">{h.name}</span>
                  {h.streak > 1 && <span className="sf-habit-streak">{h.streak} days</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MoveCard() {
  const router = useRouter();
  const active = useActiveWorkout();
  const templates = useWorkoutTemplates();
  const history = useWorkoutHistory();
  const start = useStartWorkout();

  const suggested = suggestedTemplate(templates.data ?? []);
  const others = (templates.data ?? []).filter((t) => t.id !== suggested?.id);
  const last = (history.data ?? []).find((w) => w.endedAt);

  function begin(templateId?: string) {
    start.mutate(templateId ? { templateId } : {}, { onSuccess: () => router.push('/fitness') });
  }

  return (
    <section className="sf-card sf-move" aria-labelledby="sf-move-title">
      <header className="sf-card-head">
        <h2 id="sf-move-title" className="sf-card-title">
          Move
        </h2>
        <Link href="/fitness" className="sf-link">
          Training
        </Link>
      </header>

      {active.isPending || templates.isPending ? (
        <Skeleton height={64} />
      ) : active.data ? (
        <Link href="/fitness" className="sf-primary">
          <Dumbbell size={18} aria-hidden />
          Continue {active.data.title}
        </Link>
      ) : suggested ? (
        <>
          <button
            type="button"
            className="sf-primary"
            disabled={start.isPending}
            onClick={() => begin(suggested.id)}
          >
            <Sparkles size={18} aria-hidden />
            Start {suggested.name}
          </button>
          {others.length > 0 && (
            <div className="sf-chips" aria-label="Or another day">
              {others.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="sf-chip"
                  disabled={start.isPending}
                  onClick={() => begin(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="sf-move-empty">
          <p className="sf-muted">Save your training days once and today&apos;s is one tap.</p>
          <div className="sf-chips">
            <Link href="/fitness" className="sf-chip">
              Set up training
            </Link>
            <button
              type="button"
              className="sf-chip"
              disabled={start.isPending}
              onClick={() => begin()}
            >
              Quick workout
            </button>
          </div>
        </div>
      )}

      {last && !active.data && (
        <p className="sf-last">
          Last time: {last.title} · {formatAgo(new Date(last.endedAt!))}
          {last.workingSets > 0 ? ` · ${last.workingSets} sets` : ''}
        </p>
      )}
    </section>
  );
}
