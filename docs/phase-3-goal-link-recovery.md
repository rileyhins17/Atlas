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

Run 34280641816 at fbf0277 passed 68 browser tests (one skipped), independent
selections 1 + 1 + 21, and screenshots. Its 42 reports passed the original checks.
Visual inspection then found the menu clipped to the left. Saved geometry proved
it spanned -85px to 145px in both themes; asserting nonnegative bounds failed.
Document scrollWidth alone missed this. Menu placement now stays within 16px
viewport gutters, and the common measurement checks horizontal bounds for goal
menus and dialogs explicitly. This visual finding prevents treating that green
run as completion; fresh verification is required for the repair.

Depends on unmerged PR #48 through 489ee8c. No migrations, runtime dependencies,
credentials or production changes. Mutation failure/pending interaction behavior
is unchanged and is not claimed by the read-recovery tests.
