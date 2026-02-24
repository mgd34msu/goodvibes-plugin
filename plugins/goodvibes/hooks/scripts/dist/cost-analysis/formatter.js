/**
 * Format output based on selected format
 */
export function formatOutput(result, format) {
    switch (format) {
        case 'text':
            return formatText(result);
        case 'json':
            return formatJson(result);
        case 'markdown':
            return formatMarkdown(result);
        case 'minimal':
            return formatMinimal(result);
        default:
            return formatText(result);
    }
}
/**
 * Format as detailed text (like current cost-analysis.cjs output)
 */
function formatText(result) {
    const lines = [];
    // Header
    lines.push('='.repeat(120));
    lines.push(`COMPLETE COST ANALYSIS: ${result.timeRange.description}`);
    lines.push('='.repeat(120));
    // Project breakdown
    lines.push('\n\nPROJECT BREAKDOWN:');
    lines.push('-'.repeat(100));
    for (const project of result.projects) {
        const shortName = project.project
            .replace('C--Users-buzzkill-Documents-', '')
            .substring(0, 50);
        const costStr = `$${project.cost.totalCost.toFixed(2)}`;
        const calls = project.models.reduce((sum, m) => sum + m.tokens.calls, 0);
        lines.push(shortName.padEnd(55) +
            calls.toString().padStart(7) +
            ' calls   ' +
            costStr.padStart(10));
    }
    // Model totals
    lines.push('\n\nMODEL TOTALS:');
    lines.push('-'.repeat(100));
    for (const modelResult of result.models) {
        const { tokens, cost, displayName } = modelResult;
        lines.push(displayName.padEnd(20) + tokens.calls.toString().padStart(8) + ' calls');
        lines.push('  Input:       ' +
            tokens.input.toLocaleString().padStart(15) +
            ' tokens   $' +
            cost.inputCost.toFixed(2));
        lines.push('  Output:      ' +
            tokens.output.toLocaleString().padStart(15) +
            ' tokens   $' +
            cost.outputCost.toFixed(2));
        lines.push('  Cache5m:     ' +
            tokens.cache5m.toLocaleString().padStart(15) +
            ' tokens   $' +
            cost.cache5mCost.toFixed(2));
        lines.push('  Cache1h:     ' +
            tokens.cache1h.toLocaleString().padStart(15) +
            ' tokens   $' +
            cost.cache1hCost.toFixed(2));
        lines.push('  CacheRead:   ' +
            tokens.cacheRead.toLocaleString().padStart(15) +
            ' tokens   $' +
            cost.cacheReadCost.toFixed(2));
        lines.push('  SUBTOTAL:    $' + cost.totalCost.toFixed(2));
        lines.push('');
    }
    const grandCalls = result.grandTotal.tokens.calls;
    const grandCost = result.grandTotal.cost.totalCost;
    lines.push('GRAND TOTAL: ' +
        grandCalls.toLocaleString() +
        ' calls, $' +
        grandCost.toFixed(2));
    // Tool breakdown
    if (result.tools && result.tools.length > 0) {
        lines.push('\n\nTOOL BREAKDOWN (Top ' + result.tools.length + '):');
        lines.push('-'.repeat(100));
        for (const tool of result.tools) {
            const name = tool.tool === '__text_response__' ? '(text only)' : tool.tool;
            const costStr = `$${tool.cost.totalCost.toFixed(2)}`;
            lines.push(name.padEnd(60) +
                tool.usageCount.toString().padStart(7) +
                ' calls   ' +
                costStr.padStart(10));
        }
    }
    // MCP tools summary
    if (result.mcpToolsSummary && result.mcpToolsSummary.topTools.length > 0) {
        lines.push('\n\nMCP TOOLS ONLY:');
        lines.push('-'.repeat(100));
        for (const tool of result.mcpToolsSummary.topTools) {
            const costStr = `$${tool.cost.totalCost.toFixed(2)}`;
            lines.push(tool.tool.padEnd(60) +
                tool.usageCount.toString().padStart(7) +
                ' calls   ' +
                costStr.padStart(10));
        }
        lines.push('-'.repeat(100));
        lines.push(`MCP TOTAL: ${result.mcpToolsSummary.totalCalls} calls, $${result.mcpToolsSummary.cost.totalCost.toFixed(2)}`);
    }
    if (result.subagents) {
        lines.push('\n\nSUBAGENT ANALYSIS:');
        lines.push('-'.repeat(100));
        lines.push(`Sessions: ${result.subagents.totalSessions} | Calls: ${result.subagents.totalCalls}`);
        lines.push(`MCP: ${result.subagents.mcpCallPercent.toFixed(1)}% | Native: ${result.subagents.nativeCallPercent.toFixed(1)}%`);
        lines.push(`Cost: $${result.subagents.totalCost.toFixed(2)}`);
    }
    if (result.batches) {
        lines.push('\n\nBATCH ANALYSIS:');
        lines.push('-'.repeat(100));
        lines.push(`Batches: ${result.batches.totalBatches} | Operations: ${result.batches.totalOperations}`);
        lines.push(`Savings: $${result.batches.totalSavings.toFixed(2)} (${result.batches.avgSavingsPercent.toFixed(1)}%)`);
    }
    if (result.nativeVsMcp) {
        lines.push('\n\nNATIVE VS MCP:');
        lines.push('-'.repeat(100));
        lines.push(`Native: ${result.nativeVsMcp.native.totalCalls} calls, $${result.nativeVsMcp.native.totalCost.toFixed(2)}`);
        lines.push(`MCP: ${result.nativeVsMcp.mcp.totalCalls} calls, $${result.nativeVsMcp.mcp.totalCost.toFixed(2)}`);
    }
    return lines.join('\n');
}
/**
 * Format as JSON
 */
