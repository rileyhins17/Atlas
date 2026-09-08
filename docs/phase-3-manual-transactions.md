# Manual spending and income

Money exposed manual account creation but had no manual transaction action; its
empty ledger directed everyone to bank sync. The existing authenticated,
user-scoped transaction endpoint already supported manual entries.

The new entry form uses that endpoint for Money out and Money in. It takes the
currency from the selected account, uses the shared exact-cents parser and keeps
the draft after failed saves. Missing accounts, negative/zero/incomplete amounts,
unsafe integer amounts and impossible dates are rejected before submitting.
Account loading/errors cannot be mistaken for permission to submit a new entry.

The ledger's existing date grouping uses the device calendar, so manual dates
use local noon and the form states that calendar convention. This preserves the
current ledger semantics; it does not solve cross-device timezone differences
throughout Money. Recorded account balances remain snapshots and do not change
when logging a transaction; both creation forms explicitly explain that.

Two component regressions were observed failing because Add transaction did
not exist. The focused suite then passed four account/transaction component
tests and two new shared validation tests. The error test uses the API helper's
safe fallback for an ordinary Error instead of expecting its internal message.

The appended browser case creates its own synthetic account, types exact amounts
in both themes, verifies signed cents and currency from the saved response,
reloads and checks saved rows and IDs. It is included in the independent CI
selection. The existing screenshot rig captures the open editor at 390px in
both themes and applies the same geometry and axe checks as the route audit.
No additional registration/spec or runtime dependency was introduced.

Local repository gates and observed CI results are recorded in the commit/PR.
Browser and editor PNG verification are pending until those jobs are observed.
This slice depends on unmerged work through c36dea9. No production changes.
