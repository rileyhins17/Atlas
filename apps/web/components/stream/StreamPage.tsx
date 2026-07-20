'use client';

import { useEvents } from '@/lib/hooks/events';
import { useHabits } from '@/lib/hooks/habits';
import { useTasks } from '@/lib/hooks/tasks';
import { HomeCapture } from '@/components/home/HomeCapture';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { NowCluster } from './NowCluster';
import { UpNext } from './UpNext';
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

  // First run: everything loaded and nothing created yet → the setup wizard
  // maps their week (sleep/work/movement/meals) before the stream takes over.
  const loaded = !tasks.isPending && !events.isPending && !habits.isPending;
  const isFirstRun =
    loaded &&
    (tasks.data?.length ?? 0) === 0 &&
    (events.data?.length ?? 0) === 0 &&
    (habits.data?.length ?? 0) === 0;

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

      <NowCluster />
      <UpNext />
      <NowLine />
      <Feed />
    </div>
  );
}
