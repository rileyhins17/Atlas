import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { nextOccurrences } from '../src/dto/recurrence.js';

beforeAll(() => { vi.stubEnv('TZ', 'America/Toronto'); });
afterAll(() => { vi.unstubAllEnvs(); });

const local = (date: Date) => [date.getMonth() + 1, date.getDate(), date.getHours()];

describe('recurrence uses calendar weeks through DST', () => {
  it('keeps every-other-Monday appointments on their week after spring forward', () => {
    const start = new Date(2026, 2, 2, 9);
    expect(start.getTimezoneOffset()).toBe(300);
    expect(new Date(2026, 2, 16, 9).getTimezoneOffset()).toBe(240);
    expect(nextOccurrences('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', start, start, 3).map(local))
      .toEqual([[3, 16, 9], [3, 30, 9], [4, 13, 9]]);
  });

  it('keeps Monday and Wednesday in the same interval week after spring forward', () => {
    const start = new Date(2026, 2, 4, 9);
    expect(nextOccurrences('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE', start, start, 4).map(local))
      .toEqual([[3, 16, 9], [3, 18, 9], [3, 30, 9], [4, 1, 9]]);
  });

  it('retains wall-clock time and COUNT across fall back', () => {
    const start = new Date(2026, 9, 26, 9);
    expect(nextOccurrences('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;COUNT=3', start, start, 5).map(local))
      .toEqual([[11, 9, 9], [11, 23, 9]]);
  });
});
