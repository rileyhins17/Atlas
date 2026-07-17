import type {
  AiQuestionDTO,
  ChatMessageDTO,
  ChatResponseDTO,
  CreateHabitInput,
  CreateJournalInput,
  CreateNoteInput,
  CreateTaskInput,
  EventDTO,
  HabitDTO,
  InsightDTO,
  JournalDTO,
  NoteDTO,
  TaskDTO,
  UserDTO,
} from '@atlas/shared';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
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
  return (await res.json()) as T;
}

export const AuthApi = {
  me: () => request<UserDTO>('/auth/me'),
  register: (input: { email: string; password: string }) =>
    request<UserDTO>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  login: (input: { email: string; password: string }) =>
    request<UserDTO>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
};

export const TasksApi = {
  list: () => request<TaskDTO[]>('/tasks'),
  create: (input: Partial<CreateTaskInput> & { title: string }) =>
    request<TaskDTO>('/tasks', { method: 'POST', body: JSON.stringify(input) }),
  complete: (id: string) => request<TaskDTO>(`/tasks/${id}/complete`, { method: 'POST' }),
  remove: (id: string) => request<{ ok: true }>(`/tasks/${id}`, { method: 'DELETE' }),
};

export const HabitsApi = {
  list: () => request<HabitDTO[]>('/habits'),
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
};

export const EventsApi = {
  list: () => request<EventDTO[]>('/events'),
  create: (input: NewEvent) =>
    request<EventDTO>('/events', { method: 'POST', body: JSON.stringify(input) }),
  remove: (id: string) => request<{ ok: true }>(`/events/${id}`, { method: 'DELETE' }),
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
  embeddingsConfigured: boolean;
  domains: string[];
}

export const AiApi = {
  status: () => request<AiStatus>('/ai/status'),
  connectDeepSeek: (apiKey: string) =>
    request<{ ok: true }>('/ai/connect/deepseek', { method: 'POST', body: JSON.stringify({ apiKey }) }),
  connectOpenRouter: (apiKey: string) =>
    request<{ ok: true }>('/ai/connect/openrouter', { method: 'POST', body: JSON.stringify({ apiKey }) }),
  chat: (message: string, history: ChatMessageDTO[]) =>
    request<ChatResponseDTO>('/ai/chat', { method: 'POST', body: JSON.stringify({ message, history }) }),
  brainDump: (text: string) =>
    request<ChatResponseDTO>('/ai/brain-dump', { method: 'POST', body: JSON.stringify({ text }) }),
  dailyBrief: () => request<InsightDTO>('/ai/daily-brief', { method: 'POST', body: '{}' }),
  insights: () => request<InsightDTO[]>('/ai/insights'),
  backfillEmbeddings: () =>
    request<{ processed: number; failed: number }>('/ai/embeddings/backfill', { method: 'POST', body: '{}' }),
};
