import { describe, expect, it, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { DailyTokenCapError } from '@atlas/ai';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter.js';

/**
 * Running out of AI budget is an expected daily condition with an obvious
 * remedy. It carried a genuinely useful message and nothing ever caught it, so
 * the filter flattened it to a 500 reading "Internal server error" — the least
 * actionable possible answer to the one failure a user can understand.
 *
 * The status is load-bearing beyond the wording. `useCaptureFallback` fires the
 * local parser ONLY on 424, so while the cap error was a 500 the safety net
 * switched itself off at exactly the moment cost mattered most: a user out of
 * budget typing "gym at 6" had it written nowhere at all.
 */
function runFilter(exception: unknown) {
  const json = vi.fn();
  const res = { status: vi.fn((_code: number) => ({ json })), json };
  const req = { requestId: 'req-1', method: 'POST', path: '/ai/chat', url: '/ai/chat' };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  };
  new AllExceptionsFilter().catch(exception as Error, host as never);
  const status = res.status.mock.calls[0]?.[0];
  return { status, body: json.mock.calls[0]?.[0] as { message: string } };
}

describe('running out of AI budget', () => {
  it('is not reported as a server fault', () => {
    const { status } = runFilter(new DailyTokenCapError(1200, 1000, 'user'));
    expect(status).toBe(HttpStatus.FAILED_DEPENDENCY);
    expect(status).toBeLessThan(500);
  });

  /** 424 is what arms the local capture fallback. */
  it('uses the status the capture fallback listens for', () => {
    const { status } = runFilter(new DailyTokenCapError(1200, 1000, 'user'));
    expect(status).toBe(424);
  });

  it('tells the user what actually happened', () => {
    const { body } = runFilter(new DailyTokenCapError(1200, 1000, 'user'));
    expect(body.message).not.toBe('Internal server error');
    expect(body.message).toMatch(/used your AI for today/i);
    expect(body.message).toMatch(/midnight/i);
  });

  /**
   * The three scopes have different remedies, so they must not share wording.
   * Telling someone to raise a cap they do not control is worse than silence.
   */
  it('distinguishes a shared limit from a personal one', () => {
    const mine = runFilter(new DailyTokenCapError(1200, 1000, 'user')).body.message as string;
    const shared = runFilter(new DailyTokenCapError(99_000, 50_000, 'global')).body.message as string;
    const off = runFilter(new DailyTokenCapError(0, 0, 'disabled')).body.message as string;
    expect(shared).toMatch(/everyone/i);
    expect(shared).not.toBe(mine);
    // "cap reached (0/0)" described exhaustion when AI was simply switched off.
    expect(off).toMatch(/turned off/i);
    expect(off).not.toMatch(/0\/0/);
  });

  /** A genuine bug must still be a 500 with nothing leaked. */
  it('still hides a real server error', () => {
    const { status, body } = runFilter(new Error('connection string is postgres://user:pw@host'));
    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.message).toBe('Internal server error');
  });
});
