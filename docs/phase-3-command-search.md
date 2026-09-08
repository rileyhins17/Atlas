# Command search feedback and stable keyboard selection

The command bar previously showed capture/chat actions without explaining whether
saved-item search was loading, failed or confirmed empty. Search results also
inserted above the numerically selected row: an explicitly selected Ask action
could become Capture when a saved result arrived. Pressing Enter could therefore
write something when the user intended to ask a question.

Selection now follows item identity until the query changes. Loading appears only
for active searches (two or more characters, not an ask intent); failed search
offers Retry, and successful empty search explains that no saved items matched.
Capture and chat remain available. The status lives outside the listbox so its
Retry button is not a fake search option.

Four real-component regressions were observed failing before the fix, then all
four passed. The browser case creates its own synthetic task, holds/fails search,
selects Ask before results arrive, retries the real endpoint and verifies that
selection and query survive. It verifies the returned task id and opens Tasks
where that saved task is visible, then measures a real empty query. Error and empty states are measured at
390px in both themes and added to the screenshot rig. Local build 6/6, forced
typecheck 10/10, lint 0 errors with 3 existing warnings and 1610 unit tests passed.
Full CI evidence is pending.

The first CI run (34279068443, 8332677) passed 66 browser tests and skipped one,
then the new search-error measurement failed: the command input was 23px high.
Its minimum height is now 32px. The existing default-route measurements did not
include this open search state; the stricter case caught the real target defect.

Depends on unmerged PR #47 through 47de6a1. No API contract, provider behavior,
runtime dependency, credential or production change. Capture's existing close-on-
submit and hook-owned local fallback are unchanged; retaining a failed capture
draft is a separate remaining interaction audit, not claimed by these tests.
Search still navigates to a domain list rather than an item-specific deep link.
