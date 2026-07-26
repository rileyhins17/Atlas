import { describe, expect, it } from 'vitest';
import {
  CreateEventInput,
  CreateTaskInput,
  LoginInput,
  RegisterInput,
  RoutineBlockInput,
  RruleString,
  UpdateRoutineBlockInput,
} from '../src/index.js';

/**
 * Boundary tests for input the stress pass found unbounded or unvalidated.
 * Each case here is one thing the API accepted before and should not.
 */

describe('auth field bounds', () => {
  const validPassword = 'correct-horse-battery';

  it('rejects an absurdly long email', () => {
    const email = `${'x'.repeat(100_000)}@example.com`;
    expect(RegisterInput.safeParse({ email, password: validPassword }).success).toBe(false);
    expect(LoginInput.safeParse({ email, password: validPassword }).success).toBe(false);
  });

  it('rejects an absurdly long password', () => {
    // Unbounded input into scrypt is the reason this matters, not storage.
    const password = 'x'.repeat(100_000);
    expect(RegisterInput.safeParse({ email: 'a@b.co', password }).success).toBe(false);
    expect(LoginInput.safeParse({ email: 'a@b.co', password }).success).toBe(false);
  });

  it('still accepts a realistic long email and a long passphrase', () => {
    const email = `${'a'.repeat(60)}@${'b'.repeat(180)}.com`;
    expect(RegisterInput.safeParse({ email, password: 'x'.repeat(120) }).success).toBe(true);
  });

  it('keeps the minimum password rule', () => {
    expect(RegisterInput.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(false);
  });
});

describe('RruleString', () => {
  it('accepts the rules the preset picker produces', () => {
    for (const rule of [
      'FREQ=DAILY',
      'FREQ=WEEKLY;BYDAY=MO,WE,FR',
      'FREQ=MONTHLY;INTERVAL=2',
      'FREQ=WEEKLY;BYDAY=MO;COUNT=10',
      'RRULE:FREQ=DAILY',
    ]) {
      expect(RruleString.safeParse(rule).success, rule).toBe(true);
    }
  });

  it('rejects a rule the scheduler cannot act on', () => {
    // Previously stored happily, then silently never recurred — the UI showed a
    // repeat was set and nothing ever came of it.
    for (const rule of ['FREQ=NONSENSE;;;', 'not a rule at all', 'FREQ=', 'BYDAY=MO', '']) {
      expect(RruleString.safeParse(rule).success, rule).toBe(false);
    }
  });

  it('is enforced on tasks and events, create and update', () => {
    expect(
      CreateTaskInput.safeParse({ title: 'x', recurrence: 'FREQ=NONSENSE;;;' }).success,
    ).toBe(false);
    expect(
      CreateEventInput.safeParse({
        title: 'x',
        startAt: '2026-08-01T10:00:00Z',
        endAt: '2026-08-01T11:00:00Z',
        recurrence: 'FREQ=NONSENSE;;;',
      }).success,
    ).toBe(false);
    expect(CreateTaskInput.safeParse({ title: 'x', recurrence: 'FREQ=DAILY' }).success).toBe(true);
  });
});

describe('routine block span', () => {
  const base = { label: 'Work', days: 1, startMin: 540, endMin: 1020 };

  it('accepts a normal block', () => {
    expect(RoutineBlockInput.safeParse(base).success).toBe(true);
  });

  it('still accepts a block that wraps past midnight', () => {
    // Sleep: startMin > endMin is meaningful, not an error.
    expect(RoutineBlockInput.safeParse({ ...base, startMin: 1380, endMin: 420 }).success).toBe(true);
  });

  it('rejects a block covering no time', () => {
    expect(RoutineBlockInput.safeParse({ ...base, startMin: 300, endMin: 300 }).success).toBe(false);
  });

  it('only checks the span on a patch that supplies both ends', () => {
    expect(UpdateRoutineBlockInput.safeParse({ startMin: 300 }).success).toBe(true);
    expect(UpdateRoutineBlockInput.safeParse({ label: 'Renamed' }).success).toBe(true);
    expect(UpdateRoutineBlockInput.safeParse({ startMin: 300, endMin: 300 }).success).toBe(false);
  });
});
