import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { EventDTO } from '@atlas/shared';
import { WeekPresentation } from '@/components/calendar/WeekPresentation';
vi.mock('@/components/calendar/WeekGrid', () => ({ WeekGrid: () => <p>Time grid contents</p> }));
const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 8, 7 + i, 12));
const event = { id: 'saved-event', title: 'A complete appointment title that must remain readable', startAt: new Date(2026, 8, 8, 10).toISOString(), endAt: new Date(2026, 8, 8, 11).toISOString(), allDay: false, location: 'Community centre' } as EventDTO;
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
});
it('shows every day and the complete saved event on a phone, with editing and grid access', () => {
  const edit = vi.fn();
  render(<WeekPresentation days={days} events={[event]} selectedDay="2026-09-08" onPickDay={vi.fn()} onOpenEvent={edit} />);
  expect(screen.getAllByRole('region')).toHaveLength(7);
  expect(screen.getAllByText('No events scheduled')).toHaveLength(6);
  fireEvent.click(screen.getByRole('button', { name: /A complete appointment title/ }));
  expect(edit).toHaveBeenCalledWith(event);
  fireEvent.click(screen.getByRole('button', { name: 'Time grid' }));
  expect(screen.getByText('Time grid contents')).toBeTruthy();
});
it('starts an event on the chosen day instead of silently using today', () => {
  const create = vi.fn();
  render(<WeekPresentation days={days} events={[]} selectedDay="2026-09-08" onPickDay={vi.fn()} onOpenEvent={vi.fn()} onCreateAt={create} />);
  fireEvent.click(screen.getAllByRole('button', { name: /^Add event on/ })[5]!);
  expect(create).toHaveBeenCalledWith(days[5], 540);
});

it('shows overnight events on both affected days with continuation labels', () => {
  const overnight = { ...event, startAt: new Date(2026, 8, 8, 23).toISOString(), endAt: new Date(2026, 8, 9, 1).toISOString() };
  render(<WeekPresentation days={days} events={[overnight]} selectedDay="2026-09-08" onPickDay={vi.fn()} onOpenEvent={vi.fn()} />);
  expect(screen.getAllByRole('button', { name: /A complete appointment title/ })).toHaveLength(2);
  expect(screen.getByText(/Continues into the next day/)).toBeTruthy();
  expect(screen.getByText(/Continued from the previous day/)).toBeTruthy();
});
