/**
 * Pricing Fetcher
 *
 * Fetches and caches Claude model pricing from the official pricing page.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { debug, logError } from '../shared/index.js';
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
const CONFIG_PATH = join(PLUGIN_ROOT, '.goodvibes', 'config', 'pricing.json');
const CACHE_PATH = join(PLUGIN_ROOT, '.cache', 'model-pricing.json');
async function loadConfig() {
    try {
        const content = await readFile(CONFIG_PATH, 'utf-8');
        return JSON.parse(content);
    }
    catch (error) {
        debug('Failed to load pricing config, using defaults', { error });
        return {
            pricingUrl: 'https://platform.claude.com/docs/en/about-claude/pricing.md',
            cacheTtlHours: 24,
        };
    }
}
async function isCacheStale(ttlHours) {
    try {
        if (!existsSync(CACHE_PATH)) {
            debug('Cache file does not exist');
            return true;
        }
        const content = await readFile(CACHE_PATH, 'utf-8');
        const cache = JSON.parse(content);
        const fetchedAt = new Date(cache.fetchedAt);
        const now = new Date();
        const ageHours = (now.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60);
        const isStale = ageHours >= ttlHours;
        debug('Cache age check', { ageHours, ttlHours, isStale });
        return isStale;
    }
    catch (error) {
        logError('Cache staleness check failed', error);
        return true;
    }
}
async function fetchPricingMarkdown(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.text();
    }
    finally {
        clearTimeout(timeout);
    }
}
function parsePrice(priceStr) {
    const match = priceStr.match(/\$(\d+(?:\.\d+)?)\s*\/\s*MTok/i);
    if (!match) {
        throw new Error(`Invalid price format: ${priceStr}`);
    }
    return parseFloat(match[1]);
}
function parseModelName(name) {
    // Strip parenthetical notes before matching (e.g., "([deprecated](/docs/...))")
    const cleanName = name.replace(/\s*\(.*\)/, '').trim();
    const match = cleanName.match(/Claude\s+(Opus|Sonnet|Haiku)\s+([\d.]+)/i);
    if (!match) {
        return null;
    }
    const family = match[1].toLowerCase();
    const version = parseFloat(match[2]);
    return { family, version };
}
function parsePricingTable(markdown) {
    const models = [];
    const pricingMatch = markdown.match(/##\s*Model pricing[\s\S]*?(?=##|$)/i);
    if (!pricingMatch) {
        throw new Error('Could not find "Model pricing" section');
    }
    const pricingSection = pricingMatch[0];
    const lines = pricingSection.split('\n');
    let inTable = false;
    for (const line of lines) {
        if (line.includes('| Model |') || line.includes('|---')) {
            inTable = true;
            continue;
        }
        if (!inTable || !line.trim().startsWith('|')) {
            continue;
        }
        const cells = line.split('|').map(c => c.trim()).filter(c => c);
        if (cells.length < 6) {
            continue;
        }
        const [modelName, baseInput, cache5m, cache1h, cacheHits, output] = cells;
        const parsed = parseModelName(modelName);
        if (!parsed) {
            debug('Skipping unrecognized model', { modelName });
            continue;
        }
        try {
            models.push({
                family: parsed.family,
                version: parsed.version,
                name: modelName,
                inputPrice: parsePrice(baseInput),
                outputPrice: parsePrice(output),
                cacheWrite5Min: parsePrice(cache5m),
                cacheWrite1Hour: parsePrice(cache1h),
                cacheHits: parsePrice(cacheHits),
            });
        }
        catch (error) {
            logError(`Failed to parse row for ${modelName}`, error);
        }
    }
    return models;
}
function filterLatestVersions(models) {
    const latestByFamily = new Map();
    for (const model of models) {
        const existing = latestByFamily.get(model.family);
        if (!existing || model.version > existing.version) {
            latestByFamily.set(model.family, model);
        }
    }
    return Array.from(latestByFamily.values());
}
function toCacheFormat(models) {
    const cacheModels = {};
    for (const model of models) {
        const key = `claude-${model.family}-${model.version}`;
        cacheModels[key] = {
            name: model.name,
            inputPrice: model.inputPrice,
            outputPrice: model.outputPrice,
            cacheWrite5Min: model.cacheWrite5Min,
            cacheWrite1Hour: model.cacheWrite1Hour,
            cacheHits: model.cacheHits,
        };
    }
    return {
        fetchedAt: new Date().toISOString(),
        models: cacheModels,
    };
}
async function saveCache(cache) {
    const dir = dirname(CACHE_PATH);
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }
    await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
    debug('Pricing cache saved', { path: CACHE_PATH, modelCount: Object.keys(cache.models).length });
}
export async function fetchPricingIfStale() {
    try {
        const config = await loadConfig();
        const isStale = await isCacheStale(config.cacheTtlHours);
        if (!isStale) {
            debug('Pricing cache is fresh, skipping fetch');
            return;
        }
        debug('Fetching pricing data', { url: config.pricingUrl });
        const markdown = await fetchPricingMarkdown(config.pricingUrl);
        debug('Parsing pricing table');
        const allModels = parsePricingTable(markdown);
        debug('Parsed models', { count: allModels.length });
        const latestModels = filterLatestVersions(allModels);
        debug('Filtered to latest versions', { count: latestModels.length });
        const cache = toCacheFormat(latestModels);
        await saveCache(cache);
        debug('Pricing fetch completed successfully');
    }
    catch (error) {
        logError('Pricing fetch failed (non-blocking)', error);
    }
}
