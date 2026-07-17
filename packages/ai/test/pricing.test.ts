import { describe, expect, it } from 'vitest';
import { estimateCostMicros, MODEL_RATES, rateFor } from '../src/pricing.js';

describe('rateFor', () => {
  it('returns the known rate for deepseek-chat', () => {
    expect(rateFor('deepseek/deepseek-chat')).toEqual(MODEL_RATES['deepseek/deepseek-chat']);
  });

  it('returns the known rate for deepseek-reasoner', () => {
    expect(rateFor('deepseek/deepseek-reasoner')).toEqual(
      MODEL_RATES['deepseek/deepseek-reasoner'],
    );
  });

  it('falls back to a non-zero rate for unknown models', () => {
    const rate = rateFor('some/unknown-model');
    expect(rate.inputMicros).toBeGreaterThan(0);
    expect(rate.outputMicros).toBeGreaterThan(0);
  });
});

describe('estimateCostMicros', () => {
  it('computes cost from known model rates', () => {
    // deepseek-chat: 0.14 in / 0.28 out micro-USD per token.
    // 1000 * 0.14 + 500 * 0.28 = 140 + 140 = 280.
    expect(estimateCostMicros('deepseek/deepseek-chat', 1000, 500)).toBe(280);
  });

  it('rounds up to the next whole micro-USD', () => {
    // 1 * 0.14 + 1 * 0.28 = 0.42 -> ceil -> 1.
    expect(estimateCostMicros('deepseek/deepseek-chat', 1, 1)).toBe(1);
  });

  it('uses the fallback rate for unknown models so cost is never 0', () => {
    expect(estimateCostMicros('some/unknown-model', 100, 100)).toBeGreaterThan(0);
  });

  it('is zero when no tokens were used', () => {
    expect(estimateCostMicros('deepseek/deepseek-chat', 0, 0)).toBe(0);
  });
});
