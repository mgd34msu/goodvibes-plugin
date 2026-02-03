const data = {
  callTools: [
    { tool: 'precision_read', calls: 1096, cost: 13.475383, tokens: { input: 38315, output: 6943, cacheRead: 43123618 } },
    { tool: 'precision_grep', calls: 754, cost: 13.129385, tokens: { input: 31028, output: 4560, cacheRead: 33603250 } },
    { tool: 'precision_edit', calls: 518, cost: 6.790228, tokens: { input: 8744, output: 2538, cacheRead: 28193513 } },
    { tool: 'precision_write', calls: 120, cost: 2.521020, tokens: { input: 12896, output: 1012, cacheRead: 6250403 } },
    { tool: 'precision_glob', calls: 157, cost: 1.996918, tokens: { input: 15559, output: 1276, cacheRead: 5805065 } },
    { tool: 'discover', calls: 259, cost: 1.928089, tokens: { input: 78208, output: 2151, cacheRead: 7692893 } },
    { tool: 'precision_exec', calls: 99, cost: 0.674854, tokens: { input: 1031, output: 1154, cacheRead: 3853382 } },
    { tool: 'batch', calls: 52, cost: 0.723182, tokens: { input: 86, output: 485, cacheRead: 2153063 } }
  ],
  infoTools: [
    { tool: 'precision_read', calls: 256, cost: 1.910039 },
    { tool: 'precision_grep', calls: 146, cost: 1.121894 },
    { tool: 'precision_edit', calls: 108, cost: 0.815862 },
    { tool: 'precision_write', calls: 43, cost: 0.732389 }
  ],
  nativeTools: [
    { tool: 'Bash', calls: 27334, cost: 736.809480, tokens: { input: 1624552, output: 3173700, cacheRead: 1704928258 } },
    { tool: 'Edit', calls: 13829, cost: 529.827584, tokens: { input: 403223, output: 6797109, cacheRead: 968577506 } },
    { tool: 'Read', calls: 17287, cost: 440.293582, tokens: { input: 2985647, output: 2138396, cacheRead: 945836401 } },
    { tool: 'Write', calls: 3379, cost: 328.797994, tokens: { input: 233187, output: 11397714, cacheRead: 212682570 } },
    { tool: 'Grep', calls: 4246, cost: 120.134205, tokens: { input: 906617, output: 499433, cacheRead: 244048340 } },
    { tool: 'Glob', calls: 2762, cost: 53.579229, tokens: { input: 860328, output: 330133, cacheRead: 92242187 } }
  ]
};

// Calculate per-call stats for MCP tools
console.log('=== MCP CALL TOOLS (ALL TIME) ===');
console.log('');
let totalMcpCalls = 0;
let totalMcpCost = 0;

for (const t of data.callTools) {
  const perCall = t.cost / t.calls;
  totalMcpCalls += t.calls;
  totalMcpCost += t.cost;
  console.log(t.tool.padEnd(18) + ' | ' + String(t.calls).padStart(5) + ' calls | $' + t.cost.toFixed(2).padStart(8) + ' | $' + perCall.toFixed(4) + '/call');
}
console.log('-'.repeat(60));
console.log('TOTAL'.padEnd(18) + ' | ' + String(totalMcpCalls).padStart(5) + ' calls | $' + totalMcpCost.toFixed(2).padStart(8) + ' | $' + (totalMcpCost/totalMcpCalls).toFixed(4) + '/call');

// Calculate info overhead
console.log('');
console.log('=== MCP INFO OVERHEAD ===');
console.log('');
let totalInfoCalls = 0;
let totalInfoCost = 0;

for (const t of data.infoTools) {
  totalInfoCalls += t.calls;
  totalInfoCost += t.cost;
  const ratio = data.callTools.find(c => c.tool === t.tool);
  const infoRatio = ratio ? (t.calls / ratio.calls * 100).toFixed(1) : 'N/A';
  console.log(t.tool.padEnd(18) + ' | ' + String(t.calls).padStart(5) + ' info calls | $' + t.cost.toFixed(2).padStart(6) + ' | ' + infoRatio + '% of calls need info');
}
console.log('-'.repeat(70));
console.log('INFO TOTAL'.padEnd(18) + ' | ' + String(totalInfoCalls).padStart(5) + ' info calls | $' + totalInfoCost.toFixed(2).padStart(6) + ' | ' + (totalInfoCalls/totalMcpCalls*100).toFixed(1) + '% overhead rate');

// Adjusted per-call (including info overhead)
console.log('');
console.log('=== ADJUSTED PER-CALL (WITH INFO OVERHEAD) ===');
console.log('');
const adjustedTotal = totalMcpCost + totalInfoCost;
const adjustedPerCall = adjustedTotal / totalMcpCalls;
console.log('Total call cost:      $' + totalMcpCost.toFixed(2));
console.log('Total info overhead:  $' + totalInfoCost.toFixed(2));
console.log('Combined total:       $' + adjustedTotal.toFixed(2));
console.log('');
console.log('Raw per-call:         $' + (totalMcpCost/totalMcpCalls).toFixed(4));
console.log('Adjusted per-call:    $' + adjustedPerCall.toFixed(4));
console.log('Info overhead ratio:  ' + ((totalInfoCost/totalMcpCost)*100).toFixed(1) + '%');

