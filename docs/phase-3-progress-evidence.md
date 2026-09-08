# Progress claims and query recovery

The light and dark Progress PNGs from CI run 34265906708 showed a mood average
of 3.7 described as steady despite the synthetic account having no previous
mood baseline. Source inspection confirmed that a missing previous average was
converted to a zero delta. A regression observed that false steady claim before
the fix. The summary now states that no baseline was logged in the previous
period; comparisons against an existing baseline retain their current behavior.

MoodPatterns also returned nothing for loading, errors and empty history. Three
component regressions reproduced those missing states. Loading now has a status
and skeleton, failure has an explicit retry action, and empty history explains
the 14-day requirement through the existing server-provided progress message.
All four regressions passed after their fixes.

The appended browser case establishes real synthetic journal activity so the
Progress page renders, then controls only the patterns response to exercise
pending, failure, retry and empty states in both themes at 390px. It is included
in the full and independent runs. This tests recovery behavior; it does not
claim that the intercepted empty response is real persisted journal history.

Still unresolved: the habit ring uses the selected window even for a habit
created today, sparse history is grouped by row position rather than calendar
week, and weekly cadence is not represented in its scoring. The aggregate habit
headline also warns on sparse history without knowing habit eligibility dates.
These need a coherent cadence/date correction with regression evidence, not
merely a lower visual emphasis. Existing mood comparisons do not yet expose
their sample sizes; this change only fixes the absent-baseline claim.

Depends on unmerged PR #38 through 13436ab. Local gate results belong in the
commit; browser and fresh PNG results remain pending until observed in CI.
