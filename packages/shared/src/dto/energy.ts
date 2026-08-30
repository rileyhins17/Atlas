/**
 * When you actually get demanding work done.
 *
 * Every planner puts the important thing wherever there is a gap. The gap is
 * not the constraint — you are. Atlas already knows when tasks were completed
 * and how important they were, which is enough to notice that someone reliably
 * finishes hard work before lunch and reliably does not at 3pm.
 *
 * The output is not a schedule. It is one sentence handed to the planner, which
 * then prefers those hours for high-priority work and stops filling the flat
 * one. No UI, no setting: the same button gets better over weeks.
 *
 * Pure on purpose, like `duration.ts` next to it — the API computes it from the
 * database and it can be reasoned about without one.
 *
 * IT STAYS SILENT WITHOUT EVIDENCE. A profile built from four completions is
 * noise wearing a lab coat, and a planner that reorganises someone's week
 * around noise is worse than one that never tried.
 */

/** One finished piece of work, reduced to the two facts that matter. */
export interface EnergySample {
  /** Hour of the LOCAL day it was completed in, 0–23. */
  hour: number;
  /** High or urgent priority — the work whose placement is worth optimising. */
  demanding: boolean;
}

export interface EnergyWindow {
  /** Inclusive start hour, 0–23. */
  startHour: number;
  /** EXCLUSIVE end hour, so 9–11 means 09:00 up to 11:00. */
  endHour: number;
  completions: number;
}

export interface EnergyProfile {
  /** Hours where demanding work lands far more often than average. */
  peak: EnergyWindow[];
  /** Waking hours where it lands far less often. */
  trough: EnergyWindow[];
  /** Demanding completions the profile is based on. */
  samples: number;
}

/**
 * Under this, hour-by-hour differences are indistinguishable from which days
 * someone happened to be busy. Twelve is roughly two weeks of ordinary use and
 * is deliberately conservative: the cost of saying nothing is one unremarkable
 * plan, and the cost of being wrong is a planner confidently protecting the
 * wrong afternoon.
 */
export const MIN_SAMPLES_FOR_ENERGY = 12;

/**
 * A peak hour is simply one that carries MORE than the average active hour.
 *
 * A multiple of the average (1.5x was the first attempt) looks stricter and is
 * actually blind in the common case: when the peak covers most of someone's
 * working hours it drags the average up past its own threshold, so a person who
 * does all their hard work between 9 and 12 and almost none at 3pm registers as
 * having no pattern at all. The guards that keep this honest are the sample
 * floor and the all-or-nothing check below, not a bigger multiplier.
 */
const MIN_PEAK_COMPLETIONS = 2;
/** A trough hour carries at most this fraction of the average. */
const TROUGH_RATIO = 0.5;

/** Merge consecutive hours into ranges, so 9,10,11 reads as 09:00–12:00. */
function toWindows(hours: number[], counts: number[]): EnergyWindow[] {
  const sorted = [...hours].sort((a, b) => a - b);
  const out: EnergyWindow[] = [];
  for (const hour of sorted) {
    const last = out[out.length - 1];
    if (last && last.endHour === hour) {
      last.endHour = hour + 1;
      last.completions += counts[hour]!;
    } else {
      out.push({ startHour: hour, endHour: hour + 1, completions: counts[hour]! });
    }
  }
  return out;
}

/**
 * Build the profile, or report that there is not enough to build one.
 *
 * Troughs are only ever drawn from hours the user is ACTIVE in. Without that,
 * 04:00 is the flattest hour of everyone's day and the planner would earnestly
 * protect the middle of the night.
 */
export function buildEnergyProfile(samples: EnergySample[]): EnergyProfile {
  const demanding = new Array<number>(24).fill(0);
  const anyWork = new Array<number>(24).fill(0);

  for (const s of samples) {
    if (!Number.isInteger(s.hour) || s.hour < 0 || s.hour > 23) continue;
    anyWork[s.hour]! += 1;
    if (s.demanding) demanding[s.hour]! += 1;
  }

  const total = demanding.reduce((a, b) => a + b, 0);
  if (total < MIN_SAMPLES_FOR_ENERGY) return { peak: [], trough: [], samples: total };

  const activeHours = anyWork.map((c, h) => (c > 0 ? h : -1)).filter((h) => h >= 0);
  if (activeHours.length === 0) return { peak: [], trough: [], samples: total };

  const mean = total / activeHours.length;
  const peakHours = activeHours.filter(
    (h) => demanding[h]! > mean && demanding[h]! >= MIN_PEAK_COMPLETIONS,
  );
  const troughHours = activeHours.filter((h) => demanding[h]! <= mean * TROUGH_RATIO);

  // All-or-nothing: a "peak" that covers every active hour says nothing, and a
  // profile with no contrast is exactly the noise the sample floor guards
  // against arriving a different way.
  if (peakHours.length === 0 || peakHours.length === activeHours.length) {
    return { peak: [], trough: [], samples: total };
  }

  return {
    peak: toWindows(peakHours, demanding),
    trough: toWindows(troughHours, demanding),
    samples: total,
  };
}

const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;
const range = (w: EnergyWindow) => `${pad(w.startHour)}-${pad(w.endHour % 24)}`;

/**
 * One line for the planner's prompt, or null when there is nothing honest to
 * say. Null means the prompt gets no energy section at all rather than a
 * hedged one — a model told "we are not sure" will still use it.
 */
export function describeEnergy(profile: EnergyProfile): string | null {
  if (profile.peak.length === 0) return null;
  const peaks = profile.peak.map(range).join(', ');
  const troughs = profile.trough.map(range).join(', ');
  const tail = troughs ? ` Rarely finishes it ${troughs}.` : '';
  return `Usually finishes demanding work ${peaks}.${tail} (from ${profile.samples} completed high-priority tasks)`;
}
