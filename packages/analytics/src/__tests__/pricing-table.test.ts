/**
 * Pricing-table regression tests (v2 mandatory fix): the maintained per-model
 * table replaces v1's flat two-rate model and its stale Opus rates, and cost is
 * cache-aware (5-min write 1.25x, 1-hour write 2x, cache read 0.1x of input).
 */

import { describe, it, expect } from 'vitest';
import {
  FALLBACK_MODEL_PRICING,
  getModelRates,
  priced,
  CACHE_WRITE_5MIN_MULT,
  CACHE_WRITE_1HOUR_MULT,
  CACHE_HIT_MULT,
} from '../engine/config.js';

describe('maintained model-pricing table', () => {
  it('priced() derives cache rates from the base input rate via the standard multipliers', () => {
    const p = priced('Test', 8, 40);
    expect(p.inputPrice).toBe(8);
    expect(p.outputPrice).toBe(40);
    expect(p.cacheWrite5Min).toBeCloseTo(8 * CACHE_WRITE_5MIN_MULT, 10); // 10.0
    expect(p.cacheWrite1Hour).toBeCloseTo(8 * CACHE_WRITE_1HOUR_MULT, 10); // 16.0
    expect(p.cacheHits).toBeCloseTo(8 * CACHE_HIT_MULT, 10); // 0.8
  });

  it('multipliers match Anthropic standard cache economics', () => {
    expect(CACHE_WRITE_5MIN_MULT).toBe(1.25);
    expect(CACHE_WRITE_1HOUR_MULT).toBe(2);
    expect(CACHE_HIT_MULT).toBe(0.1);
  });

  it('ships current models with correct base rates ($/MTok)', () => {
    expect(FALLBACK_MODEL_PRICING['claude-opus-4-8']).toMatchObject({ inputPrice: 5, outputPrice: 25 });
    expect(FALLBACK_MODEL_PRICING['claude-sonnet-5']).toMatchObject({ inputPrice: 3, outputPrice: 15 });
    expect(FALLBACK_MODEL_PRICING['claude-haiku-4-5']).toMatchObject({ inputPrice: 1, outputPrice: 5 });
    expect(FALLBACK_MODEL_PRICING['claude-fable-5']).toMatchObject({ inputPrice: 10, outputPrice: 50 });
  });

  it('every table entry is cache-aware and internally ordered', () => {
    for (const [id, r] of Object.entries(FALLBACK_MODEL_PRICING)) {
      // read < input < 5-min write < 1-hour write
      expect(r.cacheHits, id).toBeLessThan(r.inputPrice);
      expect(r.inputPrice, id).toBeLessThanOrEqual(r.cacheWrite5Min);
      expect(r.cacheWrite5Min, id).toBeLessThan(r.cacheWrite1Hour);
      // derived from the base rate
      expect(r.cacheHits, id).toBeCloseTo(r.inputPrice * CACHE_HIT_MULT, 10);
      expect(r.cacheWrite5Min, id).toBeCloseTo(r.inputPrice * CACHE_WRITE_5MIN_MULT, 10);
      expect(r.cacheWrite1Hour, id).toBeCloseTo(r.inputPrice * CACHE_WRITE_1HOUR_MULT, 10);
    }
  });

  it('no longer carries the stale $15/$75 Opus rate from v1', () => {
    for (const r of Object.values(FALLBACK_MODEL_PRICING)) {
      expect(r.inputPrice).toBeLessThanOrEqual(10);
    }
  });

  it('getModelRates resolves an exact model id', () => {
    const r = getModelRates('claude-opus-4-8', FALLBACK_MODEL_PRICING);
    expect(r.inputPrice).toBe(5);
    expect(r.cacheHits).toBeCloseTo(0.5, 10);
  });

  it('getModelRates resolves a dated/suffixed id via prefix match', () => {
    // Transcript model ids are often longer than the pricing key.
    const r = getModelRates('claude-opus-4-8-20260601', FALLBACK_MODEL_PRICING);
    expect(r.inputPrice).toBe(5);
    expect(r.outputPrice).toBe(25);
  });

  it('getModelRates falls back for an unknown model without throwing', () => {
    const r = getModelRates('some-unknown-model', FALLBACK_MODEL_PRICING);
    expect(r.inputPrice).toBeGreaterThan(0);
    expect(r.outputPrice).toBeGreaterThan(0);
  });
});
