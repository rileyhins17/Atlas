'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { useMe } from '@/lib/hooks/auth';
import { useTasks } from '@/lib/hooks/tasks';
import { useHabits } from '@/lib/hooks/habits';
import { useWorkoutTemplates } from '@/lib/hooks/fitness';
import { useWearablesStatus } from '@/lib/hooks/wearables';
import { gettingStartedSteps, type StartStepId } from '@/lib/soft-today';

const HIDDEN_KEY = 'atlas-start-hidden';

/** Where each unfinished step takes you. "plan" is handled in place instead. */
const HREF: Partial<Record<StartStepId, string>> = {
  name: '/settings#you',
  habit: '/habits',
  training: '/fitness',
  watch: '/settings#wearables',
};

/**
 * The first things worth doing in a new account, at the top of Today.
 *
 * Every step is ticked off by the data rather than by a checkbox, so the list
 * cannot drift from the app, and the card removes itself the moment the last
 * one is done — or when it is hidden, which is remembered on this device.
 *
 * It renders NOTHING until every answer it depends on has arrived: a step that
 * reads "not done" because its query is still pending would be telling an
 * established account to start again.
 */
export function GettingStarted() {
  const me = useMe();
  const tasks = useTasks();
  const habits = useHabits();
  const templates = useWorkoutTemplates();
  const watch = useWearablesStatus();
  // null until mounted: localStorage does not exist on the server.
  const [hidden, setHidden] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDDEN_KEY) === '1');
    } catch {
      setHidden(false);
    }
  }, []);

  if (hidden !== false) return null;
  if (!me.isSuccess || !tasks.isSuccess || !habits.isSuccess || !templates.isSuccess) return null;
  // The watch is optional: a failed or pending status drops the step rather
  // than holding the whole card back.
  if (watch.isPending) return null;

  const steps = gettingStartedSteps({
    hasName: Boolean(me.data?.displayName?.trim()),
    hasTask: tasks.data.length > 0,
    habitCount: habits.data.length,
    templateCount: templates.data.length,
    watchConnected: watch.data?.configured ? watch.data.connected : null,
  });
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  function hide() {
    try {
      localStorage.setItem(HIDDEN_KEY, '1');
    } catch {
      /* private mode — hidden for this visit only */
    }
    setHidden(true);
  }

  return (
    <section className="sf-card sf-start" aria-labelledby="sf-start-title">
      <header className="sf-card-head">
        <h2 id="sf-start-title" className="sf-card-title">
          Getting started
        </h2>
        <button type="button" className="sf-link sf-start-hide" onClick={hide}>
          Hide
        </button>
      </header>
      <p className="sf-start-count">
        {done} of {steps.length} done
      </p>
      <span className="sf-start-bar" aria-hidden>
        <span style={{ width: `${Math.round((done / steps.length) * 100)}%` }} />
      </span>

      <ol className="sf-start-steps">
        {steps.map((step) => {
          const body = (
            <>
              <span className={`sf-start-tick ${step.done ? 'done' : ''}`} aria-hidden>
                {step.done && <Check size={14} strokeWidth={3} />}
              </span>
              <span className="sf-start-text">
                <span className="sf-start-label">{step.label}</span>
                {!step.done && <span className="sf-start-hint">{step.hint}</span>}
              </span>
              {!step.done && <ChevronRight size={18} aria-hidden className="sf-start-go" />}
            </>
          );
          if (step.done) {
            return (
              <li key={step.id} className="sf-start-step is-done">
                <span className="sf-start-row">
                  {body}
                  <span className="sr-only">(done)</span>
                </span>
              </li>
            );
          }
          const href = HREF[step.id];
          return (
            <li key={step.id} className="sf-start-step">
              {href ? (
                <Link href={href} className="sf-start-row">
                  {body}
                </Link>
              ) : (
                <button
                  type="button"
                  className="sf-start-row"
                  // "Put something on today" is done right here: take them to
                  // the box under Your day.
                  onClick={() => document.getElementById('sf-add-input')?.focus()}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
