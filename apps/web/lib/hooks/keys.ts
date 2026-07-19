/**
 * Every query key in one place so invalidation is never a stringly-typed
 * guess. Key shape: [domain, ...subpath].
 */
export const qk = {
  me: ['auth', 'me'] as const,
  tasks: ['tasks'] as const,
  habits: ['habits'] as const,
  journal: ['journal'] as const,
  notes: ['notes'] as const,
  events: ['events'] as const,
  aiQuestions: ['ai', 'questions'] as const,
  aiStatus: ['ai', 'status'] as const,
  insights: ['ai', 'insights'] as const,
  googleStatus: ['google', 'status'] as const,
  habitHistory: (days: number) => ['habits', 'history', days] as const,
  timeline: (source?: string) => ['timeline', source ?? 'all'] as const,
};
