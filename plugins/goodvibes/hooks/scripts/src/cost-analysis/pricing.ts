import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ModelPricing, PricingCache, TokenStats, CostBreakdown } from './types.js';
import { calculateTokenCost as calcTokenCost } from './calculator.js';
import { toDisplayName as getDisplayName } from './model-id-translator.js';

const CACHE_FILE = path.join(os.homedir(), '.claude', 'model-pricing.json');
const FALLBACK_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4.5': {
    name: 'Claude Opus 4.5',
    inputPrice: 5.0,
    outputPrice: 25.0,
    cacheWrite5Min: 6.25,
    cacheWrite1Hour: 10.0,
    cacheHits: 0.5
  },
  'claude-sonnet-4.5': {
    name: 'Claude Sonnet 4.5',
    inputPrice: 1.5,
    outputPrice: 7.5,
    cacheWrite5Min: 1.875,
    cacheWrite1Hour: 3.0,
    cacheHits: 0.15
  },
  'claude-haiku-4.5': {
    name: 'Claude Haiku 4.5',
    inputPrice: 1.0,
    outputPrice: 5.0,
    cacheWrite5Min: 1.25,
    cacheWrite1Hour: 2.0,
    cacheHits: 0.1
  }
};

export function loadPricing(): Record<string, ModelPricing> {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, 'utf8');
      const cache: PricingCache = JSON.parse(content);
      const age = Date.now() - new Date(cache.fetchedAt).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        return cache.models;
      }
    }
  } catch (error) {}
  return FALLBACK_PRICING;
}

export function calculateCost(stats: TokenStats, pricing: ModelPricing): CostBreakdown {
  return calcTokenCost(stats, pricing);
}

export function getModelDisplayName(modelId: string): string {
  return getDisplayName(modelId);
}
