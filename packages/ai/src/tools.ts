import type { AiToolSpec } from '@atlas/shared';

// Atlas's tool names are dotted ("tasks.create") for readability, but several
// providers (DeepSeek included) reject function names outside
// ^[a-zA-Z0-9_-]+$. Map to/from a wire-safe form at the provider boundary only
// — everything else in the app (ToolRouterService, getToolSpecs()) keeps
// using dotted names.
export function toWireToolName(name: string): string {
  return name.replace(/\./g, '__');
}

export function fromWireToolName(wireName: string): string {
  return wireName.replace(/__/g, '.');
}

/** Converts Atlas's provider-agnostic tool specs to the OpenAI/OpenRouter function-calling shape. */
export function toOpenAiTools(specs: AiToolSpec[]): Record<string, unknown>[] {
  return specs.map((spec) => ({
    type: 'function',
    function: {
      name: toWireToolName(spec.name),
      description: spec.description,
      parameters: spec.parameters,
    },
  }));
}
