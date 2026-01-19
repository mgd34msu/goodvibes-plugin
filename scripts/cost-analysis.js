const fs = require('fs');
const path = require('path');

const projectsDir = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'projects');
const startTime = new Date('2026-01-15T16:00:00Z').getTime();

const pricing = {
  'claude-opus-4-5-20251101': { input: 5.00, cache5m: 6.25, cache1h: 10.00, cacheRead: 0.50, output: 25.00 },
  'claude-haiku-4-5-20251001': { input: 1.00, cache5m: 1.25, cache1h: 2.00, cacheRead: 0.10, output: 5.00 }
};

const projectStats = {};
const modelStats = {};
const toolStats = {};

function getProjectName(filePath) {
  const parts = filePath.replace(/\\/g, '/').split('/');
  const projectsIdx = parts.indexOf('projects');
  if (projectsIdx >= 0 && parts[projectsIdx + 1]) {
    return parts[projectsIdx + 1];
  }
  return 'unknown';
}

function addStats(statsObj, key, model, usage) {
  if (!statsObj[key]) statsObj[key] = {};
  if (!statsObj[key][model]) {
    statsObj[key][model] = { input: 0, output: 0, cache5m: 0, cache1h: 0, cacheRead: 0, calls: 0 };
  }
  const s = statsObj[key][model];
  s.input += usage.input_tokens || 0;
  s.output += usage.output_tokens || 0;
  s.cacheRead += usage.cache_read_input_tokens || 0;
  if (usage.cache_creation) {
    s.cache5m += usage.cache_creation.ephemeral_5m_input_tokens || 0;
    s.cache1h += usage.cache_creation.ephemeral_1h_input_tokens || 0;
  }
  s.calls += 1;
}

