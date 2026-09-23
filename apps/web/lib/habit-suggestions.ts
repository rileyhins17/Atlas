/**
 * Small, common habits offered as one tap on an empty habit list — the
 * blank-box problem is the hardest part of starting one. Targets are per day.
 */
export interface HabitSuggestion {
  name: string;
  target: number;
}

export const HABIT_SUGGESTIONS: HabitSuggestion[] = [
  { name: 'Drink water', target: 8 },
  { name: 'Read', target: 1 },
  { name: 'Walk', target: 1 },
  { name: 'Stretch', target: 1 },
  { name: 'Meditate', target: 1 },
  { name: 'Vitamins', target: 1 },
  { name: 'Journal', target: 1 },
  { name: 'No phone in bed', target: 1 },
];

/**
 * The suggestions not already on the list, compared the way the duplicate
 * warning compares names: trimmed and case-insensitive.
 */
export function habitSuggestions(existing: string[], limit = 6): HabitSuggestion[] {
  const have = new Set(existing.map((n) => n.trim().toLowerCase()));
  return HABIT_SUGGESTIONS.filter((s) => !have.has(s.name.toLowerCase())).slice(0, limit);
}
