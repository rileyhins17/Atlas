import { EXERCISE_CATALOG } from './exercise-catalog.js';

/** A user cannot make the exercise picker grow without limit. */
export const MAX_CUSTOM_EXERCISES = 200;

/** A named workout day cannot become a scrolling wall of movements. */
export const MAX_EXERCISES_PER_TEMPLATE = 30;

/** A split should remain a split, not an import dump. */
export const MAX_TEMPLATES = 20;

/** The largest exercise list any picker or planner is allowed to read. */
export const MAX_EXERCISES_READ = EXERCISE_CATALOG.length + MAX_CUSTOM_EXERCISES;
