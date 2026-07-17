import { describe, expect, it } from 'vitest';
import { estimateCostMicros, MODEL_RATES, rateFor } from '../src/pricing.js';

describe('rateFor', () => {
  it('returns the known rate for deepseek-chat', () => {
    expect(rateFor('deepseek/deepseek-chat')).toEqual(MODEL_RATES['deepseek/deepseek-chat']);
  });

  it('knows the DeepSeek direct v4 model ids Atlas actually calls', () => {
    // The API resolves aliases server-side and echoes the concrete id back, and
    // that echoed id is what gets priced — so these must be present or every
    // row silently lands on the fallback rate.
    expect(rateFor('deepseek-v4-flash')).toBe(MODEL_RATES['deepseek-v4-flash']);
    expect(rateFor('deepseek-v4-pro')).toBe(MODEL_RATES['deepseek-v4-pro']);
    expect(rateFor('deepseek-v4-flash')).not.toEqual(rateFor('totally-unknown-model'));
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

  it('prices deepseek-v4-flash at its published rates', () => {
    // 0.14 in / 0.28 out: 1_000_000 * 0.14 = 140_000 micro-USD ($0.14).
    expect(estimateCostMicros('deepseek-v4-flash', 1_000_000, 0)).toBe(140_000);
    expect(estimateCostMicros('deepseek-v4-flash', 0, 1_000_000)).toBe(280_000);
  });

  it('bills cache-hit prompt tokens at the much cheaper cached rate', () => {
    // All 1M prompt tokens cached: 1_000_000 * 0.0028 = 2_800 micro-USD, vs
    // 140_000 uncached — a ~50x difference, which is why this is threaded through.
    expect(estimateCostMicros('deepseek-v4-flash', 1_000_000, 0, 1_000_000)).toBe(2_800);
  });

  it('splits the prompt into cached and uncached portions', () => {
    // 600k uncached * 0.14 = 84_000; 400k cached * 0.0028 = 1_120. Total 85_120.
    expect(estimateCostMicros('deepseek-v4-flash', 1_000_000, 0, 400_000)).toBe(85_120);
  });

  it('never lets cached tokens exceed the prompt total or go negative', () => {
    // A provider over-reporting cache hits must not produce a cheaper-than-cached
    // or negative bill.
    expect(estimateCostMicros('deepseek-v4-flash', 1_000, 0, 9_999)).toBe(
      estimateCostMicros('deepseek-v4-flash', 1_000, 0, 1_000),
    );
    expect(estimateCostMicros('deepseek-v4-flash', 1_000, 0, -50)).toBe(
      estimateCostMicros('deepseek-v4-flash', 1_000, 0, 0),
    );
  });

  it('falls back to the uncached rate for models with no cache pricing', () => {
    // deepseek-reasoner has no cachedInputMicros; cached tokens bill as normal input.
    expect(estimateCostMicros('deepseek-reasoner', 1_000, 0, 1_000)).toBe(
      estimateCostMicros('deepseek-reasoner', 1_000, 0, 0),
    );
  });
});
