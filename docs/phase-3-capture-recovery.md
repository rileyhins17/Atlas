# Capture keeps drafts until a confirmed save

The command bar previously closed immediately after submitting a capture. Both
capture surfaces allowed editing during a pending write, and the success callback
could clear that newer text. Local fallback saved a row from an error callback,
leaving the mutation failed even after successful persistence. A failed fallback
also reported the original provider error instead of the actual write failure.

Fallback now runs inside the mutation and returns a successful local result after
the existing parser and domain API confirm the write. It still executes when a
caller unmounts. Only the existing 424 integration error permits fallback; an
ordinary server error never creates a second local row. Local results do not
invent AI tool executions or server-generated undo instructions.

The dock and command bar retain failed text with a persistent message. Inputs
are read-only while saving, with a visible saving status. The command bar closes
after success and retains an unfinished draft when dismissed and reopened.
Successful local writes clear the draft and use the hook's single success toast.

Seven regression assertions were observed failing before the implementation;
the eight focused cases pass after it. The tests cover fallback success, the
actual failed-write error, persistence after unmount, no fallback on a generic
server failure, retained command text and pending input protection. A React
state assertion waits for the mutation observer's asynchronous notification.

The browser case is appended to life-os.spec.ts and included in the independent
selection. It fails a synthetic local write, retries through the actual domain
API, reloads, and verifies the saved ID and one matching title. Both surfaces
are measured at 390px in light and dark. This browser case has not run: GitHub
Actions is currently refusing jobs before execution because of account billing.
No new screenshot or browser pass is claimed.

This slice depends on PR #50 through 2637423. It changes no production data,
credentials, runtime dependencies, deployment topology or AI orchestrator guard.

Local final gates: build 6/6, forced typecheck 10/10, lint 0 errors with
3 existing warnings, and 1634 unit tests (313 web, 916 shared, 346 API,
34 AI and 25 connectors).
