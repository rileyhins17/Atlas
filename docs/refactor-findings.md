# Refactor findings requiring a separate correction

## F1 — Exercise history combines sessions when reporting best session volume

Status: verified with synthetic inputs on 8 September 2026; correction pending.

`assembleExerciseHistory` (formerly the inline calculation in
`FitnessService.exerciseHistory`) supplies every fetched set as one session to
`exerciseRecords`. Individual displayed session volumes are correct, but the
best-session record is the total across the fetched history.

Observed reproduction: two synthetic workouts, each with ten reps, at 10,000 g
and 20,000 g respectively. The response's individual session volumes were
100,000 g and 200,000 g. Its `records.bestSessionVolumeGrams` was 300,000 g;
the correct maximum of the two sessions is 200,000 g. The exercise detail UI
displays this field as a session record.

The history extraction preserves this existing behavior. Correct it in a
separate focused correctness PR with a regression observed failing first.
Compute records from actual workout groups across **all fetched sessions**,
before applying the displayed-session limit, so old records remain available.
