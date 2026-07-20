'use client';

import { useEvents } from '@/lib/hooks/events';
import { useHabits } from '@/lib/hooks/habits';
import { useTasks } from '@/lib/hooks/tasks';
import { useRoutine } from '@/lib/hooks/routine';
import { HomeCapture } from '@/components/home/HomeCapture';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { NowStrip } from './NowStrip';
import { NowLine } from './NowLine';
import { Feed } from './Feed';

/**
 * The Stream — Atlas's home surface. One continuous, interactive feed of your
 * life: capture at the top, the now cluster (brief/rings/asks), the bounded
 * plan (Up Next), the now-line, then the past scrolling forever. Timeline
 * isn't a page anymore; it IS the app.
 */
export function StreamPage() {
  const tasks = useTasks();
  const events = useEvents();
  const habits = useHabits();
  const routine = useRoutine();

  // First run: everything loaded and nothing created yet → the setup wizard
  // maps their week (sleep/work/movement/meals) before the stream takes over.
  // Routine is part of the gate: the wizard ALWAYS writes routine blocks (sleep +
  // wind-down are unconditional), so a user who finishes without picking habits or
  // creating tasks still leaves first-run — otherwise the wizard loops forever.
  const loaded =
    !tasks.isPending && !events.isPending && !habits.isPending && !routine.isPending;
  const isFirstRun =
    loaded &&
    (tasks.data?.length ?? 0) === 0 &&
    (events.data?.length ?? 0) === 0 &&
    (habits.data?.length ?? 0) === 0 &&
    (routine.data?.length ?? 0) === 0;

  if (isFirstRun) {
    return (
      <div className="stream">
        <OnboardingWizard />
      </div>
    );
  }

  return (
    <div className="stream">
      <div className="stream-capture">
        <HomeCapture />
      </div>

      <NowStrip />
      <NowLine />
      <Feed />
    </div>
  );
}
