/** Record of one tool the model asked to run, and what happened. */
export interface ToolExecution {
  name: string;
  arguments: string;
  result: string;
  ok: boolean;
  /** Plain-language description of the change, for the "Atlas changed" strip. */
  summary: string | null;
  /** How to reverse it. Server-built; null when the action is not reversible. */
  undo: ToolUndo | null;
}

/**
 * The inverse of one write, as a call against Atlas's own REST API.
 *
 * Built on the server from the row that was actually written — the model never
 * supplies a path or a body, so replaying one can only reach data the caller's
 * session could already reach.
 */
export interface ToolUndo {
  label: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body: Record<string, unknown> | null;
}

/**
 * What a tool hands back. `result` is what the model sees; the rest is for the
 * user interface and is never shown to the model.
 */
export interface ToolOutcome {
  result: unknown;
  summary?: string | null;
  undo?: ToolUndo | null;
}

export interface ToolLoopResult {
  content: string;
  usage: { promptTokens: number; completionTokens: number; cachedPromptTokens: number };
  toolExecutions: ToolExecution[];
}
