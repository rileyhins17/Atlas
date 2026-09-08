import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({ tasks: [] as { id: string }[], events: [] as { id: string }[] }));
vi.mock('@/lib/hooks/tasks', () => ({ useTasks: () => ({ data: state.tasks, isPending: false, isError: false }) }));
vi.mock('@/lib/hooks/events', () => ({ useEvents: () => ({ data: state.events, isPending: false, isError: false }) }));
import { FirstCapture } from '@/components/stream/FirstCapture';
import { ESTABLISHED_KEY } from '@/lib/hooks/established';
beforeEach(() => { localStorage.removeItem(ESTABLISHED_KEY); state.tasks = []; state.events = []; });
it('offers a path to the saved task after first capture', () => {
  state.tasks = [{ id: 'saved-task' }];
  render(<FirstCapture />);
  expect(screen.getByRole('link', { name: 'Review my tasks' }).getAttribute('href')).toBe('/tasks');
  expect(screen.queryByRole('link', { name: 'Open my calendar' })).toBeNull();
});
it('offers the calendar for a saved event rather than an empty task list', () => {
  state.events = [{ id: 'saved-event' }];
  render(<FirstCapture />);
  expect(screen.getByRole('link', { name: 'Open my calendar' }).getAttribute('href')).toBe('/calendar');
  expect(screen.queryByRole('link', { name: 'Review my tasks' })).toBeNull();
});
