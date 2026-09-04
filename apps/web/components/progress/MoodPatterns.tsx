'use client';

import { useMoodPatterns } from '@/lib/hooks/stats';

/** Three is a page you read. Six is a horoscope. */
const MAX_SHOWN = 3;

/**
 * What your better days have in common.
 *
 * This is the payoff for the daily mood tap, and the one thing in Atlas that no
 * single-purpose app can do — a habit tracker knows you trained, a journal knows
 * you felt like a 2, and only something holding both notices the 2s cluster on
 * the days you did not.
 *
 * Everything here is counting, done server-side and unit-tested. It deliberately
 * does not ask the model: a model asked "why is he down?" always produces a
 * fluent sentence, and there is no way to tell a real pattern from a plausible
 * one. It also never claims a cause — the arrow between mood and behaviour
 * points both ways, and a product that asserts otherwise will be confidently
 * wrong about someone's mental health in public.
 *
 * Four states, and three of them say almost nothing on purpose:
 *   nothing logged  → silence (Today's check-in is already doing the asking)
 *   under a fortnight → how far off it is, so the daily tap has a visible point
 *   enough days, no gap → says so plainly, which is a real answer
 *   a gap → the observation, with both counts, so it can be checked
 */
export function MoodPatterns() {
  const q = useMoodPatterns();

  // Never make a claim about someone's data from a response that has not
  // arrived — the same rule that keeps "No habits yet" off a loading page.
  if (q.isPending || q.isError) return null;
  const { daysLogged, daysNeeded, patterns } = q.data;
  if (daysLogged === 0) return null;

  return (
    <section className="mood-patterns" aria-labelledby="mood-patterns-h">
      <h2 className="mood-patterns-h" id="mood-patterns-h">
        What your better days have in common
        {/* The window is stated because it is NOT the range chips above: the
            server decides how far back a correlation may look, so this card
            says 90 days while the page header says 30, and two different
            numbers with no explanation read as a bug. */}
        {daysLogged >= daysNeeded && (
          <span className="mood-patterns-scope"> · across {daysLogged} logged days</span>
        )}
      </h2>

      {daysLogged < daysNeeded ? (
        <p className="mood-patterns-wait">
          {daysLogged} of {daysNeeded} days logged. Atlas waits for a fortnight before comparing
          anything — under that, one good Tuesday looks like a pattern.
        </p>
      ) : patterns.length === 0 ? (
        <p className="mood-patterns-wait">
          Nothing stands out across your last {daysLogged} logged days. Your mood has not tracked
          any one thing Atlas can see, which is itself worth knowing.
        </p>
      ) : (
        <>
          <ul className="mood-patterns-list">
            {patterns.slice(0, MAX_SHOWN).map((p) => (
              <li key={p.factor} className="mood-patterns-item">
                {p.line}
              </li>
            ))}
          </ul>
          {/* Said once, plainly, rather than hedged into every line. */}
          <p className="mood-patterns-note">
            These are counts, not causes. Which way the arrow points is yours to decide.
          </p>
        </>
      )}
    </section>
  );
}
