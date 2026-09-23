/**
 * The mood scale in words. Every place mood is picked uses these, so a 2 is
 * "Low" whether it was logged from Today's check-in or from Writing.
 */
export const MOOD_SCALE = [
  { value: 1, label: 'Rough' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Okay' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Great' },
] as const;
