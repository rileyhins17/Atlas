# Goal links remain visible when details are unavailable

TaskGoalChip previously used a resolved goal title as evidence of the relationship.
If the goal read failed, compact task rows hid an existing link entirely. The
expanded picker also described an error as Loading, with no recovery path. A
successful list that did not include the linked goal could hide the link too.

The task's goalId now establishes whether it is linked. Missing details render a
temporary Linked goal chip; failed reads offer Retry, and a settled missing goal
has an explicit unavailable explanation. Removing a known link stays an explicit
user action. A confirmed empty, unlinked task still omits the unnecessary picker.
No relationship is changed merely because a read failed.

Observed four component regressions fail before the fix; six focused cases pass.
The browser case creates two synthetic goals and a linked task for each theme,
fails the goal read, checks the retained relationship and Retry, changes the goal
after recovery, reloads and verifies the persisted goal id through the API. The
failure and recovered states are measured at 390px in light and dark. Browser
results remain pending CI.

Depends on unmerged PR #48 through 489ee8c. No migrations, runtime dependencies,
credentials or production changes. Mutation failure/pending interaction behavior
is unchanged and is not claimed by the read-recovery tests.
