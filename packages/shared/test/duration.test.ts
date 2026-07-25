import { describe, expect, it } from 'vitest';
import {
  durationKey,
  estimateDurations,
  formatDuration,
  type DurationSample,
} from '../src/dto/duration.js';

const sample = (title: string, minutes: number, dayOffset = 0): DurationSample => {
  const startedAt = new Date(2026, 6, 15 + dayOffset, 9, 0);
  return {
    title,
    startedAt,
    completedAt: new Date(startedAt.getTime() + minutes * 60_000),
  };
};

describe('durationKey', () => {
  it('folds case and surrounding space so the same work keys the same', () => {
    expect(durationKey('  Draft the Report ')).toBe('draft the report');
    expect(durationKey('Draft   the report')).toBe('draft the report');
  });

  it('normalises curly apostrophes', () => {
    expect(durationKey('Reply to Sam’s email')).toBe(durationKey("Reply to Sam's email"));
  });
});

describe('estimateDurations', () => {
  it('needs more than one completion before it will claim a usual', () => {
    expect(estimateDurations([sample('Write the brief', 40)]).size).toBe(0);
    expect(estimateDurations([sample('Write the brief', 40), sample('Write the brief', 50, 1)]).size)
      .toBe(1);
  });

  it('takes the median, so one abandoned afternoon cannot skew it', () => {
    const est = estimateDurations([
      sample('Email triage', 20),
      sample('Email triage', 25, 1),
      sample('Email triage', 240, 2), // left open over lunch
    ]);
    // Mean would be ~95 minutes and useless; the median is the honest number.
    expect(est.get('email triage')?.minutes).toBe(25);
    expect(est.get('email triage')?.samples).toBe(3);
  });

  it('rounds to five minutes rather than pretending to be exact', () => {
    const est = estimateDurations([
      sample('Standup notes', 12),
      sample('Standup notes', 14, 1),
    ]);
    expect(est.get('standup notes')?.minutes).toBe(15);
  });

  it('discards a tick-the-box completion and a walked-away one', () => {
    const est = estimateDurations([
      sample('Quick call', 0.5),
      sample('Quick call', 1, 1),
      sample('Quick call', 600, 2),
    ]);
    expect(est.size).toBe(0);
  });

  it('groups differently-cased instances of the same recurring task', () => {
    const est = estimateDurations([
      sample('Weekly review', 30),
      sample('weekly review ', 40, 1),
    ]);
    expect(est.get('weekly review')?.samples).toBe(2);
    expect(est.get('weekly review')?.minutes).toBe(35);
  });

  it('never returns less than a five-minute estimate', () => {
    const est = estimateDurations([sample('Tiny', 2), sample('Tiny', 2.2, 1)]);
    expect(est.get('tiny')?.minutes).toBe(5);
  });

  it('ignores samples whose clock makes no sense', () => {
    const backwards: DurationSample = {
      title: 'Time traveller',
      startedAt: new Date(2026, 6, 15, 10, 0),
      completedAt: new Date(2026, 6, 15, 9, 0),
    };
    expect(estimateDurations([backwards, backwards]).size).toBe(0);
  });

  it('ignores an empty title', () => {
    expect(estimateDurations([sample('   ', 30), sample('', 30, 1)]).size).toBe(0);
  });
});

describe('formatDuration', () => {
  it('reads the way a person would say it', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(80)).toBe('1h 20m');
    expect(formatDuration(120)).toBe('2h');
  });
});
