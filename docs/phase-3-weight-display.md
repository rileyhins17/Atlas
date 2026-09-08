# Weight displays wait for the saved preference

The read-only useWeightUnit hook previously returned pounds while settings were
unknown. Entry forms already guarded their saved units, but history, exercise
records, training progress, the live volume and finished summaries still guessed.
Those readouts now consume the existing settings query and show loading or Retry
when its result is unavailable. The fallback hook is removed.

WeightPreference shares these display states. Active workouts retain their title,
set count, notes and Finish action when settings fail. The completed summary keeps
time, set counts and comparisons in grams, with an unavailable volume placeholder
and Retry inside the modal; it renders weights in the saved unit after recovery.
No saved gram value is converted or rewritten when the preference is read.

Eight real-component regression cases failed before the fix; all 18 focused
cases then passed, including history/detail recovery and finishing with retained
notes through a failed preference read. The browser case logs 100000 grams for
five reps, fails settings, finishes with typed notes, retries inside the summary,
expects 500 kg, reloads and verifies the original stored grams and notes. Both
themes are measured at 390px. The screenshot rig also captures history's preference
failure. Local build 6/6, forced typecheck 10/10, lint 0 errors with 3 existing
warnings and 1626 unit tests passed again after incorporating the goal-menu
bounds repair. Fresh CI is unavailable: GitHub refused the dependency repair
jobs before allocating a runner, citing failed account payments or a spending
limit. No browser pass is claimed for this slice.

Depends on unmerged PR #49 through 2730b9c. No runtime dependencies, migrations,
credentials or production configuration changes. The existing entry-form draft
unit protections and stored integer-gram contract remain in force.
