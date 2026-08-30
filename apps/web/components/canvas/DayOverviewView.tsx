'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, Sunrise } from 'lucide-react';
import { useRoutine } from '@/lib/hooks/routine';
import { useCompleteTask, useTasks } from '@/lib/hooks/tasks';
import { useDayEvents } from '@/lib/hooks/events';
import { useDayActuals } from '@/lib/hooks/timeline';
import { buildDayCanvas, buildDayOverview, type CanvasSection } from '@/lib/canvas';
import { ListSkeleton } from '@/components/ui';
import { usePlanDay, useAcceptProposal } from '@/lib/hooks/plan';
import type { PlanProposalDTO } from '@atlas/shared';
import { formatClock } from '@/lib/dates';
import { NowNext } from './NowNext';
import { RunningLate } from './RunningLate';
import { FreeTime } from './FreeTime';
import { SlippedTasks } from './SlippedTasks';
import { TodayChecklist } from './TodayChecklist';
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
  // Open by default on any day that is NOT today.
  //
  // Today has a now/next card, a checklist, free-time windows and the brief, so
  // folding the hour-by-hour away leaves plenty on screen. Every other day has
  // none of those — paging to tomorrow gave "Nothing scheduled yet" and a
  // closed disclosure over an otherwise black screen, when the routine
  // underneath it is exactly what you paged over to look at.
  const [showFullDay, setShowFullDay] = useState(
    () => dayStart.toDateString() !== new Date().toDateString(),
  );
  const [proposals, setProposals] = useState<PlanProposalDTO[] | null>(null);
  const [planNote, setPlanNote] = useState<string | null>(null);
  const plan = usePlanDay();
  const accept = useAcceptProposal();

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

      {/* Today only: "push the rest of the day" has nothing to push from on a
          date that has already happened or has not started. */}
      {isToday && <NowNext overview={overview} now={now} action={<RunningLate />} />}

      {/* Before anything else about today: settle what didn't happen. Planning
          on top of a backlog you have not looked at is how the list dies. */}
      {isToday && <SlippedTasks />}

      {isToday && (
        <FreeTime
          overview={overview}
          planning={plan.isPending}
          onPlan={(gap) =>
            onPlanGap?.({
              kind: 'open',
              label: 'Open',
              start: gap.start,
              end: gap.end,
              items: [],
              isNow: false,
            })
          }
          onPlanDay={() => {
            setProposals(null);
            setPlanNote(null);
            plan.mutate(
              overview.gaps.map((g) => ({
                startAt: g.start.toISOString(),
                endAt: g.end.toISOString(),
              })),
              {
                onSuccess: (res) => {
                  setProposals(res.proposals);
                  setPlanNote(res.note);
                },
              },
            );
          }}
        />
      )}

      {planNote && proposals?.length === 0 && <p className="plan-note">{planNote}</p>}

      {proposals && proposals.length > 0 && (
        <section className="ov-block plan-proposals" aria-label="Proposed plan">
          <h2 className="ov-title">Atlas suggests</h2>
          {/* Proposals are inert until accepted — nothing here has touched your
              calendar yet, which is what makes a wrong suggestion cheap. */}
          {proposals.map((p) => (
            <div key={p.taskId} className="plan-row">
              <div className="plan-row-main">
                <span className="plan-row-title">{p.title}</span>
                <span className="plan-row-why">{p.why}</span>
              </div>
              <span className="plan-row-when">
                {formatClock(new Date(p.startAt))}–{formatClock(new Date(p.endAt))}
              </span>
              <button
                type="button"
                className="plan-accept"
                disabled={accept.isPending}
                onClick={() =>
                  accept.mutate(
                    { taskId: p.taskId, title: p.title, startAt: p.startAt, endAt: p.endAt },
                    {
                      onSuccess: () =>
                        setProposals((cur) => (cur ?? []).filter((x) => x.taskId !== p.taskId)),
                    },
                  )
                }
              >
                Add
              </button>
            </div>
          ))}
        </section>
      )}

      {isToday && (
        <section className="ov-block" aria-label="Checklist">
          <h2 className="ov-head">Checklist</h2>
          <TodayChecklist checklist={overview.checklist} />
        </section>
      )}

      <section className="ov-block" aria-label={isToday ? 'Coming up' : 'Planned'}>
        <h2 className="ov-head">
          {isToday ? 'Coming up' : 'Planned'}
          {overview.timed.length > 0 && <span className="ov-count">{overview.timed.length}</span>}
        </h2>
        {overview.timed.length === 0 ? (
          <p className="ov-empty">
            <Sunrise size={14} aria-hidden />
            {isToday ? 'Nothing else scheduled today.' : 'Nothing scheduled yet.'}
          </p>
        ) : (
          <div className="ov-list">
            {overview.timed.map((item) => (
              <CanvasCard key={item.id} item={item} onComplete={(id) => complete.mutate(id)} />
            ))}
          </div>
        )}
        {/* Other days have no habit checklist, so their tasks live here. */}
        {!isToday && overview.checklist.length > 0 && (
          <div className="ov-list">
            {overview.checklist.map((item) => (
              <CanvasCard key={item.id} item={item} onComplete={(id) => complete.mutate(id)} />
            ))}
          </div>
        )}
      </section>

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
