import { isWithinRecommended, type MoodWindow } from './dto/mood-windows.js';
import type { CanvasItem } from './canvas.js';

/**
 * Nudge a numeric field by `delta`, tolerating an empty or half-typed value.
 * Returns a string because the input is controlled by one.
 */
export function bumpNumericInput(value: string, delta: number, min = 0): string {
  const n = Number(value);
  const base = Number.isFinite(n) && value.trim() !== '' ? n : 0;
  const next = Math.max(min, Math.round((base + delta) * 100) / 100);
  return String(next);
}

/** The four bands, chosen from the data so the scale means something. */
export function activityThresholds(counts: number[]): [number, number, number] {
  const busy = counts.filter((n) => n > 0).sort((a, b) => a - b);
  if (busy.length === 0) return [1, 2, 3];
  const at = (q: number) => busy[Math.min(busy.length - 1, Math.floor(busy.length * q))] ?? 1;
  // Quartiles, deduplicated and monotonic — a flat distribution must not
  // produce three identical bands that all render as the darkest shade.
  const a = Math.max(1, at(0.25));
  const b = Math.max(a + 1, at(0.55));
  const c = Math.max(b + 1, at(0.8));
  return [a, b, c];
}

/** True when a series has no signal at all — every bucket empty. */
export function hasNothing(points: number[]): boolean {
  return points.length === 0 || points.every((n) => n === 0);
}

/** Friendly summary of what brain-dump filed, e.g. "1 task, 1 journal entry". */
export function summarizeToolRuns(names: string[]): string {
  const labels: Record<string, string> = {
    'tasks.create': 'task',
    'tasks.complete': 'task completed',
    'habits.log': 'habit check-in',
    'journal.add': 'journal entry',
    'notes.remember': 'note',
    'calendar.add': 'event',
    'ai.ask_question': 'question for you',
  };
  const countByLabel = new Map<string, number>();
  for (const name of names) {
    const label = labels[name] ?? name;
    countByLabel.set(label, (countByLabel.get(label) ?? 0) + 1);
  }
  if (countByLabel.size === 0) return 'Nothing to file';
  return [...countByLabel]
    .map(([label, n]) => (n > 1 ? `${n} ${label}s` : `1 ${label}`))
    .join(', ');
}

export function remainingTimePhrase(until: Date, now: Date): string {
  const mins = Math.max(0, Math.round((until.getTime() - now.getTime()) / 60_000));
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h left` : `${h}h ${m}m left`;
}

export function canvasItemTitle(item: CanvasItem): string {
  return item.type === 'actual' ? item.row.title : item.title;
}

export function formatFreeMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "1h 02m" — a session length reads better than "62 min". */
export function formatSessionMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}

/** "Jul 21" for a week-of key. */
export function trainingWeekLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function moodCheckInQuestion(w: MoodWindow): string {
  return w.id === 'morning' ? 'How did you wake up?' : 'How are you ending the day?';
}

/**
 * One line saying why this is worth a tap, in the user's own terms.
 *
 * It explains the PAIR — morning and night — because that is the part that is
 * not obvious and the part that makes Looking back mean anything. Someone
 * answering inside the recommended hour is not told about timing; being
 * corrected while doing the thing correctly is a strange reward.
 */
export function moodCheckInReason(w: MoodWindow, nowMin: number, hasRoutine: boolean): string {
  if (!isWithinRecommended(nowMin, w)) {
    return w.id === 'morning'
      ? 'Best in the first hour after you wake — that reading is the one your day gets compared against.'
      : 'Best in the last hour before bed, so the pair covers the whole day.';
  }
  if (!hasRoutine) {
    return 'Asked twice a day — waking and bedtime — so Looking back can show what the hours between did to you. Set your sleep hours in Settings and Atlas will ask at your times, not these.';
  }
  return w.id === 'morning'
    ? 'One tap. Tonight Atlas asks again, and the difference between the two is what your day actually did to you.'
    : 'One tap. Against this morning, this is what today did to you — and what Looking back compares your habits and training against.';
}
