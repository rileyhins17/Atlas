import type { PlanDayDTO, PlanProposalDTO } from './dto/ai.js';
import { durationKey, type DurationEstimate } from './dto/duration.js';

interface PlanningTask {
  id: string;
  title: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueAt: Date | null;
}
const PRIORITY = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 } as const;
const MINUTE = 60_000;

/** A provider-free proposal, using only supplied owner data. It never writes. */
export function buildLocalDayPlan(
  tasks: readonly PlanningTask[],
  gaps: readonly { startAt: Date; endAt: Date }[],
  learned: ReadonlyMap<string, DurationEstimate>,
  now: Date,
): PlanDayDTO {
  const earliest = Math.ceil(now.getTime() / (5 * MINUTE)) * 5 * MINUTE;
  const ordered = gaps.map((g) => ({ start: Math.max(earliest, g.startAt.getTime()), end: g.endAt.getTime() }))
    .filter((g) => Number.isFinite(g.start) && Number.isFinite(g.end) && g.end > g.start)
    .sort((a, b) => a.start - b.start);
  const windows: { start: number; end: number }[] = [];
  for (const gap of ordered) {
    const previous = windows.at(-1);
    if (previous && gap.start <= previous.end) previous.end = Math.max(previous.end, gap.end);
    else windows.push({ ...gap });
  }
  const overdue = (task: PlanningTask) => task.dueAt !== null && task.dueAt.getTime() <= now.getTime();
  const ranked = [...tasks].sort((a, b) =>
    Number(overdue(b)) - Number(overdue(a)) || PRIORITY[b.priority] - PRIORITY[a.priority]
    || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity)
    || a.id.localeCompare(b.id),
  );
  const seen = new Set<string>();
  const proposals: PlanProposalDTO[] = [];
  for (const task of ranked) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    const estimate = learned.get(durationKey(task.title));
    const known = estimate && Number.isFinite(estimate.minutes) && estimate.minutes > 0 ? estimate : null;
    const minutes = known ? Math.max(5, Math.ceil(known.minutes)) : 30;
    const window = windows.find((g) => g.end - g.start >= minutes * MINUTE);
    if (!window) continue;
    const start = window.start;
    window.start += minutes * MINUTE;
    proposals.push({
      taskId: task.id, title: task.title,
      startAt: new Date(start).toISOString(), endAt: new Date(window.start).toISOString(),
      why: known
        ? `${minutes} minutes based on ${known.samples} similar completed tasks.`
        : '30-minute starting estimate. Review before adding to your day.',
    });
  }
  proposals.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return {
    proposals,
    note: proposals.length > 0
      ? 'A local plan from your tasks and available time. Nothing is scheduled until you add a block.'
      : tasks.length === 0
        ? 'Nothing open to schedule — your task list is clear.'
        : 'No task fits the remaining free windows. Adjust a window or schedule a smaller piece of work.',
  };
}