function formatJson(result) {
    return JSON.stringify(result, null, 2);
}
/**
 * Format as Markdown tables
 */
function formatMarkdown(result) {
    const lines = [];
    lines.push(`# Cost Analysis: ${result.timeRange.description}\n`);
    // Project breakdown
    lines.push('## Project Breakdown\n');
    lines.push('| Project | Calls | Cost |');
    lines.push('|---------|-------|------|');
    for (const project of result.projects) {
        const shortName = project.project.replace('C--Users-buzzkill-Documents-', '');
        const calls = project.models.reduce((sum, m) => sum + m.tokens.calls, 0);
        lines.push(`| ${shortName} | ${calls} | $${project.cost.totalCost.toFixed(2)} |`);
    }
    // Model totals
    lines.push('\n## Model Totals\n');
    lines.push('| Model | Calls | Input | Output | Cache5m | Cache1h | CacheRead | Cost |');
    lines.push('|-------|-------|-------|--------|---------|---------|-----------|------|');
    for (const model of result.models) {
        lines.push(`| ${model.displayName} | ${model.tokens.calls} | ` +
            `${model.tokens.input.toLocaleString()} | ${model.tokens.output.toLocaleString()} | ` +
            `${model.tokens.cache5m.toLocaleString()} | ${model.tokens.cache1h.toLocaleString()} | ` +
            `${model.tokens.cacheRead.toLocaleString()} | $${model.cost.totalCost.toFixed(2)} |`);
    }
    // Tool breakdown
    if (result.tools && result.tools.length > 0) {
        lines.push('\n## Tool Breakdown\n');
        lines.push('| Tool | Calls | Cost |');
        lines.push('|------|-------|------|');
        for (const tool of result.tools) {
            const name = tool.tool === '__text_response__' ? '(text only)' : tool.tool;
            lines.push(`| ${name} | ${tool.usageCount} | $${tool.cost.totalCost.toFixed(2)} |`);
        }
    }
    // Grand total
    lines.push('\n## Grand Total\n');
    lines.push(`**${result.grandTotal.tokens.calls.toLocaleString()} calls, $${result.grandTotal.cost.totalCost.toFixed(2)}**`);
    // Extended analysis sections
    if (result.comparisons && result.comparisons.headToHead) {
        lines.push('\n## Native vs MCP Tool Comparison\n');
        lines.push('| Operation | Native Tool | Native Cost | MCP Tool | MCP Cost | Savings |');
        lines.push('|-----------|-------------|-------------|----------|----------|---------|');
        for (const comp of result.comparisons.headToHead) {
            const nCost = comp.nativeTool?.totalCost?.toFixed(2) || '0.00';
            const mCost = comp.precisionTool?.totalCost?.toFixed(2) || '0.00';
            const save = comp.deltas?.costPercent?.toFixed(1) || '0.0';
            lines.push(`| ${comp.label} | ${comp.nativeTool?.displayName || 'N/A'} | $${nCost} | ${comp.precisionTool?.displayName || 'N/A'} | $${mCost} | ${save}% |`);
        }
    }
    if (result.subagents) {
        lines.push('\n## Subagent Analysis\n');
        lines.push(`**Sessions:** ${result.subagents.totalSessions} | **Calls:** ${result.subagents.totalCalls} | **Cost:** $${result.subagents.totalCost.toFixed(2)}`);
        lines.push(`**MCP Usage:** ${result.subagents.mcpCallPercent.toFixed(1)}% | **Native Usage:** ${result.subagents.nativeCallPercent.toFixed(1)}%`);
    }
    if (result.batches) {
        lines.push('\n## Batch Analysis\n');
        lines.push(`**Batches:** ${result.batches.totalBatches} | **Operations:** ${result.batches.totalOperations}`);
        lines.push(`**Savings:** $${result.batches.totalSavings.toFixed(2)} (${result.batches.avgSavingsPercent.toFixed(1)}%)`);
    }
    if (result.nativeVsMcp) {
        lines.push('\n## Native vs MCP Summary\n');
        lines.push(`**Native:** ${result.nativeVsMcp.native.totalCalls} calls, $${result.nativeVsMcp.native.totalCost.toFixed(2)}`);
        lines.push(`**MCP:** ${result.nativeVsMcp.mcp.totalCalls} calls, $${result.nativeVsMcp.mcp.totalCost.toFixed(2)}`);
    }
    return lines.join('\n');
}
/**
 * Format as minimal one-line summary
 */
