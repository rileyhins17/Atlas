// Per-model token pricing, expressed in micro-USD (1e-6 USD) per single token.
// Source: OpenRouter/DeepSeek public pricing (approximate; verify periodically).
// $0.14 / 1M tokens == 0.14 micro-USD / token.

export interface ModelRate {
  /** micro-USD per prompt (input) token. */
  inputMicros: number;
  /** micro-USD per completion (output) token. */
  outputMicros: number;
}

export const MODEL_RATES: Record<string, ModelRate> = {
  'deepseek/deepseek-chat': { inputMicros: 0.14, outputMicros: 0.28 },
  'deepseek/deepseek-reasoner': { inputMicros: 0.55, outputMicros: 2.19 },
};

/** Fallback rate for unknown models so cost is never silently 0. */
const FALLBACK_RATE: ModelRate = { inputMicros: 1, outputMicros: 3 };

export function rateFor(model: string): ModelRate {
  return MODEL_RATES[model] ?? FALLBACK_RATE;
}

export function estimateCostMicros(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const rate = rateFor(model);
  return Math.ceil(promptTokens * rate.inputMicros + completionTokens * rate.outputMicros);
}
