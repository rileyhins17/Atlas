import { describe, expect, it } from 'vitest';
import {
  formatDistance,
  formatSleep,
  summarizeWearables,
  type WearableActivityDTO,
  type WearableDayDTO,
} from '../src/dto/wearables.js';

const day = (dayKey: string, over: Partial<WearableDayDTO> = {}): WearableDayDTO => ({
  dayKey,
  steps: null,
  restingHeartRate: null,
  hrvMs: null,
  sleepMinutes: null,
  sleepStart: null,
  sleepEnd: null,
  deepMinutes: null,
  remMinutes: null,
  ...over,
});

describe('formatting', () => {
  it('writes sleep as hours and minutes', () => {
    expect(formatSleep(432)).toBe('7h 12m');
    expect(formatSleep(480)).toBe('8h');
    expect(formatSleep(45)).toBe('45m');
  });

  it('writes distance in km once past a kilometre', () => {
    expect(formatDistance(5012)).toBe('5.0 km');
    expect(formatDistance(800)).toBe('800 m');
  });
});

describe('summarizeWearables', () => {
  it('says so when nothing has synced, rather than implying zeros', () => {
    expect(summarizeWearables([], [], '2026-09-22')).toBe(
      'Watch connected, but nothing has synced yet.',
    );
  });

  it('states last night and today against the week, as facts', () => {
    const days = [
      day('2026-09-20', { sleepMinutes: 420, steps: 9000, restingHeartRate: 60 }),
      day('2026-09-21', { sleepMinutes: 480, steps: 11000 }),
      day('2026-09-22', { sleepMinutes: 365, deepMinutes: 60, remMinutes: 80, steps: 3100, restingHeartRate: 57 }),
    ];
    const text = summarizeWearables(days, [], '2026-09-22');
    expect(text).toContain('Last night: 6h 5m asleep (deep 1h, REM 1h 20m); 7-day average 7h 2m.');
    expect(text).toContain('Steps today so far: 3,100 (7-day average 7,700).');
    expect(text).toContain('Resting heart rate 57 bpm (2026-09-22).');
    expect(text).not.toMatch(/badly|poor|great|should/i);
  });

  it('does not claim zero sleep for a night the watch was off', () => {
    const text = summarizeWearables(
      [day('2026-09-21', { sleepMinutes: 450 }), day('2026-09-22', { steps: 500 })],
      [],
      '2026-09-22',
    );
    expect(text).toContain('No sleep recorded last night; 7-day average 7h 30m.');
    expect(text).not.toMatch(/0h|0m asleep/);
  });

  it('lists recent watch workouts with what was measured', () => {
    const run: WearableActivityDTO = {
      id: 'a',
      type: 'RUNNING',
      name: 'Run',
      startAt: '2026-09-21T11:00:00.000Z',
      endAt: '2026-09-21T11:35:00.000Z',
      activeMinutes: 32,
      calories: 300,
      avgHeartRate: 150,
      distanceMeters: 5012,
    };
    expect(summarizeWearables([], [run], '2026-09-22')).toBe(
      'Recent watch workouts: 2026-09-21 Run (32 min, 5.0 km).',
    );
  });
});
