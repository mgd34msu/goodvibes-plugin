import type { ModelPricing, TokenStats, CostBreakdown } from './types.js';
export declare function loadPricing(): Record<string, ModelPricing>;
export declare function calculateCost(stats: TokenStats, pricing: ModelPricing): CostBreakdown;
/**
 * Get pricing for a specific model by ID
 * Returns a simplified pricing object with input/output/cacheRead rates
 */
export declare function getModelPricing(modelId: string): {
    input: number;
    output: number;
    cacheRead: number;
} | null;
export declare function getModelDisplayName(modelId: string): string;
