import type {
  AccountDTO,
  AiQuestionDTO,
  AiUndoStepDTO,
  AuthConfigDTO,
  HabitHistoryDTO,
  TimelinePageDTO,
  ChatMessageDTO,
  ChatResponseDTO,
  CreateHabitInput,
  CreateJournalInput,
  CreateNoteInput,
  CreateExerciseInput,
  CreateTaskInput,
  DurationEstimate,
  EventDTO,
  ExerciseDTO,
  HabitDTO,
  LastPerformanceDTO,
  GoalDTO,
  PlanSplitResultDTO,
  WeightUnitPref,
  WorkoutTemplateDTO,
  LogSetInput,
  WorkoutDTO,
  InsightDTO,
  JournalDTO,
  NoteDTO,
  PlanDayDTO,
  RollForwardAction,
  RollForwardResultDTO,
  RoutineBlockDTO,
  RoutineBlockInput,
  SearchResultDTO,
  SettingsDTO,
  StatsDTO,
  TaskDTO,
  TransactionDTO,
  UserDTO,
} from '@atlas/shared';

/**
 * Where the browser reaches the API.
 *
 * An explicit NEXT_PUBLIC_API_URL always wins. Otherwise this is decided at
 * RUNTIME from the hostname, which matters because the value is otherwise baked
 * in at build time: a production build made without the variable set silently
 * shipped a bundle pointing at http://localhost:4000, so every phone tried to
 * call its OWN localhost and failed CORS with no server-side error to notice.
 *
 * Served from a real hostname, the API is same-origin behind the reverse proxy
 * at /api. On localhost it is the dev API on :4000. Deriving it removes the
 * chance of shipping a bundle that cannot talk to its own backend.
 */
function resolveBase(): string {
  const explicit = process.env.NEXT_PUBLIC_API_URL;
  if (explicit) return explicit;
  if (typeof window === 'undefined') return 'http://localhost:4000';
  const { hostname } = window.location;
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  return local ? 'http://localhost:4000' : '/api';
}

const BASE = resolveBase();

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Human-readable message for a failed call; API messages pass through. */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    ...opts,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  // A handler returning null serialises to an EMPTY body with a 200/201 — not
  // a 204 — and `res.json()` throws on empty input. Both "no active workout"
  // and "the empty session was discarded" arrive this way.
  //
  // It must resolve to null, NOT undefined: TanStack Query rejects an undefined
  // query result outright ("Query data cannot be undefined"), so a nullable GET
  // would render its error state instead of its empty state.
  const text = await res.text();
  if (text.length === 0) return null as T;
  return JSON.parse(text) as T;
}

