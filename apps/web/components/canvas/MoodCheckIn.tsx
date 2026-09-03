'use client';

import { useCreateJournalEntry, useJournal } from '@/lib/hooks/journal';
import { localDayKey } from '@/lib/dates';

const FACES = [
  { value: 1, label: 'Rough' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Okay' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Great' },
];

/**
 * One tap, once a day, before anything else.
 *
 * Mood is the only thing Atlas cannot derive. Tasks, events, workouts and spend
 * all arrive as a by-product of using the app; how the day actually FEELS has to
 * be volunteered, and it was previously buried behind writing a journal entry —
 * so it was almost never given, and the mood trend on Looking back usually had
 * nothing to draw.
 *
 * This asks on the first visit of each local day and then gets out of the way
 * for the rest of it. It is deliberately not dismissible: dismissing is what
 * every notification has trained people to do reflexively, and a prompt that can
 * be waved away collects nothing. It is also deliberately not a modal — blocking
 * the whole app to demand a feeling is a worse trade than a card that cannot be
 * ignored, and someone who opened Atlas to check a meeting time should still be
 * able to.
 *
 * The day is the USER'S local day, compared by day key — a UTC comparison would
 * ask again at 8pm for anyone west of Greenwich.
 */
export function MoodCheckIn() {
  const journal = useJournal();
  const create = useCreateJournalEntry();

  // Never guess from an unarrived response. Rendering the prompt while the
  // journal is still loading would flash it at someone who answered an hour
  // ago, which is the same mistake as "No habits yet" on Looking back.
  if (journal.isPending || journal.isError) return null;

  const today = localDayKey(new Date());
  const answered = (journal.data ?? []).some(
    (e) => e.mood != null && localDayKey(new Date(e.entryDate)) === today,
  );
  if (answered) return null;

  return (
    <section className="mood-checkin" aria-label="How are you feeling today?">
      <p className="mood-checkin-q">How are you, right now?</p>
      <div className="mood-checkin-scale" role="group" aria-label="Pick a mood from 1 to 5">
        {FACES.map((f) => (
          <button
            key={f.value}
            type="button"
            className="mood-checkin-btn"
            disabled={create.isPending}
            aria-label={`${f.label} — ${f.value} out of 5`}
            onClick={() => create.mutate({ body: '', mood: f.value })}
          >
            <span className="mood-checkin-num">{f.value}</span>
            <span className="mood-checkin-word">{f.label}</span>
          </button>
        ))}
      </div>
      <p className="mood-checkin-why">
        One tap. It is what makes the patterns on Looking back mean anything.
      </p>
    </section>
  );
}
