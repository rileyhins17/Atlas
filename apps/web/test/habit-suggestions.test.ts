import { describe, expect, it } from 'vitest';
import { HABIT_SUGGESTIONS, habitSuggestions } from '@/lib/habit-suggestions';

describe('habitSuggestions', () => {
  it('offers the first few on an empty list', () => {
    expect(habitSuggestions([])).toEqual(HABIT_SUGGESTIONS.slice(0, 6));
  });

  it('never offers one already on the list, however it was typed', () => {
    const names = habitSuggestions(['  drink WATER ', 'Read']).map((s) => s.name);
    expect(names).not.toContain('Drink water');
    expect(names).not.toContain('Read');
    expect(names[0]).toBe('Walk');
  });

  it('gives water a daily count and everything else once a day', () => {
    expect(HABIT_SUGGESTIONS.find((s) => s.name === 'Drink water')?.target).toBe(8);
    expect(HABIT_SUGGESTIONS.filter((s) => s.name !== 'Drink water').every((s) => s.target === 1)).toBe(
      true,
    );
  });
});
