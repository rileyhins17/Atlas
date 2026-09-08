'use client';

import { workoutRecencyLabel } from '@atlas/shared';

import { useState } from 'react';
import { type WorkoutSummaryDTO, type WorkoutTemplateDTO } from '@atlas/shared';
import { Dumbbell, Plus, Sparkles } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useActiveWorkout, useExercises, useStartWorkout, useWorkoutHistory, useWorkoutTemplates } from '@/lib/hooks/fitness';
import { useSettings } from '@/lib/hooks/settings';
import { WeightPreference, WeightPreferenceStatus } from '@/components/fitness/WeightPreference';
import { SplitSetup } from '@/components/fitness/SplitSetup';
import { WorkoutSummaryDialog } from '@/components/fitness/WorkoutSummaryDialog';
import { TrainingProgress } from '@/components/fitness/TrainingProgress';
import { DayBuilder } from '@/components/fitness/DayBuilder';
import { Button, Card, ErrorState, Input, ListSkeleton, QueryState } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { NO_EXERCISES } from '@/components/fitness/helpers';
import { ActiveWorkout } from '@/components/fitness/ActiveWorkout';
import { WorkoutHistory } from '@/components/fitness/WorkoutHistory';

/** Fallback names, used only until the user has saved days of their own. */
const QUICK_STARTS = ['Push', 'Pull', 'Legs', 'Upper', 'Full body'];

function sinceLabel(iso: string | null): string {
  return workoutRecencyLabel(iso, new Date());
}

