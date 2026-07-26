/**
 * Is this something to file, or a question to answer?
 *
 * Atlas used to require a literal "?" prefix to ask instead of capture. That is
 * hidden syntax: nothing on screen teaches it, and getting it wrong silently
 * files your question as a task. Typing should just work, so this decides.
 *
 * Deliberately biased toward FILE. Capture is the app's front door and the
 * common case; a question wrongly filed leaves a stray task you can delete,
 * while a capture wrongly answered silently loses what you meant to record.
 * Both outcomes are correctable in one tap by the caller, which is why this can
 * afford to be a heuristic rather than a model call.
 */

export type CaptureIntent = 'ask' | 'file';

/** Openers that begin a question far more often than they begin a note. */
const QUESTION_OPENERS = [
  'what', 'whats', "what's", 'when', 'where', 'why', 'who', 'whose', 'which',
  'how', 'hows', "how's", 'am', 'are', 'is', 'was', 'were', 'do', 'does', 'did',
  'should', 'could', 'would', 'will', 'can', 'have', 'has', 'tell', 'show',
  'explain', 'summarise', 'summarize', 'compare', 'remind',
];

/**
 * Openers that are imperative captures even though they look interrogative.
 * "Can opener", "will call mom" — these are things to record, not questions.
 */
const CAPTURE_PHRASES = [
  'remind me to',
  'remember to',
  'remember that',
  'add ',
  'book ',
  'schedule ',
  'log ',
  'note ',
];

export function detectCaptureIntent(raw: string): CaptureIntent {
  const text = raw.trim();
  if (!text) return 'file';

  // An explicit "?" prefix still forces a question. It is no longer required,
  // but it used to be, and silently breaking a habit people already have is
  // worse than supporting one extra character.
  if (text.startsWith('?')) return 'ask';

  const lower = text.toLowerCase();

  // "Remind me to X" opens with a question word but is unambiguously a capture.
  if (CAPTURE_PHRASES.some((p) => lower.startsWith(p))) return 'file';

  // A trailing question mark is the strongest possible signal.
  if (text.endsWith('?')) return 'ask';

  const words = lower.split(/\s+/);
  if (!QUESTION_OPENERS.includes(words[0]!.replace(/[^a-z']/g, ''))) return 'file';

  // A question opener alone is not enough — "can opener", "will call" are two
  // words and are captures. Real questions are longer than that.
  return words.length >= 3 ? 'ask' : 'file';
}

/** Strip a legacy "?" prefix before sending the text on. */
export function stripAskPrefix(raw: string): string {
  return raw.trim().replace(/^\?\s*/, '');
}
