/**
 * Calculator
 *
 * Cost calculation with tiered pricing support:
 * - First 200k tokens at base rate
 * - Remaining tokens at 2x base rate
 * - Cache write and read tokens at fixed rates
 */

import type { TokenStats, ModelPricing } from './types.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Tier boundary for input tokens (200k)
 * First 200k tokens are charged at base rate
 * Remaining tokens are charged at 2x base rate
 */
export const TIER_BOUNDARY = 200_000;

// ============================================================================
// Types
// ============================================================================

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cache5mCost: number;
  cache1hCost: number;
  cacheReadCost: number;
  totalCost: number;
}

// ============================================================================
// Tiered Pricing
// ============================================================================

/**
 * Calculates input cost with tiered pricing
 * - First 200k tokens at baseRate
 * - Remaining tokens at 2x baseRate
 */
export function calculateTieredInputCost(
  tokens: number,
  baseRate: number
): number {
  if (tokens <= TIER_BOUNDARY) {
    // All tokens at base rate
    return (tokens / 1_000_000) * baseRate;
  }

  // First tier at base rate
  const tier1Cost = (TIER_BOUNDARY / 1_000_000) * baseRate;

  // Remaining tokens at 2x base rate
  const tier2Tokens = tokens - TIER_BOUNDARY;
  const tier2Cost = (tier2Tokens / 1_000_000) * (baseRate * 2);

  return tier1Cost + tier2Cost;
}

// ============================================================================
// Cost Calculation
// ============================================================================

/**
 * Calculates detailed cost breakdown for token stats
 */
export function calculateTokenCost(
  stats: TokenStats,
  pricing: ModelPricing
): CostBreakdown {
  const inputCost = calculateTieredInputCost(stats.input, pricing.inputPrice);

  const outputCost = (stats.output / 1_000_000) * pricing.outputPrice;
  const cache5mCost = (stats.cache5m / 1_000_000) * pricing.cacheWrite5Min;
  const cache1hCost = (stats.cache1h / 1_000_000) * pricing.cacheWrite1Hour;
  const cacheReadCost = (stats.cacheRead / 1_000_000) * pricing.cacheHits;

  const totalCost =
    inputCost + outputCost + cache5mCost + cache1hCost + cacheReadCost;

  return {
    inputCost,
    outputCost,
    cache5mCost,
    cache1hCost,
    cacheReadCost,
    totalCost,
  };
}

/**
 * Calculates total cost for token stats (simplified version)
 */
export function calculateTotalCost(
  stats: TokenStats,
  pricing: ModelPricing
): number {
  return calculateTokenCost(stats, pricing).totalCost;
}
