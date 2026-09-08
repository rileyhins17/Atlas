# Phase 3 query-state audit ledger

Inventory refreshed from tracked hook and component ASTs. This discovers named
query-backed hooks and direct useQuery calls; it is not proof of exhaustive
dynamic/aliased usage or of state coverage. A test listed here proves only its
assertions. No component is marked fully audited from source indicators alone.

| Component | Query-backed hooks | Evidence located / work remaining |
| --- | --- | --- |
| AppShell.tsx | useMe | session-read-recovery: failed read avoids false sign-out and offers Retry; confirmed signed-out landmark; full and independent browser recovery passed CI 34278488365 in both themes |
| AuthGate.tsx | useAuthConfig | auth-config-recovery: registration waits for known config, Retry, credentials retained, sign-in independent; full and independent browser config recovery passed CI 34278488365 in both themes |
| TaskGoalChip.tsx | useGoals | task-goal-recovery: real component tests for failed-read Retry, compact pending/error linked label, unresolved linked id, recovered title and confirmed-empty unlinked task; browser persistence passed CI 34280641816, but inspected PNGs exposed -85px menu clipping; repair and stronger bounds checks pending. Old copied-expression tests are not component evidence |
| atlas/AsksPanel.tsx | useAiQuestions | context-query-states: questions pending, failure, empty |
| atlas/CommandBar.tsx | useSearch | command-search-states: active-query loading, failed search Retry, confirmed empty and stable selected action; full and independent saved-result recovery passed CI 34279919678; both-theme search PNGs inspected. Capture recovery now has eight local tests and PR #51: failed text retained, pending input protected, confirmed fallback success; browser verification is blocked by CI billing |
| canvas/DayOverviewView.tsx | useRoutine, useTasks, useDayEvents, useDayActuals | day-overview: four source-specific pending and failed Retry cases, action ordering and timeline expansion. Child components are mocked; this proves the parent gate, not child states. Consolidated state geometry remains |
| canvas/MoodCheckIn.tsx | useJournal, useRoutine | source has pending skeleton, failed-source Retry and settled answered/outside-window absence. mood-checkin tests prove windows and failed journal recovery, but old pending cases only assert no prompt; positive skeleton and failed-routine coverage remain |
| canvas/SlippedTasks.tsx | useSlippedTasks | decision-query-states: pending skeleton, failed read Retry, settled empty message; consolidated state geometry remains to audit |
| canvas/TodayChecklist.tsx | useHabits | decision-query-states: habit pending and failure avoid false empty, Retry invokes failed source, settled empty message; real check-in and position journeys also exist. Consolidated state geometry remains to audit |
| canvas/TodayView.tsx | useTasks, useEvents, useHabits, useRoutine, useEstablished | first-use tests prove the successful-empty setup gate, unsuccessful-read exclusion and saved-item handoff. DayOverview and other children are mocked in those tests; combined source failures must not be inferred from them |
| connectors/GoogleCalendarCard.tsx | useGoogleStatus | google-connection-states: actual inline pending, three layouts failed-read Retry, cached-unconfigured failed refresh; four observed-red regressions and six passing local cases. Browser manual-event persistence and both-theme error PNGs added but not run |
| connectors/GoogleCalendarPicker.tsx | useGoogleCalendars | google-calendar-picker plus settings-draft-refresh: selection writes, warnings, draft refresh and empty calendar result; consolidated browser provider-state audit remains |
| fitness/ActiveWorkout.tsx | useWorkoutHistory, useSettings, useWorkoutTemplates, useExercises | active-workout-recovery: pending plans, failed catalog Retry, retained finish notes and unavailable-comparison explanation; weight-display tests now prove unknown preference states without blocking Finish; summary/browser recovery pending |
| fitness/DayBuilder.tsx | useExercises | workout-builder-recovery: pending and empty catalog, failed refresh Retry, retained draft and selected exercise ids |
| fitness/ExerciseBlock.tsx | useSettings, useLastPerformance | exercise-entry-units: delayed units, errors, retained draft |
| fitness/ExerciseDetail.tsx | useExerciseHistory, useSettings | workout-weight-preference: actual detail waits for units, failed units Retry, recovered kilograms; history-query state geometry remains to audit |
| fitness/ExercisePicker.tsx | useExercises, useWorkoutHistory | exercise-picker-states: catalog/recent-history failures and pending |
| fitness/WorkoutHistory.tsx | useWorkoutHistory, useSettings | workout-weight-preference: actual history waits for units, failed units Retry, recovered kilograms; browser finish/summary/history recovery pending |
| home/HeroBrief.tsx | useAiStatus, useInsights | hero-brief: real hooks with mocked API prove config pending, config failure and positive Retry, unconfigured fallback, insight pending/error and rendered brief. Configured-success empty is now tested; first/refresh generation failures retain context and retry in two observed-red regressions. Nine HeroBrief tests pass; synthetic browser state geometry remains unverified |
| panels/AdminPanel.tsx | useQuery | insight-query-states: actual query pending, failed read/Retry and confirmed empty cohort with no invented percentages; these cases passed before implementation changes elsewhere. Browser owner-route states remain unverified |
| panels/AiSettingsCard.tsx | useAiStatus | ai-access-settings: invite redemption callback, included access and error Retry; pending and revoked/unavailable coverage and real redemption browser proof remain |
| panels/CalendarPanel.tsx | useEventsRange | Pending consolidated loading / empty / error and recovery audit |
| panels/FinancePanel.tsx | useAccounts, useTransactions | Pending consolidated loading / empty / error and recovery audit |
| panels/FitnessPanel.tsx | useActiveWorkout, useWorkoutHistory, useWorkoutTemplates, useSettings, useExercises | fitness-panel-recovery: templates pending/error exclude false quick starts, history failure excludes newcomer claim, catalog error excludes comparison. added preference pending/error cases exclude comparison; active-workout states and mocked child coverage remain unproven here |
| panels/GoalsPanel.tsx | useTasks, useGoals | domain-query-states: expanded tasks pending/error/retry do not show false empty; real saved-step and retained-draft recovery passed full and independent browser runs 34274101707 in both themes |
| panels/HabitsPanel.tsx | useHabits, useHabitHistory | domain-query-states: history pending/error/retry preserve check-in controls and hide false blank grids; history request covers displayed 26 weeks; browser recovery passed full and independent runs 34274101707 in both themes |
| panels/NameSettingsCard.tsx | useSettings, useMe | settings-read-failures and settings-draft-refresh: read failure/retry and background profile draft retention; real save/GET/reload in both themes passed CI 34270602672 |
| panels/PlaidCard.tsx | usePlaidStatus | Pending consolidated loading / empty / error and recovery audit |
| panels/ProactiveSettingsCard.tsx | useSettings | settings-draft-refresh: edited hour retained across unrelated responses; real save/GET/reload passed CI 34270602672; settings-action-recovery proves rejected push read and Retry in unit tests; corrected browser recovery passed full and independent runs 34273730781 in both themes. push-disable-recovery and settings-action-recovery now prove removal errors propagate and retain retry; fresh browser/screenshot verification pending |
| panels/ProgressPanel.tsx | useStats | insight-query-states: actual pending, failed stats/Retry, confirmed empty and range changes; existing implementation passed. Resolved child states are a separate inventory, and failure-state geometry remains unverified |
| panels/RoutineEditor.tsx | useRoutine | Pending consolidated loading / empty / error and recovery audit |
| panels/TasksPanel.tsx | useTasks, useTaskDurations | task-timing-states: one pending/error/empty state for the list, Retry retains the new-task draft, and timing stays disabled without open tasks. TaskRow receives confirmed estimates as props; title recovery remains covered separately. Browser persistence and timing PNGs pending. Main task-list state geometry remains to consolidate |
| panels/TrainingSettingsCard.tsx | useSettings | settings-action-recovery: failed unit save displays alert and preserves confirmed selection; browser failure/retry/persistence passed full and independent runs 34273730781 in both themes |
| panels/WeeklyDecisions.tsx | useSlippedTasks, useGoals, useHabits, useHabitHistory | decision-query-states: per-source pending and retry |
| panels/WritingPanel.tsx | useJournal, useNotes | Pending consolidated loading / empty / error and recovery audit |
| progress/HabitConsistency.tsx | useHabits, useHabitHistory | progress-empty-states: list/history pending, failure, empty, retry; CI 34225605840 |
| progress/MoodPatterns.tsx | useMoodPatterns | mood-pattern-states: observed-red pending, error/retry and empty tests; both-theme browser loading/failure/retry/empty journey passed CI 34268737825 |
| progress/TrackerTrends.tsx | useTrackerOverview, useTrackerPatterns | tracker-trends-states: overview/pattern pending, failure, empty |
| progress/WeeklyReviewCard.tsx | useInsights | context-query-states: review pending and failure |
| stream/ConnectionCard.tsx | useStats | insight-query-states: pending announcement, failed read/Retry, missing history and sufficient history without a pattern; three observed-red cases fixed. Both-theme browser state measurements and error/no-pattern PNGs configured but unverified |
| stream/Feed.tsx | useTimeline, useTasks | history-query-recovery: actual infinite query preserves pages on next-page failure and retries offset 50; task-action pending/error recovery preserves history; first-page failure remains distinct from empty. Three observed-red cases fixed. Browser recovery and saved completion configured but unverified |
| stream/FirstCapture.tsx | useTasks, useEvents | context-query-states; first-capture-handoff; first-use lifecycle |
| stream/TodayHeader.tsx | useMe | BriefBlock inherits AppShell session states: BootScreen before data, Retry on failed initial read, AuthGate on confirmed signed-out, and a shared refresh error with cached data. Source chain inspected; name-nudge tests cover settled nameless setup and avoiding prompts before success. No separate greeting error is needed; final geometry remains inherited from shell verification |
| trackers/TrackerCheckIn.tsx | useTrackers | tracker-checkin: real component pending skeleton, failed-read Retry and confirmed-empty setup link. Browser state geometry remains |
| trackers/TrackerManager.tsx | useTrackers | tracker-setup-states: loading/error exclude starter suggestions, Retry, retained draft, pending-save protection; full and independent browser read/save/reload journey passed CI 34276808982 in both themes |

