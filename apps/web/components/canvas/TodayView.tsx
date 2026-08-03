'use client';

import { useState } from 'react';
import { useEvents } from '@/lib/hooks/events';
import { useHabits } from '@/lib/hooks/habits';
import { useTasks } from '@/lib/hooks/tasks';
import { useRoutine } from '@/lib/hooks/routine';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { BriefBlock } from '@/components/stream/TodayHeader';
import { ConnectionCard } from '@/components/stream/ConnectionCard';
import { ChangeStrip } from '@/components/stream/ChangeStrip';
import { useAtlasUi } from '@/components/atlas/AtlasUiProvider';
import { formatClock, localDayKey, startOfDay } from '@/lib/dates';
import type { CanvasSection } from '@/lib/canvas';
import { DayPager } from './DayPager';
import { DayOverviewView } from './DayOverviewView';

/**
 * Home (v4): the day overview. Sticky capture → greeting → day pager → the
 * overview itself (now/next, what's left, habits, then the AI's brief, earlier,
 * and the full hour-by-hour canvas on demand). Tapping an Open gap in the full
 * canvas focuses capture with that time window attached. First-run still routes
 * to the onboarding wizard.
 */
export function TodayView() {
  const tasks = useTasks();
  const events = useEvents();
  const habits = useHabits();
  const routine = useRoutine();

  const { planWindow } = useAtlasUi();
  const [dayOffset, setDayOffset] = useState(0);
  // Null until the user actually pages — the first mount must NOT animate
  // (a throttled/background tab can freeze a fill-both animation on its
  // 0% frame, leaving the whole canvas shifted 28px and overflowing).
  const [pageDir, setPageDir] = useState<'fwd' | 'back' | null>(null);

  // First-run gate (routine included — the wizard always writes routine, so
  // finishing it flips this off even with no habits/tasks picked).
  const loaded = !tasks.isPending && !events.isPending && !habits.isPending && !routine.isPending;
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

  const dayStart = new Date(startOfDay(new Date()).getTime() + dayOffset * 86_400_000);
  const isToday = dayOffset === 0;

  function planGap(section: CanvasSection) {
    const label = `${formatClock(section.start)}–${formatClock(section.end)}`;
    const dayWord = isToday ? 'today' : `on ${dayStart.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`;
    planWindow({
      label,
      hint: `between ${formatClock(section.start)} and ${formatClock(section.end)} ${dayWord}`,
    });
  }

  return (
    <div className="stream">
      <DayPager
        day={dayStart}
        isToday={isToday}
        onPage={(delta) => {
          setPageDir(delta === 1 ? 'fwd' : 'back');
          setDayOffset((o) => o + delta);
        }}
        onToday={() => {
          setPageDir(dayOffset > 0 ? 'back' : 'fwd');
          setDayOffset(0);
        }}
      />

      {/* Keyed by day so paging remounts with the slide animation. The greeting
          and the AI's brief are context, so they sit BELOW what you can act on. */}
      <div key={localDayKey(dayStart)} className={`day-page ${pageDir ? `slide-${pageDir}` : ''}`}>
        <DayOverviewView
          dayStart={dayStart}
          onPlanGap={planGap}
          contextSlot={
            isToday ? (
              <>
                <BriefBlock />
                {/* The cross-domain observation sits with the brief because it
                    is context, not an action — and only on today, since it
                    describes a window ending now rather than the day you paged
                    to. It renders nothing when the data cannot support it. */}
                <ConnectionCard />
                {/* Renders nothing until Atlas has actually changed something
                    this session. */}
                <ChangeStrip />
              </>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
