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

  for (let i = 0; i < maxIterations; i++) {
    const res = await chat(messages, openAiTools);
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

    for (const call of calls) {
      const name = fromWireToolName(call.function.name);
      let ok = true;
      let resultText: string;
      let summary: string | null = null;
      let undo: ToolUndo | null = null;
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
