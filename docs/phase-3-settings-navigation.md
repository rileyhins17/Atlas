# Settings overview and manual account entry

This Phase 3 UI slice replaces the routine-first Settings layout with grouped
account, day and connection controls. The measured predecessor at cd63d41 was
2622px tall at 390px in both themes, with the routine editor open by default.
The replacement starts with collapsed editors and shortcuts to the week, AI
access and data controls. Existing section preferences and deep links remain.
CI run 34263454287 is green at 7e83b4724a2a4b013408bc7ea92070927374812c.
The Settings page measures 1598px in both themes, down 1024px (39.1%) from
2622px. This is a shorter overview, not a claim that all settings fit in one
viewport. Money measures 1000px; its visible Add account action is the material
change, not the 10px height reduction from the earlier screenshot.

Two regressions were observed failing before the section fix: hash changes on
the same page did not open an editor, and a closed section's aria-controls
referenced a missing element. Both now pass. Content is still mounted only when
opened, preserving query ownership in each editor.

This branch includes the unmerged manual-account checkpoint 59622f6 and AI
usage checkpoint 98bd1e9 on top of PR #33. It does not claim the manual
transaction flow or invited hosted AI is finished. Bank setup remains available
through a disclosure on Money; manual account entry comes first.

New independent browser cases exercise explicit routine opening and create an
account by typing 185.29, then verify the saved account id, 18529 integer cents,
CAD currency and the persisted row after reload. They use the existing synthetic
test account, with no new registration or production access. These cases and
the updated screenshots passed in that run: 56 browser tests passed, one was
skipped, independent groups passed 1 + 1 + 9 cases, and the screenshot case
passed. The synthetic restore and main checks also passed. All 28 measurements
report zero overflow, undersized targets, undersized inputs and axe violations.
The four changed-route PNGs (Settings and Money, light and dark) were inspected
from artifact 10071093968. Raw reports are retained in
`docs/evidence/phase-3-settings-overview.json`. Expanded manual forms still need
their own visual measurement coverage; default route checks do not prove it.

The entire app UI/UX refactor remains active. This is one implementation slice,
not a substitute for mobile planning, complete domain workflows, hosted AI,
query-state coverage or the measured Today performance phase.
