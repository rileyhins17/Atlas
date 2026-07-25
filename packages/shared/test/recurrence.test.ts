import { describe, expect, it } from 'vitest';
import {
  describeRrule,
  formatRrule,
  nextOccurrence,
  nextOccurrences,
  parseRrule,
} from '../src/dto/recurrence.js';

// Wed 15 Jul 2026, 09:00 local — the series seed for most cases.
const START = new Date(2026, 6, 15, 9, 0);
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('parseRrule', () => {
  it('parses the supported subset, with and without the RRULE: prefix', () => {
    expect(parseRrule('FREQ=DAILY')).toMatchObject({ freq: 'DAILY', interval: 1, byDay: [] });
    expect(parseRrule('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=2')).toMatchObject({
      freq: 'WEEKLY',
      interval: 2,
      byDay: ['MO', 'WE'],
    });
    expect(parseRrule('FREQ=MONTHLY;COUNT=5')).toMatchObject({ freq: 'MONTHLY', count: 5 });
  });

  it('parses UNTIL in both iCal basic forms', () => {
    expect(parseRrule('FREQ=DAILY;UNTIL=20260731')?.until?.getFullYear()).toBe(2026);
    expect(parseRrule('FREQ=DAILY;UNTIL=20260731T235900Z')?.until?.getMonth()).toBe(6);
  });

  it('returns null for anything outside the subset, so it is preserved not mangled', () => {
    expect(parseRrule('FREQ=YEARLY')).toBeNull(); // unsupported frequency
    expect(parseRrule('FREQ=MONTHLY;BYDAY=2MO')).toBeNull(); // positional weekday
    expect(parseRrule('FREQ=WEEKLY;BYDAY=XX')).toBeNull(); // bogus weekday
    expect(parseRrule('FREQ=DAILY;INTERVAL=0')).toBeNull(); // nonsense interval
    expect(parseRrule('FREQ=DAILY;COUNT=3;UNTIL=20260731')).toBeNull(); // RFC forbids both
    expect(parseRrule('GARBAGE')).toBeNull();
    expect(parseRrule('')).toBeNull();
    expect(parseRrule(null)).toBeNull();
  });
});

describe('formatRrule', () => {
  it('round-trips the common rules', () => {
    for (const rule of [
      'FREQ=DAILY',
      'FREQ=DAILY;INTERVAL=3',
      'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=SA',
      'FREQ=MONTHLY;COUNT=6',
    ]) {
      expect(formatRrule(parseRrule(rule)!)).toBe(rule);
    }
  });
});

