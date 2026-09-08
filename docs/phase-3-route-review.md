# Phase 3 route review after first-use changes

Reviewed all 26 `audit-{light,dark}-{route}.png` files from CI run
34227770139, commit cd63d41f8db95008c09ff2898c7d57d41636321f, artifact
10056713959. These are synthetic fixtures at a 390 by 844 viewport. This is a
review of that revision, not visual approval of later workout changes or of
every interaction state. The PNGs and measurements were read directly.

All 26 route measurements report zero root horizontal overflow, zero targets
under 24 by 24, zero text inputs under 16px and zero axe violations. The two
additional first-use measurements pass the same checks. A geometry/accessibility
pass does not establish a complete or useful product journey.

| Route | Page height, both themes | Visual findings and required follow-through |
| --- | ---: | --- |
| /today | 1909px | Current activity, slipped work and free time precede the checklist. The full timeline is collapsed. The checklist still begins below the first viewport; evaluate the action hierarchy with the redesigned planning journey. |
| /tasks | 1240px | Due groups and titles are readable. Creation, filtering and saved task rows are visible; editor and recovery states require their separate tests. |
| /calendar | 844px | Day view shows full event titles, times and duration within the phone width. |
| /goals | 844px | Empty state has a visible creation form. Populated goal-to-task planning is not evidenced by this empty fixture. |
| /habits | 982px | Three habits have large history grids despite one logged day. Daily action and progress counts are visible; consider reducing sparse-history prominence. |
| /journal | 971px | Writing form and persisted entries are readable. Optional mood and memory controls are visible. |
| /notes | 971px | Resolves to the same Writing surface as journal. This does not independently prove note capture, filtering or retrieval. |
| /fitness | 1028px | Session-start controls precede the first-workout explanation. This fixture contains no active workout or populated history; subsequent recovery work needs its own evidence. |
| /finance | 1010px | Bank configuration notice leads the page. Empty accounts copy promises manual creation, but there is no button or form for it. This is an incomplete provider-free journey. |
| /progress | 1664px | One habit day appears as 3% of the 30-day window, with a warning symbol. Mood is labelled steady from sparse data. Show the evidence window and sufficiency before drawing a conclusion. |
| /everything | 1039px | Domain links have readable names and descriptions. Full-page capture includes fixed navigation over content; verify scroll/focus reachability through interaction tests rather than interpreting the image as permanent occlusion. |
| /week | 993px | Week grid exposes Monday through part of Thursday at once. Event titles truncate to fragments such as “Team sta...”. Root overflow is zero, but the internal grid is not a readable phone planning overview. |
| /settings | 2622px | Routine editor opens expanded and pushes account and connection settings far down. Prefer a concise saved-routine summary with explicit editing while preserving every existing control. |

The paired light/dark images show the same hierarchy and content findings.
Colour changes alone do not resolve them. Fixed capture/navigation bars appear
at the viewport boundary in full-page screenshots; these images alone cannot
prove or disprove reachability of the covered content after scrolling.

Source follow-up confirmed `FinanceService.createAccount` and
`FinanceService.createTransaction` already exist, scope writes to the user and
write timeline records. The web FinanceApi and hooks currently expose reads and
transaction edits, without account/transaction creation. Reuse those existing
server contracts for the missing manual flow. Account balance and transaction
amounts use integer minor units; the current transaction create method does not
update account balance, so the UI must explain that model or deliberately
implement and verify a revised one before claiming a running balance.

This review leaves Phase 3 open. Query-state coverage, populated domain journeys,
mobile planning, manual money entry, sparse-data interpretation and final visual
verification remain required. Phase 4 performance measurements have not started.
