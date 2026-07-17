import type { ChatMessage, ChatResult } from '@atlas/connectors';
import type { AiToolSpec } from '@atlas/shared';
import { fromWireToolName, toOpenAiTools } from './tools.js';

/** Record of one tool the model asked to run, and what happened. */
export interface ToolExecution {
  name: string;
  arguments: string;
  result: string;
  ok: boolean;
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
  executeTool: (name: string, args: unknown) => Promise<unknown>;
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
      try {
        let args: unknown = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          throw new Error('Malformed tool arguments JSON');
        }
        const result = await executeTool(name, args);
        resultText = JSON.stringify(result ?? { ok: true });
      } catch (err) {
        ok = false;
        resultText = JSON.stringify({
          error: err instanceof Error ? err.message : 'Tool execution failed',
        });
      }
      toolExecutions.push({ name, arguments: call.function.arguments, result: resultText, ok });
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