// Native tool stats
console.log('');
console.log('=== NATIVE TOOLS (ALL TIME) ===');
console.log('');
let totalNativeCalls = 0;
let totalNativeCost = 0;

for (const t of data.nativeTools) {
  const perCall = t.cost / t.calls;
  totalNativeCalls += t.calls;
  totalNativeCost += t.cost;
  console.log(t.tool.padEnd(18) + ' | ' + String(t.calls).padStart(6) + ' calls | $' + t.cost.toFixed(2).padStart(10) + ' | $' + perCall.toFixed(4) + '/call');
}
console.log('-'.repeat(65));
console.log('TOTAL'.padEnd(18) + ' | ' + String(totalNativeCalls).padStart(6) + ' calls | $' + totalNativeCost.toFixed(2).padStart(10) + ' | $' + (totalNativeCost/totalNativeCalls).toFixed(4) + '/call');

// Grouped comparison
console.log('');
console.log('=== GROUPED COMPARISON ===');
console.log('');

// Group 1: Read operations (precision_read vs Read)
const readMcp = data.callTools.find(t => t.tool === 'precision_read');
const readInfo = data.infoTools.find(t => t.tool === 'precision_read');
const readNative = data.nativeTools.find(t => t.tool === 'Read');
const readMcpTotal = readMcp.cost + readInfo.cost;
const readMcpPerCall = readMcpTotal / readMcp.calls;
const readNativePerCall = readNative.cost / readNative.calls;

console.log('GROUP 1: READ OPERATIONS');
console.log('  precision_read: ' + readMcp.calls + ' calls, $' + readMcpTotal.toFixed(2) + ' ($' + readMcpPerCall.toFixed(4) + '/call incl info)');
console.log('  Native Read:    ' + readNative.calls + ' calls, $' + readNative.cost.toFixed(2) + ' ($' + readNativePerCall.toFixed(4) + '/call)');
console.log('  If MCP calls were native: $' + (readMcp.calls * readNativePerCall).toFixed(2));
console.log('  Savings: $' + ((readMcp.calls * readNativePerCall) - readMcpTotal).toFixed(2));
console.log('');

// Group 2: Search operations (precision_grep + discover vs Grep)
const grepMcp = data.callTools.find(t => t.tool === 'precision_grep');
const grepInfo = data.infoTools.find(t => t.tool === 'precision_grep');
const discoverMcp = data.callTools.find(t => t.tool === 'discover');
const grepNative = data.nativeTools.find(t => t.tool === 'Grep');
const searchMcpCalls = grepMcp.calls + discoverMcp.calls;
const searchMcpCost = grepMcp.cost + grepInfo.cost + discoverMcp.cost;
const searchMcpPerCall = searchMcpCost / searchMcpCalls;
const grepNativePerCall = grepNative.cost / grepNative.calls;

console.log('GROUP 2: SEARCH OPERATIONS (grep + discover)');
console.log('  precision_grep: ' + grepMcp.calls + ' calls');
console.log('  discover:       ' + discoverMcp.calls + ' calls (batches ~3.5 searches each)');
console.log('  MCP Total:      ' + searchMcpCalls + ' calls, $' + searchMcpCost.toFixed(2) + ' ($' + searchMcpPerCall.toFixed(4) + '/call)');
console.log('  Native Grep:    ' + grepNative.calls + ' calls, $' + grepNative.cost.toFixed(2) + ' ($' + grepNativePerCall.toFixed(4) + '/call)');
// discover batches ~3.5 queries, so equivalent native calls would be higher
const equivalentSearchCalls = grepMcp.calls + (discoverMcp.calls * 3.5);
console.log('  Equivalent native calls: ' + Math.round(equivalentSearchCalls) + ' (accounting for discover batching)');
console.log('  If MCP calls were native: $' + (equivalentSearchCalls * grepNativePerCall).toFixed(2));
console.log('  Savings: $' + ((equivalentSearchCalls * grepNativePerCall) - searchMcpCost).toFixed(2));
console.log('');

// Group 3: Write/Edit operations (precision_edit + precision_write vs Edit + Write)
const editMcp = data.callTools.find(t => t.tool === 'precision_edit');
const editInfo = data.infoTools.find(t => t.tool === 'precision_edit');
const writeMcp = data.callTools.find(t => t.tool === 'precision_write');
const writeInfo = data.infoTools.find(t => t.tool === 'precision_write');
const editNative = data.nativeTools.find(t => t.tool === 'Edit');
const writeNative = data.nativeTools.find(t => t.tool === 'Write');