export function FitnessPanel() {
  const active = useActiveWorkout();
  const start = useStartWorkout();
  const history = useWorkoutHistory();
  const templates = useWorkoutTemplates();
  const settings = useSettings();
  // Warm the catalog while the start screen is on show. ActiveWorkout needs it
  // to render a template's movements as blocks, and fetching only on mount
  // meant a templated session appeared empty for a beat before filling in.
  const [title, setTitle] = useState('');
  // Lives here, not in ActiveWorkout: that component unmounts the instant the
  // workout is finished, which would take the summary down with it.
  const [summary, setSummary] = useState<WorkoutSummaryDTO | null>(null);
  const [finishedTitle, setFinishedTitle] = useState('');
  // null = closed; { editing } = the tap-to-build editor; 'paste' = the
  // whole-program text path, kept as the secondary route.
  const [builder, setBuilder] = useState<{ editing: WorkoutTemplateDTO | null } | 'paste' | null>(null);
  const [tab, setTab] = useState<'train' | 'progress'>('train');
  const exercisesQuery = useExercises();

  const workout = active.data ?? null;
  const days = templates.data ?? [];
  // Longest-since-trained first: the useful answer to "what should I do today"
  // is the day you have left the longest, and one never done outranks all.
  const suggested = [...days].sort((a, b) => {
    const at = a.lastPerformedAt ? new Date(a.lastPerformedAt).getTime() : 0;
    const bt = b.lastPerformedAt ? new Date(b.lastPerformedAt).getTime() : 0;
    return at - bt;
  });

  return (
    <>
      <PageHeader
        title="Training"
        subtitle={
          workout
            ? 'Session in progress — log each set as you finish it.'
            : 'Log a workout. Atlas keeps every set so you always know what to beat.'
        }
      />

      {active.isPending ? (
        <ListSkeleton rows={3} circle={false} />
      ) : active.isError ? (
        <ErrorState
          message={errorMessage(active.error, 'Failed to load your session')}
          onRetry={() => void active.refetch()}
        />
      ) : workout ? (
        <ActiveWorkout
          workout={workout}
          onFinished={(s, t) => {
            setFinishedTitle(t);
            setSummary(s);
          }}
        />
      ) : (
        <Card stack className="fit-start">
          {/* The day you are most likely to be here to do, as one big target.
              This card used to LEAD with "Name it (optional)" and a Start
              button, which put the rarest action first: almost nobody starts an
              untitled blank session, and almost everybody starts the day they
              have left the longest. Naming a workout is now the quiet option at
              the bottom, where the rare thing belongs. */}
          <QueryState query={templates} errorFallback="Saved workout days could not be loaded." skeleton={<ListSkeleton rows={2} />}>
          {suggested.length > 0 && (
            <div className="fit-quick" role="group" aria-label="Start a saved day">
              {suggested.map((t, i) => (
                <span key={t.id} className={`fit-day-wrap ${i === 0 ? 'hero' : ''}`}>
                  <button
                    type="button"
                    className={`fit-day-chip ${i === 0 ? 'hero' : ''}`}
                    disabled={start.isPending}
                    /* Without this its accessible name is the whole chip —
                       "Push Day3 moves · 4 days ago" — which is what a screen
                       reader announces and what the button is addressed by. */
                    aria-label={`Start ${t.name}`}
                    onClick={() => start.mutate({ templateId: t.id })}
                  >
                    {i === 0 && (
                      <span className="fit-day-lead" aria-hidden>
                        <Dumbbell size={13} /> Up next
                      </span>
                    )}
                    <span className="fit-day-name">{t.name}</span>
                    <span className="fit-day-meta">
                      {t.exercises.length} moves · {sinceLabel(t.lastPerformedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="fit-day-edit"
                    aria-label={`Edit ${t.name}`}
                    onClick={() => setBuilder({ editing: t })}
                  >
                    Edit
                  </button>
                </span>
              ))}
            </div>
          )}

          {suggested.length === 0 && (
            <div className="fit-quick" role="group" aria-label="Quick start">
              {QUICK_STARTS.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="fit-quick-chip"
                  disabled={start.isPending}
                  onClick={() => start.mutate({ title: name })}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          </QueryState>
          <form
            className="fit-blank"
            onSubmit={(e) => {
              e.preventDefault();
              if (start.isPending) return;
              start.mutate({ title: title.trim() || undefined }, { onSuccess: () => setTitle('') });
            }}
          >
            <Input
              placeholder="Name a one-off session"
              aria-label="Workout name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Button variant="ghost" type="submit" disabled={start.isPending}>
              <Dumbbell size={15} aria-hidden /> Start
            </Button>
          </form>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="fit-setup-link"
              onClick={() => setBuilder({ editing: null })}
            >
              <Plus size={13} aria-hidden /> New workout day
            </button>
            {/* Secondary: paste a whole program at once. Powerful, but not the
                thing to lead with — nothing on screen teaches the format. */}
            <button type="button" className="fit-setup-link" onClick={() => setBuilder('paste')}>
              <Sparkles size={13} aria-hidden /> Paste a whole split
            </button>
          </div>
        </Card>
      )}

      {!workout && builder !== null && (
        <div style={{ marginTop: 14 }}>
          {builder === 'paste' ? (
            <SplitSetup onDone={() => setBuilder(null)} onCancel={() => setBuilder(null)} />
          ) : (
            <DayBuilder
              editing={builder.editing}
              onDone={() => setBuilder(null)}
              onCancel={() => setBuilder(null)}
            />
          )}
        </div>
      )}

      {!workout && history.isError && <ErrorState message="Workout history could not be loaded." onRetry={() => void history.refetch()} />}
      {!workout && !history.isError && history.data !== undefined && history.data.length === 0 && !history.isPending && (
        <section className="fit-pitch" aria-label="What Atlas tracks">
          <h2 className="section-title" style={{ marginTop: 20 }}>
            What you get once you log one
          </h2>
          <ul className="fit-pitch-list">
            <li>
              <strong>Last time, on screen.</strong> Every exercise shows what you
              lifted before, so you are never guessing at the weight.
            </li>
            <li>
              <strong>Sets pre-filled.</strong> The entry row starts from your last
              set — repeating it or adding a plate is one tap, no typing.
            </li>
            <li>
              <strong>Records that mean something.</strong> A PR only counts when you
              actually beat your best, and warm-ups never inflate it.
            </li>
            <li>
              <strong>Volume in your Progress.</strong> Sessions and total weight
              lifted join the rest of your life stats.
            </li>
          </ul>
        </section>
      )}

      <WorkoutSummaryDialog
        summary={summary}
        title={finishedTitle}
        unit={settings.data?.weightUnit ?? null}
        unitStatus={<WeightPreferenceStatus query={settings} />}
        onClose={() => setSummary(null)}
      />

      {!workout && !history.isError && ((history.data?.length ?? 0) > 0 || history.isPending) && (
        <>
          <div className="cal-scope" role="group" aria-label="Training view" style={{ marginTop: 22 }}>
            <button
              type="button"
              className={`cal-scope-btn ${tab === 'train' ? 'on' : ''}`}
              aria-pressed={tab === 'train'}
              onClick={() => setTab('train')}
            >
              Recent sessions
            </button>
            <button
              type="button"
              className={`cal-scope-btn ${tab === 'progress' ? 'on' : ''}`}
              aria-pressed={tab === 'progress'}
              onClick={() => setTab('progress')}
            >
              Progress
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            {tab === 'train' ? (
              <WorkoutHistory />
            ) : history.isPending || history.data === undefined ? <ListSkeleton rows={3} /> : (
              <QueryState query={exercisesQuery} errorFallback="Exercises for training progress could not be loaded." skeleton={<ListSkeleton rows={3} />}>
              <WeightPreference query={settings}>{(unit) => <TrainingProgress
                workouts={history.data ?? []}
                exercises={exercisesQuery.data ?? NO_EXERCISES}
                unit={unit}
              />}</WeightPreference>
              </QueryState>
            )}
          </div>
        </>
      )}
    </>
  );
}
