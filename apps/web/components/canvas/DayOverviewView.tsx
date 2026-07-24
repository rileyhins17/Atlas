'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, Sunrise } from 'lucide-react';
import { useRoutine } from '@/lib/hooks/routine';
import { useCompleteTask, useTasks } from '@/lib/hooks/tasks';
import { useDayEvents } from '@/lib/hooks/events';
import { useDayActuals } from '@/lib/hooks/timeline';
import { buildDayCanvas, buildDayOverview, type CanvasSection } from '@/lib/canvas';
import { ListSkeleton } from '@/components/ui';
import { HabitChips } from '@/components/stream/HabitChips';
import { NowNext } from './NowNext';
import { CanvasCard } from './CanvasCard';
import { TimeSection } from './TimeSection';

/**
 * Today, as an overview. The full hour-by-hour canvas is the planning surface
 * (one tap away, below); this answers the four questions you actually open the
 * app with — what now, what's left, habits, what happened — with no empty
 * scaffolding in between.
 */
export function DayOverviewView({
  dayStart,
  onPlanGap,
  contextSlot,
}: {
  dayStart: Date;
  onPlanGap?: (section: CanvasSection) => void;
  /** The AI brief + asks — context, so it sits below the actionable blocks. */
  contextSlot?: React.ReactNode;
}) {
  const routine = useRoutine();
  const tasks = useTasks();
  const events = useDayEvents(dayStart);
  const actuals = useDayActuals(dayStart);
  const complete = useCompleteTask();

  const [now, setNow] = useState(() => new Date());
  const [showEarlier, setShowEarlier] = useState(false);
  const [showFullDay, setShowFullDay] = useState(false);

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
  const overview = useMemo(() => buildDayOverview(canvas, now), [canvas, now]);

  const loading = routine.isPending || tasks.isPending || events.isPending || actuals.isPending;
  if (loading) return <ListSkeleton rows={5} circle={false} />;

  const isToday = canvas.flavor === 'today';

  return (
    <div className="overview">
      {overview.allDay.length > 0 && (
        <div className="canvas-allday" aria-label="All day">
          <CalendarDays size={13} aria-hidden />
          {overview.allDay.map((i) => (
            <span key={i.id} className="canvas-allday-item">
              {i.type === 'event' ? i.title : ''}
            </span>
          ))}
        </div>
      )}

      {isToday && <NowNext overview={overview} now={now} />}

      <section className="ov-block" aria-label={isToday ? 'Rest of today' : 'Planned'}>
        <h2 className="ov-head">
          {isToday ? 'Rest of today' : 'Planned'}
          {overview.ahead.length > 0 && <span className="ov-count">{overview.ahead.length}</span>}
        </h2>
        {overview.ahead.length === 0 ? (
          <p className="ov-empty">
            <Sunrise size={14} aria-hidden />
            {isToday ? "That's everything for today." : 'Nothing scheduled yet.'}
          </p>
        ) : (
          <div className="ov-list">
            {overview.ahead.map((item) => (
              <CanvasCard key={item.id} item={item} onComplete={(id) => complete.mutate(id)} />
            ))}
          </div>
        )}
      </section>

      {isToday && (
        <section className="ov-block" aria-label="Habits">
          <h2 className="ov-head">Habits</h2>
          <HabitChips />
        </section>
      )}

      {contextSlot}

      {overview.earlier.length > 0 && (
        <section className="ov-block" aria-label="Earlier today">
          <button
            type="button"
            className="ov-disclose"
            aria-expanded={showEarlier}
            onClick={() => setShowEarlier((v) => !v)}
          >
            <ChevronDown size={14} aria-hidden className={showEarlier ? 'open' : ''} />
            Earlier {isToday ? 'today' : ''}
            <span className="ov-count">{overview.earlier.length}</span>
          </button>
          {showEarlier && (
            <div className="ov-list">
              {overview.earlier.map((item) => (
                <CanvasCard key={item.id} item={item} onComplete={(id) => complete.mutate(id)} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="ov-block" aria-label="Full day">
        <button
          type="button"
          className="ov-disclose"
          aria-expanded={showFullDay}
          onClick={() => setShowFullDay((v) => !v)}
        >
          <ChevronDown size={14} aria-hidden className={showFullDay ? 'open' : ''} />
          Full day, hour by hour
        </button>
        {showFullDay && (
          <div className="day-canvas">
            {canvas.sections.map((section, si) => (
              <TimeSection
                key={`${section.label}-${si}`}
                section={section}
                flavor={canvas.flavor}
                onPlanGap={onPlanGap}
              >
                {section.items.map((item) => (
                  <CanvasCard key={item.id} item={item} onComplete={(id) => complete.mutate(id)} />
                ))}
              </TimeSection>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
