import { expect, it } from 'vitest';
import { agendaDays } from '../src/calendar-view.js';
import type { EventDTO } from '../src/dto/event.js';
const event = (startAt: Date, endAt: Date) => ({ id: 'event', startAt: startAt.toISOString(), endAt: endAt.toISOString() }) as EventDTO;

it('includes an event crossing into the visible range and marks both edges', () => {
  const days = [new Date(2026, 8, 8), new Date(2026, 8, 9)];
  const result = agendaDays([event(new Date(2026, 8, 7, 23), new Date(2026, 8, 9, 1))], days);
  expect(result.map((day) => day.segments.map(({ continuesBefore, continuesAfter }) => [continuesBefore, continuesAfter])))
    .toEqual([[[true, true]], [[true, false]]]);
});

it('does not occupy the next day when an event ends exactly at midnight', () => {
  const days = [new Date(2026, 8, 8), new Date(2026, 8, 9)];
  const result = agendaDays([event(new Date(2026, 8, 8, 12), new Date(2026, 8, 9))], days);
  expect(result.map((day) => day.segments.length)).toEqual([1, 0]);
});
