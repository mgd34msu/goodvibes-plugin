import { calculateTokenCost } from './calculator.js';
import { toCacheKey, toDisplayName } from './model-id-translator.js';
export function createEmptyStats() {
    return { input: 0, output: 0, cache5m: 0, cache1h: 0, cacheRead: 0, calls: 0 };
}
export function addStats(statsObj, key, model, usage) {
    if (!statsObj[key])
        statsObj[key] = {};
    if (!statsObj[key][model])
        statsObj[key][model] = createEmptyStats();
    const stats = statsObj[key][model];
    stats.input += usage.input_tokens || 0;
    stats.output += usage.output_tokens || 0;
    stats.cacheRead += usage.cache_read_input_tokens || 0;
    if (usage.cache_creation) {
        stats.cache5m += usage.cache_creation.ephemeral_5m || 0;
        stats.cache1h += usage.cache_creation.ephemeral_1h || 0;
    }
    stats.calls += 1;
}
export function aggregateByProject(projects, pricing) {
    const results = [];
    for (const project of projects) {
        const modelStatsMap = new Map();
        for (const entry of project.entries) {
            if (!modelStatsMap.has(entry.model))
                modelStatsMap.set(entry.model, createEmptyStats());
            const stats = modelStatsMap.get(entry.model);
            stats.input += entry.usage.input_tokens || 0;
            stats.output += entry.usage.output_tokens || 0;
            stats.cacheRead += entry.usage.cache_read_input_tokens || 0;
            if (entry.usage.cache_creation) {
                stats.cache5m += entry.usage.cache_creation.ephemeral_5m || 0;
                stats.cache1h += entry.usage.cache_creation.ephemeral_1h || 0;
            }
            stats.calls += 1;
        }
        const models = [];
        let projectTokens = createEmptyStats();
        let projectCost = { inputCost: 0, outputCost: 0, cache5mCost: 0, cache1hCost: 0, cacheReadCost: 0, totalCost: 0 };
        for (const [model, tokens] of modelStatsMap.entries()) {
            const cacheKey = toCacheKey(model) || model;
            const modelPricing = pricing[cacheKey] || pricing[model];
            if (!modelPricing)
                continue;
            const cost = calculateTokenCost(tokens, modelPricing);
            const displayName = toDisplayName(model);
            models.push({ model, displayName, tokens, cost });
            projectTokens.input += tokens.input;
            projectTokens.output += tokens.output;
            projectTokens.cache5m += tokens.cache5m;
            projectTokens.cache1h += tokens.cache1h;
            projectTokens.cacheRead += tokens.cacheRead;
            projectTokens.calls += tokens.calls;
            projectCost.inputCost += cost.inputCost;
            projectCost.outputCost += cost.outputCost;
            projectCost.cache5mCost += cost.cache5mCost;
            projectCost.cache1hCost += cost.cache1hCost;
            projectCost.cacheReadCost += cost.cacheReadCost;
            projectCost.totalCost += cost.totalCost;
        }
        results.push({ project: project.projectName, tokens: projectTokens, cost: projectCost, models });
    }
    results.sort((a, b) => b.cost.totalCost - a.cost.totalCost);
    return results;
}
export function aggregateByModel(projects, pricing) {
    const modelStatsMap = new Map();
    for (const project of projects) {
        for (const entry of project.entries) {
            if (!modelStatsMap.has(entry.model))
                modelStatsMap.set(entry.model, createEmptyStats());
            const stats = modelStatsMap.get(entry.model);
            stats.input += entry.usage.input_tokens || 0;
            stats.output += entry.usage.output_tokens || 0;
            stats.cacheRead += entry.usage.cache_read_input_tokens || 0;
            if (entry.usage.cache_creation) {
                stats.cache5m += entry.usage.cache_creation.ephemeral_5m || 0;
                stats.cache1h += entry.usage.cache_creation.ephemeral_1h || 0;
            }
            stats.calls += 1;
        }
    }
    const results = [];
    for (const [model, tokens] of modelStatsMap.entries()) {
        const cacheKey = toCacheKey(model) || model;
        const modelPricing = pricing[cacheKey] || pricing[model];
        if (!modelPricing)
            continue;
        const cost = calculateTokenCost(tokens, modelPricing);
        const displayName = toDisplayName(model);
        results.push({ model, displayName, tokens, cost });
    }
    results.sort((a, b) => b.cost.totalCost - a.cost.totalCost);
    return results;
}
export function aggregateByTool(projects, pricing) {
    const toolStatsMap = new Map();
    for (const project of projects) {
        for (const entry of project.entries) {
            const toolCount = entry.tools.length;
            const splitUsage = {
                input_tokens: Math.round((entry.usage.input_tokens || 0) / toolCount),
                output_tokens: Math.round((entry.usage.output_tokens || 0) / toolCount),
                cache_read_input_tokens: Math.round((entry.usage.cache_read_input_tokens || 0) / toolCount),
                cache_creation: entry.usage.cache_creation ? {
                    ephemeral_5m: Math.round((entry.usage.cache_creation.ephemeral_5m || 0) / toolCount),
                    ephemeral_1h: Math.round((entry.usage.cache_creation.ephemeral_1h || 0) / toolCount)
                } : undefined
            };
            for (const tool of entry.tools) {
                if (!toolStatsMap.has(tool))
                    toolStatsMap.set(tool, new Map());
                const modelMap = toolStatsMap.get(tool);
                if (!modelMap.has(entry.model))
                    modelMap.set(entry.model, createEmptyStats());
                const stats = modelMap.get(entry.model);
                stats.input += splitUsage.input_tokens || 0;
                stats.output += splitUsage.output_tokens || 0;
                stats.cacheRead += splitUsage.cache_read_input_tokens || 0;
                if (splitUsage.cache_creation) {
                    stats.cache5m += splitUsage.cache_creation.ephemeral_5m || 0;
                    stats.cache1h += splitUsage.cache_creation.ephemeral_1h || 0;
                }
                stats.calls += 1 / toolCount;
            }
        }
    }
    const results = [];
    for (const [tool, modelMap] of toolStatsMap.entries()) {
        let toolTokens = createEmptyStats();
        let toolCost = { inputCost: 0, outputCost: 0, cache5mCost: 0, cache1hCost: 0, cacheReadCost: 0, totalCost: 0 };
        for (const [model, tokens] of modelMap.entries()) {
            const cacheKey = toCacheKey(model) || model;
            const modelPricing = pricing[cacheKey] || pricing[model];
            if (!modelPricing)
                continue;
            const cost = calculateTokenCost(tokens, modelPricing);
            toolTokens.input += tokens.input;
            toolTokens.output += tokens.output;
            toolTokens.cache5m += tokens.cache5m;
            toolTokens.cache1h += tokens.cache1h;
            toolTokens.cacheRead += tokens.cacheRead;
            toolTokens.calls += tokens.calls;
            toolCost.inputCost += cost.inputCost;
            toolCost.outputCost += cost.outputCost;
            toolCost.cache5mCost += cost.cache5mCost;
            toolCost.cache1hCost += cost.cache1hCost;
            toolCost.cacheReadCost += cost.cacheReadCost;
            toolCost.totalCost += cost.totalCost;
        }
        results.push({ tool, usageCount: Math.round(toolTokens.calls), tokens: toolTokens, cost: toolCost });
    }
    results.sort((a, b) => b.cost.totalCost - a.cost.totalCost);
    return results;
}