function extractMcpTool(bashInput) {
  if (!bashInput || !bashInput.command) return null;
  const cmd = bashInput.command;
  const mcpMatch = cmd.match(/mcp-cli\s+(call|info)\s+([^\s'"]+)/);
  if (mcpMatch) return 'mcp:' + mcpMatch[1] + ':' + mcpMatch[2];
  return null;
}

function processFile(filePath) {
  const projectName = getProjectName(filePath);

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'assistant' && entry.message && entry.message.usage) {
          const ts = new Date(entry.timestamp).getTime();
          if (ts < startTime) continue;

          const model = entry.message.model || 'unknown';
          const usage = entry.message.usage;
          const msgContent = entry.message.content;

          addStats(projectStats, projectName, model, usage);
          addStats(modelStats, model, model, usage);

          const tools = [];
          if (Array.isArray(msgContent)) {
            for (const block of msgContent) {
              if (block.type === 'tool_use' && block.name) {
                if (block.name === 'Bash' && block.input) {
                  const mcpTool = extractMcpTool(block.input);
                  tools.push(mcpTool || 'Bash');
                } else {
                  tools.push(block.name);
                }
              }
            }
          }

          if (tools.length === 0) {
            addStats(toolStats, '__text_response__', model, usage);
          } else if (tools.length === 1) {
            addStats(toolStats, tools[0], model, usage);
          } else {
            const splitUsage = {
              input_tokens: Math.round((usage.input_tokens || 0) / tools.length),
              output_tokens: Math.round((usage.output_tokens || 0) / tools.length),
              cache_read_input_tokens: Math.round((usage.cache_read_input_tokens || 0) / tools.length),
              cache_creation: usage.cache_creation ? {
                ephemeral_5m_input_tokens: Math.round((usage.cache_creation.ephemeral_5m_input_tokens || 0) / tools.length),
                ephemeral_1h_input_tokens: Math.round((usage.cache_creation.ephemeral_1h_input_tokens || 0) / tools.length)
              } : null
            };
            for (const tool of tools) {
              addStats(toolStats, tool, model, splitUsage);
            }
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
}

function walkDir(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walkDir(fullPath);
      else if (entry.name.endsWith('.jsonl')) processFile(fullPath);
    }
  } catch (e) {}
}

walkDir(projectsDir);

function calcCost(stats, model) {
  const p = pricing[model] || { input: 0, cache5m: 0, cache1h: 0, cacheRead: 0, output: 0 };
  return (stats.input / 1e6) * p.input +
         (stats.output / 1e6) * p.output +
         (stats.cache5m / 1e6) * p.cache5m +
         (stats.cache1h / 1e6) * p.cache1h +
         (stats.cacheRead / 1e6) * p.cacheRead;
}

console.log('='.repeat(120));
console.log('COMPLETE COST ANALYSIS: Jan 15 10:00 AM Central - Now (ALL PROJECTS)');
console.log('='.repeat(120));

console.log('\n\nPROJECT BREAKDOWN:');
console.log('-'.repeat(100));
const projectResults = [];
for (const [project, models] of Object.entries(projectStats)) {
  let totalCost = 0;
  let totalCalls = 0;
  for (const [model, stats] of Object.entries(models)) {
    totalCost += calcCost(stats, model);
    totalCalls += stats.calls;
  }
  projectResults.push({ project, totalCost, totalCalls });
}
projectResults.sort((a, b) => b.totalCost - a.totalCost);

for (const r of projectResults) {
  const shortName = r.project.replace('C--Users-buzzkill-Documents-', '').substring(0, 50);
  console.log(shortName.padEnd(55) + r.totalCalls.toString().padStart(7) + ' calls   $' + r.totalCost.toFixed(2).padStart(10));
}

console.log('\n\nMODEL TOTALS:');
console.log('-'.repeat(100));
let grandTotal = 0;
let grandCalls = 0;
for (const [model, models] of Object.entries(modelStats)) {
  const stats = models[model];
  const cost = calcCost(stats, model);
  grandTotal += cost;
  grandCalls += stats.calls;
  const shortModel = model.includes('opus') ? 'Opus 4.5' : model.includes('haiku') ? 'Haiku 4.5' : model;
  console.log(shortModel.padEnd(20) + stats.calls.toString().padStart(8) + ' calls');
  console.log('  Input:       ' + stats.input.toLocaleString().padStart(15) + ' tokens   $' + ((stats.input/1e6) * (pricing[model]?.input || 0)).toFixed(2));
  console.log('  Output:      ' + stats.output.toLocaleString().padStart(15) + ' tokens   $' + ((stats.output/1e6) * (pricing[model]?.output || 0)).toFixed(2));
  console.log('  Cache5m:     ' + stats.cache5m.toLocaleString().padStart(15) + ' tokens   $' + ((stats.cache5m/1e6) * (pricing[model]?.cache5m || 0)).toFixed(2));
  console.log('  Cache1h:     ' + stats.cache1h.toLocaleString().padStart(15) + ' tokens   $' + ((stats.cache1h/1e6) * (pricing[model]?.cache1h || 0)).toFixed(2));
  console.log('  CacheRead:   ' + stats.cacheRead.toLocaleString().padStart(15) + ' tokens   $' + ((stats.cacheRead/1e6) * (pricing[model]?.cacheRead || 0)).toFixed(2));
  console.log('  SUBTOTAL:    $' + cost.toFixed(2));
  console.log('');
}
console.log('GRAND TOTAL: ' + grandCalls.toLocaleString() + ' calls, $' + grandTotal.toFixed(2));

console.log('\n\nTOOL BREAKDOWN (Top 40):');
console.log('-'.repeat(100));
const toolResults = [];
for (const [tool, models] of Object.entries(toolStats)) {
  let totalCost = 0;
  let totalCalls = 0;
  for (const [model, stats] of Object.entries(models)) {
    totalCost += calcCost(stats, model);
    totalCalls += stats.calls;
  }
  toolResults.push({ tool, totalCost, totalCalls });
}
toolResults.sort((a, b) => b.totalCost - a.totalCost);

for (const r of toolResults.slice(0, 40)) {
  const name = r.tool === '__text_response__' ? '(text only)' : r.tool;
  console.log(name.padEnd(60) + r.totalCalls.toString().padStart(7) + ' calls   $' + r.totalCost.toFixed(2).padStart(10));
}

console.log('\n\nMCP TOOLS ONLY:');
console.log('-'.repeat(100));
const mcpResults = toolResults.filter(r => r.tool.startsWith('mcp:'));
let mcpTotal = 0;
let mcpCalls = 0;
for (const r of mcpResults) {
  console.log(r.tool.padEnd(60) + r.totalCalls.toString().padStart(7) + ' calls   $' + r.totalCost.toFixed(2).padStart(10));
  mcpTotal += r.totalCost;
  mcpCalls += r.totalCalls;
}
console.log('-'.repeat(100));
console.log('MCP TOTAL: ' + mcpCalls + ' calls, $' + mcpTotal.toFixed(2));
