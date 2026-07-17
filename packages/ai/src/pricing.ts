// Per-model token pricing, expressed in micro-USD (1e-6 USD) per single token.
// Source: https://api-docs.deepseek.com/quick_start/pricing (verified 2026-07-17).
// $0.14 / 1M tokens == 0.14 micro-USD / token.

export interface ModelRate {
  /** micro-USD per prompt (input) token the provider's cache did NOT already have. */
  inputMicros: number;
  /** micro-USD per completion (output) token. */
  outputMicros: number;
  /**
   * micro-USD per prompt token served from the provider's prefix cache.
   * DeepSeek discounts these ~98%, and Atlas re-sends a near-identical context
   * block on every call, so ignoring this overstates cost badly. Defaults to
   * inputMicros when a provider has no cache pricing.
   */
  cachedInputMicros?: number;
}

export const MODEL_RATES: Record<string, ModelRate> = {
  // DeepSeek direct API ids (api.deepseek.com) — the ones Atlas uses.
  'deepseek-v4-flash': { inputMicros: 0.14, cachedInputMicros: 0.0028, outputMicros: 0.28 },
  'deepseek-v4-pro': { inputMicros: 0.435, cachedInputMicros: 0.003625, outputMicros: 0.87 },
  // Legacy DeepSeek aliases. They resolve server-side to a v4 model and are
  // scheduled for removal on 2026-07-24; kept only so historical ai_usage rows
  // written before the switch still price correctly.
  'deepseek-chat': { inputMicros: 0.14, cachedInputMicros: 0.0028, outputMicros: 0.28 },
  'deepseek-reasoner': { inputMicros: 0.55, outputMicros: 2.19 },
  // OpenRouter-style ids. Atlas no longer calls OpenRouter (chat is DeepSeek
  // direct, embeddings are local), but early ai_usage rows carry these ids.
  'deepseek/deepseek-chat': { inputMicros: 0.14, outputMicros: 0.28 },
  'deepseek/deepseek-reasoner': { inputMicros: 0.55, outputMicros: 2.19 },
};

/** Fallback rate for unknown models so cost is never silently 0. */
const FALLBACK_RATE: ModelRate = { inputMicros: 1, outputMicros: 3 };

export function rateFor(model: string): ModelRate {
  return MODEL_RATES[model] ?? FALLBACK_RATE;
}

/**
 * Estimated cost in micro-USD. `cachedPromptTokens` is the subset of
 * `promptTokens` the provider served from its prefix cache (DeepSeek's
 * `prompt_cache_hit_tokens`); those are billed at the much cheaper cached rate.
 */
export function estimateCostMicros(
  model: string,
  promptTokens: number,
  completionTokens: number,
  cachedPromptTokens = 0,
): number {
  const rate = rateFor(model);
  const cached = Math.min(Math.max(cachedPromptTokens, 0), promptTokens);
  const uncached = promptTokens - cached;
  const cachedRate = rate.cachedInputMicros ?? rate.inputMicros;
  const total =
    uncached * rate.inputMicros + cached * cachedRate + completionTokens * rate.outputMicros;
  // Rates are fractional, so the sum carries binary-float noise (e.g. 85120
  // computes as 85120.00000000001). Ceil would turn that into a phantom extra
  // micro, so snap to a sane precision before rounding up.
  return Math.ceil(Number(total.toFixed(6)));
}
