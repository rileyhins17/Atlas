import { describe, expect, it } from 'vitest';
import { parsePlanReply } from '../src/modules/ai/plan-day.util.js';

const proposal = (id: string) =>
  `{"taskId":"${id}","startAt":"2026-07-25T11:40:00.000Z","endAt":"2026-07-25T12:40:00.000Z","why":"Fits the morning window."}`;

describe('parsePlanReply', () => {
  it('parses a clean JSON reply', () => {
    const parsed = parsePlanReply(`{"proposals":[${proposal('t1')}],"note":null}`);
    expect(parsed?.proposals.map((p) => p.taskId)).toEqual(['t1']);
    expect(parsed?.note).toBeNull();
  });

  it('ignores prose and code fences around the JSON', () => {
    const parsed = parsePlanReply(
      'Here is the plan:\n```json\n{"proposals":[],"note":"Nothing fits."}\n```\nHope that helps.',
    );
    expect(parsed?.proposals).toEqual([]);
    expect(parsed?.note).toBe('Nothing fits.');
  });

  it('salvages complete proposals from a reply truncated mid-object', () => {
    // What a reasoning model actually emits when reasoning_content eats the
    // completion budget: two whole proposals, then the third cut off.
    const truncated = `{"proposals":[${proposal('t1')},${proposal('t2')},{"taskId":"t3","startAt":"2026-07-2`;
    const parsed = parsePlanReply(truncated);
    expect(parsed?.proposals.map((p) => p.taskId)).toEqual(['t1', 't2']);
    expect(parsed?.note).toBeNull();
  });

  it('does not let a brace inside a why sentence end the object early', () => {
    const withBrace =
      '{"proposals":[{"taskId":"t1","startAt":"2026-07-25T11:40:00.000Z","endAt":"2026-07-25T12:40:00.000Z","why":"Use the {morning} window."}';
    const parsed = parsePlanReply(withBrace);
    expect(parsed?.proposals.map((p) => p.why)).toEqual(['Use the {morning} window.']);
  });

  it('skips a malformed proposal but keeps the good ones', () => {
    const mixed = `{"proposals":[{"taskId":"t1","startAt":}, ${proposal('t2')}`;
    const parsed = parsePlanReply(mixed);
    expect(parsed?.proposals.map((p) => p.taskId)).toEqual(['t2']);
  });

  it('returns null when there is nothing usable', () => {
    expect(parsePlanReply('I could not work out a plan.')).toBeNull();
    expect(parsePlanReply('')).toBeNull();
    // Truncated before a single proposal closed — no partial slot is invented.
    expect(parsePlanReply('{"proposals":[{"taskId":"t1"')).toBeNull();
  });

  it('treats a non-array proposals field as no proposals', () => {
    const parsed = parsePlanReply('{"proposals":"none","note":"Your list is clear."}');
    expect(parsed?.proposals).toEqual([]);
    expect(parsed?.note).toBe('Your list is clear.');
  });
});
