'use client';

import { useState } from 'react';
import { useEvents } from '@/lib/hooks/events';
import { useHabits } from '@/lib/hooks/habits';
import { useTasks } from '@/lib/hooks/tasks';
import { useRoutine } from '@/lib/hooks/routine';
import { HomeCapture, type CaptureContext } from '@/components/home/HomeCapture';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { NowStrip } from '@/components/stream/NowStrip';
import { formatClock, localDayKey } from '@/lib/dates';
import type { CanvasSection } from '@/lib/canvas';
import { DayPager } from './DayPager';
import { DayCanvas } from './DayCanvas';

function localMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Home (v4): the Day Canvas. Sticky capture → compact now-strip (today only) →
 * day pager → the canvas itself. Tapping an Open gap focuses capture with that
 * time window attached. First-run still routes to the onboarding wizard.
 */
export function TodayView() {
  const tasks = useTasks();
  const events = useEvents();
  const habits = useHabits();
  const routine = useRoutine();

  const [dayOffset, setDayOffset] = useState(0);
  // Null until the user actually pages — the first mount must NOT animate
  // (a throttled/background tab can freeze a fill-both animation on its
  // 0% frame, leaving the whole canvas shifted 28px and overflowing).
  const [pageDir, setPageDir] = useState<'fwd' | 'back' | null>(null);
  const [context, setContext] = useState<CaptureContext | null>(null);
  const [focusToken, setFocusToken] = useState(0);

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

  const dayStart = new Date(localMidnight(new Date()).getTime() + dayOffset * 86_400_000);
  const isToday = dayOffset === 0;

  function planGap(section: CanvasSection) {
    const label = `${formatClock(section.start)}–${formatClock(section.end)}`;
    const dayWord = isToday ? 'today' : `on ${dayStart.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`;
    setContext({ label, hint: `between ${formatClock(section.start)} and ${formatClock(section.end)} ${dayWord}` });
    setFocusToken((t) => t + 1);
  }

  return (
    <div className="stream">
      <div className="stream-capture">
        <HomeCapture context={context} onClearContext={() => setContext(null)} focusToken={focusToken} />
      </div>

      {isToday && <NowStrip showGlance={false} />}

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

      {/* Keyed by day so paging remounts with the slide animation. */}
      <div key={localDayKey(dayStart)} className={`day-page ${pageDir ? `slide-${pageDir}` : ''}`}>
        <DayCanvas dayStart={dayStart} onPlanGap={planGap} />
      </div>
    </div>
  );
}
