# Tracker setup: distinguish unavailable data and preserve submitted drafts

TrackerManager treated a missing query result as an empty tracker list and
presented starter suggestions during loading and errors. It now waits for a
successful read, offers Retry after failure, and describes a confirmed empty
list explicitly. Component state survives failed reads so an open draft is
available again after recovery.

Tracker creation also left fields and Cancel editable while the submitted
mutation was pending. A later success could clear edits typed after submission.
The submitted fields, direction choices and Cancel are now disabled until the
save settles. Failed saves retain the draft for another attempt.

Observed three regressions fail before fixing them: loading suggestions, error
suggestions and editable submitted drafts. The four-test focused run now passes,
including draft retention across read failure/recovery. The browser case covers
read failure/retry, a held and failed save, retained input, successful real write,
reload and API-id verification in both themes at 390px. Browser results remain
pending until CI is observed. The existing screenshot suite covers all routes;
this expanded tracker journey has its own strict geometry and axe measurement.

Depends on unmerged PR #45 through a422d09. No runtime dependencies, migrations,
credentials or production configuration changes are included.
