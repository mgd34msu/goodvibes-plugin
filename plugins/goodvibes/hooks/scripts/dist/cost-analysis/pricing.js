import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { calculateTokenCost as calcTokenCost } from './calculator.js';
import { toDisplayName as getDisplayName } from './model-id-translator.js';
const CACHE_FILE = path.join(os.homedir(), '.claude', 'model-pricing.json');
const FALLBACK_PRICING = {
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
export function loadPricing() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const content = fs.readFileSync(CACHE_FILE, 'utf8');
            const cache = JSON.parse(content);
            // NO TTL CHECK - session-start's pricing-fetcher handles refresh
            return cache.models;
        }
    }
    catch (error) { }
    return FALLBACK_PRICING;
}
export function calculateCost(stats, pricing) {
    return calcTokenCost(stats, pricing);
}
/**
 * Get pricing for a specific model by ID
 * Returns a simplified pricing object with input/output/cacheRead rates
 */
export function getModelPricing(modelId) {
    const pricingCache = loadPricing();
    const modelPricing = pricingCache[modelId] || pricingCache['claude-opus-4.5']; // fallback to opus
    if (!modelPricing)
        return null;
    return {
        input: modelPricing.inputPrice,
        output: modelPricing.outputPrice,
        cacheRead: modelPricing.cacheHits
    };
}
export function getModelDisplayName(modelId) {
    return getDisplayName(modelId);
}
