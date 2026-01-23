import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PricingCache, ModelPricing } from './types.js';

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
const CACHE_PATH = join(PLUGIN_ROOT, '.cache', 'model-pricing.json');

// Fallback pricing if cache doesn't exist (per million tokens)
const FALLBACK_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4.5': {
    name: 'Claude Opus 4.5',
    inputPrice: 15.00,
    outputPrice: 75.00,
    cacheWrite5Min: 18.75,
    cacheWrite1Hour: 30.00,
    cacheHits: 1.50,
  },
  'claude-sonnet-4.5': {
    name: 'Claude Sonnet 4.5',
    inputPrice: 3.00,
    outputPrice: 15.00,
    cacheWrite5Min: 3.75,
    cacheWrite1Hour: 6.00,
    cacheHits: 0.30,
  },
  'claude-haiku-4.5': {
    name: 'Claude Haiku 4.5',
    inputPrice: 1.00,
    outputPrice: 5.00,
    cacheWrite5Min: 1.25,
    cacheWrite1Hour: 2.00,
    cacheHits: 0.10,
  },
};

export async function loadPricingCache(): Promise<PricingCache> {
  if (!existsSync(CACHE_PATH)) {
    console.warn('Pricing cache not found, using fallback pricing');
    return { fetchedAt: new Date().toISOString(), models: FALLBACK_PRICING };
  }
  try {
    const content = await readFile(CACHE_PATH, 'utf-8');
    const cache = JSON.parse(content) as PricingCache;
    if (!cache.models || typeof cache.models !== 'object') {
      throw new Error('Invalid cache structure');
    }
    return cache;
  } catch (error) {
    console.warn('Failed to load pricing cache, using fallback:', error);
    return { fetchedAt: new Date().toISOString(), models: FALLBACK_PRICING };
  }
}

export function getPricingForModel(cache: PricingCache, cacheKey: string): ModelPricing | null {
  return cache.models[cacheKey] ?? null;
}

export { CACHE_PATH, FALLBACK_PRICING };
