import { describe, expect, it } from 'vitest';
import { describeLocalCapture, parseCapture } from '../src/index.js';

// A Wednesday, mid-morning, so "already passed today" cases are unambiguous.
const NOW = new Date(2026, 7, 5, 10, 0, 0);

describe('capture that works with no AI', () => {
  it('files a plain sentence as a task and guesses nothing', () => {
    const c = parseCapture('buy milk', NOW);
    expect(c).toMatchObject({ kind: 'task', title: 'buy milk', at: null, understoodTime: false });
  });

  it('reads "gym at 6" as this evening, not dawn', () => {
    // The bare-hour rule: 1-6 is afternoon. Nobody types "gym at 6" meaning 6am.
    const c = parseCapture('gym at 6', NOW);
    expect(c.kind).toBe('event');
    expect(c.title).toBe('gym');
    expect(c.at!.getHours()).toBe(18);
    expect(c.at!.getDate()).toBe(5);
    expect(c.endAt!.getTime() - c.at!.getTime()).toBe(3_600_000);
  });

  it('reads "standup at 9" as morning', () => {
    const c = parseCapture('standup at 9', NOW);
    // 9am has already gone at 10:00, so it lands tomorrow rather than in the past.
    expect(c.at!.getHours()).toBe(9);
    expect(c.at!.getDate()).toBe(6);
  });

  it('takes am and pm at their word', () => {
    expect(parseCapture('call at 8pm', NOW).at!.getHours()).toBe(20);
    expect(parseCapture('flight at 6am', NOW).at!.getHours()).toBe(6);
    expect(parseCapture('lunch at 12pm', NOW).at!.getHours()).toBe(12);
  });

  it('handles minutes and 24-hour times', () => {
    const c = parseCapture('physio at 14:30', NOW);
    expect([c.at!.getHours(), c.at!.getMinutes()]).toEqual([14, 30]);
    expect(c.title).toBe('physio');
  });

  it('gives a dated task the end of its day, never midnight', () => {
    // Due at 00:00 is overdue the instant it is created.
    const c = parseCapture('call mum tomorrow', NOW);
    expect(c.kind).toBe('task');
    expect(c.title).toBe('call mum');
    expect(c.at!.getDate()).toBe(6);
    expect([c.at!.getHours(), c.at!.getMinutes()]).toEqual([23, 59]);
  });

  it('reads a weekday as the NEXT one, never today', () => {
    // Said on a Wednesday: "wednesday" means the coming one. Someone who meant
    // today would have typed today.
    const c = parseCapture('dentist wednesday', NOW);
    expect(c.at!.getDate()).toBe(12);
    const next = parseCapture('dentist next wednesday', NOW);
    expect(next.at!.getDate()).toBe(19);
  });

  it('combines a day and a time', () => {
    const c = parseCapture('dinner friday at 7pm', NOW);
    expect(c.kind).toBe('event');
    expect(c.title).toBe('dinner');
    expect(c.at!.getDate()).toBe(7);
    expect(c.at!.getHours()).toBe(19);
  });

  it('does NOT turn a quantity into a time', () => {
    // "buy 2 pints" becoming a 2pm appointment is the failure that would make
    // people distrust capture entirely.
    const c = parseCapture('buy 2 pints', NOW);
    expect(c.kind).toBe('task');
    expect(c.understoodTime).toBe(false);
    expect(c.title).toBe('buy 2 pints');
  });

  it('does not let a day name donate digits to the clock', () => {
    const c = parseCapture('review next monday', NOW);
    expect(c.kind).toBe('task');
    expect(c.title).toBe('review');
  });

  it('never returns an empty title', () => {
    const c = parseCapture('tomorrow', NOW);
    expect(c.title.length).toBeGreaterThan(0);
  });

  it('says what it did in plain words', () => {
    expect(describeLocalCapture(parseCapture('buy milk', NOW))).toBe('Added task: buy milk.');
    expect(describeLocalCapture(parseCapture('gym at 6', NOW))).toContain('Added to your calendar: gym');
  });
});
