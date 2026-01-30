import fs from 'fs';
import path from 'path';
import os from 'os';

const projectsDir = path.join(os.homedir(), '.claude', 'projects');
const now = Date.now();
const hours = parseInt(process.argv[2] || '11', 10);
const cutoff = now - hours * 60 * 60 * 1000;

// Pricing per 1M tokens
const pricing = {
  'claude-opus-4-5-20251101': { input: 15, output: 75, cacheRead: 1.5 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15, cacheRead: 0.30 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5, cacheRead: 0.10 }
};

function getModelPricing(model) {
  return pricing[model] || pricing['claude-sonnet-4-5-20250929'];
}

function calculateCost(usage, model) {
  const p = getModelPricing(model);
  const inputCost = ((usage.input_tokens || 0) / 1_000_000) * p.input;
  const outputCost = ((usage.output_tokens || 0) / 1_000_000) * p.output;
  const cacheReadCost = ((usage.cache_read_input_tokens || 0) / 1_000_000) * p.cacheRead;
  return { inputCost, outputCost, cacheReadCost, totalCost: inputCost + outputCost + cacheReadCost };
}

// Find all agent session files (in subagents/ directories)
function findAgentFiles(dir, results = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Check if this is a subagents directory
        if (entry.name === 'subagents') {
          // Get all agent files in this directory
          const agentFiles = fs.readdirSync(fullPath)
            .filter(f => f.endsWith('.jsonl'))
            .map(f => {
              const stat = fs.statSync(path.join(fullPath, f));
              return {
                path: path.join(fullPath, f),
                name: f,
                size: stat.size,
                mtime: stat.mtimeMs
              };
            })
            .filter(f => f.mtime >= cutoff);
          results.push(...agentFiles);
        } else {
          findAgentFiles(fullPath, results);
        }
      }
    }
  } catch {}
  return results;
}

const agentFiles = findAgentFiles(projectsDir);
console.error(`Found ${agentFiles.length} agent session files in last ${hours}h`);

// Analyze each agent session
const agentStats = [];

for (const file of agentFiles) {
  try {
    const content = fs.readFileSync(file.path, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());

    const stats = {
      id: file.name.replace('agent-', '').replace('.jsonl', ''),
      size: file.size,
      calls: 0,
      tokens: { input: 0, output: 0, cacheRead: 0 },
      cost: { inputCost: 0, outputCost: 0, cacheReadCost: 0, totalCost: 0 },
      mcpCalls: 0,
      mcpTools: {},
      nativeTools: {},
      models: {}
    };

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== 'assistant' || !entry.message?.usage) continue;

        // Time filter
        if (entry.timestamp) {
          const ts = new Date(entry.timestamp).getTime();
          if (ts < cutoff || ts > now) continue;
        }

        const model = entry.message.model || 'unknown';
        const usage = entry.message.usage;
        const cost = calculateCost(usage, model);

        stats.calls++;
        stats.tokens.input += usage.input_tokens || 0;
        stats.tokens.output += usage.output_tokens || 0;
        stats.tokens.cacheRead += usage.cache_read_input_tokens || 0;
        stats.cost.inputCost += cost.inputCost;
        stats.cost.outputCost += cost.outputCost;
        stats.cost.cacheReadCost += cost.cacheReadCost;
        stats.cost.totalCost += cost.totalCost;

        const shortModel = model.replace('claude-', '').split('-202')[0];
        stats.models[shortModel] = (stats.models[shortModel] || 0) + 1;

        // Check for tools
        if (Array.isArray(entry.message.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_use') {
              if (block.name === 'Bash' && block.input?.command) {
                const match = block.input.command.match(/mcp-cli\s+(call|info)\s+([^\s'"]+)/);
                if (match) {
                  stats.mcpCalls++;
                  const tool = match[2].split('/').pop();
                  stats.mcpTools[tool] = (stats.mcpTools[tool] || 0) + 1;
                } else {
                  stats.nativeTools['Bash'] = (stats.nativeTools['Bash'] || 0) + 1;
                }
              } else {
                stats.nativeTools[block.name] = (stats.nativeTools[block.name] || 0) + 1;
              }
            }
          }
        }
      } catch {}
    }

    if (stats.calls > 0) {
      agentStats.push(stats);
    }
  } catch {}
}

// Aggregate totals
const totals = {
  sessions: agentStats.length,
  calls: 0,
  tokens: { input: 0, output: 0, cacheRead: 0 },
  cost: { inputCost: 0, outputCost: 0, cacheReadCost: 0, totalCost: 0 },
  mcpCalls: 0,
  mcpTools: {},
  nativeTools: {},
  models: {}
};

for (const s of agentStats) {
  totals.calls += s.calls;
  totals.tokens.input += s.tokens.input;
  totals.tokens.output += s.tokens.output;
  totals.tokens.cacheRead += s.tokens.cacheRead;
  totals.cost.inputCost += s.cost.inputCost;
  totals.cost.outputCost += s.cost.outputCost;
  totals.cost.cacheReadCost += s.cost.cacheReadCost;
  totals.cost.totalCost += s.cost.totalCost;
  totals.mcpCalls += s.mcpCalls;

  for (const [tool, count] of Object.entries(s.mcpTools)) {
    totals.mcpTools[tool] = (totals.mcpTools[tool] || 0) + count;
  }
  for (const [tool, count] of Object.entries(s.nativeTools)) {
    totals.nativeTools[tool] = (totals.nativeTools[tool] || 0) + count;
  }
  for (const [model, count] of Object.entries(s.models)) {
    totals.models[model] = (totals.models[model] || 0) + count;
  }
}

// Output
console.log(JSON.stringify({
  timeRange: `Last ${hours} hours`,
  summary: {
    agentSessions: totals.sessions,
    totalCalls: totals.calls,
    totalCost: totals.cost.totalCost.toFixed(2),
    totalMcpCalls: totals.mcpCalls,
    avgCostPerSession: totals.sessions > 0 ? (totals.cost.totalCost / totals.sessions).toFixed(4) : 0,
    avgMcpPerSession: totals.sessions > 0 ? (totals.mcpCalls / totals.sessions).toFixed(1) : 0
  },
  tokens: {
    input: totals.tokens.input,
    output: totals.tokens.output,
    cacheRead: totals.tokens.cacheRead
  },
  costBreakdown: {
    inputCost: totals.cost.inputCost.toFixed(4),
    outputCost: totals.cost.outputCost.toFixed(4),
    cacheReadCost: totals.cost.cacheReadCost.toFixed(4),
    totalCost: totals.cost.totalCost.toFixed(4)
  },
  byModel: Object.entries(totals.models)
    .sort((a, b) => b[1] - a[1])
    .map(([model, calls]) => ({ model, calls })),
  mcpTools: Object.entries(totals.mcpTools)
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => ({ tool, count })),
  nativeTools: Object.entries(totals.nativeTools)
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => ({ tool, count })),
  topAgents: agentStats
    .sort((a, b) => b.mcpCalls - a.mcpCalls)
    .slice(0, 15)
    .map(s => ({
      id: s.id,
      calls: s.calls,
      cost: '$' + s.cost.totalCost.toFixed(3),
      mcpCalls: s.mcpCalls,
      topMcp: Object.entries(s.mcpTools).sort((a,b) => b[1] - a[1]).slice(0, 3).map(([t,c]) => `${t}:${c}`).join(', ') || '-',
      model: Object.keys(s.models)[0] || 'unknown'
    }))
}, null, 2));
