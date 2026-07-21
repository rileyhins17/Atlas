'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useRoutine } from '@/lib/hooks/routine';
import { useCompleteTask, useTasks } from '@/lib/hooks/tasks';
import { useDayEvents } from '@/lib/hooks/events';
import { useDayActuals } from '@/lib/hooks/timeline';
import { buildDayCanvas, type CanvasSection } from '@/lib/canvas';
import { ListSkeleton } from '@/components/ui';
import { NowLine } from '@/components/stream/NowLine';
import { TimeSection } from './TimeSection';
import { CanvasCard } from './CanvasCard';

/**
 * One day rendered as the canvas: routine sections as the backbone, moments as
 * cards, the now-line inside the current section. Auto-scrolls to now on load
 * so the app opens on the present (design doc §3.2).
 */
export function DayCanvas({
  dayStart,
  onPlanGap,
}: {
  /** Local midnight of the day to render. */
  dayStart: Date;
  onPlanGap?: (section: CanvasSection) => void;
}) {
  const routine = useRoutine();
  const tasks = useTasks();
  const events = useDayEvents(dayStart);
  const actuals = useDayActuals(dayStart);
  const complete = useCompleteTask();
  const nowRef = useRef<HTMLDivElement>(null);

  // Minute tick so the now-line drifts through the day without a reload.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const canvas = useMemo(
    () =>
      buildDayCanvas(
        dayStart,
        routine.data ?? [],
        events.data ?? [],
        tasks.data ?? [],
        actuals.data?.events ?? [],
        now,
      ),
    [dayStart, routine.data, events.data, tasks.data, actuals.data, now],
  );

  const loading = routine.isPending || tasks.isPending || events.isPending || actuals.isPending;

  // Open centered on now (today only), after the sections exist.
  useEffect(() => {
    if (!loading && canvas.flavor === 'today') {
      nowRef.current?.scrollIntoView({ block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, dayStart]);

  if (loading) return <ListSkeleton rows={6} />;

  return (
    <div className={`day-canvas flavor-${canvas.flavor}`}>
      {canvas.allDay.length > 0 && (
        <div className="canvas-allday" aria-label="All day">
          <CalendarDays size={13} aria-hidden />
          {canvas.allDay.map((i) => (
            <span key={i.id} className="canvas-allday-item">
              {i.type === 'event' ? i.title : ''}
            </span>
          ))}
        </div>
      )}

      {canvas.sections.map((section, si) => (
        <TimeSection key={`${section.label}-${si}`} section={section} flavor={canvas.flavor} onPlanGap={onPlanGap}>
          {section.items.length === 0 && !section.isNow && section.kind === 'open' && (
            <p className="canvas-sec-empty">Nothing planned.</p>
          )}
          {section.items.map((item, ii) => (
            <Fragment key={item.id}>
              {section.isNow && section.nowIndex === ii && (
                <div ref={nowRef}>
                  <NowLine />
                </div>
              )}
              <CanvasCard item={item} onComplete={(id) => complete.mutate(id)} />
            </Fragment>
          ))}
          {section.isNow && (section.nowIndex ?? 0) >= section.items.length && (
            <div ref={nowRef}>
              <NowLine />
            </div>
          )}
        </TimeSection>
      ))}
    </div>
  );
}
