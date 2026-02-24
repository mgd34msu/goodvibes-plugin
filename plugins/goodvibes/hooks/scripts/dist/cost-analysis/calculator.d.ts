/**
 * Calculator
 *
 * Cost calculation with tiered pricing support:
 * - First 200k tokens at base rate
 * - Remaining tokens at 2x base rate
 * - Cache write and read tokens at fixed rates
 */
import type { TokenStats, ModelPricing } from './types.js';
/**
 * Tier boundary for input tokens (200k)
 * First 200k tokens are charged at base rate
 * Remaining tokens are charged at 2x base rate
 */
export declare const TIER_BOUNDARY = 200000;
export interface CostBreakdown {
    inputCost: number;
    outputCost: number;
    cache5mCost: number;
    cache1hCost: number;
    cacheReadCost: number;
    totalCost: number;
}
/**
 * Calculates input cost with tiered pricing
 * - First 200k tokens at baseRate
 * - Remaining tokens at 2x baseRate
 */
export declare function calculateTieredInputCost(tokens: number, baseRate: number): number;
/**
 * Calculates detailed cost breakdown for token stats
 */
export declare function calculateTokenCost(stats: TokenStats, pricing: ModelPricing): CostBreakdown;
/**
 * Calculates total cost for token stats (simplified version)
 */
export declare function calculateTotalCost(stats: TokenStats, pricing: ModelPricing): number;
