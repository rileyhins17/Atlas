'use client';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useMe } from '@/lib/hooks/auth';
import { useEvents } from '@/lib/hooks/events';
import { useTasks } from '@/lib/hooks/tasks';
import { useRoutine } from '@/lib/hooks/routine';
import { HeroBrief } from '@/components/home/HeroBrief';
import { AtlasAsks } from '@/components/AtlasAsks';
import {
  buildUpNext,
  nextRoutine,
  upNextGlance,
  type UpNextGlance,
} from '@/lib/stream';
import { formatClock, greeting } from '@/lib/dates';
import { HabitChips } from './HabitChips';

/**
 * The compact "now" neighborhood — everything the old stacked dashboard held
 * (greeting, brief, habits, plan, asks) folded into one slim strip so the feed
 * below is what you see first. The timeline IS the app; this is the peripheral
 * glance above it, not a page you scroll past.
 */
export function NowStrip() {
  const me = useMe();
  const events = useEvents();
  const tasks = useTasks();
  const routine = useRoutine();

  const first = (me.data?.displayName ?? me.data?.email ?? '').split('@')[0].split(' ')[0];
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const glance = useMemo(
    () => upNextGlance(buildUpNext(events.data ?? [], tasks.data ?? [], new Date())),
    [events.data, tasks.data],
  );
  const routineNext = nextRoutine(routine.data ?? [], new Date());

  return (
    <section className="nowstrip" aria-label="Now">
      <div className="nowstrip-head">
        <h1 className="nowstrip-greet">
          {greeting()}
          {first ? `, ${first}` : ''}
        </h1>
        <span className="nowstrip-date">{today}</span>
      </div>

      <HeroBrief compact />

      <div className="nowstrip-foot">
        <HabitChips />
        <GlanceLine glance={glance} routineNext={routineNext?.block.label} routineAt={routineNext?.at} />
      </div>

      <AtlasAsks />
    </section>
  );
}

/** One-line peripheral summary of the plan: overdue → next thing → +N tomorrow. */
function GlanceLine({
  glance,
  routineNext,
  routineAt,
}: {
  glance: UpNextGlance;
  routineNext?: string;
  routineAt?: Date;
}) {
  const bits: ReactNode[] = [];

  if (glance.overdueCount > 0) {
    bits.push(
      <Link key="overdue" href="/tasks" className="glance-overdue">
        <AlertTriangle size={12} aria-hidden /> {glance.overdueCount} overdue
      </Link>,
    );
  }

  if (glance.next) {
    bits.push(
      <span key="next">
        <span className="glance-lead">Next</span> {glance.next.title}
        {' · '}
        {glance.next.allDay ? 'all day' : formatClock(glance.next.at)}
      </span>,
    );
  } else if (routineNext && routineAt) {
    bits.push(
      <span key="routine">
        <span className="glance-lead">Next</span> {routineNext} · {formatClock(routineAt)}
      </span>,
    );
  } else if (glance.overdueCount === 0) {
    bits.push(
      <span key="clear" className="muted">
        Nothing scheduled
      </span>,
    );
  }

  return (
    <div className="glance-line">
      {bits.map((b, i) => (
        <span key={i} className="glance-bit">
          {i > 0 && <span className="glance-sep" aria-hidden>·</span>}
          {b}
        </span>
      ))}
      {glance.tomorrowCount > 0 && (
        <Link href="/calendar" className="glance-tomorrow">
          +{glance.tomorrowCount} tomorrow <ArrowRight size={11} aria-hidden />
        </Link>
      )}
    </div>
  );
}
