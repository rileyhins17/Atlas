# Phase 3 query-state audit ledger

Inventory refreshed from tracked hook and component ASTs. This discovers named
query-backed hooks and direct useQuery calls; it is not proof of exhaustive
dynamic/aliased usage or of state coverage. A test listed here proves only its
assertions. No component is marked fully audited from source indicators alone.

| Component | Query-backed hooks | Evidence located / work remaining |
| --- | --- | --- |
| AppShell.tsx | useMe | session-read-recovery: failed read avoids false sign-out and offers Retry; confirmed signed-out landmark; full and independent browser recovery passed CI 34278488365 in both themes |
| AuthGate.tsx | useAuthConfig | auth-config-recovery: registration waits for known config, Retry, credentials retained, sign-in independent; full and independent browser config recovery passed CI 34278488365 in both themes |
| TaskGoalChip.tsx | useGoals | Newly included root-level component; errors currently render as loading; old copied-expression tests are not component evidence |
| TaskRow.tsx | useTaskDurations | Newly included root-level component; pending duration-hint state/recovery audit |
| atlas/AsksPanel.tsx | useAiQuestions | context-query-states: questions pending, failure, empty |
| atlas/CommandBar.tsx | useSearch | command-search-states: active-query loading, failed search Retry, confirmed empty and stable selected action; real saved-result browser recovery pending. Capture failure draft recovery remains separate |
| canvas/DayOverviewView.tsx | useRoutine, useTasks, useDayEvents, useDayActuals | Pending consolidated loading / empty / error and recovery audit |
| canvas/MoodCheckIn.tsx | useJournal, useRoutine | Pending consolidated loading / empty / error and recovery audit |
| canvas/SlippedTasks.tsx | useSlippedTasks | decision-query-states: pending skeleton, failed read Retry, settled empty message; consolidated state geometry remains to audit |
| canvas/TodayChecklist.tsx | useHabits | decision-query-states: habit pending and failure avoid false empty, Retry invokes failed source, settled empty message; real check-in and position journeys also exist. Consolidated state geometry remains to audit |
| canvas/TodayView.tsx | useTasks, useEvents, useHabits, useRoutine, useEstablished | Pending consolidated loading / empty / error and recovery audit |
| connectors/GoogleCalendarCard.tsx | useGoogleStatus | Pending consolidated loading / empty / error and recovery audit |
| connectors/GoogleCalendarPicker.tsx | useGoogleCalendars | google-calendar-picker plus settings-draft-refresh: selection writes, warnings, draft refresh and empty calendar result; consolidated browser provider-state audit remains |
| fitness/ActiveWorkout.tsx | useWorkoutHistory, useWeightUnit, useWorkoutTemplates, useExercises | active-workout-recovery: pending plans, failed catalog Retry, retained finish notes and unavailable-comparison explanation; weight-preference display audit remains |
| fitness/DayBuilder.tsx | useExercises | workout-builder-recovery: pending and empty catalog, failed refresh Retry, retained draft and selected exercise ids |
| fitness/ExerciseBlock.tsx | useSettings, useLastPerformance | exercise-entry-units: delayed units, errors, retained draft |
| fitness/ExerciseDetail.tsx | useExerciseHistory, useWeightUnit | Pending consolidated loading / empty / error and recovery audit |
| fitness/ExercisePicker.tsx | useExercises, useWorkoutHistory | exercise-picker-states: catalog/recent-history failures and pending |
| fitness/WorkoutHistory.tsx | useWorkoutHistory, useWeightUnit | Pending consolidated loading / empty / error and recovery audit |
| home/HeroBrief.tsx | useAiStatus, useInsights | hero-brief: real hooks with mocked API prove config pending, config failure and positive Retry, unconfigured fallback, insight pending/error and rendered brief. Configured-success empty and state geometry remain to audit |
| panels/AdminPanel.tsx | useQuery | Pending consolidated loading / empty / error and recovery audit |
| panels/AiSettingsCard.tsx | useAiStatus | Pending consolidated loading / empty / error and recovery audit |
| panels/CalendarPanel.tsx | useEventsRange | Pending consolidated loading / empty / error and recovery audit |
| panels/FinancePanel.tsx | useAccounts, useTransactions | Pending consolidated loading / empty / error and recovery audit |
| panels/FitnessPanel.tsx | useActiveWorkout, useWorkoutHistory, useWorkoutTemplates, useWeightUnit, useExercises | fitness-panel-recovery: templates pending/error exclude false quick starts, history failure excludes newcomer claim, catalog error excludes comparison. Active-workout/preference states and mocked child coverage remain unproven here |
| panels/GoalsPanel.tsx | useTasks, useGoals | domain-query-states: expanded tasks pending/error/retry do not show false empty; real saved-step and retained-draft recovery passed full and independent browser runs 34274101707 in both themes |
| panels/HabitsPanel.tsx | useHabits, useHabitHistory | domain-query-states: history pending/error/retry preserve check-in controls and hide false blank grids; history request covers displayed 26 weeks; browser recovery passed full and independent runs 34274101707 in both themes |
| panels/NameSettingsCard.tsx | useSettings, useMe | settings-read-failures and settings-draft-refresh: read failure/retry and background profile draft retention; real save/GET/reload in both themes passed CI 34270602672 |
| panels/PlaidCard.tsx | usePlaidStatus | Pending consolidated loading / empty / error and recovery audit |
| panels/ProactiveSettingsCard.tsx | useSettings | settings-draft-refresh: edited hour retained across unrelated responses; real save/GET/reload passed CI 34270602672; settings-action-recovery proves rejected push read and Retry in unit tests; corrected browser recovery passed full and independent runs 34273730781 in both themes |
| panels/ProgressPanel.tsx | useStats | Pending consolidated loading / empty / error and recovery audit |
| panels/RoutineEditor.tsx | useRoutine | Pending consolidated loading / empty / error and recovery audit |
| panels/TasksPanel.tsx | useTasks | Pending consolidated loading / empty / error and recovery audit |
| panels/TrainingSettingsCard.tsx | useSettings | settings-action-recovery: failed unit save displays alert and preserves confirmed selection; browser failure/retry/persistence passed full and independent runs 34273730781 in both themes |
| panels/WeeklyDecisions.tsx | useSlippedTasks, useGoals, useHabits, useHabitHistory | decision-query-states: per-source pending and retry |
| panels/WritingPanel.tsx | useJournal, useNotes | Pending consolidated loading / empty / error and recovery audit |
| progress/HabitConsistency.tsx | useHabits, useHabitHistory | progress-empty-states: list/history pending, failure, empty, retry; CI 34225605840 |
| progress/MoodPatterns.tsx | useMoodPatterns | mood-pattern-states: observed-red pending, error/retry and empty tests; both-theme browser loading/failure/retry/empty journey passed CI 34268737825 |
| progress/TrackerTrends.tsx | useTrackerOverview, useTrackerPatterns | tracker-trends-states: overview/pattern pending, failure, empty |
| progress/WeeklyReviewCard.tsx | useInsights | context-query-states: review pending and failure |
| stream/ConnectionCard.tsx | useStats | Pending consolidated loading / empty / error and recovery audit |
| stream/Feed.tsx | useTasks | Pending consolidated loading / empty / error and recovery audit |
| stream/FirstCapture.tsx | useTasks, useEvents | context-query-states; first-capture-handoff; first-use lifecycle |
| stream/TodayHeader.tsx | useMe | Pending consolidated loading / empty / error and recovery audit |
| trackers/TrackerCheckIn.tsx | useTrackers | Pending consolidated loading / empty / error and recovery audit |
| trackers/TrackerManager.tsx | useTrackers | tracker-setup-states: loading/error exclude starter suggestions, Retry, retained draft, pending-save protection; full and independent browser read/save/reload journey passed CI 34276808982 in both themes |

Current inventory: 46 component files. The previous Git pathspec omitted root-level
components; this refresh includes them and removes the obsolete SettingsPanel hook
row. This inventory remains a discovery aid, not exhaustive proof for aliased or
indirect query usage. Optional routine onboarding no
longer issues connection-status queries; connections remain query-backed in Settings.

Next high-impact gaps observed in source: CommandBar still closes before capture
completion and search navigates only to domain lists; TaskGoalChip labels a failed
goal read as loading; read-only workout displays use a default weight unit before preferences
arrive. The old pending-is-not-an-answer tests render copied expressions, not
GoogleCalendarCard or TaskGoalChip, and do not prove those components' states.

This ledger is intentionally incomplete evidence. Default-route screenshots do
not prove modal, editor, pending, failure or empty states. Remaining product
journeys and Phase 4 are not replaced by this inventory.
