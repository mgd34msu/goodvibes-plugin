const fs = require('fs');
const path = 'plugins/goodvibes/hooks/scripts/src/cost-analysis/formatter.ts';
let content = fs.readFileSync(path, 'utf8');

// Normalize line endings
content = content.replace(/\r\n/g, '\n');

const target = `  return lines.join('\n');
}

/**
 * Format as minimal one-line summary
 */
function formatMinimal`;

const replacement = `  // Extended analysis sections
  if (result.comparisons && result.comparisons.comparisons) {
    lines.push('\n## Native vs MCP Tool Comparison\n');
    lines.push('| Operation | Native Tool | Native Cost | MCP Tool | MCP Cost | Savings |');
    lines.push('|-----------|-------------|-------------|----------|----------|---------|');
    for (const comp of result.comparisons.comparisons) {
      const nCost = comp.nativeTool?.totalCost?.toFixed(2) || '0.00';
      const mCost = comp.precisionTool?.totalCost?.toFixed(2) || '0.00';
      const save = comp.deltas?.costPercent?.toFixed(1) || '0.0';
      lines.push(\`| \${comp.label} | \${comp.nativeTool?.displayName || 'N/A'} | $\${nCost} | \${comp.precisionTool?.displayName || 'N/A'} | $\${mCost} | \${save}% |\`);
    }
  }

  return lines.join('\n');
}

/**
 * Format as minimal one-line summary
 */
function formatMinimal`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(path, content);
  console.log('Success: Extended sections added to formatMarkdown');
} else {
  console.log('Pattern not found');
}
