'use client';

import { useState } from 'react';
import { useEstablished } from '@/lib/hooks/established';
import { BriefBlock } from '@/components/stream/TodayHeader';
import { ConnectionCard } from '@/components/stream/ConnectionCard';
import { ChangeStrip } from '@/components/stream/ChangeStrip';
import { FirstCapture } from '@/components/stream/FirstCapture';
import { useAtlasUi } from '@/components/atlas/AtlasUiProvider';
import { addDays, fmt, formatClock, localDayKey, startOfDay } from '@/lib/dates';
import type { CanvasSection } from '@/lib/canvas';
import { DayPager } from './DayPager';
import { DayOverviewView } from './DayOverviewView';

/**
 * Classic Today: sticky capture → day pager → the overview itself (now/next,
 * what's left, habits, then the AI's brief, earlier, and the full
 * hour-by-hour canvas on demand). Tapping an Open gap in the full canvas
 * focuses capture with that time window attached.
 *
 * Its own chunk, loaded only by someone who chose the classic style — soft is
 * the default, and its Today shares almost none of this code.
 */
export function ClassicToday() {
  const { planWindow } = useAtlasUi();
  const established = useEstablished();
  const [dayOffset, setDayOffset] = useState(0);
  // Null until the user actually pages — the first mount must NOT animate
  // (a throttled/background tab can freeze a fill-both animation on its
  // 0% frame, leaving the whole canvas shifted 28px and overflowing).
  const [pageDir, setPageDir] = useState<'fwd' | 'back' | null>(null);

  // Calendar days, not fixed milliseconds: across the autumn DST change the
  // fixed-ms form lands back on the SAME date, so paging forward did nothing.
  const dayStart = startOfDay(addDays(new Date(), dayOffset));
  const isToday = dayOffset === 0;

  function planGap(section: CanvasSection) {
    const label = `${formatClock(section.start)}–${formatClock(section.end)}`;
    const dayWord = isToday ? 'today' : `on ${dayStart.toLocaleDateString('en-US', fmt({ weekday: 'long', month: 'long', day: 'numeric' }))}`;
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
          possible fix for "the point isn't obvious".

          It now retires itself, which is what that reasoning always implied:
          the gap it fills is the one BEFORE the app has proved itself. Left
          unconditional it was ~70px above the fold on the primary screen,
          pushing the day itself below y=290 on a phone — a sentence you have
          read four hundred times, charging rent on the part of the screen you
          opened the app to see. */}
      {!established && (
        <p className="promise">
          <strong>Tell Atlas anything, in your own words.</strong> It files it, and connects it to
          the rest of your life.
        </p>
      )}

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
