import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({ cadence: 'daily', target: 1 }));
vi.mock('@/lib/hooks/habits', () => ({
  useHabits: () => ({ isPending: false, isError: false, data: [{ id: 'h', name: 'Read', target: state.target, cadence: state.cadence, createdAt: '2026-09-08T10:00:00Z', streak: 1 }] }),
  useHabitHistory: () => ({ isPending: false, isError: false, data: [{ habitId: 'h', days: [{ day: '2026-09-08', count: 1 }] }] }),
}));
import { HabitConsistency } from '@/components/progress/HabitConsistency';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T18:00:00Z')); state.cadence = 'daily'; state.target = 1; });
afterEach(() => vi.useRealTimers());
it('shows the eligible denominator for a new daily habit', () => {
  render(<HabitConsistency days={30} />);
  expect(screen.getByText(/1 of 1 day with the target met/)).toBeTruthy();
  expect(screen.getByText('100')).toBeTruthy();
});
it('labels a partial weekly period without showing a daily streak', () => {
  state.cadence = 'weekly';
  render(<HabitConsistency days={30} />);
  expect(screen.getByText(/1 of 1 week with the target met.*includes 1 partial week/)).toBeTruthy();
  expect(screen.queryByText(/day streak/)).toBeNull();
});
