import type {
  CostAnalysisResult,
  OutputFormat,
  TokenStats,
  CostBreakdown,
  SubagentSummary,
  BatchAnalysisResult,
  ComparisonResult,
  ExtendedCostAnalysisResult
} from './types.js';

/**
 * Format output based on selected format
 */
export function formatOutput(result: CostAnalysisResult, format: OutputFormat): string {
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
function formatText(result: CostAnalysisResult): string {
  const lines: string[] = [];

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
    lines.push(
      shortName.padEnd(55) +
      calls.toString().padStart(7) +
      ' calls   ' +
      costStr.padStart(10)
    );
  }

  // Model totals
  lines.push('\n\nMODEL TOTALS:');
  lines.push('-'.repeat(100));

  for (const modelResult of result.models) {
    const { tokens, cost, displayName } = modelResult;

    lines.push(displayName.padEnd(20) + tokens.calls.toString().padStart(8) + ' calls');
    lines.push(
      '  Input:       ' +
      tokens.input.toLocaleString().padStart(15) +
      ' tokens   $' +
      cost.inputCost.toFixed(2)
    );
    lines.push(
      '  Output:      ' +
      tokens.output.toLocaleString().padStart(15) +
      ' tokens   $' +
      cost.outputCost.toFixed(2)
    );
    lines.push(
      '  Cache5m:     ' +
      tokens.cache5m.toLocaleString().padStart(15) +
      ' tokens   $' +
      cost.cache5mCost.toFixed(2)
    );
    lines.push(
      '  Cache1h:     ' +
      tokens.cache1h.toLocaleString().padStart(15) +
      ' tokens   $' +
      cost.cache1hCost.toFixed(2)
    );
    lines.push(
      '  CacheRead:   ' +
      tokens.cacheRead.toLocaleString().padStart(15) +
      ' tokens   $' +
      cost.cacheReadCost.toFixed(2)
    );
    lines.push('  SUBTOTAL:    $' + cost.totalCost.toFixed(2));
    lines.push('');
  }

  const grandCalls = result.grandTotal.tokens.calls;
  const grandCost = result.grandTotal.cost.totalCost;
  lines.push(
    'GRAND TOTAL: ' +
    grandCalls.toLocaleString() +
    ' calls, $' +
    grandCost.toFixed(2)
  );

  // Tool breakdown
  if (result.tools && result.tools.length > 0) {
    lines.push('\n\nTOOL BREAKDOWN (Top ' + result.tools.length + '):');
    lines.push('-'.repeat(100));

    for (const tool of result.tools) {
      const name = tool.tool === '__text_response__' ? '(text only)' : tool.tool;
      const costStr = `$${tool.cost.totalCost.toFixed(2)}`;
      lines.push(
        name.padEnd(60) +
        tool.usageCount.toString().padStart(7) +
        ' calls   ' +
        costStr.padStart(10)
      );
    }
  }

  // MCP tools summary
  if (result.mcpToolsSummary && result.mcpToolsSummary.topTools.length > 0) {
    lines.push('\n\nMCP TOOLS ONLY:');
    lines.push('-'.repeat(100));

    for (const tool of result.mcpToolsSummary.topTools) {
      const costStr = `$${tool.cost.totalCost.toFixed(2)}`;
      lines.push(
        tool.tool.padEnd(60) +
        tool.usageCount.toString().padStart(7) +
        ' calls   ' +
        costStr.padStart(10)
      );
    }

    lines.push('-'.repeat(100));
    lines.push(
      `MCP TOTAL: ${result.mcpToolsSummary.totalCalls} calls, $${result.mcpToolsSummary.cost.totalCost.toFixed(2)}`
    );
  }

  return lines.join('\n');
}

/**
 * Format as JSON
 */
function formatJson(result: CostAnalysisResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Format as Markdown tables
 */
function formatMarkdown(result: CostAnalysisResult): string {
  const lines: string[] = [];

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
    lines.push(
      `| ${model.displayName} | ${model.tokens.calls} | ` +
      `${model.tokens.input.toLocaleString()} | ${model.tokens.output.toLocaleString()} | ` +
      `${model.tokens.cache5m.toLocaleString()} | ${model.tokens.cache1h.toLocaleString()} | ` +
      `${model.tokens.cacheRead.toLocaleString()} | $${model.cost.totalCost.toFixed(2)} |`
    );
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
  lines.push(
    `**${result.grandTotal.tokens.calls.toLocaleString()} calls, $${result.grandTotal.cost.totalCost.toFixed(2)}**`
  );

  return lines.join('\n');
}

/**
 * Format as minimal one-line summary
 */
function formatMinimal(result: CostAnalysisResult): string {
  return (
    `Cost: $${result.grandTotal.cost.totalCost.toFixed(2)} | ` +
    `Calls: ${result.grandTotal.tokens.calls.toLocaleString()} | ` +
    `Period: ${result.timeRange.description}`
  );
}
