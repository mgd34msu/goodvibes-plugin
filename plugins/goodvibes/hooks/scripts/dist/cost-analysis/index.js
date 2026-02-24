import { loadPricing } from './pricing.js';
import { parseTimeFilter, parseAllProjects } from './parser.js';
import { aggregateByProject, aggregateByModel, aggregateByTool } from './aggregator.js';
import { analyzeSubagents } from './subagent-analyzer.js';
import { analyzeBatches } from './batch-analyzer.js';
import { generateComparison } from './tool-comparison.js';
import { summarizeNativeVsMcp } from './native-vs-mcp.js';
export * from './types.js';
export { formatOutput } from './formatter.js';
export { loadPricing, calculateCost, getModelDisplayName } from './pricing.js';
export { getProjectName } from './parser.js';
export { analyzeSubagents } from './subagent-analyzer.js';
export { analyzeBatches } from './batch-analyzer.js';
export { generateComparison } from './tool-comparison.js';
export { summarizeNativeVsMcp } from './native-vs-mcp.js';
export async function analyzeCosts(options = {}) {
    const pricing = loadPricing();
    const timeRange = parseTimeFilter(options.timeFilter);
    const parsedProjects = parseAllProjects({
        timeFilter: options.timeFilter,
        projectFilter: options.projectFilter,
        modelFilter: options.modelFilter
    });
    const projects = aggregateByProject(parsedProjects, pricing);
    const models = aggregateByModel(parsedProjects, pricing);
    const includeTools = options.includeTools !== false;
    const topToolsLimit = options.topToolsLimit || 40;
    let tools;
    let mcpToolsSummary;
    if (includeTools) {
        const allTools = aggregateByTool(parsedProjects, pricing);
        tools = allTools.slice(0, topToolsLimit);
        const mcpTools = allTools.filter(t => t.tool.startsWith('mcp:'));
        if (mcpTools.length > 0) {
            const mcpTotalCalls = mcpTools.reduce((sum, t) => sum + t.usageCount, 0);
            const mcpTokens = {
                input: mcpTools.reduce((sum, t) => sum + t.tokens.input, 0),
                output: mcpTools.reduce((sum, t) => sum + t.tokens.output, 0),
                cache5m: mcpTools.reduce((sum, t) => sum + t.tokens.cache5m, 0),
                cache1h: mcpTools.reduce((sum, t) => sum + t.tokens.cache1h, 0),
                cacheRead: mcpTools.reduce((sum, t) => sum + t.tokens.cacheRead, 0),
                calls: mcpTotalCalls
            };
            const mcpCost = {
                inputCost: mcpTools.reduce((sum, t) => sum + t.cost.inputCost, 0),
                outputCost: mcpTools.reduce((sum, t) => sum + t.cost.outputCost, 0),
                cache5mCost: mcpTools.reduce((sum, t) => sum + t.cost.cache5mCost, 0),
                cache1hCost: mcpTools.reduce((sum, t) => sum + t.cost.cache1hCost, 0),
                cacheReadCost: mcpTools.reduce((sum, t) => sum + t.cost.cacheReadCost, 0),
                totalCost: mcpTools.reduce((sum, t) => sum + t.cost.totalCost, 0)
            };
            mcpToolsSummary = {
                totalTools: mcpTools.length,
                totalCalls: mcpTotalCalls,
                tokens: mcpTokens,
                cost: mcpCost,
                topTools: mcpTools
            };
        }
    }
    const grandTotal = {
        tokens: {
            input: models.reduce((sum, m) => sum + m.tokens.input, 0),
            output: models.reduce((sum, m) => sum + m.tokens.output, 0),
            cache5m: models.reduce((sum, m) => sum + m.tokens.cache5m, 0),
            cache1h: models.reduce((sum, m) => sum + m.tokens.cache1h, 0),
            cacheRead: models.reduce((sum, m) => sum + m.tokens.cacheRead, 0),
            calls: models.reduce((sum, m) => sum + m.tokens.calls, 0)
        },
        cost: {
            inputCost: models.reduce((sum, m) => sum + m.cost.inputCost, 0),
            outputCost: models.reduce((sum, m) => sum + m.cost.outputCost, 0),
            cache5mCost: models.reduce((sum, m) => sum + m.cost.cache5mCost, 0),
            cache1hCost: models.reduce((sum, m) => sum + m.cost.cache1hCost, 0),
            cacheReadCost: models.reduce((sum, m) => sum + m.cost.cacheReadCost, 0),
            totalCost: models.reduce((sum, m) => sum + m.cost.totalCost, 0)
        }
    };
    // Extended analysis
    let subagents;
    let batches;
    let nativeVsMcp;
    let comparisons;
    if (options.includeSubagents) {
        subagents = await analyzeSubagents(timeRange);
    }
    if (options.includeBatches) {
        batches = await analyzeBatches(timeRange);
    }
    if (options.includeNativeVsMcp || options.includeComparisons) {
        const allTools = aggregateByTool(parsedProjects, pricing);
        nativeVsMcp = summarizeNativeVsMcp(allTools);
    }
    if (options.includeComparisons) {
        const allTools = aggregateByTool(parsedProjects, pricing);
        comparisons = generateComparison(allTools);
    }
    return {
        timeRange,
        projects,
        models,
        tools,
        grandTotal,
        mcpToolsSummary,
        subagents,
        batches,
        nativeVsMcp,
        comparisons
    };
}
