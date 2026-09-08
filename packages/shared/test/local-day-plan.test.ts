import { describe, expect, it } from 'vitest';
import { buildLocalDayPlan } from '../src/local-day-plan.js';
import { durationKey } from '../src/dto/duration.js';

const now = new Date('2026-09-08T14:00:00Z');
const gap = (start: string, end: string) => ({ startAt: new Date(`2026-09-08T${start}:00Z`), endAt: new Date(`2026-09-08T${end}:00Z`) });
const task = (id: string, priority: 'LOW' | 'HIGH' | 'URGENT' = 'HIGH') => ({ id, title: id, priority, dueAt: null });

describe('local day plan', () => {
  it('merges overlapping windows and schedules each real task once without overlap', () => {
    const tasks = [task('a'), task('b'), task('a'), task('c')];
    const plan = buildLocalDayPlan(tasks, [gap('15:00', '16:00'), gap('15:30', '16:30')], new Map(), now);
    expect(plan.proposals.map((p) => [p.taskId, p.startAt.slice(11, 16), p.endAt.slice(11, 16)])).toEqual([
      ['a', '15:00', '15:30'], ['b', '15:30', '16:00'], ['c', '16:00', '16:30'],
    ]);
    expect(plan.proposals.every((p) => p.why.includes('starting estimate'))).toBe(true);
  });

  it('honors measured durations and leaves a large task unscheduled instead of truncating it', () => {
    const learned = new Map([
      [durationKey('Large job'), { key: durationKey('Large job'), minutes: 90, samples: 4 }],
      [durationKey('Small job'), { key: durationKey('Small job'), minutes: 15, samples: 3 }],
    ]);
    const result = buildLocalDayPlan([task('Large job', 'URGENT'), task('Small job')], [gap('15:00', '15:30')], learned, now);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({ taskId: 'Small job', endAt: '2026-09-08T15:15:00.000Z', why: '15 minutes based on 3 similar completed tasks.' });
  });

  it('prioritizes overdue work, then priority, while ignoring invalid and elapsed windows', () => {
    const result = buildLocalDayPlan([
      task('low', 'LOW'), task('urgent', 'URGENT'),
      { ...task('overdue', 'LOW'), dueAt: new Date('2026-09-07T12:00Z') },
    ], [gap('12:00', '13:00'), gap('16:00', '15:00'), gap('14:00', '15:00')], new Map(), now);
    expect(result.proposals.map((p) => p.taskId)).toEqual(['overdue', 'urgent']);
  });

  it('rounds a partial current window forward and explains when no work fits', () => {
    const result = buildLocalDayPlan([task('a')], [gap('13:00', '14:45')], new Map(), new Date('2026-09-08T14:02:00Z'));
    expect(result.proposals[0]?.startAt).toBe('2026-09-08T14:05:00.000Z');
    expect(buildLocalDayPlan([task('a')], [gap('14:00', '14:10')], new Map(), now)).toMatchObject({ proposals: [], note: expect.stringContaining('No task fits') });
  });
});
