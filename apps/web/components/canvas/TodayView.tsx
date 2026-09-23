'use client';

import dynamic from 'next/dynamic';
import { useEvents } from '@/lib/hooks/events';
import { useHabits } from '@/lib/hooks/habits';
import { useTasks } from '@/lib/hooks/tasks';
import { useRoutine } from '@/lib/hooks/routine';
import { ListSkeleton } from '@/components/ui';
import { useUiStyle } from '@/lib/theme/style';

function TodaySkeleton() {
  return <ListSkeleton rows={4} circle={false} />;
}

// Each Today is its own chunk: a person only ever uses one style at a time,
// and the first-run wizard only once per account, so shipping all three to
// every visit of the most-opened screen was paying for code nobody ran.
const SoftToday = dynamic(() => import('@/components/soft/SoftToday').then((m) => m.SoftToday), {
  loading: TodaySkeleton,
});
const ClassicToday = dynamic(() => import('./ClassicToday').then((m) => m.ClassicToday), {
  loading: TodaySkeleton,
});
const OnboardingWizard = dynamic(
  () => import('@/components/onboarding/OnboardingWizard').then((m) => m.OnboardingWizard),
  { loading: TodaySkeleton },
);

/**
 * Today: the first-run gate, then whichever Today the chosen style has —
 * SoftToday (the default) or ClassicToday.
 */
export function TodayView() {
  const tasks = useTasks();
  const events = useEvents();
  const habits = useHabits();
  const routine = useRoutine();

  const style = useUiStyle();

  // First-run gate (routine included — the wizard always writes routine, so
  // finishing it flips this off even with no habits/tasks picked).
  //
  // SUCCEEDED, not merely "no longer pending". A failed query leaves `data`
  // undefined, and `?? 0` reads that as "you have nothing" — so one bad response
  // (a 429 from the 120/min throttler, an API restart, a dropped connection)
  // told an established account it was brand new and put the first-run wizard
  // over the top of their day. That is not a cosmetic misfire: the wizard's
  // whole purpose is to WRITE a routine, so the recovery path from a transient
  // network error was a flow that overwrites the working week the user already
  // had. Deciding "this account is empty" is only safe from data you actually
  // received; on an error the canvas renders and shows its own error state.
  const loaded =
    tasks.isSuccess && events.isSuccess && habits.isSuccess && routine.isSuccess;
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

  // `null` is "not mounted yet" — guessing a style for that one frame would
  // flash the wrong layout on every load.
  if (style === null) return <TodaySkeleton />;
  return style === 'soft' ? <SoftToday /> : <ClassicToday />;
}

