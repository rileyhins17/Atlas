# Settings action recovery

The settings audit found two missing failure paths. A rejected service-worker
registration read left notification controls disabled with no explanation and
an unhandled promise rejection. A failed weight-unit mutation left the old
selection visible without an inline explanation. Both regressions were observed
failing before their fixes; the red run also reported the unhandled rejection.

Notification status now has explicit checking, failure and retry states. A
request generation prevents obsolete reads from updating the component after
unmount or a newer read. Existing permission/unsupported/configuration states
remain. A failed weight preference save displays an inline alert and retains
the confirmed selection; choosing the desired unit again retries the mutation.

The browser case simulates the first registration-status failure without asking
for notification permission or sending a notification. It then retries to the
available state. A simulated weight-save failure verifies the alert and retained
selection, followed by a real write and GET against the disposable API. Both
themes receive strict measurements at 390px. The case runs in the full and
independent selections.

The existing screenshot rig also captures the expanded training and notification
settings in light and dark and adds those states to its measurement report.
Those PNGs must be downloaded and inspected after CI produces them.

This does not yet change subscription/unsubscription failure semantics in
lib/push.ts or prove delivery through a real push provider. No credentials,
notification permissions, runtime dependencies, migrations or production
configuration changed. Depends on unmerged PR #41 through e6773e4. Local gate
results belong in the commit; browser evidence remains pending until observed.
