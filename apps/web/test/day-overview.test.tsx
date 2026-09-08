import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({
  routine: { data: [], isPending: false, isError: false, refetch: vi.fn() },
  tasks: { data: [], isPending: false, isError: false, refetch: vi.fn() },
  events: { data: [], isPending: false, isError: false, refetch: vi.fn() },
  actuals: { data: { events: [] }, isPending: false, isError: false, refetch: vi.fn() },
}));
vi.mock('@/lib/hooks/routine', () => ({ useRoutine: () => state.routine }));
vi.mock('@/lib/hooks/tasks', () => ({ useTasks: () => state.tasks, useCompleteTask: () => ({ mutate: vi.fn() }) }));
vi.mock('@/lib/hooks/events', () => ({ useDayEvents: () => state.events }));
vi.mock('@/lib/hooks/timeline', () => ({ useDayActuals: () => state.actuals }));
vi.mock('@/lib/hooks/plan', () => ({ usePlanDay: () => ({ mutate: vi.fn() }), useAcceptProposal: () => ({ mutate: vi.fn() }) }));
vi.mock('@/components/canvas/MoodCheckIn', () => ({ MoodCheckIn: () => null }));
vi.mock('@/components/trackers/TrackerCheckIn', () => ({ TrackerCheckIn: () => null }));
vi.mock('@/components/canvas/SlippedTasks', () => ({ SlippedTasks: () => <section aria-label="Missed commitments">Review missed work</section> }));
vi.mock('@/components/canvas/RunningLate', () => ({ RunningLate: () => <div role="group" aria-label="Running late">Adjust schedule</div> }));
vi.mock('@/components/canvas/TodayChecklist', () => ({ TodayChecklist: () => <p>Your checklist</p> }));
import { DayOverviewView } from '@/components/canvas/DayOverviewView';
import { startOfDay, addDays } from '@/lib/dates';

beforeEach(() => {
  for (const query of Object.values(state)) {
    query.isPending = false;
    query.isError = false;
    query.refetch.mockClear();
  }
});

describe('the day overview', () => {
  it.each(['routine', 'tasks', 'events', 'actuals'] as const)('does not invent free time when %s fails, and retries the failed source', (source) => {
    state[source].isError = true;
    render(<DayOverviewView dayStart={startOfDay(new Date())} />);
    expect(screen.getByText('Your day could not be loaded. Retry before planning from it.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Checklist' })).toBeNull();
    expect(screen.queryByText('Nothing else scheduled today.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state[source].refetch).toHaveBeenCalledOnce();
  });

  it.each(['routine', 'tasks', 'events', 'actuals'] as const)('waits for %s before offering a plan', (source) => {
    state[source].isPending = true;
    const { container } = render(<DayOverviewView dayStart={startOfDay(new Date())} />);
    expect(container.querySelector('.skeleton')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Checklist' })).toBeNull();
  });

  it('puts today’s actions before the optional full timeline', () => {
    render(<DayOverviewView dayStart={startOfDay(new Date())} />);
    const fullDay = screen.getByRole('button', { name: 'Full day, hour by hour' });
    expect(fullDay.getAttribute('aria-expanded')).toBe('false');
    const checklist = screen.getByRole('region', { name: 'Checklist' });
    expect(checklist.compareDocumentPosition(fullDay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(fullDay);
    expect(fullDay.getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps the full timeline open on another day', () => {
    render(<DayOverviewView dayStart={addDays(startOfDay(new Date()), 1)} />);
    expect(screen.getByRole('button', { name: 'Full day, hour by hour' }).getAttribute('aria-expanded')).toBe('true');
  });
});

it('puts the checklist before missed commitments and free-time planning', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-08T12:00:00'));
  try {
    render(<DayOverviewView dayStart={startOfDay(new Date())} />);
    const checklist = screen.getByRole('region', { name: 'Checklist' });
    for (const name of ['Missed commitments', 'Free time']) {
      expect(checklist.compareDocumentPosition(screen.getByRole('region', { name })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  } finally { vi.useRealTimers(); }
});

it('keeps schedule adjustments available after the checklist rather than in the now card', () => {
  render(<DayOverviewView dayStart={startOfDay(new Date())} />);
  const adjustments = screen.getByRole('group', { name: 'Running late' });
  expect(screen.getByRole('region', { name: 'Right now' }).contains(adjustments)).toBe(false);
  expect(screen.getByRole('region', { name: 'Checklist' }).compareDocumentPosition(adjustments) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