Current inventory: 38 query-backed hook functions and 45 component files.
WeightPreference and WorkoutSummaryDialog also receive query-derived state through
props; their coverage is recorded with the calling workout components. The previous Git pathspec omitted root-level
components; this refresh includes them and removes the obsolete SettingsPanel hook
row. This inventory remains a discovery aid, not exhaustive proof for aliased or
indirect query usage. Optional routine onboarding no
longer issues connection-status queries; connections remain query-backed in Settings.

Task duration query recovery now belongs to TasksPanel, with confirmed estimates
passed into TaskRow. TaskRow also keeps failed title drafts with explicit
Save/Cancel; both changes still need final browser and visual verification. Command search
still navigates only to domain lists. Capture recovery is implemented in PR #51
and awaits browser verification. Weight-dependent displays
now use the settings query with explicit states; their full browser result is pending. The old pending-is-not-an-answer tests render copied expressions, not
GoogleCalendarCard or TaskGoalChip, and do not prove those components' states.

This ledger is intentionally incomplete evidence. Default-route screenshots do
not prove modal, editor, pending, failure or empty states. Remaining product
journeys and Phase 4 are not replaced by this inventory.

Inventory correction: the earlier scanner counted useQuery but omitted
useInfiniteQuery. Including it finds useTimeline, consumed by Feed inside the
expandable LookingBackPanel → HistoryPanel surface. The count is 38 hooks in
46 component files. A search limited to route files would miss this mounted
component chain; the history feed is not dead code.

Timing ownership correction: TaskRow is rendered only by TasksPanel. Moving the
query there leaves 38 query-backed hooks but reduces direct query-owning
component files from 46 to 45. TaskRow remains in the prop-derived state audit;
its removal from the direct-query inventory is not removal of its UI coverage.

Task creation follow-up: TasksPanel and its dated QuickAdd now protect submitted
drafts during writes and expose persistent retryable failures. Four actual-hook
regressions failed first; browser pending/failure/retry and persistence checks
are configured in life-os.spec.ts but remain unverified. See
[task creation](phase-3-task-creation.md).

WritingPanel creation now protects body/title/mood/mode during pending saves
and retains failed drafts with a persistent alert. Four actual-hook regression
cases were observed red first; browser persistence checks remain unverified.
See [Writing draft recovery](phase-3-writing-drafts.md).
