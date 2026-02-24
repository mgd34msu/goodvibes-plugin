/**
 * Tool Comparison Module
 *
 * Calculates per-call metrics for tools and generates comparisons
 * between native and precision tool pairs.
 */
const TOOL_CATEGORIES = {
    'Native File Tools': ['Read', 'Edit', 'Write'],
    'Precision File Tools': [
        'precision-engine/precision_read',
        'precision-engine/precision_edit',
        'precision-engine/precision_write',
    ],
    'Native Search Tools': ['Grep', 'Glob'],
    'Precision Search Tools': [
        'precision-engine/precision_grep',
        'precision-engine/precision_glob',
        'precision-engine/discover',
    ],
    'Native Execution': ['Bash'],
    'Precision Execution': [
        'precision-engine/precision_exec',
        'precision-engine/precision_fetch',
    ],
    'Batch Engine': [
        'batch-engine/batch',
        'batch-engine/batch_status',
        'batch-engine/batch_list',
        'batch-engine/batch_recover',
        'batch-engine/batch_state',
        'batch-engine/batch_checkpoints',
    ],
    'Registry Engine': [
        'registry-engine/search_agents',
        'registry-engine/get_agent_content',
        'registry-engine/search_skills',
        'registry-engine/get_skill_content',
    ],
};
const COMPARISON_PAIRS = [
    {
        native: 'Read',
        precision: 'precision-engine/precision_read',
        label: 'File Reading',
    },
    {
        native: 'Edit',
        precision: 'precision-engine/precision_edit',
        label: 'File Editing',
    },
    {
        native: 'Write',
        precision: 'precision-engine/precision_write',
        label: 'File Writing',
    },
    {
        native: 'Grep',
        precision: 'precision-engine/precision_grep',
        label: 'Content Search',
    },
    {
        native: 'Glob',
        precision: 'precision-engine/discover',
        label: 'File Discovery',
    },
    {
        native: 'Bash',
        precision: 'precision-engine/precision_exec',
        label: 'Command Execution',
    },
];
function normalizeToolName(tool) {
    return tool
        .replace('mcp:call:plugin_goodvibes_', '')
        .replace('mcp:info:plugin_goodvibes_', 'info:')
        .replace('mcp:call:', '')
        .replace('mcp:info:', 'info:')
        .replace('plugin_goodvibes_', '');
}
function getToolCategory(toolName) {
    const normalized = normalizeToolName(toolName);
    for (const [category, tools] of Object.entries(TOOL_CATEGORIES)) {
        if (tools.some(t => normalized === t || normalized.includes(t))) {
            return category;
        }
    }
    return 'Other';
}
export function calculateToolMetrics(tools) {
    return tools
        .filter(t => t.tool !== '__text_response__')
        .map(t => {
        const tk = t.tokens;
        const totalTokens = (tk.input || 0) + (tk.output || 0) + (tk.cacheRead || 0);
        const displayName = normalizeToolName(t.tool);
        const category = getToolCategory(t.tool);
        return {
            tool: t.tool,
            displayName,
            calls: t.usageCount,
            inputPerCall: (tk.input || 0) / t.usageCount,
            outputPerCall: (tk.output || 0) / t.usageCount,
            cachePerCall: (tk.cacheRead || 0) / t.usageCount,
            totalPerCall: totalTokens / t.usageCount,
            costPerCall: t.cost.totalCost / t.usageCount,
            totalCost: t.cost.totalCost,
            category,
        };
    })
        .sort((a, b) => b.calls - a.calls);
}
export function aggregateByCategory(metrics) {
    const categoryMap = new Map();
    for (const metric of metrics) {
        const existing = categoryMap.get(metric.category) || [];
        existing.push(metric);
        categoryMap.set(metric.category, existing);
    }
    const results = [];
    for (const [category, tools] of categoryMap.entries()) {
        const totalCalls = tools.reduce((sum, t) => sum + t.calls, 0);
        const totalCost = tools.reduce((sum, t) => sum + t.totalCost, 0);
        const avgInputPerCall = tools.reduce((sum, t) => sum + t.inputPerCall * t.calls, 0) / totalCalls;
        const avgOutputPerCall = tools.reduce((sum, t) => sum + t.outputPerCall * t.calls, 0) / totalCalls;
        const avgCachePerCall = tools.reduce((sum, t) => sum + t.cachePerCall * t.calls, 0) / totalCalls;
        const avgTotalPerCall = tools.reduce((sum, t) => sum + t.totalPerCall * t.calls, 0) / totalCalls;
        const avgCostPerCall = tools.reduce((sum, t) => sum + t.costPerCall * t.calls, 0) / totalCalls;
        results.push({
            category,
            tools: tools.map(t => t.displayName),
            totalCalls,
            avgInputPerCall,
            avgOutputPerCall,
            avgCachePerCall,
            avgTotalPerCall,
            avgCostPerCall,
            totalCost,
        });
    }
    return results.sort((a, b) => b.totalCalls - a.totalCalls);
}
function calculateDelta(precision, native) {
    if (native === 0)
        return 0;
    return ((precision - native) / native) * 100;
}
export function compareHeadToHead(metrics) {
    const comparisons = [];
    for (const pair of COMPARISON_PAIRS) {
        const nativeTool = metrics.find(m => m.displayName === pair.native || m.tool === pair.native);
        const precisionTool = metrics.find(m => m.displayName === pair.precision ||
            m.tool.includes(pair.precision) ||
            m.displayName.includes(pair.precision.split('/').pop() || ''));
        if (!nativeTool || !precisionTool)
            continue;
        comparisons.push({
            label: pair.label,
            nativeTool,
            precisionTool,
            deltas: {
                inputPercent: calculateDelta(precisionTool.inputPerCall, nativeTool.inputPerCall),
                outputPercent: calculateDelta(precisionTool.outputPerCall, nativeTool.outputPerCall),
                cachePercent: calculateDelta(precisionTool.cachePerCall, nativeTool.cachePerCall),
                totalPercent: calculateDelta(precisionTool.totalPerCall, nativeTool.totalPerCall),
                costPercent: calculateDelta(precisionTool.costPerCall, nativeTool.costPerCall),
            },
        });
    }
    return comparisons;
}
export function generateComparison(tools) {
    const metrics = calculateToolMetrics(tools);
    const categories = aggregateByCategory(metrics);
    const headToHead = compareHeadToHead(metrics);
    return {
        metrics,
        categories,
        headToHead,
    };
}
