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
import { FirstCapture } from '@/components/stream/FirstCapture';
import { useAtlasUi } from '@/components/atlas/AtlasUiProvider';
import { addDays, formatClock, localDayKey, startOfDay } from '@/lib/dates';
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

  // Calendar days, not fixed milliseconds: across the autumn DST change the
  // fixed-ms form lands back on the SAME date, so paging forward did nothing.
  const dayStart = startOfDay(addDays(new Date(), dayOffset));
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
      {/* The premise, said out loud. It was on the landing page and nowhere
          inside the product, so between signing up and the first connection
          card — which needs a fortnight of data — Atlas presented as seven
          ordinary tools sharing a login. One quiet line is the cheapest
          possible fix for "the point isn't obvious". */}
      <p className="promise">
        <strong>Tell Atlas anything, in your own words.</strong> It files it, and connects it to the
        rest of your life.
      </p>

      {/* Above the day, because on a brand-new account there is no day yet and
          this is the only thing on screen worth doing. It removes itself the
          moment anything has actually been written. */}
      <FirstCapture />

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