export const AccountApi = {
  /** Fetches the export (cookie-authed) and triggers a browser download. */
  async downloadExport(): Promise<void> {
    const res = await fetch(`${BASE}/account/export`, { credentials: 'include' });
    if (!res.ok) throw new ApiError(res.status, 'Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const disposition = res.headers.get('content-disposition') ?? '';
    const match = disposition.match(/filename="(.+?)"/);
    const a = document.createElement('a');
    a.href = url;
    a.download = match?.[1] ?? 'atlas-export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  deleteAccount: (password: string) =>
    request<{ ok: true }>('/account/delete', {
      method: 'POST',
      body: JSON.stringify({ password, confirm: 'DELETE' }),
    }),
};

/**
 * The device's IANA zone, or 'UTC' where Intl cannot say.
 *
 * This is the value `User.timezone` is kept in step with. Atlas deliberately
 * has ONE clock per user rather than one per surface: the day rollups in
 * `/stats` bucket server-side with `AT TIME ZONE`, which can only use a stored
 * zone, so the stored zone has to be the real one.
 */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export const AuthApi = {
  me: () => request<UserDTO>('/auth/me'),
  /** Public: whether this deployment has closed sign-up behind an invite code. */
  config: () => request<AuthConfigDTO>('/auth/config'),
  register: (input: { email: string; password: string; inviteCode?: string; remember?: boolean }) =>
    request<UserDTO>('/auth/register', {
      method: 'POST',
      // Send the device's zone at signup. `User.timezone` is the ONE clock both
      // Today and Progress bucket days by, and its 'UTC' default is only ever
      // corrected by finding a settings toggle — so left unsent, the two
      // surfaces disagree about which day something happened for every user
      // outside UTC. See browserTimezone().
      body: JSON.stringify({ ...input, timezone: browserTimezone() }),
    }),
  login: (input: { email: string; password: string; remember?: boolean }) =>
    request<UserDTO>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
};

export const TasksApi = {
  list: () => request<TaskDTO[]>('/tasks'),
  create: (input: Partial<CreateTaskInput> & { title: string }) =>
    request<TaskDTO>('/tasks', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, patch: Record<string, unknown>) =>
    request<TaskDTO>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  complete: (id: string) => request<TaskDTO>(`/tasks/${id}/complete`, { method: 'POST' }),
  remove: (id: string) => request<{ ok: true }>(`/tasks/${id}`, { method: 'DELETE' }),
  /** Learned medians, keyed by normalised title — see durationKey(). */
  durations: () => request<DurationEstimate[]>('/tasks/durations'),
  /** Open work that was due before today. */
  slipped: () => request<TaskDTO[]>('/tasks/slipped'),
  rollForward: (taskIds: string[], action: RollForwardAction) =>
    request<RollForwardResultDTO>('/tasks/roll-forward', {
      method: 'POST',
      body: JSON.stringify({ taskIds, action }),
    }),
};

export const HabitsApi = {
  list: () => request<HabitDTO[]>('/habits'),
  history: (days: number) => request<HabitHistoryDTO[]>(`/habits/history?days=${days}`),
  create: (input: Partial<CreateHabitInput> & { name: string }) =>
    request<HabitDTO>('/habits', { method: 'POST', body: JSON.stringify(input) }),
  log: (id: string) => request<HabitDTO>(`/habits/${id}/log`, { method: 'POST', body: '{}' }),
  remove: (id: string) => request<{ ok: true }>(`/habits/${id}`, { method: 'DELETE' }),
};

export const JournalApi = {
  list: () => request<JournalDTO[]>('/journal'),
  create: (input: Partial<CreateJournalInput> & { body: string }) =>
    request<JournalDTO>('/journal', { method: 'POST', body: JSON.stringify(input) }),
};

export const NotesApi = {
  list: () => request<NoteDTO[]>('/notes'),
  create: (input: Partial<CreateNoteInput> & { body: string }) =>
    request<NoteDTO>('/notes', { method: 'POST', body: JSON.stringify(input) }),
  remove: (id: string) => request<{ ok: true }>(`/notes/${id}`, { method: 'DELETE' }),
};

// startAt/endAt sent as ISO strings; the API coerces them to Date via zod.
export type NewEvent = {
  title: string;
  startAt: string;
  endAt: string;
  location?: string;
  description?: string;
  allDay?: boolean;
  /** Set when the block was reserved for a task, so its real length can be learned. */
  taskId?: string;
};

export const EventsApi = {
  list: (opts: { from?: string; to?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.from) params.set('from', opts.from);
    if (opts.to) params.set('to', opts.to);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return request<EventDTO[]>(`/events${qs ? `?${qs}` : ''}`);
  },
  create: (input: NewEvent) =>
    request<EventDTO>('/events', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, patch: Partial<NewEvent> & { recurrence?: string | null }) =>
    request<EventDTO>(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string) => request<{ ok: true }>(`/events/${id}`, { method: 'DELETE' }),
};

export const FitnessApi = {
  exercises: () => request<ExerciseDTO[]>('/fitness/exercises'),
  createExercise: (input: CreateExerciseInput) =>
    request<ExerciseDTO>('/fitness/exercises', { method: 'POST', body: JSON.stringify(input) }),
  lastPerformance: (exerciseId: string) =>
    request<LastPerformanceDTO | null>(`/fitness/exercises/${exerciseId}/last`),
  active: () => request<WorkoutDTO | null>('/fitness/workouts/active'),
  history: (limit = 20) => request<WorkoutDTO[]>(`/fitness/workouts?limit=${limit}`),
  start: (input: { title?: string; templateId?: string }) =>
    request<WorkoutDTO>('/fitness/workouts', { method: 'POST', body: JSON.stringify(input) }),
  logSet: (workoutId: string, input: LogSetInput) =>
    request<WorkoutDTO>(`/fitness/workouts/${workoutId}/sets`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteSet: (workoutId: string, setId: string) =>
    request<WorkoutDTO>(`/fitness/workouts/${workoutId}/sets/${setId}`, { method: 'DELETE' }),
  templates: () => request<WorkoutTemplateDTO[]>('/fitness/templates'),
  createTemplate: (input: { name: string; exerciseIds: string[] }) =>
    request<WorkoutTemplateDTO>('/fitness/templates', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateTemplate: (id: string, patch: { name?: string; exerciseIds?: string[] }) =>
    request<WorkoutTemplateDTO>(`/fitness/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  removeTemplate: (id: string) =>
    request<{ ok: true }>(`/fitness/templates/${id}`, { method: 'DELETE' }),
  /** Read a written split into proposals. Writes nothing. */
  planSplit: (text: string) =>
    request<PlanSplitResultDTO>('/fitness/templates/plan', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  applySplit: (templates: { name: string; exercises: { exerciseId: string | null; name: string }[] }[]) =>
    request<WorkoutTemplateDTO[]>('/fitness/templates/apply', {
      method: 'POST',
      body: JSON.stringify({ templates }),
    }),
  finish: (workoutId: string, input: { notes?: string }) =>
    request<WorkoutDTO | null>(`/fitness/workouts/${workoutId}/finish`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

export const TimelineApi = {
  list: (opts: { limit?: number; offset?: number; source?: string; from?: string; to?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.offset) params.set('offset', String(opts.offset));
    if (opts.source) params.set('source', opts.source);
    if (opts.from) params.set('from', opts.from);
    if (opts.to) params.set('to', opts.to);
    const qs = params.toString();
    return request<TimelinePageDTO>(`/timeline${qs ? `?${qs}` : ''}`);
  },
};

export const PlanApi = {
  /** Ask for proposals. Returns suggestions only — nothing is written. */
  planDay: (gaps: { startAt: string; endAt: string }[]) =>
    request<PlanDayDTO>('/ai/plan-day', { method: 'POST', body: JSON.stringify({ gaps }) }),
};

export const AiQuestionsApi = {
  list: () => request<AiQuestionDTO[]>('/ai/questions'),
  answer: (id: string, answer: string) =>
    request<AiQuestionDTO>(`/ai/questions/${id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    }),
  dismiss: (id: string) =>
    request<{ ok: true }>(`/ai/questions/${id}/dismiss`, { method: 'POST', body: '{}' }),
  generate: () => request<{ ok: true }>('/ai/questions/generate', { method: 'POST', body: '{}' }),
};

export interface AiStatus {
  enabled: boolean;
  model: string;
  dailyTokenCap: number;
  tokensUsedToday: number;
  providerConfigured: boolean;
  domains: string[];
}

export interface GoogleStatus {
  /** Server has GOOGLE_CLIENT_ID/SECRET set. */
  configured: boolean;
  /** This user has authorized Google. */
  connected: boolean;
}

export interface SyncResult {
  connector: string;
  imported: number;
  updated: number;
  pushed: number;
  deleted: number;
  errors: string[];
}

export const GoogleApi = {
  status: () => request<GoogleStatus>('/connectors/google/status'),
  start: () => request<{ url: string }>('/connectors/google/start'),
  sync: () => request<SyncResult>('/connectors/google/sync', { method: 'POST', body: '{}' }),
  disconnect: () =>
    request<{ ok: true }>('/connectors/google/disconnect', { method: 'POST', body: '{}' }),
};

export interface PlaidItem {
  itemId: string;
  institution: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
}

export interface PlaidStatus {
  /** Server has PLAID_CLIENT_ID/SECRET set. */
  configured: boolean;
  /** This user has at least one linked bank. */
  connected: boolean;
  items: PlaidItem[];
}

export const PlaidApi = {
  status: () => request<PlaidStatus>('/connectors/plaid/status'),
  linkToken: (itemId?: string) =>
    request<{ linkToken: string }>('/connectors/plaid/link-token', {
      method: 'POST',
      body: JSON.stringify(itemId ? { itemId } : {}),
    }),
  exchange: (publicToken: string) =>
    request<SyncResult>('/connectors/plaid/exchange', {
      method: 'POST',
      body: JSON.stringify({ publicToken }),
    }),
  sync: () => request<SyncResult>('/connectors/plaid/sync', { method: 'POST', body: '{}' }),
  disconnect: (itemId?: string) =>
    request<{ ok: true }>('/connectors/plaid/disconnect', {
      method: 'POST',
      body: JSON.stringify(itemId ? { itemId } : {}),
    }),
};

export const FinanceApi = {
  accounts: () => request<AccountDTO[]>('/finance/accounts'),
  transactions: (opts: { accountId?: string; limit?: number; offset?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.accountId) params.set('accountId', opts.accountId);
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.offset) params.set('offset', String(opts.offset));
    const qs = params.toString();
    return request<TransactionDTO[]>(`/finance/transactions${qs ? `?${qs}` : ''}`);
  },
  updateTransaction: (id: string, patch: Record<string, unknown>) =>
    request<TransactionDTO>(`/finance/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
};

export const SettingsApi = {
  get: () => request<SettingsDTO>('/settings'),
  update: (
    // Mirrors UpdateSettingsInput; keep the two in step when adding a preference.
    patch: Partial<{
      displayName: string;
      timezone: string;
      briefHour: number;
      proactiveEnabled: boolean;
      weightUnit: WeightUnitPref;
    }>,
  ) => request<SettingsDTO>('/settings', { method: 'PATCH', body: JSON.stringify(patch) }),
};

export const StatsApi = {
  get: (days: number) => request<StatsDTO>(`/stats?days=${days}`),
};

export const RoutineApi = {
  addBlock: (input: RoutineBlockInput) =>
    request<RoutineBlockDTO>('/routine/blocks', { method: 'POST', body: JSON.stringify(input) }),
  updateBlock: (id: string, patch: Partial<RoutineBlockInput>) =>
    request<RoutineBlockDTO>(`/routine/blocks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  removeBlock: (id: string) =>
    request<{ ok: true }>(`/routine/blocks/${id}`, { method: 'DELETE' }),
  list: () => request<RoutineBlockDTO[]>('/routine'),
  replace: (blocks: RoutineBlockInput[]) =>
    request<RoutineBlockDTO[]>('/routine', { method: 'PUT', body: JSON.stringify({ blocks }) }),
};

export const PushApi = {
  publicKey: () => request<{ configured: boolean; publicKey: string | null }>('/push/public-key'),
  subscribe: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    request<{ ok: true }>('/push/subscribe', { method: 'POST', body: JSON.stringify(sub) }),
  unsubscribe: (endpoint: string) =>
    request<{ ok: true }>('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
};

export const AiApi = {
  status: () => request<AiStatus>('/ai/status'),
  connectDeepSeek: (apiKey: string) =>
    request<{ ok: true }>('/ai/connect/deepseek', { method: 'POST', body: JSON.stringify({ apiKey }) }),
  chat: (message: string, history: ChatMessageDTO[]) =>
    request<ChatResponseDTO>('/ai/chat', { method: 'POST', body: JSON.stringify({ message, history }) }),
  brainDump: (text: string) =>
    request<ChatResponseDTO>('/ai/brain-dump', { method: 'POST', body: JSON.stringify({ text }) }),
  dailyBrief: () => request<InsightDTO>('/ai/daily-brief', { method: 'POST', body: '{}' }),
  weeklyReview: () => request<InsightDTO>('/ai/weekly-review', { method: 'POST', body: '{}' }),
  insights: () => request<InsightDTO[]>('/ai/insights'),
  backfillEmbeddings: () =>
    request<{ processed: number; failed: number }>('/ai/embeddings/backfill', { method: 'POST', body: '{}' }),
};

export const GoalsApi = {
  list: () => request<GoalDTO[]>('/goals'),
  create: (input: { title: string; description?: string; horizon?: 'short' | 'long'; targetDate?: string }) =>
    request<GoalDTO>('/goals', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, patch: Record<string, unknown>) =>
    request<GoalDTO>(`/goals/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string) => request<{ ok: true }>(`/goals/${id}`, { method: 'DELETE' }),
};

/**
 * Replay one AI undo step.
 *
 * The method, path and body are built on the SERVER from the row that was
 * actually written — the model never supplies them. This runs with the user's
 * own session, so an undo can only ever reach data that session could already
 * reach. See AiUndoStepDTO.
 */
export function applyUndoStep(step: AiUndoStepDTO): Promise<unknown> {
  return request(step.path, {
    method: step.method,
    ...(step.body ? { body: JSON.stringify(step.body) } : {}),
  });
}

/**
 * Undo a whole batch, newest first.
 *
 * Order matters: one capture can create a task AND an event, and reversing in
 * reverse-application order is the only sequence guaranteed not to hit a row
 * another step already removed.
 */
export async function applyUndoBatch(steps: AiUndoStepDTO[]): Promise<void> {
  for (const step of [...steps].reverse()) {
    // One failed step must not strand the rest — a partially-undone batch is
    // still better than none, and the user can see what remains.
    await applyUndoStep(step).catch(() => undefined);
  }
}

export const SearchApi = {
  run: (q: string) => request<SearchResultDTO>(`/search?q=${encodeURIComponent(q)}`),
};
