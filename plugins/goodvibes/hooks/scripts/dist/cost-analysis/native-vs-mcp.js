/**
 * Native vs MCP Tool Analysis
 *
 * Classifies tools into native, MCP (precision), and MCP info categories.
 * Calculates overhead from mcp-cli info calls and provides comparative metrics.
 */
/**
 * Classify tools into native, MCP, and MCP info categories
 */
export function classifyTools(tools) {
    const native = [];
    const mcp = [];
    const mcpInfo = [];
    for (const tool of tools) {
        const toolName = tool.tool.toLowerCase();
        // MCP info calls (mcp:info:* pattern)
        if (toolName.startsWith('mcp:info:')) {
            mcpInfo.push(tool);
        }
        // MCP tools (precision_* or other mcp:* patterns)
        else if (toolName.startsWith('precision_') || toolName.startsWith('mcp:') || toolName === 'discover' || toolName === 'batch') {
            mcp.push(tool);
        }
        // Native tools
        else {
            native.push(tool);
        }
    }
    return { native, mcp, mcpInfo };
}
/**
 * Calculate MCP info overhead metrics
 */
export function calculateMcpInfoOverhead(tools, classified) {
    const { mcp, mcpInfo } = classified || classifyTools(tools);
    const totalInfoCalls = mcpInfo.reduce((sum, t) => sum + t.usageCount, 0);
    const totalInfoCost = mcpInfo.reduce((sum, t) => sum + t.cost.totalCost, 0);
    const totalMcpCalls = mcp.reduce((sum, t) => sum + t.usageCount, 0);
    const totalMcpCost = mcp.reduce((sum, t) => sum + t.cost.totalCost, 0);
    const infoRatio = totalMcpCalls > 0 ? (totalInfoCalls / totalMcpCalls) * 100 : 0;
    const costRatio = totalMcpCost > 0 ? (totalInfoCost / totalMcpCost) * 100 : 0;
    const perCallOverhead = totalMcpCalls > 0 ? totalInfoCost / totalMcpCalls : 0;
    return {
        totalInfoCalls,
        totalInfoCost,
        infoRatio,
        costRatio,
        perCallOverhead,
    };
}
/**
 * Calculate aggregate tokens and cost for a set of tools
 */
function aggregateTools(tools) {
    const tokens = {
        input: 0,
        output: 0,
        cache5m: 0,
        cache1h: 0,
        cacheRead: 0,
        calls: 0,
    };
    const cost = {
        inputCost: 0,
        outputCost: 0,
        cache5mCost: 0,
        cache1hCost: 0,
        cacheReadCost: 0,
        totalCost: 0,
    };
    for (const tool of tools) {
        tokens.input += tool.tokens.input;
        tokens.output += tool.tokens.output;
        tokens.cache5m += tool.tokens.cache5m;
        tokens.cache1h += tool.tokens.cache1h;
        tokens.cacheRead += tool.tokens.cacheRead;
        tokens.calls += tool.usageCount;
        cost.inputCost += tool.cost.inputCost;
        cost.outputCost += tool.cost.outputCost;
        cost.cache5mCost += tool.cost.cache5mCost;
        cost.cache1hCost += tool.cost.cache1hCost;
        cost.cacheReadCost += tool.cost.cacheReadCost;
        cost.totalCost += tool.cost.totalCost;
    }
    return { tokens, cost };
}
/**
 * Generate comprehensive native vs MCP comparison
 */
export function summarizeNativeVsMcp(tools) {
    const classified = classifyTools(tools);
    const infoOverhead = calculateMcpInfoOverhead(tools, classified);
    // Aggregate native tools
    const nativeAgg = aggregateTools(classified.native);
    const nativeTotalCalls = nativeAgg.tokens.calls;
    const nativeTotalCost = nativeAgg.cost.totalCost;
    const nativePerCallCost = nativeTotalCalls > 0 ? nativeTotalCost / nativeTotalCalls : 0;
    // Aggregate MCP tools (without info)
    const mcpAgg = aggregateTools(classified.mcp);
    const mcpTotalCalls = mcpAgg.tokens.calls;
    const mcpTotalCost = mcpAgg.cost.totalCost;
    const mcpPerCallCost = mcpTotalCalls > 0 ? mcpTotalCost / mcpTotalCalls : 0;
    // Aggregate MCP tools with info overhead
    const mcpInfoAgg = aggregateTools(classified.mcpInfo);
    const mcpWithInfoTotalCost = mcpTotalCost + mcpInfoAgg.cost.totalCost;
    const mcpWithInfoPerCallCost = mcpTotalCalls > 0 ? mcpWithInfoTotalCost / mcpTotalCalls : 0;
    // Combine MCP and info tokens/cost for mcpWithInfo
    const mcpWithInfoTokens = {
        input: mcpAgg.tokens.input + mcpInfoAgg.tokens.input,
        output: mcpAgg.tokens.output + mcpInfoAgg.tokens.output,
        cache5m: mcpAgg.tokens.cache5m + mcpInfoAgg.tokens.cache5m,
        cache1h: mcpAgg.tokens.cache1h + mcpInfoAgg.tokens.cache1h,
        cacheRead: mcpAgg.tokens.cacheRead + mcpInfoAgg.tokens.cacheRead,
        calls: mcpTotalCalls, // Info calls don't count as separate calls
    };
    const mcpWithInfoCost = {
        inputCost: mcpAgg.cost.inputCost + mcpInfoAgg.cost.inputCost,
        outputCost: mcpAgg.cost.outputCost + mcpInfoAgg.cost.outputCost,
        cache5mCost: mcpAgg.cost.cache5mCost + mcpInfoAgg.cost.cache5mCost,
        cache1hCost: mcpAgg.cost.cache1hCost + mcpInfoAgg.cost.cache1hCost,
        cacheReadCost: mcpAgg.cost.cacheReadCost + mcpInfoAgg.cost.cacheReadCost,
        totalCost: mcpWithInfoTotalCost,
    };
    return {
        native: {
            totalCalls: nativeTotalCalls,
            totalCost: nativeTotalCost,
            perCallCost: nativePerCallCost,
            tokens: nativeAgg.tokens,
            cost: nativeAgg.cost,
        },
        mcp: {
            totalCalls: mcpTotalCalls,
            totalCost: mcpTotalCost,
            perCallCost: mcpPerCallCost,
            tokens: mcpAgg.tokens,
            cost: mcpAgg.cost,
        },
        mcpWithInfo: {
            totalCalls: mcpTotalCalls,
            totalCost: mcpWithInfoTotalCost,
            perCallCost: mcpWithInfoPerCallCost,
            tokens: mcpWithInfoTokens,
            cost: mcpWithInfoCost,
        },
        infoOverhead,
    };
}
