import { describe, expect, it } from 'vitest';
import {
  activityThresholds, bumpNumericInput, formatFreeMinutes, formatSessionMinutes,
  hasNothing, remainingTimePhrase, summarizeToolRuns,
} from '../src/component-calculations.js';

describe('calculations extracted from components', () => {
  it('nudges parsed input and tolerates empty or incomplete values', () => {
    expect(bumpNumericInput('0185', 2.5)).toBe('187.5');
    expect(bumpNumericInput('', -1, 0)).toBe('0');
    expect(bumpNumericInput('garbled', 2.5)).toBe('2.5');
  });
  it('keeps activity bands distinct for empty and flat distributions', () => {
    expect(activityThresholds([])).toEqual([1, 2, 3]);
    expect(activityThresholds([0, 3, 3, 3])).toEqual([3, 4, 5]);
  });
  it('preserves the different free-time and workout-duration wording', () => {
    expect(formatFreeMinutes(60)).toBe('1h');
    expect(formatSessionMinutes(60)).toBe('1h 00m');
  });
  it('uses the supplied clock for remaining time', () => {
    expect(remainingTimePhrase(new Date(60000), new Date(0))).toBe('1 min left');
  });
  it('recognizes an empty signal and summarizes repeated tool runs', () => {
    expect(hasNothing([0, 0])).toBe(true);
    expect(summarizeToolRuns(['tasks.create', 'tasks.create'])).toBe('2 tasks');
  });
});
