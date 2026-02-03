const fs = require('fs');
const data = JSON.parse(fs.readFileSync(__dirname + '/cost-analysis.json', 'utf8'));

const tools = data.tools || [];

// Format number with commas
const fmt = (n) => n.toLocaleString();
const fmtDec = (n, d=2) => n.toFixed(d);

// Calculate per-call metrics for all tools
const rows = tools
  .filter(t => t.tool !== '__text_response__')
  .map(t => {
    const tk = t.tokens;
    const total = (tk.input||0) + (tk.output||0) + (tk.cacheRead||0);
    return {
      tool: t.tool.replace('mcp:call:plugin_goodvibes_', '').replace('mcp:info:plugin_goodvibes_', 'info:'),
      calls: t.usageCount,
      inputPerCall: (tk.input||0) / t.usageCount,
      outputPerCall: (tk.output||0) / t.usageCount,
      cachePerCall: (tk.cacheRead||0) / t.usageCount,
      totalPerCall: total / t.usageCount,
      costPerCall: t.cost.totalCost / t.usageCount,
      totalCost: t.cost.totalCost
    };
  })
  .sort((a,b) => b.calls - a.calls);

console.log('');
console.log('═'.repeat(140));
console.log('                              PER-CALL TOKEN & COST ANALYSIS — LAST 24 HOURS');
console.log('═'.repeat(140));
console.log('');
console.log('TOOL'.padEnd(55) + 'CALLS'.padStart(6) + '  │' + 'INPUT'.padStart(8) + 'OUTPUT'.padStart(9) + 'CACHE'.padStart(11) + 'TOTAL'.padStart(11) + '  │' + 'COST/CALL'.padStart(11) + 'TOTAL'.padStart(10));
console.log('─'.repeat(55) + '──────' + '──┼' + '─'.repeat(39) + '──┼' + '─'.repeat(21));

for (const r of rows) {
  console.log(
    r.tool.substring(0, 54).padEnd(55) +
    r.calls.toString().padStart(6) +
    '  │' +
    fmtDec(r.inputPerCall, 0).padStart(8) +
    fmtDec(r.outputPerCall, 0).padStart(9) +
    fmt(Math.round(r.cachePerCall)).padStart(11) +
    fmt(Math.round(r.totalPerCall)).padStart(11) +
    '  │' +
    ('$' + fmtDec(r.costPerCall, 5)).padStart(11) +
    ('$' + fmtDec(r.totalCost, 2)).padStart(10)
  );
}

console.log('');
console.log('═'.repeat(140));

// Now group by category
const categories = {
  'Native File Tools': ['Read', 'Edit', 'Write'],
  'Native Search Tools': ['Grep', 'Glob'],
  'Native Execution': ['Bash'],
  'Precision File Tools': ['precision-engine/precision_read', 'precision-engine/precision_edit', 'precision-engine/precision_write'],
  'Precision Search Tools': ['precision-engine/precision_grep', 'precision-engine/precision_glob', 'precision-engine/precision_symbols', 'precision-engine/discover'],
  'Precision Execution': ['precision-engine/precision_exec', 'precision-engine/precision_fetch'],
  'Batch Engine': ['batch-engine/batch', 'batch-engine/batch_status', 'batch-engine/batch_list', 'batch-engine/batch_recover', 'batch-engine/batch_state', 'batch-engine/batch_checkpoints'],
  'Registry Engine': ['registry-engine/search_agents', 'registry-engine/get_agent_content', 'registry-engine/search_skills', 'registry-engine/get_skill_content']
};

console.log('');
console.log('═'.repeat(100));
console.log('                         CATEGORY AVERAGES (Per-Call)');
console.log('═'.repeat(100));
console.log('');
console.log('CATEGORY'.padEnd(30) + 'CALLS'.padStart(7) + 'INPUT/CALL'.padStart(12) + 'OUTPUT/CALL'.padStart(13) + 'CACHE/CALL'.padStart(13) + 'TOTAL/CALL'.padStart(13) + 'COST/CALL'.padStart(12));
console.log('─'.repeat(100));

