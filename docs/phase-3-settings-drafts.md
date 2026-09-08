# Settings drafts survive background refreshes

The query audit found server-to-state effects that discarded edits in three
editors. Observed-red tests reproduced a typed name replaced by a remote name,
a brief hour reverting from 19 to 7 after an unrelated settings response, and
calendar selections replaced by refreshed sync choices.

Name and brief preferences now follow server values until editing starts, then
retain a separate draft. Successful saves update the query cache before clearing
the submitted draft. Calendar selection follows the same rule; its mutation
updates cached syncing flags from the accepted selection before invalidation.
Inputs are disabled while their save is pending so completion cannot discard
new edits typed during that request. Failed requests keep draft state.

A fourth regression reproduced the connected calendar picker's blank empty
result. It now states that no calendars are available from that Google account.
Name guidance no longer implies that an already-saved name can be cleared when
the API does not support that operation.

The browser case opens the name, brief and training editors at 390px in both
themes. It supplies a changed profile in an unrelated settings-save response,
checks that both drafts remain, then removes that interception and saves the
name/hour through the real synthetic API. GET and reload assertions verify the
saved values. The open editors receive the same geometry and axe checks as the
route audit. No real Google account or credential is used; calendar refresh
retention is covered by component tests, not a live-provider browser claim.

Local gate counts and observed CI evidence are recorded in the commit/PR.
Depends on unmerged PR #40 through caaf4fd. No runtime dependency, database
migration or production change is included. Push permission/status recovery and
the complete settings/provider-state audit remain separate unfinished work.
