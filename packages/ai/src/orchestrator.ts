import type { ChatMessage, ChatResult } from '@atlas/connectors';
import type { AiToolSpec } from '@atlas/shared';
import { fromWireToolName, toOpenAiTools } from './tools.js';

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

export interface ToolLoopParams {
  /** Full message list to send, e.g. [system, ...history, user]. Mutated internally on a copy. */
  messages: ChatMessage[];
  /** Tool specs available this run. Pass [] to disable tool calling entirely. */
  tools: AiToolSpec[];
  /** Sends one chat request. Callers wrap this with their cost guard + provider. */
  chat: (messages: ChatMessage[], tools?: Record<string, unknown>[]) => Promise<ChatResult>;
  /** Runs a single tool call and returns a JSON-serializable result, or throws. */
  executeTool: (name: string, args: unknown) => Promise<ToolOutcome>;
  /** Caps round-trips so a model that keeps calling tools can't loop forever / rack up spend. */
  maxIterations?: number;
}

const DEFAULT_MAX_ITERATIONS = 4;

/**
 * How many tools one turn may ask for.
 *
 * Iterations were capped and calls per iteration were not, so a single turn
 * returning fifty tool calls executed all fifty — and with the iteration cap
 * that is up to 300 writes from one message. Nothing legitimate needs more than
 * a handful, and a turn that asks for more has lost the plot rather than found
 * a lot of work to do.
 */
const MAX_CALLS_PER_TURN = 8;

/**
 * A tool call reduced to what makes it the same call.
 *
 * Arguments are re-serialised with sorted keys, because the model does not emit
 * them in a stable order and `{"a":1,"b":2}` is the same request as
 * `{"b":2,"a":1}`.
 */
function callFingerprint(name: string, rawArgs: string | undefined): string {
  let normalised = rawArgs ?? '';
  try {
    const parsed: unknown = rawArgs ? JSON.parse(rawArgs) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b),
      );
      normalised = JSON.stringify(entries);
    }
  } catch {
    // Unparseable arguments fail later anyway; fingerprint the raw string.
  }
  return `${name}::${normalised}`;
}

/**
 * Provider-agnostic multi-turn tool-calling loop: send messages, and if the
 * model responds with tool calls, run them and feed results back until it
 * produces a final answer (or the iteration cap is hit). No NestJS/DB here —
 * callers inject `chat` (wrapping the cost guard + connector) and `executeTool`
 * (wrapping the app's tool router), which keeps this unit-testable in isolation.
 */
export async function runToolLoop(params: ToolLoopParams): Promise<ToolLoopResult> {
  const { chat, executeTool, tools, maxIterations = DEFAULT_MAX_ITERATIONS } = params;
  const messages = [...params.messages];
  const openAiTools = tools.length ? toOpenAiTools(tools) : undefined;
  const toolExecutions: ToolExecution[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let cachedPromptTokens = 0;

  // Identical calls already made in THIS loop, so the same write is not
  // applied twice. A model that repeats `tasks.create` with the same title on
  // four consecutive turns used to make four rows, and the user saw four rows
  // appear from one sentence with no idea why.
  const alreadyRun = new Map<string, string>();

  for (let i = 0; i < maxIterations; i++) {
    let res: ChatResult;
    try {
      res = await chat(messages, openAiTools);
    } catch (err) {
      // ONLY absorb a failure once work has actually been applied.
      //
      // Writes already made are still made, and throwing threw `toolExecutions`
      // away with them — so "What Atlas changed" never rendered and the undo
      // for a real database write was unreachable. That is worth catching.
      //
      // A failure on the FIRST call is a different thing entirely: nothing has
      // happened, and the error is the whole answer. Swallowing it turns a 424
      // "Atlas AI needs an API key" into a 200 with an apology in it — which
      // silently disarms the local capture fallback, so a brand-new account's
      // first capture writes nothing at all. Rethrow, and let the typed errors
      // reach the boundary that knows what to do with them.
      if (toolExecutions.length === 0) throw err;

      const message = err instanceof Error ? err.message : 'the model stopped responding';
      return {
        content: `I ran into a problem partway through (${message}), but the changes below were already made.`,
        usage: { promptTokens, completionTokens, cachedPromptTokens },
        toolExecutions,
      };
    }
    promptTokens += res.usage.promptTokens;
    completionTokens += res.usage.completionTokens;
    cachedPromptTokens += res.usage.cachedPromptTokens ?? 0;

    const calls = res.toolCalls ?? [];
    if (calls.length === 0) {
      return {
        content: res.content,
        usage: { promptTokens, completionTokens, cachedPromptTokens },
        toolExecutions,
      };
    }

    messages.push({ role: 'assistant', content: res.content ?? '', tool_calls: calls });

    for (const [index, call] of calls.entries()) {
      const name = fromWireToolName(call.function.name);
      let ok = true;
      let resultText: string;
      let summary: string | null = null;
      let undo: ToolUndo | null = null;

      // Over the cap: answer the call so the conversation stays well-formed —
      // a tool_call with no matching tool message is a protocol error — but
      // run nothing.
      if (index >= MAX_CALLS_PER_TURN) {
        const refusal = JSON.stringify({
          error: `Too many tools in one turn (limit ${MAX_CALLS_PER_TURN}). This one was not run. Do the most important few, then continue.`,
        });
        messages.push({
          role: 'tool',
          content: refusal,
          tool_call_id: call.id,
          name: call.function.name,
        });
        continue;
      }

      const fingerprint = callFingerprint(name, call.function.arguments);
      const seen = alreadyRun.get(fingerprint);
      if (seen !== undefined) {
        messages.push({
          role: 'tool',
          content: seen,
          tool_call_id: call.id,
          name: call.function.name,
        });
        continue;
      }

      try {
        let args: unknown = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          throw new Error('Malformed tool arguments JSON');
        }
        const outcome = await executeTool(name, args);
        summary = outcome.summary ?? null;
        undo = outcome.undo ?? null;
        resultText = JSON.stringify(outcome.result ?? { ok: true });
      } catch (err) {
        ok = false;
        resultText = JSON.stringify({
          error: err instanceof Error ? err.message : 'Tool execution failed',
        });
      }
      toolExecutions.push({
        name,
        arguments: call.function.arguments,
        result: resultText,
        ok,
        summary,
        undo,
      });
      // Only a call that actually ran is remembered, so a transient failure can
      // legitimately be retried on the next turn.
      if (ok) alreadyRun.set(fingerprint, resultText);
      // Echo back the same (wire-safe) name the provider used for this call.
      messages.push({ role: 'tool', content: resultText, tool_call_id: call.id, name: call.function.name });
    }
  }

  return {
    content: '(Reached the tool-call iteration limit without a final answer.)',
    usage: { promptTokens, completionTokens, cachedPromptTokens },
    toolExecutions,
  };
}
