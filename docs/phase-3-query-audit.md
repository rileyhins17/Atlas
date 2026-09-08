# Phase 3 query-state audit ledger

Inventory refreshed from tracked hook and component ASTs. This discovers named
query-backed hooks and direct useQuery calls; it is not proof of exhaustive
dynamic/aliased usage or of state coverage. A test listed here proves only its
assertions. No component is marked fully audited from source indicators alone.

| Component | Query-backed hooks | Evidence located / work remaining |
| --- | --- | --- |
| atlas/AsksPanel.tsx | useAiQuestions | context-query-states: questions pending, failure, empty |
| atlas/CommandBar.tsx | useSearch | Pending consolidated loading / empty / error and recovery audit |
| canvas/DayOverviewView.tsx | useRoutine, useTasks, useDayEvents, useDayActuals | Pending consolidated loading / empty / error and recovery audit |
| canvas/MoodCheckIn.tsx | useJournal, useRoutine | Pending consolidated loading / empty / error and recovery audit |
| canvas/SlippedTasks.tsx | useSlippedTasks | Pending consolidated loading / empty / error and recovery audit |
| canvas/TodayChecklist.tsx | useHabits | Pending consolidated loading / empty / error and recovery audit |
| canvas/TodayView.tsx | useTasks, useEvents, useHabits, useRoutine, useEstablished | Pending consolidated loading / empty / error and recovery audit |
| connectors/GoogleCalendarCard.tsx | useGoogleStatus | Pending consolidated loading / empty / error and recovery audit |
| connectors/GoogleCalendarPicker.tsx | useGoogleCalendars | google-calendar-picker plus settings-draft-refresh: selection writes, warnings, draft refresh and empty calendar result; consolidated browser provider-state audit remains |
| fitness/ActiveWorkout.tsx | useWorkoutHistory, useWeightUnit, useWorkoutTemplates, useExercises | Pending consolidated loading / empty / error and recovery audit |
| fitness/DayBuilder.tsx | useExercises | Pending consolidated loading / empty / error and recovery audit |
| fitness/ExerciseBlock.tsx | useSettings, useLastPerformance | exercise-entry-units: delayed units, errors, retained draft |
| fitness/ExerciseDetail.tsx | useExerciseHistory, useWeightUnit | Pending consolidated loading / empty / error and recovery audit |
| fitness/ExercisePicker.tsx | useExercises, useWorkoutHistory | exercise-picker-states: catalog/recent-history failures and pending |
| fitness/WorkoutHistory.tsx | useWorkoutHistory, useWeightUnit | Pending consolidated loading / empty / error and recovery audit |
| home/HeroBrief.tsx | useAiStatus, useInsights | Pending consolidated loading / empty / error and recovery audit |
| panels/AdminPanel.tsx | useQuery | Pending consolidated loading / empty / error and recovery audit |
| panels/AiSettingsCard.tsx | useAiStatus | Pending consolidated loading / empty / error and recovery audit |
| panels/CalendarPanel.tsx | useEventsRange | Pending consolidated loading / empty / error and recovery audit |
| panels/FinancePanel.tsx | useAccounts, useTransactions | Pending consolidated loading / empty / error and recovery audit |
| panels/FitnessPanel.tsx | useActiveWorkout, useWorkoutHistory, useWorkoutTemplates, useWeightUnit, useExercises | Pending consolidated loading / empty / error and recovery audit |
| panels/GoalsPanel.tsx | useTasks, useGoals | Pending consolidated loading / empty / error and recovery audit |
| panels/HabitsPanel.tsx | useHabits, useHabitHistory | Pending consolidated loading / empty / error and recovery audit |
| panels/NameSettingsCard.tsx | useSettings, useMe | settings-read-failures and settings-draft-refresh: read failure/retry and background profile draft retention; save/reload journey pending CI |
| panels/PlaidCard.tsx | usePlaidStatus | Pending consolidated loading / empty / error and recovery audit |
| panels/ProactiveSettingsCard.tsx | useSettings | settings-draft-refresh: edited hour retained across unrelated server responses; save/reload journey pending CI; push-state recovery remains |
| panels/ProgressPanel.tsx | useStats | Pending consolidated loading / empty / error and recovery audit |
| panels/RoutineEditor.tsx | useRoutine | Pending consolidated loading / empty / error and recovery audit |
| panels/SettingsPanel.tsx | useGoogleStatus | Pending consolidated loading / empty / error and recovery audit |
| panels/TasksPanel.tsx | useTasks | Pending consolidated loading / empty / error and recovery audit |
| panels/TrainingSettingsCard.tsx | useSettings | Pending consolidated loading / empty / error and recovery audit |
| panels/WeeklyDecisions.tsx | useSlippedTasks, useGoals, useHabits, useHabitHistory | decision-query-states: per-source pending and retry |
| panels/WritingPanel.tsx | useJournal, useNotes | Pending consolidated loading / empty / error and recovery audit |
| progress/HabitConsistency.tsx | useHabits, useHabitHistory | progress-empty-states: list/history pending, failure, empty, retry; CI 34225605840 |
| progress/MoodPatterns.tsx | useMoodPatterns | mood-pattern-states: observed-red pending, error/retry and empty tests; browser state journey pending CI |
| progress/TrackerTrends.tsx | useTrackerOverview, useTrackerPatterns | tracker-trends-states: overview/pattern pending, failure, empty |
| progress/WeeklyReviewCard.tsx | useInsights | context-query-states: review pending and failure |
| stream/ConnectionCard.tsx | useStats | Pending consolidated loading / empty / error and recovery audit |
| stream/Feed.tsx | useTasks | Pending consolidated loading / empty / error and recovery audit |
| stream/FirstCapture.tsx | useTasks, useEvents | context-query-states; first-capture-handoff; first-use lifecycle |
| stream/TodayHeader.tsx | useMe | Pending consolidated loading / empty / error and recovery audit |
| trackers/TrackerCheckIn.tsx | useTrackers | Pending consolidated loading / empty / error and recovery audit |
| trackers/TrackerManager.tsx | useTrackers | Pending consolidated loading / empty / error and recovery audit |

Current inventory: 43 component files. Optional routine onboarding no
longer issues connection-status queries; connections remain query-backed in Settings.

Next high-impact gaps observed in source: ActiveWorkout derives template blocks
from unavailable template/catalog data and record summaries from unavailable
history; DayBuilder has no catalog recovery gate. These require preserving
draft/session state and avoiding false absence or personal-record claims.

This ledger is intentionally incomplete evidence. Default-route screenshots do
not prove modal, editor, pending, failure or empty states. Remaining product
journeys and Phase 4 are not replaced by this inventory.
