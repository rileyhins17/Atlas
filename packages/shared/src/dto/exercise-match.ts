/**
 * Turning "push: bench, incline db, lat raises" into real catalog exercises,
 * without spending a token.
 *
 * The overwhelmingly common case — someone listing movements they already do —
 * is a string-matching problem, not a reasoning one. Doing it locally means
 * fitness setup works on a brand-new account with no API key, costs nothing,
 * and is instant. The AI is only worth calling for input this cannot resolve
 * ("my usual upper day"), which is the minority.
 */

/** Gym shorthand → the words the catalog actually uses. */
const SYNONYMS: Record<string, string> = {
  db: 'dumbbell',
  dbs: 'dumbbell',
  bb: 'barbell',
  ohp: 'overhead press',
  rdl: 'romanian deadlift',
  sldl: 'romanian deadlift',
  bp: 'bench press',
  pullups: 'pull up',
  pullup: 'pull up',
  chinup: 'pull up',
  chinups: 'pull up',
  pushups: 'push up',
  pushup: 'push up',
  pressups: 'push up',
  dips: 'dip',
  lats: 'lat',
  laterals: 'lateral raise',
  lateral: 'lateral raise',
  raises: 'raise',
  curls: 'curl',
  rows: 'row',
  squats: 'squat',
  deadlifts: 'deadlift',
  presses: 'press',
  extensions: 'extension',
  pulldowns: 'pulldown',
  pushdowns: 'pushdown',
  pushdown: 'tricep pushdown',
  skullcrushers: 'skull crusher',
  quads: 'leg extension',
  hammies: 'leg curl',
  hamstrings: 'leg curl',
  calves: 'calf raise',
  abs: 'core',
  cardio: 'run',
  treadmill: 'run',
  bike: 'cycling',
  erg: 'row (machine)',
};

/** Lowercase, strip punctuation and equipment parens, expand shorthand. */
export function normalizeExerciseName(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[()[\]]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned
    .split(' ')
    .map((w) => SYNONYMS[w] ?? w)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MatchCandidate {
  id: string;
  name: string;
}

export interface ExerciseMatch<T extends MatchCandidate> {
  candidate: T;
  /** exact = normalised equality; fuzzy = every query word appears in the name. */
  match: 'exact' | 'fuzzy';
}

/**
 * Best catalog entry for a free-text movement name, or null.
 *
 * Deliberately conservative: a fuzzy hit requires EVERY word of the query to
 * appear in the candidate, so "incline bench" matches "Incline Bench Press
 * (Barbell)" but "bench" alone never silently becomes the incline variant. A
 * wrong match is worse than no match — it puts the wrong movement in someone's
 * training log.
 */
export function matchExercise<T extends MatchCandidate>(
  query: string,
  candidates: T[],
): ExerciseMatch<T> | null {
  const q = normalizeExerciseName(query);
  if (!q) return null;

  const normalized = candidates.map((c) => ({ c, n: normalizeExerciseName(c.name) }));

  const exact = normalized.find((x) => x.n === q);
  if (exact) return { candidate: exact.c, match: 'exact' };

  const words = q.split(' ').filter(Boolean);
  const contains = normalized.filter((x) => words.every((w) => x.n.includes(w)));
  if (contains.length > 0) {
    // Shortest name wins: it is the least-qualified match, so "bench press"
    // prefers "Bench Press (Barbell)" over "Incline Bench Press (Barbell)".
    contains.sort((a, b) => a.n.length - b.n.length);
    return { candidate: contains[0]!.c, match: 'fuzzy' };
  }

  return null;
}

export interface ParsedSplitDay {
  name: string;
  items: string[];
}

/** Words that mark a line as a day heading rather than a movement. */
const DAY_HINT = /^(push|pull|legs?|upper|lower|full ?body|chest|back|shoulders?|arms?|core|abs|cardio|day ?\d+|[a-z] ?day)\b/i;

/**
 * Parse a written split into days and their movements.
 *
 * Handles the shapes people actually type:
 *   "Push: bench, incline db press, lateral raises"
 *   "Push day - bench press / incline / flyes"
 *   a heading line followed by one movement per line or as a bullet list
 */
export function parseSplitText(text: string): ParsedSplitDay[] {
  const days: ParsedSplitDay[] = [];
  let current: ParsedSplitDay | null = null;

  const pushItems = (target: ParsedSplitDay, raw: string) => {
    for (const piece of raw.split(/[,/;•]|\s+\+\s+/)) {
      const item = piece.replace(/^[-*\d.)\s]+/, '').trim();
      if (item && item.length <= 80) target.items.push(item);
    }
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // "Push: a, b, c" — heading and contents on one line.
    const colon = line.match(/^([^:]{1,40}):\s*(.*)$/);
    if (colon) {
      current = { name: titleCase(colon[1]!.replace(/\bday\b/i, '').trim()), items: [] };
      days.push(current);
      if (colon[2]) pushItems(current, colon[2]);
      continue;
    }

    // A bare heading line: "Push day", "Legs".
    const bare = line.replace(/^[-*\s]+/, '').trim();
    if (DAY_HINT.test(bare) && bare.split(/[\s]+/).length <= 3 && !/\d/.test(bare)) {
      current = { name: titleCase(bare.replace(/\bday\b/i, '').trim()), items: [] };
      days.push(current);
      continue;
    }

    // Otherwise it is movements. Anything before the first heading goes into a
    // default day rather than being dropped.
    if (!current) {
      current = { name: 'My workout', items: [] };
      days.push(current);
    }
    pushItems(current, line);
  }

  return days.filter((d) => d.items.length > 0).map((d) => ({
    name: d.name || 'My workout',
    // Dedupe within a day, preserving order.
    items: [...new Set(d.items.map((i) => i.trim()))].slice(0, 30),
  }));
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