const modifyMcpCalls = editMcp.calls + writeMcp.calls;
const modifyMcpCost = editMcp.cost + editInfo.cost + writeMcp.cost + writeInfo.cost;
const modifyMcpPerCall = modifyMcpCost / modifyMcpCalls;
const modifyNativeCalls = editNative.calls + writeNative.calls;
const modifyNativeCost = editNative.cost + writeNative.cost;
const modifyNativePerCall = modifyNativeCost / modifyNativeCalls;

console.log('GROUP 3: MODIFY OPERATIONS (edit + write)');
console.log('  precision_edit:  ' + editMcp.calls + ' calls');
console.log('  precision_write: ' + writeMcp.calls + ' calls');
console.log('  MCP Total:       ' + modifyMcpCalls + ' calls, $' + modifyMcpCost.toFixed(2) + ' ($' + modifyMcpPerCall.toFixed(4) + '/call)');
console.log('  Native Edit:     ' + editNative.calls + ' calls, $' + editNative.cost.toFixed(2));
console.log('  Native Write:    ' + writeNative.calls + ' calls, $' + writeNative.cost.toFixed(2));
console.log('  Native Total:    ' + modifyNativeCalls + ' calls, $' + modifyNativeCost.toFixed(2) + ' ($' + modifyNativePerCall.toFixed(4) + '/call)');
console.log('  If MCP calls were native: $' + (modifyMcpCalls * modifyNativePerCall).toFixed(2));
console.log('  Savings: $' + ((modifyMcpCalls * modifyNativePerCall) - modifyMcpCost).toFixed(2));
console.log('');

// Group 4: Glob operations
const globMcp = data.callTools.find(t => t.tool === 'precision_glob');
const globNative = data.nativeTools.find(t => t.tool === 'Glob');
const globMcpPerCall = globMcp.cost / globMcp.calls;
const globNativePerCall = globNative.cost / globNative.calls;

console.log('GROUP 4: GLOB OPERATIONS');
console.log('  precision_glob: ' + globMcp.calls + ' calls, $' + globMcp.cost.toFixed(2) + ' ($' + globMcpPerCall.toFixed(4) + '/call)');
console.log('  Native Glob:    ' + globNative.calls + ' calls, $' + globNative.cost.toFixed(2) + ' ($' + globNativePerCall.toFixed(4) + '/call)');
console.log('  If MCP calls were native: $' + (globMcp.calls * globNativePerCall).toFixed(2));
console.log('  Savings: $' + ((globMcp.calls * globNativePerCall) - globMcp.cost).toFixed(2));
console.log('');

// Group 5: Exec operations
const execMcp = data.callTools.find(t => t.tool === 'precision_exec');
const bashNative = data.nativeTools.find(t => t.tool === 'Bash');
const execMcpPerCall = execMcp.cost / execMcp.calls;
const bashNativePerCall = bashNative.cost / bashNative.calls;

console.log('GROUP 5: EXEC/BASH OPERATIONS');
console.log('  precision_exec: ' + execMcp.calls + ' calls, $' + execMcp.cost.toFixed(2) + ' ($' + execMcpPerCall.toFixed(4) + '/call)');
console.log('  Native Bash:    ' + bashNative.calls + ' calls, $' + bashNative.cost.toFixed(2) + ' ($' + bashNativePerCall.toFixed(4) + '/call)');
console.log('  If MCP calls were native: $' + (execMcp.calls * bashNativePerCall).toFixed(2));
console.log('  Savings: $' + ((execMcp.calls * bashNativePerCall) - execMcp.cost).toFixed(2));
console.log('');

// Batch engine
const batchMcp = data.callTools.find(t => t.tool === 'batch');
console.log('GROUP 6: BATCH ENGINE');
console.log('  batch: ' + batchMcp.calls + ' calls, $' + batchMcp.cost.toFixed(2) + ' ($' + (batchMcp.cost/batchMcp.calls).toFixed(4) + '/call)');
console.log('  (No native equivalent - unique orchestration capability)');
console.log('');

// Grand summary
console.log('=== GRAND SUMMARY ===');
console.log('');
const totalSavings =
  ((readMcp.calls * readNativePerCall) - readMcpTotal) +
  ((equivalentSearchCalls * grepNativePerCall) - searchMcpCost) +
  ((modifyMcpCalls * modifyNativePerCall) - modifyMcpCost) +
  ((globMcp.calls * globNativePerCall) - globMcp.cost) +
  ((execMcp.calls * bashNativePerCall) - execMcp.cost);

console.log('Total MCP tool calls:     ' + totalMcpCalls);
console.log('Total MCP cost (w/ info): $' + adjustedTotal.toFixed(2));
console.log('');
console.log('Estimated native equiv:   $' + (adjustedTotal + totalSavings).toFixed(2));
console.log('TOTAL SAVINGS:            $' + totalSavings.toFixed(2));
console.log('Savings percentage:       ' + ((totalSavings / (adjustedTotal + totalSavings)) * 100).toFixed(1) + '%');