describe('describeRrule', () => {
  it('reads like a human wrote it', () => {
    expect(describeRrule('FREQ=DAILY')).toBe('Daily');
    expect(describeRrule('FREQ=DAILY;INTERVAL=3')).toBe('Every 3 days');
    expect(describeRrule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('Every weekday');
    expect(describeRrule('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('Weekly on Mon, Wed');
    expect(describeRrule('FREQ=WEEKLY;INTERVAL=2;BYDAY=SA')).toBe('Every 2 weeks on Sat');
    expect(describeRrule('FREQ=MONTHLY')).toBe('Monthly');
    expect(describeRrule('FREQ=DAILY;COUNT=4')).toBe('Daily, 4×');
  });

  it('orders weekdays Monday-first regardless of input order', () => {
    expect(describeRrule('FREQ=WEEKLY;BYDAY=FR,MO')).toBe('Weekly on Mon, Fri');
  });

  it('is null for unsupported rules (the row shows nothing rather than a lie)', () => {
    expect(describeRrule('FREQ=YEARLY')).toBeNull();
    expect(describeRrule(null)).toBeNull();
  });
});

describe('nextOccurrences', () => {
  it('daily steps by interval and never returns the seed itself', () => {
    const out = nextOccurrences('FREQ=DAILY', START, START, 3);
    expect(out.map(fmt)).toEqual(['2026-07-16 09:00', '2026-07-17 09:00', '2026-07-18 09:00']);
  });

  it('honours INTERVAL on daily rules', () => {
    expect(nextOccurrences('FREQ=DAILY;INTERVAL=3', START, START, 2).map(fmt)).toEqual([
      '2026-07-18 09:00',
      '2026-07-21 09:00',
    ]);
  });

  it('weekday rules skip the weekend', () => {
    // Wed 15th → Thu 16, Fri 17, then jumps to Mon 20.
    expect(
      nextOccurrences('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', START, START, 3).map(fmt),
    ).toEqual(['2026-07-16 09:00', '2026-07-17 09:00', '2026-07-20 09:00']);
  });

  it('weekly BYDAY with an interval only fires on matching weeks', () => {
    // Every 2 weeks on Wednesday, seeded on Wed 15th → 29th, not the 22nd.
    expect(nextOccurrences('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE', START, START, 2).map(fmt)).toEqual([
      '2026-07-29 09:00',
      '2026-08-12 09:00',
    ]);
  });

  it('weekly with no BYDAY repeats on the seed weekday', () => {
    expect(nextOccurrences('FREQ=WEEKLY', START, START, 2).map(fmt)).toEqual([
      '2026-07-22 09:00',
      '2026-07-29 09:00',
    ]);
  });

  it('monthly clamps to the last day of shorter months', () => {
    const jan31 = new Date(2026, 0, 31, 8, 0);
    // Feb 2026 has 28 days: must clamp, not overflow into March.
    expect(nextOccurrences('FREQ=MONTHLY', jan31, jan31, 3).map(fmt)).toEqual([
      '2026-02-28 08:00',
      '2026-03-31 08:00',
      '2026-04-30 08:00',
    ]);
  });

  it('preserves wall-clock time across a DST boundary', () => {
    // North American DST starts 8 Mar 2026; 9am must stay 9am, not shift to 10.
    const beforeDst = new Date(2026, 2, 6, 9, 0);
    const out = nextOccurrences('FREQ=DAILY', beforeDst, beforeDst, 3).map(fmt);
    expect(out).toEqual(['2026-03-07 09:00', '2026-03-08 09:00', '2026-03-09 09:00']);
  });

  it('stops at COUNT, which per RFC 5545 counts the seed occurrence too', () => {
    // COUNT=3 → seed (15th) + two more.
    expect(nextOccurrences('FREQ=DAILY;COUNT=3', START, START, 5).map(fmt)).toEqual([
      '2026-07-16 09:00',
      '2026-07-17 09:00',
    ]);
    // COUNT=1 → the seed was the whole series.
    expect(nextOccurrences('FREQ=DAILY;COUNT=1', START, START, 5)).toEqual([]);
  });

  it('stops at UNTIL', () => {
    expect(nextOccurrences('FREQ=DAILY;UNTIL=20260717', START, START, 5).map(fmt)).toEqual([
      '2026-07-16 09:00',
      '2026-07-17 09:00',
    ]);
  });

  it('skips occurrences already behind `after` (catching up a stale series)', () => {
    const after = new Date(2026, 6, 20, 12, 0);
    expect(nextOccurrences('FREQ=DAILY', START, after, 1).map(fmt)).toEqual(['2026-07-21 09:00']);
  });

  it('yields nothing for an unsupported rule rather than guessing', () => {
    expect(nextOccurrences('FREQ=YEARLY', START, START, 3)).toEqual([]);
    expect(nextOccurrences(null, START, START, 3)).toEqual([]);
  });
});

describe('nextOccurrence', () => {
  it('returns the single next date, or null when the series is exhausted', () => {
    expect(fmt(nextOccurrence('FREQ=DAILY', START, START)!)).toBe('2026-07-16 09:00');
    // COUNT=1 means the seed was the only occurrence.
    expect(nextOccurrence('FREQ=DAILY;COUNT=1', START, START)).toBeNull();
  });
});
