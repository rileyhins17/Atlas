'use client';

import { moodCheckInQuestion as question, moodCheckInReason as why } from '@atlas/shared';

import {
  activeMoodWindow,
  inMoodWindow,
  moodWindows,
} from '@atlas/shared';
import { useCreateJournalEntry, useJournal } from '@/lib/hooks/journal';
import { useRoutine } from '@/lib/hooks/routine';
import { dayBit, localDayKey } from '@/lib/dates';
import { ErrorState, ListSkeleton } from '@/components/ui';

const FACES = [
  { value: 1, label: 'Rough' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Okay' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Great' },
];

/**
 * Twice a day: shortly after you wake, and shortly before you sleep.
 *
 * Mood is the only thing Atlas cannot derive. Tasks, events, workouts and spend
 * all arrive as a by-product of using the app; how the day FEELS has to be
 * volunteered, and it used to cost a written journal entry — so it was almost
 * never given, and the mood trend on Looking back had nothing to draw.
 *
 * ONE reading a day tells you how a day went. Two bracket it. The difference
 * between how you woke up and how you went to bed is caused by the hours in
 * between, and those hours are exactly what Atlas already knows: what you
 * trained, what you finished, how full the day was. A single evening mood
 * cannot separate "today was hard" from "I woke up like this", which is the
 * distinction the whole patterns feature rests on — so the prompt says why it
 * is asking twice rather than leaving it to look like nagging.
 *
 * The times are the user's OWN, read from the sleep block in their routine, so
 * a night shift or a 5am start is followed without configuring a second thing.
 * With no routine set it falls back to ordinary hours and offers to be told.
 *
 * Deliberately not dismissible: dismissing is what every notification has
 * trained people to do reflexively, and a prompt that can be waved away
 * collects nothing. Deliberately not a modal, either — blocking the app to
 * demand a feeling is a worse trade than a card that cannot be ignored, and
 * someone who opened Atlas to check a meeting time should still be able to.
 * Outside its two windows it renders nothing at all.
 */
export function MoodCheckIn() {
  const journal = useJournal();
  const routine = useRoutine();
  const create = useCreateJournalEntry();

  // Never guess from an unarrived response. Rendering the prompt while either
  // query is still loading would ask someone who answered an hour ago, or ask
  // at the wrong time of day — the same mistake as "No habits yet" on a page
  // that is still loading.
  const failed = [journal, routine].filter((query) => query.isError);
  if (failed.length > 0) return (
    <section className="mood-checkin" aria-label="Mood check-in">
      <ErrorState message="Mood check-in could not be loaded." onRetry={() => {
        for (const query of failed) void query.refetch();
      }} />
    </section>
  );
  if (journal.isPending || routine.isPending) return <ListSkeleton rows={1} circle={false} />;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = localDayKey(now);

  // The sleep block for TODAY specifically: a routine can name different hours
  // on different days, and a one-off `onDate` block overrides the weekly rule.
  const mask = 1 << dayBit(now);
  const sleep = (routine.data ?? []).find(
    (b) => b.kind === 'sleep' && (b.onDate ? b.onDate === today : (b.days & mask) !== 0),
  );

  const windows = moodWindows(sleep ?? null);
  const window = activeMoodWindow(nowMin, windows);
  if (!window) return null;

  // Answered THIS window, not merely today. The morning reading must not
  // silence the evening one — two readings is the entire point.
  const answered = (journal.data ?? []).some((e) => {
    if (e.mood == null) return false;
    const at = new Date(e.entryDate);
    if (localDayKey(at) !== today) return false;
    return inMoodWindow(at.getHours() * 60 + at.getMinutes(), window);
  });
  if (answered) return null;

  return (
    <section className="mood-checkin" aria-label={question(window)}>
      <p className="mood-checkin-q">{question(window)}</p>
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
      {create.isError && <p className="mood-checkin-error error" role="alert">Mood was not confirmed. Choose a mood to try again.</p>}
      <p className="mood-checkin-why">{why(window, nowMin, Boolean(sleep))}</p>
    </section>
  );
}
