const fs = require('fs');
const data = fs.readFileSync(__dirname + '/cost-analysis.json', 'utf8');
const json = JSON.parse(data);

const tools = json.tools || [];

// Categorize
const native = ['Read', 'Edit', 'Bash', 'Grep', 'Glob', 'Write'];
const precision = [
  'mcp:call:plugin_goodvibes_precision-engine/precision_read',
  'mcp:call:plugin_goodvibes_precision-engine/precision_edit',
  'mcp:call:plugin_goodvibes_precision-engine/precision_grep',
  'mcp:call:plugin_goodvibes_precision-engine/precision_glob',
  'mcp:call:plugin_goodvibes_precision-engine/precision_write',
  'mcp:call:plugin_goodvibes_precision-engine/precision_exec',
  'mcp:call:plugin_goodvibes_precision-engine/precision_symbols',
  'mcp:call:plugin_goodvibes_precision-engine/precision_fetch',
  'mcp:call:plugin_goodvibes_precision-engine/discover'
];

const results = [];

for (const tool of tools) {
  const t = tool.tokens;
  const c = tool.cost;
  const totalTokens = (t.input || 0) + (t.output || 0) + (t.cacheRead || 0);

  if (native.includes(tool.tool) || precision.includes(tool.tool)) {
    results.push({
      tool: tool.tool.replace('mcp:call:plugin_goodvibes_precision-engine/', ''),
      type: native.includes(tool.tool) ? 'native' : 'precision',
      calls: tool.usageCount,
      input: t.input || 0,
      output: t.output || 0,
      cacheRead: t.cacheRead || 0,
      totalTokens,
      cost: c.totalCost,
      tokensPerCall: Math.round(totalTokens / tool.usageCount),
      costPerCall: c.totalCost / tool.usageCount
    });
  }
}

// Sort by type then by calls
results.sort((a, b) => {
  if (a.type !== b.type) return a.type === 'native' ? -1 : 1;
  return b.calls - a.calls;
});

// Calculate totals
const nativeTotal = results.filter(r => r.type === 'native').reduce((acc, r) => ({
  calls: acc.calls + r.calls,
  input: acc.input + r.input,
  output: acc.output + r.output,
  cacheRead: acc.cacheRead + r.cacheRead,
  totalTokens: acc.totalTokens + r.totalTokens,
  cost: acc.cost + r.cost
}), {calls: 0, input: 0, output: 0, cacheRead: 0, totalTokens: 0, cost: 0});

const precisionTotal = results.filter(r => r.type === 'precision').reduce((acc, r) => ({
  calls: acc.calls + r.calls,
  input: acc.input + r.input,
  output: acc.output + r.output,
  cacheRead: acc.cacheRead + r.cacheRead,
  totalTokens: acc.totalTokens + r.totalTokens,
  cost: acc.cost + r.cost
}), {calls: 0, input: 0, output: 0, cacheRead: 0, totalTokens: 0, cost: 0});

console.log('=== INDIVIDUAL TOOLS ===');
console.log(JSON.stringify(results, null, 2));
console.log('\n=== NATIVE TOTAL ===');
console.log(JSON.stringify({...nativeTotal, avgTokensPerCall: Math.round(nativeTotal.totalTokens/nativeTotal.calls), avgCostPerCall: nativeTotal.cost/nativeTotal.calls}, null, 2));
console.log('\n=== PRECISION TOTAL ===');
console.log(JSON.stringify({...precisionTotal, avgTokensPerCall: Math.round(precisionTotal.totalTokens/precisionTotal.calls), avgCostPerCall: precisionTotal.cost/precisionTotal.calls}, null, 2));