for (const [cat, toolNames] of Object.entries(categories)) {
  const catRows = rows.filter(r => toolNames.some(tn => r.tool === tn || r.tool.includes(tn)));
  if (catRows.length === 0) continue;

  const totalCalls = catRows.reduce((s, r) => s + r.calls, 0);
  const avgInput = catRows.reduce((s, r) => s + r.inputPerCall * r.calls, 0) / totalCalls;
  const avgOutput = catRows.reduce((s, r) => s + r.outputPerCall * r.calls, 0) / totalCalls;
  const avgCache = catRows.reduce((s, r) => s + r.cachePerCall * r.calls, 0) / totalCalls;
  const avgTotal = catRows.reduce((s, r) => s + r.totalPerCall * r.calls, 0) / totalCalls;
  const avgCost = catRows.reduce((s, r) => s + r.costPerCall * r.calls, 0) / totalCalls;

  console.log(
    cat.padEnd(30) +
    totalCalls.toString().padStart(7) +
    fmtDec(avgInput, 1).padStart(12) +
    fmtDec(avgOutput, 1).padStart(13) +
    fmt(Math.round(avgCache)).padStart(13) +
    fmt(Math.round(avgTotal)).padStart(13) +
    ('$' + fmtDec(avgCost, 5)).padStart(12)
  );
}

console.log('');

// Head-to-head comparisons
console.log('═'.repeat(100));
console.log('                         HEAD-TO-HEAD: NATIVE vs PRECISION (Per-Call)');
console.log('═'.repeat(100));
console.log('');

const comparisons = [
  { native: 'Read', precision: 'precision-engine/precision_read', label: 'File Reading' },
  { native: 'Grep', precision: 'precision-engine/precision_grep', label: 'Content Search' },
  { native: 'Glob', precision: 'precision-engine/discover', label: 'File Discovery' },
];

for (const comp of comparisons) {
  const n = rows.find(r => r.tool === comp.native);
  const p = rows.find(r => r.tool === comp.precision);

  if (!n || !p) continue;

  console.log(`┌─ ${comp.label} ─────────────────────────────────────────────────────────────────────────────────┐`);
  console.log('│' + ''.padEnd(98) + '│');
  console.log('│  ' + 'Tool'.padEnd(40) + 'Input/Call'.padStart(12) + 'Output/Call'.padStart(13) + 'Cache/Call'.padStart(13) + 'Total/Call'.padStart(12) + 'Cost/Call'.padStart(10) + '│');
  console.log('│  ' + '─'.repeat(96) + '│');
  console.log('│  ' + ('Native: ' + n.tool).padEnd(40) + fmtDec(n.inputPerCall, 1).padStart(12) + fmtDec(n.outputPerCall, 1).padStart(13) + fmt(Math.round(n.cachePerCall)).padStart(13) + fmt(Math.round(n.totalPerCall)).padStart(12) + ('$' + fmtDec(n.costPerCall, 5)).padStart(10) + '│');
  console.log('│  ' + ('Precision: ' + p.tool.split('/')[1]).padEnd(40) + fmtDec(p.inputPerCall, 1).padStart(12) + fmtDec(p.outputPerCall, 1).padStart(13) + fmt(Math.round(p.cachePerCall)).padStart(13) + fmt(Math.round(p.totalPerCall)).padStart(12) + ('$' + fmtDec(p.costPerCall, 5)).padStart(10) + '│');
  console.log('│  ' + '─'.repeat(96) + '│');

  const inputDelta = ((p.inputPerCall - n.inputPerCall) / n.inputPerCall * 100);
  const outputDelta = ((p.outputPerCall - n.outputPerCall) / n.outputPerCall * 100);
  const cacheDelta = ((p.cachePerCall - n.cachePerCall) / n.cachePerCall * 100);
  const totalDelta = ((p.totalPerCall - n.totalPerCall) / n.totalPerCall * 100);
  const costDelta = ((p.costPerCall - n.costPerCall) / n.costPerCall * 100);

  const sign = (v) => v > 0 ? '+' : '';
  console.log('│  ' + 'Δ Precision vs Native'.padEnd(40) + (sign(inputDelta) + fmtDec(inputDelta, 0) + '%').padStart(12) + (sign(outputDelta) + fmtDec(outputDelta, 0) + '%').padStart(13) + (sign(cacheDelta) + fmtDec(cacheDelta, 0) + '%').padStart(13) + (sign(totalDelta) + fmtDec(totalDelta, 0) + '%').padStart(12) + (sign(costDelta) + fmtDec(costDelta, 0) + '%').padStart(10) + '│');
  console.log('│' + ''.padEnd(98) + '│');
  console.log('└' + '─'.repeat(98) + '┘');
  console.log('');
}