function formatMinimal(result) {
    return (`Cost: $${result.grandTotal.cost.totalCost.toFixed(2)} | ` +
        `Calls: ${result.grandTotal.tokens.calls.toLocaleString()} | ` +
        `Period: ${result.timeRange.description}`);
}
/**
 * Format subagent summary
 */
export function formatSubagentSummary(summary, format) {
    switch (format) {
        case 'json':
            return JSON.stringify(summary, null, 2);
        case 'markdown':
            return `# Subagent Summary\n\n**Total Sessions:** ${summary.totalSessions}\n**Total Cost:** $${summary.totalCost.toFixed(2)}`;
        case 'minimal':
            return `Subagents: ${summary.totalSessions} | $${summary.totalCost.toFixed(2)}`;
        case 'text':
        default:
            return `SUBAGENT SUMMARY\nSessions: ${summary.totalSessions}\nCost: $${summary.totalCost.toFixed(2)}`;
    }
}
/**
 * Format batch analysis
 */
export function formatBatchAnalysis(result, format) {
    switch (format) {
        case 'json':
            return JSON.stringify(result, null, 2);
        case 'markdown':
            return `# Batch Analysis\n\n**Total Batches:** ${result.totalBatches}\n**Total Savings:** $${result.totalSavings.toFixed(2)}`;
        case 'minimal':
            return `Batches: ${result.totalBatches} | Saved: $${result.totalSavings.toFixed(2)}`;
        case 'text':
        default:
            return `BATCH ANALYSIS\nBatches: ${result.totalBatches}\nSavings: $${result.totalSavings.toFixed(2)}`;
    }
}
/**
 * Format comparison analysis
 */
export function formatComparison(result, format) {
    switch (format) {
        case 'json':
            return JSON.stringify(result, null, 2);
        case 'markdown':
            return `# Tool Comparison\n\n**Categories:** ${result.categories.length}\n**Comparisons:** ${result.headToHead.length}`;
        case 'minimal':
            return `Comparison: ${result.categories.length} categories | ${result.headToHead.length} comparisons`;
        case 'text':
        default:
            return `TOOL COMPARISON\nCategories: ${result.categories.length}\nComparisons: ${result.headToHead.length}`;
    }
}
