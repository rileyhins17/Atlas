import type { AiContextChunk, AiToolSpec } from './contracts.js';

/**
 * The contract every life-domain module implements to plug into the AI brain.
 * Adding a new domain (finance, habits, ...) means writing one of these and
 * registering it — nothing in the core or the AI layer changes.
 */
export interface DomainModule {
  /** Stable id, matches the module folder, e.g. "tasks". */
  readonly id: string;
  /**
   * Where this domain sits when the context budget runs out. LOWER goes first.
   *
   * `buildContext` fills a fixed token budget in the order it is given and
   * trims or drops whatever does not fit, so this decides which domain the
   * model stops being able to see. That used to be decided by the order NestJS
   * happened to register the modules in, which is a function of the import list
   * in `app.module.ts` — so "the AI can no longer see your calendar" was a
   * consequence of where a line sat in a file.
   *
   * Defaults to the middle, so a new domain neither starves the important ones
   * nor silently outranks them.
   */
  readonly contextPriority?: number;
  /** A compact, token-budgeted summary of this domain for the AI context. */
  aiContext(userId: string): Promise<AiContextChunk>;
  /** Tool specs the AI may call to act on this domain. */
  getToolSpecs(): AiToolSpec[];
}

/**
 * What survives a tight budget, and why.
 *
 * The ordering answers one question: if the model can only be told SOME of
 * this, what does it need to answer "what should I do now" without being
 * confidently wrong?
 *
 *   routine    the shape of the day. Without it "2pm is free" is a guess.
 *   calendar   commitments with other people in them — the costly ones to miss.
 *   tasks      what is actually due.
 *   notes      pinned facts about the user; tiny, and the highest signal per token.
 *   habits     what they are trying to keep up.
 *   goals      what the above is supposedly in service of.
 *   trackers   whatever they chose to watch daily.
 *   fitness    training volume and recent sessions.
 *   journal    how it has been going; the mood the patterns are built from.
 *   finance    the most rows and the least bearing on the next hour.
 */
export const DEFAULT_CONTEXT_PRIORITY = 50;

/** Preserve context ordering independently of framework registration order. */
export function orderDomains<T extends Pick<DomainModule, 'id' | 'contextPriority'>>(modules: readonly T[]): T[] {
  return [...modules].sort((a, b) =>
    (a.contextPriority ?? DEFAULT_CONTEXT_PRIORITY) - (b.contextPriority ?? DEFAULT_CONTEXT_PRIORITY)
      || a.id.localeCompare(b.id),
  );
}
