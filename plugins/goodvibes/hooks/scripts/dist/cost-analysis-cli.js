#!/usr/bin/env node
/* Bundled with esbuild */

// src/cost-analysis-cli.ts
import { parseArgs } from "node:util";

// src/cost-analysis/pricing.ts
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// src/cost-analysis/calculator.ts
var TIER_BOUNDARY = 2e5;
function calculateTieredInputCost(tokens, baseRate) {
  if (tokens <= TIER_BOUNDARY) {
    return tokens / 1e6 * baseRate;
  }
  const tier1Cost = TIER_BOUNDARY / 1e6 * baseRate;
  const tier2Tokens = tokens - TIER_BOUNDARY;
  const tier2Cost = tier2Tokens / 1e6 * (baseRate * 2);
  return tier1Cost + tier2Cost;
}
function calculateTokenCost(stats, pricing) {
  const inputCost = calculateTieredInputCost(stats.input, pricing.inputPrice);
  const outputCost = stats.output / 1e6 * pricing.outputPrice;
  const cache5mCost = stats.cache5m / 1e6 * pricing.cacheWrite5Min;
  const cache1hCost = stats.cache1h / 1e6 * pricing.cacheWrite1Hour;
  const cacheReadCost = stats.cacheRead / 1e6 * pricing.cacheHits;
  const totalCost = inputCost + outputCost + cache5mCost + cache1hCost + cacheReadCost;
  return {
    inputCost,
    outputCost,
    cache5mCost,
    cache1hCost,
    cacheReadCost,
    totalCost
  };
}

// src/cost-analysis/model-id-translator.ts
function parseModelId(fullModelId) {
  const pattern = /^claude-(opus|sonnet|haiku)-(\d+)-(\d+)-(\d{8})$/;
  const match = fullModelId.match(pattern);
  if (!match) {
    return null;
  }
  return {
    family: match[1],
    majorVersion: parseInt(match[2], 10),
    minorVersion: parseInt(match[3], 10),
    dateCode: match[4]
  };
}
function toCacheKey(fullModelId) {
  const parsed = parseModelId(fullModelId);
  if (!parsed) {
    return null;
  }
  return `claude-${parsed.family}-${parsed.majorVersion}.${parsed.minorVersion}`;
}
function toDisplayName(fullModelId) {
  const parsed = parseModelId(fullModelId);
  if (!parsed) {
    return fullModelId;
  }
  const familyName = parsed.family.charAt(0).toUpperCase() + parsed.family.slice(1);
  return `${familyName} ${parsed.majorVersion}.${parsed.minorVersion}`;
}

// src/cost-analysis/pricing.ts
var CACHE_FILE = path.join(os.homedir(), ".claude", "model-pricing.json");
var FALLBACK_PRICING = {
  "claude-opus-4.5": {
    name: "Claude Opus 4.5",
    inputPrice: 15,
    outputPrice: 75,
    cacheWrite5Min: 18.75,
    cacheWrite1Hour: 30,
    cacheHits: 1.5
  },
  "claude-sonnet-4.5": {
    name: "Claude Sonnet 4.5",
    inputPrice: 3,
    outputPrice: 15,
    cacheWrite5Min: 3.75,
    cacheWrite1Hour: 6,
    cacheHits: 0.3
  },
  "claude-haiku-4.5": {
    name: "Claude Haiku 4.5",
    inputPrice: 1,
    outputPrice: 5,
    cacheWrite5Min: 1.25,
    cacheWrite1Hour: 2,
    cacheHits: 0.1
  }
};
function loadPricing() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, "utf8");
      const cache = JSON.parse(content);
      return cache.models;
    }
  } catch (error) {
  }
  return FALLBACK_PRICING;
}
function getModelPricing(modelId) {
  const pricingCache = loadPricing();
  const modelPricing = pricingCache[modelId] || pricingCache["claude-opus-4.5"];
  if (!modelPricing) return null;
  return {
    input: modelPricing.inputPrice,
    output: modelPricing.outputPrice,
    cacheRead: modelPricing.cacheHits
  };
}

// src/cost-analysis/parser.ts
import * as fs2 from "fs";
import * as path2 from "path";
import * as os2 from "os";
import * as crypto from "crypto";

// src/cost-analysis/types.ts
function validateJournalEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw;
  if (typeof entry.type !== "string") return null;
  const timestamp = entry.timestamp && typeof entry.timestamp === "string" ? entry.timestamp : void 0;
  let message;
  if (entry.message && typeof entry.message === "object") {
    const msg = entry.message;
    message = {
      id: typeof msg.id === "string" ? msg.id : void 0,
      model: typeof msg.model === "string" ? msg.model : void 0,
      usage: msg.usage && typeof msg.usage === "object" ? msg.usage : void 0,
      content: Array.isArray(msg.content) ? msg.content : void 0
    };
  }
  const requestId = entry.requestId && typeof entry.requestId === "string" ? entry.requestId : void 0;
  return { type: entry.type, timestamp, message, requestId };
}

// src/cost-analysis/parser.ts
function getProjectDirectories() {
  const homeDir = os2.homedir();
  return [
    path2.join(homeDir, ".claude", "projects"),
    path2.join(homeDir, ".config", "claude", "projects")
  ].filter((dir) => {
    try {
      return fs2.existsSync(dir) && fs2.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  });
}
function* walkDir(dir) {
  try {
    const entries = fs2.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path2.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "subagents") {
          continue;
        }
        yield* walkDir(fullPath);
      } else if (entry.name.endsWith(".jsonl")) {
        yield fullPath;
      }
    }
  } catch (error) {
  }
}
function findJSONLFiles() {
  const directories = getProjectDirectories();
  const files = [];
  for (const dir of directories) {
    for (const file of walkDir(dir)) {
      files.push(file);
    }
  }
  return files;
}
function getProjectName(filePath) {
  const parts = filePath.replace(/\\/g, "/").split("/");
  const projectsIdx = parts.indexOf("projects");
  if (projectsIdx >= 0 && parts[projectsIdx + 1]) {
    return parts[projectsIdx + 1];
  }
  return "unknown";
}
function extractMcpTool(bashInput) {
  if (!bashInput || typeof bashInput !== "object") return null;
  const input = bashInput;
  if (!input.command) return null;
  const mcpMatch = input.command.match(/mcp-cli\s+(call|info)\s+([^\s'"]+)/);
  if (mcpMatch) {
    return `mcp:${mcpMatch[1]}:${mcpMatch[2]}`;
  }
  return null;
}
function createEntryHash(entry) {
  const parts = [entry.message?.id || "", entry.requestId || ""];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}
function parseTimeFilter(filter) {
  const now = Date.now();
  if (!filter) {
    return { startTime: now - 30 * 24 * 60 * 60 * 1e3, endTime: now, description: "Last 30 days" };
  }
  if (filter.type === "absolute") {
    const startTime = filter.startDate ? new Date(filter.startDate).getTime() : 0;
    const endTime = filter.endDate ? new Date(filter.endDate).getTime() : now;
    return { startTime, endTime, description: `${filter.startDate || "All time"} - ${filter.endDate || "Now"}` };
  }
  const match = filter.relativeStart?.match(/^(\d+)([hdwmy])$/);
  if (!match) {
    return { startTime: now - 30 * 24 * 60 * 60 * 1e3, endTime: now, description: "Last 30 days" };
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  let milliseconds;
  let description;
  switch (unit) {
    case "h":
      milliseconds = value * 60 * 60 * 1e3;
      description = `Last ${value} hour${value > 1 ? "s" : ""}`;
      break;
    case "d":
      milliseconds = value * 24 * 60 * 60 * 1e3;
      description = `Last ${value} day${value > 1 ? "s" : ""}`;
      break;
    case "w":
      milliseconds = value * 7 * 24 * 60 * 60 * 1e3;
      description = `Last ${value} week${value > 1 ? "s" : ""}`;
      break;
    case "m":
      milliseconds = value * 30 * 24 * 60 * 60 * 1e3;
      description = `Last ${value} month${value > 1 ? "s" : ""}`;
      break;
    case "y":
      milliseconds = value * 365 * 24 * 60 * 60 * 1e3;
      description = `Last ${value} year${value > 1 ? "s" : ""}`;
      break;
    default:
      milliseconds = 30 * 24 * 60 * 60 * 1e3;
      description = "Last 30 days";
  }
  return { startTime: now - milliseconds, endTime: now, description };
}
function parseJournalFile(filePath, timeFilter, seenHashes) {
  const entries = [];
  const entryMap = /* @__PURE__ */ new Map();
  try {
    const fileContent = fs2.readFileSync(filePath, "utf8");
    const contentLines = fileContent.trim().split(String.fromCharCode(10));
    for (const line of contentLines) {
      if (!line.trim()) continue;
      try {
        const raw = JSON.parse(line);
        const entry = validateJournalEntry(raw);
        if (!entry || entry.type !== "assistant") continue;
        if (!entry.message?.usage) continue;
        if (entry.timestamp) {
          const timestamp = new Date(entry.timestamp).getTime();
          if (timestamp < timeFilter.startTime || timestamp > timeFilter.endTime) continue;
        }
        const hash = createEntryHash(entry);
        const entryTools = [];
        if (Array.isArray(entry.message.content)) {
          for (const block of entry.message.content) {
            if (block.type === "tool_use" && block.name) {
              if (block.name === "Bash" && block.input) {
                const mcpTool = extractMcpTool(block.input);
                entryTools.push(mcpTool || "Bash");
              } else {
                entryTools.push(block.name);
              }
            }
          }
        }
        if (entryMap.has(hash)) {
          const existing = entryMap.get(hash);
          for (const tool of entryTools) {
            existing.tools.add(tool);
          }
          existing.usage = entry.message.usage;
        } else {
          entryMap.set(hash, {
            model: entry.message.model || "unknown",
            usage: entry.message.usage,
            tools: new Set(entryTools)
          });
        }
      } catch (error) {
      }
    }
  } catch (error) {
  }
  for (const [hash, data] of entryMap) {
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);
    const tools = Array.from(data.tools);
    if (tools.length === 0) tools.push("__text_response__");
    entries.push({ model: data.model, usage: data.usage, tools });
  }
  return entries;
}
function parseAllProjects(options = {}) {
  const timeRange = parseTimeFilter(options.timeFilter);
  const seenHashes = /* @__PURE__ */ new Set();
  const projectMap = /* @__PURE__ */ new Map();
  const files = findJSONLFiles();
  for (const file of files) {
    const projectName = getProjectName(file);
    if (options.projectFilter && !options.projectFilter.includes(projectName)) continue;
    const entries = parseJournalFile(file, timeRange, seenHashes);
    const filteredEntries = options.modelFilter ? entries.filter((e) => options.modelFilter.includes(e.model)) : entries;
    if (filteredEntries.length > 0) {
      const existing = projectMap.get(projectName) || [];
      projectMap.set(projectName, [...existing, ...filteredEntries]);
    }
  }
  return Array.from(projectMap.entries()).map(([projectName, entries]) => ({ projectName, entries }));
}

// src/cost-analysis/aggregator.ts
function createEmptyStats() {
  return { input: 0, output: 0, cache5m: 0, cache1h: 0, cacheRead: 0, calls: 0 };
}
function aggregateByProject(projects, pricing) {
  const results = [];
  for (const project of projects) {
    const modelStatsMap = /* @__PURE__ */ new Map();
    for (const entry of project.entries) {
      if (!modelStatsMap.has(entry.model)) modelStatsMap.set(entry.model, createEmptyStats());
      const stats = modelStatsMap.get(entry.model);
      stats.input += entry.usage.input_tokens || 0;
      stats.output += entry.usage.output_tokens || 0;
      stats.cacheRead += entry.usage.cache_read_input_tokens || 0;
      if (entry.usage.cache_creation) {
        stats.cache5m += entry.usage.cache_creation.ephemeral_5m || 0;
        stats.cache1h += entry.usage.cache_creation.ephemeral_1h || 0;
      }
      stats.calls += 1;
    }
    const models = [];
    let projectTokens = createEmptyStats();
    let projectCost = { inputCost: 0, outputCost: 0, cache5mCost: 0, cache1hCost: 0, cacheReadCost: 0, totalCost: 0 };
    for (const [model, tokens] of modelStatsMap.entries()) {
      const cacheKey = toCacheKey(model) || model;
      const modelPricing = pricing[cacheKey] || pricing[model];
      if (!modelPricing) continue;
      const cost = calculateTokenCost(tokens, modelPricing);
      const displayName = toDisplayName(model);
      models.push({ model, displayName, tokens, cost });
      projectTokens.input += tokens.input;
      projectTokens.output += tokens.output;
      projectTokens.cache5m += tokens.cache5m;
      projectTokens.cache1h += tokens.cache1h;
      projectTokens.cacheRead += tokens.cacheRead;
      projectTokens.calls += tokens.calls;
      projectCost.inputCost += cost.inputCost;
      projectCost.outputCost += cost.outputCost;
      projectCost.cache5mCost += cost.cache5mCost;
      projectCost.cache1hCost += cost.cache1hCost;
      projectCost.cacheReadCost += cost.cacheReadCost;
      projectCost.totalCost += cost.totalCost;
    }
    results.push({ project: project.projectName, tokens: projectTokens, cost: projectCost, models });
  }
  results.sort((a, b) => b.cost.totalCost - a.cost.totalCost);
  return results;
}
function aggregateByModel(projects, pricing) {
  const modelStatsMap = /* @__PURE__ */ new Map();
  for (const project of projects) {
    for (const entry of project.entries) {
      if (!modelStatsMap.has(entry.model)) modelStatsMap.set(entry.model, createEmptyStats());
      const stats = modelStatsMap.get(entry.model);
      stats.input += entry.usage.input_tokens || 0;
      stats.output += entry.usage.output_tokens || 0;
      stats.cacheRead += entry.usage.cache_read_input_tokens || 0;
      if (entry.usage.cache_creation) {
        stats.cache5m += entry.usage.cache_creation.ephemeral_5m || 0;
        stats.cache1h += entry.usage.cache_creation.ephemeral_1h || 0;
      }
      stats.calls += 1;
    }
  }
  const results = [];
  for (const [model, tokens] of modelStatsMap.entries()) {
    const cacheKey = toCacheKey(model) || model;
    const modelPricing = pricing[cacheKey] || pricing[model];
    if (!modelPricing) continue;
    const cost = calculateTokenCost(tokens, modelPricing);
    const displayName = toDisplayName(model);
    results.push({ model, displayName, tokens, cost });
  }
  results.sort((a, b) => b.cost.totalCost - a.cost.totalCost);
  return results;
}
function aggregateByTool(projects, pricing) {
  const toolStatsMap = /* @__PURE__ */ new Map();
  for (const project of projects) {
    for (const entry of project.entries) {
      const toolCount = entry.tools.length;
      const splitUsage = {
        input_tokens: Math.round((entry.usage.input_tokens || 0) / toolCount),
        output_tokens: Math.round((entry.usage.output_tokens || 0) / toolCount),
        cache_read_input_tokens: Math.round((entry.usage.cache_read_input_tokens || 0) / toolCount),
        cache_creation: entry.usage.cache_creation ? {
          ephemeral_5m: Math.round((entry.usage.cache_creation.ephemeral_5m || 0) / toolCount),
          ephemeral_1h: Math.round((entry.usage.cache_creation.ephemeral_1h || 0) / toolCount)
        } : void 0
      };
      for (const tool of entry.tools) {
        if (!toolStatsMap.has(tool)) toolStatsMap.set(tool, /* @__PURE__ */ new Map());
        const modelMap = toolStatsMap.get(tool);
        if (!modelMap.has(entry.model)) modelMap.set(entry.model, createEmptyStats());
        const stats = modelMap.get(entry.model);
        stats.input += splitUsage.input_tokens || 0;
        stats.output += splitUsage.output_tokens || 0;
        stats.cacheRead += splitUsage.cache_read_input_tokens || 0;
        if (splitUsage.cache_creation) {
          stats.cache5m += splitUsage.cache_creation.ephemeral_5m || 0;
          stats.cache1h += splitUsage.cache_creation.ephemeral_1h || 0;
        }
        stats.calls += 1 / toolCount;
      }
    }
  }
  const results = [];
  for (const [tool, modelMap] of toolStatsMap.entries()) {
    let toolTokens = createEmptyStats();
    let toolCost = { inputCost: 0, outputCost: 0, cache5mCost: 0, cache1hCost: 0, cacheReadCost: 0, totalCost: 0 };
    for (const [model, tokens] of modelMap.entries()) {
      const cacheKey = toCacheKey(model) || model;
      const modelPricing = pricing[cacheKey] || pricing[model];
      if (!modelPricing) continue;
      const cost = calculateTokenCost(tokens, modelPricing);
      toolTokens.input += tokens.input;
      toolTokens.output += tokens.output;
      toolTokens.cache5m += tokens.cache5m;
      toolTokens.cache1h += tokens.cache1h;
      toolTokens.cacheRead += tokens.cacheRead;
      toolTokens.calls += tokens.calls;
      toolCost.inputCost += cost.inputCost;
      toolCost.outputCost += cost.outputCost;
      toolCost.cache5mCost += cost.cache5mCost;
      toolCost.cache1hCost += cost.cache1hCost;
      toolCost.cacheReadCost += cost.cacheReadCost;
      toolCost.totalCost += cost.totalCost;
    }
    results.push({ tool, usageCount: Math.round(toolTokens.calls), tokens: toolTokens, cost: toolCost });
  }
  results.sort((a, b) => b.cost.totalCost - a.cost.totalCost);
  return results;
}

// src/cost-analysis/subagent-analyzer.ts
import * as fs3 from "fs";
import * as path3 from "path";
function extractAgentId(filePath) {
  const match = filePath.match(/agent-([a-f0-9]+).jsonl/);
  return match ? match[1] : "unknown";
}
function extractProjectName(filePath) {
  const parts = filePath.replace(/\\/g, "/").split("/");
  const projectsIdx = parts.indexOf("projects");
  if (projectsIdx >= 0 && parts[projectsIdx + 1]) {
    return parts[projectsIdx + 1];
  }
  return "unknown";
}
function findSubagentFiles(timeFilter) {
  const filter = timeFilter || parseTimeFilter();
  const files = [];
  const directories = getProjectDirectories();
  for (const dir of directories) {
    const projectsDir = path3.join(dir);
    try {
      for (const projectDir of fs3.readdirSync(projectsDir)) {
        const projectPath = path3.join(projectsDir, projectDir);
        if (!fs3.statSync(projectPath).isDirectory()) continue;
        for (const sessionDir of fs3.readdirSync(projectPath)) {
          const subagentPath = path3.join(projectPath, sessionDir, "subagents");
          if (!fs3.existsSync(subagentPath)) continue;
          for (const file of fs3.readdirSync(subagentPath)) {
            if (!file.startsWith("agent-") || !file.endsWith(".jsonl")) continue;
            const fullPath = path3.join(subagentPath, file);
            try {
              const stat = fs3.statSync(fullPath);
              const mtime = stat.mtime.getTime();
              if (mtime >= filter.startTime && mtime <= filter.endTime) {
                files.push(fullPath);
              }
            } catch {
            }
          }
        }
      }
    } catch {
    }
  }
  return files;
}
function parseSubagentSession(filePath, timeFilter) {
  const filter = timeFilter || parseTimeFilter();
  try {
    const content = fs3.readFileSync(filePath, "utf8");
    const lines = content.split("\n").filter((l) => l.trim());
    const session = {
      id: extractAgentId(filePath),
      path: filePath,
      project: extractProjectName(filePath),
      calls: 0,
      tokens: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      cost: 0,
      mcpCalls: 0,
      nativeCalls: 0,
      mcpTools: {},
      nativeTools: {},
      model: "unknown"
    };
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== "assistant") continue;
        if (entry.timestamp) {
          const ts = new Date(entry.timestamp).getTime();
          if (ts < filter.startTime || ts > filter.endTime) continue;
        }
        if (entry.message?.model) {
          session.model = entry.message.model;
        }
        if (entry.message?.usage) {
          const u = entry.message.usage;
          session.tokens.input_tokens += u.input_tokens || 0;
          session.tokens.output_tokens += u.output_tokens || 0;
          session.tokens.cache_read_input_tokens += u.cache_read_input_tokens || 0;
          session.tokens.cache_creation_input_tokens += u.cache_creation_input_tokens || 0;
        }
        const blocks = entry.message?.content || [];
        for (const block of blocks) {
          if (block.type === "tool_use" && block.name) {
            session.calls++;
            if (block.name === "Bash" && block.input?.command) {
              const mcpTool = extractMcpTool(block.input);
              if (mcpTool) {
                session.mcpCalls++;
                session.mcpTools[mcpTool] = (session.mcpTools[mcpTool] || 0) + 1;
              } else {
                session.nativeCalls++;
                session.nativeTools["Bash"] = (session.nativeTools["Bash"] || 0) + 1;
              }
            } else {
              session.nativeCalls++;
              session.nativeTools[block.name] = (session.nativeTools[block.name] || 0) + 1;
            }
          }
        }
      } catch {
      }
    }
    if (session.calls === 0) return null;
    const pricing = getModelPricing(session.model);
    if (pricing) {
      session.cost = session.tokens.input_tokens * pricing.input / 1e6 + session.tokens.output_tokens * pricing.output / 1e6 + (session.tokens.cache_read_input_tokens || 0) * (pricing.cacheRead || pricing.input * 0.1) / 1e6;
    }
    return session;
  } catch {
    return null;
  }
}
async function analyzeSubagents(timeFilter) {
  const filter = timeFilter || parseTimeFilter();
  const files = findSubagentFiles(filter);
  const sessions = [];
  for (const file of files) {
    const session = parseSubagentSession(file, filter);
    if (session) {
      sessions.push(session);
    }
  }
  const totals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let totalCalls = 0;
  let totalMcpCalls = 0;
  let totalNativeCalls = 0;
  let totalCost = 0;
  for (const s of sessions) {
    totalCalls += s.calls;
    totalMcpCalls += s.mcpCalls;
    totalNativeCalls += s.nativeCalls;
    totalCost += s.cost;
    totals.input_tokens += s.tokens.input_tokens;
    totals.output_tokens += s.tokens.output_tokens;
    totals.cache_read_input_tokens = (totals.cache_read_input_tokens ?? 0) + (s.tokens.cache_read_input_tokens || 0);
    totals.cache_creation_input_tokens = (totals.cache_creation_input_tokens ?? 0) + (s.tokens.cache_creation_input_tokens || 0);
  }
  const topAgents = [...sessions].sort((a, b) => b.mcpCalls - a.mcpCalls).slice(0, 10);
  return {
    totalSessions: sessions.length,
    totalCalls,
    totalTokens: totals,
    totalCost,
    mcpCallPercent: totalCalls > 0 ? totalMcpCalls / totalCalls * 100 : 0,
    nativeCallPercent: totalCalls > 0 ? totalNativeCalls / totalCalls * 100 : 0,
    topAgents,
    sessions
  };
}

// src/cost-analysis/batch-analyzer.ts
import * as fs4 from "fs";
var BATCH_COST = 0.0139;
var NATIVE_WRITE_COST = 0.0973;
var NATIVE_READ_COST = 0.0255;
var NATIVE_EDIT_COST = 0.0383;
var NATIVE_GREP_COST = 0.0283;
var NATIVE_GLOB_COST = 0.0194;
var NATIVE_EXEC_COST = 0.0321;
function extractBatchPayload(command) {
  try {
    const jsonMatch = command.match(/mcp-cli\s+call\s+[^\s]+\s+'(\{[\s\S]*\})'/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    const stdinMatch = command.match(/mcp-cli\s+call\s+[^\s]+\s+-\s*<<['"]?EOF['"]?\n([\s\S]*?)\nEOF/);
    if (stdinMatch) {
      return JSON.parse(stdinMatch[1]);
    }
  } catch {
  }
  return null;
}
function countBatchOperations(payload) {
  const counts = { read: 0, write: 0, edit: 0, grep: 0, glob: 0, exec: 0, other: 0, total: 0 };
  if (payload.files) {
    counts.write += payload.files.length;
  }
  if (payload.edits) {
    counts.edit += payload.edits.length;
  }
  if (payload.queries) {
    for (const q of payload.queries) {
      if (q.type === "grep") counts.grep++;
      else if (q.type === "glob") counts.glob++;
      else counts.other++;
    }
  }
  if (payload.commands) {
    counts.exec += payload.commands.length;
  }
  if (payload.operations) {
    for (const op of payload.operations) {
      const tool = op.tool?.toLowerCase() || "";
      if (tool.includes("read")) counts.read++;
      else if (tool.includes("write")) counts.write++;
      else if (tool.includes("edit")) counts.edit++;
      else if (tool.includes("grep")) counts.grep++;
      else if (tool.includes("glob")) counts.glob++;
      else if (tool.includes("exec")) counts.exec++;
      else counts.other++;
    }
  }
  counts.total = counts.read + counts.write + counts.edit + counts.grep + counts.glob + counts.exec + counts.other;
  return counts;
}
function calculateBatchSavings(ops) {
  const nativeEquivalent = ops.read * NATIVE_READ_COST + ops.write * NATIVE_WRITE_COST + ops.edit * NATIVE_EDIT_COST + ops.grep * NATIVE_GREP_COST + ops.glob * NATIVE_GLOB_COST + ops.exec * NATIVE_EXEC_COST + ops.other * 0.02;
  const batchCost = BATCH_COST;
  const savings = nativeEquivalent - batchCost;
  const savingsPercent = nativeEquivalent > 0 ? savings / nativeEquivalent * 100 : 0;
  const multiplier = batchCost > 0 ? nativeEquivalent / batchCost : 0;
  return { batchCost, nativeEquivalent, savings, savingsPercent, multiplier };
}
function findBatchCalls(timeFilter) {
  const filter = timeFilter || parseTimeFilter();
  const calls = [];
  const directories = getProjectDirectories();
  for (const dir of directories) {
    for (const filePath of walkDir(dir)) {
      try {
        const content = fs4.readFileSync(filePath, "utf8");
        const lines = content.split("\n");
        for (const line of lines) {
          if (!line.includes("batch-engine/batch")) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.type !== "assistant") continue;
            if (entry.timestamp) {
              const ts = new Date(entry.timestamp).getTime();
              if (ts < filter.startTime || ts > filter.endTime) continue;
            }
            const blocks = entry.message?.content || [];
            for (const block of blocks) {
              if (block.type === "tool_use" && block.name === "Bash") {
                const cmd = block.input?.command || "";
                if (cmd.includes("batch-engine/batch")) {
                  const payload = extractBatchPayload(cmd);
                  const ops = payload ? countBatchOperations(payload) : { read: 0, write: 0, edit: 0, grep: 0, glob: 0, exec: 0, other: 0, total: 0 };
                  calls.push({
                    file: filePath,
                    timestamp: entry.timestamp || "",
                    command: cmd.substring(0, 500),
                    payload,
                    operationCount: ops.total,
                    operationsByType: ops
                  });
                }
              }
            }
          } catch {
          }
        }
      } catch {
      }
    }
  }
  return calls;
}
function analyzeBatches(timeFilter) {
  const calls = findBatchCalls(timeFilter);
  const totals = { read: 0, write: 0, edit: 0, grep: 0, glob: 0, exec: 0, other: 0, total: 0 };
  const analyzed = [];
  for (const call of calls) {
    const ops = call.operationsByType;
    totals.read += ops.read;
    totals.write += ops.write;
    totals.edit += ops.edit;
    totals.grep += ops.grep;
    totals.glob += ops.glob;
    totals.exec += ops.exec;
    totals.other += ops.other;
    totals.total += ops.total;
    const savings = calculateBatchSavings(ops);
    analyzed.push({ ...call, ...savings });
  }
  const totalBatchCost = calls.length * BATCH_COST;
  const totalNativeEquivalent = analyzed.reduce((sum, b) => sum + b.nativeEquivalent, 0);
  const totalSavings = totalNativeEquivalent - totalBatchCost;
  analyzed.sort((a, b) => b.multiplier - a.multiplier);
  return {
    totalBatches: calls.length,
    totalOperations: totals.total,
    operationsByType: totals,
    totalBatchCost,
    totalNativeEquivalent,
    totalSavings,
    avgSavingsPercent: totalNativeEquivalent > 0 ? totalSavings / totalNativeEquivalent * 100 : 0,
    avgOpsPerBatch: calls.length > 0 ? totals.total / calls.length : 0,
    greatestBatches: analyzed.slice(0, 10)
  };
}

// src/cost-analysis/tool-comparison.ts
var TOOL_CATEGORIES = {
  "Native File Tools": ["Read", "Edit", "Write"],
  "Precision File Tools": [
    "precision-engine/precision_read",
    "precision-engine/precision_edit",
    "precision-engine/precision_write"
  ],
  "Native Search Tools": ["Grep", "Glob"],
  "Precision Search Tools": [
    "precision-engine/precision_grep",
    "precision-engine/precision_glob",
    "precision-engine/discover"
  ],
  "Native Execution": ["Bash"],
  "Precision Execution": [
    "precision-engine/precision_exec",
    "precision-engine/precision_fetch"
  ],
  "Batch Engine": [
    "batch-engine/batch",
    "batch-engine/batch_status",
    "batch-engine/batch_list",
    "batch-engine/batch_recover",
    "batch-engine/batch_state",
    "batch-engine/batch_checkpoints"
  ],
  "Registry Engine": [
    "registry-engine/search_agents",
    "registry-engine/get_agent_content",
    "registry-engine/search_skills",
    "registry-engine/get_skill_content"
  ]
};
var COMPARISON_PAIRS = [
  {
    native: "Read",
    precision: "precision-engine/precision_read",
    label: "File Reading"
  },
  {
    native: "Edit",
    precision: "precision-engine/precision_edit",
    label: "File Editing"
  },
  {
    native: "Write",
    precision: "precision-engine/precision_write",
    label: "File Writing"
  },
  {
    native: "Grep",
    precision: "precision-engine/precision_grep",
    label: "Content Search"
  },
  {
    native: "Glob",
    precision: "precision-engine/discover",
    label: "File Discovery"
  },
  {
    native: "Bash",
    precision: "precision-engine/precision_exec",
    label: "Command Execution"
  }
];
function normalizeToolName(tool) {
  return tool.replace("mcp:call:plugin_goodvibes_", "").replace("mcp:info:plugin_goodvibes_", "info:").replace("mcp:call:", "").replace("mcp:info:", "info:").replace("plugin_goodvibes_", "");
}
function getToolCategory(toolName) {
  const normalized = normalizeToolName(toolName);
  for (const [category, tools] of Object.entries(TOOL_CATEGORIES)) {
    if (tools.some((t) => normalized === t || normalized.includes(t))) {
      return category;
    }
  }
  return "Other";
}
function calculateToolMetrics(tools) {
  return tools.filter((t) => t.tool !== "__text_response__").map((t) => {
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
      category
    };
  }).sort((a, b) => b.calls - a.calls);
}
function aggregateByCategory(metrics) {
  const categoryMap = /* @__PURE__ */ new Map();
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
      tools: tools.map((t) => t.displayName),
      totalCalls,
      avgInputPerCall,
      avgOutputPerCall,
      avgCachePerCall,
      avgTotalPerCall,
      avgCostPerCall,
      totalCost
    });
  }
  return results.sort((a, b) => b.totalCalls - a.totalCalls);
}
function calculateDelta(precision, native) {
  if (native === 0) return 0;
  return (precision - native) / native * 100;
}
function compareHeadToHead(metrics) {
  const comparisons = [];
  for (const pair of COMPARISON_PAIRS) {
    const nativeTool = metrics.find(
      (m) => m.displayName === pair.native || m.tool === pair.native
    );
    const precisionTool = metrics.find(
      (m) => m.displayName === pair.precision || m.tool.includes(pair.precision) || m.displayName.includes(pair.precision.split("/").pop() || "")
    );
    if (!nativeTool || !precisionTool) continue;
    comparisons.push({
      label: pair.label,
      nativeTool,
      precisionTool,
      deltas: {
        inputPercent: calculateDelta(
          precisionTool.inputPerCall,
          nativeTool.inputPerCall
        ),
        outputPercent: calculateDelta(
          precisionTool.outputPerCall,
          nativeTool.outputPerCall
        ),
        cachePercent: calculateDelta(
          precisionTool.cachePerCall,
          nativeTool.cachePerCall
        ),
        totalPercent: calculateDelta(
          precisionTool.totalPerCall,
          nativeTool.totalPerCall
        ),
        costPercent: calculateDelta(
          precisionTool.costPerCall,
          nativeTool.costPerCall
        )
      }
    });
  }
  return comparisons;
}
function generateComparison(tools) {
  const metrics = calculateToolMetrics(tools);
  const categories = aggregateByCategory(metrics);
  const headToHead = compareHeadToHead(metrics);
  return {
    metrics,
    categories,
    headToHead
  };
}

// src/cost-analysis/native-vs-mcp.ts
function classifyTools(tools) {
  const native = [];
  const mcp = [];
  const mcpInfo = [];
  for (const tool of tools) {
    const toolName = tool.tool.toLowerCase();
    if (toolName.startsWith("mcp:info:")) {
      mcpInfo.push(tool);
    } else if (toolName.startsWith("precision_") || toolName.startsWith("mcp:") || toolName === "discover" || toolName === "batch") {
      mcp.push(tool);
    } else {
      native.push(tool);
    }
  }
  return { native, mcp, mcpInfo };
}
function calculateMcpInfoOverhead(tools, classified) {
  const { mcp, mcpInfo } = classified || classifyTools(tools);
  const totalInfoCalls = mcpInfo.reduce((sum, t) => sum + t.usageCount, 0);
  const totalInfoCost = mcpInfo.reduce((sum, t) => sum + t.cost.totalCost, 0);
  const totalMcpCalls = mcp.reduce((sum, t) => sum + t.usageCount, 0);
  const totalMcpCost = mcp.reduce((sum, t) => sum + t.cost.totalCost, 0);
  const infoRatio = totalMcpCalls > 0 ? totalInfoCalls / totalMcpCalls * 100 : 0;
  const costRatio = totalMcpCost > 0 ? totalInfoCost / totalMcpCost * 100 : 0;
  const perCallOverhead = totalMcpCalls > 0 ? totalInfoCost / totalMcpCalls : 0;
  return {
    totalInfoCalls,
    totalInfoCost,
    infoRatio,
    costRatio,
    perCallOverhead
  };
}
function aggregateTools(tools) {
  const tokens = {
    input: 0,
    output: 0,
    cache5m: 0,
    cache1h: 0,
    cacheRead: 0,
    calls: 0
  };
  const cost = {
    inputCost: 0,
    outputCost: 0,
    cache5mCost: 0,
    cache1hCost: 0,
    cacheReadCost: 0,
    totalCost: 0
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
function summarizeNativeVsMcp(tools) {
  const classified = classifyTools(tools);
  const infoOverhead = calculateMcpInfoOverhead(tools, classified);
  const nativeAgg = aggregateTools(classified.native);
  const nativeTotalCalls = nativeAgg.tokens.calls;
  const nativeTotalCost = nativeAgg.cost.totalCost;
  const nativePerCallCost = nativeTotalCalls > 0 ? nativeTotalCost / nativeTotalCalls : 0;
  const mcpAgg = aggregateTools(classified.mcp);
  const mcpTotalCalls = mcpAgg.tokens.calls;
  const mcpTotalCost = mcpAgg.cost.totalCost;
  const mcpPerCallCost = mcpTotalCalls > 0 ? mcpTotalCost / mcpTotalCalls : 0;
  const mcpInfoAgg = aggregateTools(classified.mcpInfo);
  const mcpWithInfoTotalCost = mcpTotalCost + mcpInfoAgg.cost.totalCost;
  const mcpWithInfoPerCallCost = mcpTotalCalls > 0 ? mcpWithInfoTotalCost / mcpTotalCalls : 0;
  const mcpWithInfoTokens = {
    input: mcpAgg.tokens.input + mcpInfoAgg.tokens.input,
    output: mcpAgg.tokens.output + mcpInfoAgg.tokens.output,
    cache5m: mcpAgg.tokens.cache5m + mcpInfoAgg.tokens.cache5m,
    cache1h: mcpAgg.tokens.cache1h + mcpInfoAgg.tokens.cache1h,
    cacheRead: mcpAgg.tokens.cacheRead + mcpInfoAgg.tokens.cacheRead,
    calls: mcpTotalCalls
    // Info calls don't count as separate calls
  };
  const mcpWithInfoCost = {
    inputCost: mcpAgg.cost.inputCost + mcpInfoAgg.cost.inputCost,
    outputCost: mcpAgg.cost.outputCost + mcpInfoAgg.cost.outputCost,
    cache5mCost: mcpAgg.cost.cache5mCost + mcpInfoAgg.cost.cache5mCost,
    cache1hCost: mcpAgg.cost.cache1hCost + mcpInfoAgg.cost.cache1hCost,
    cacheReadCost: mcpAgg.cost.cacheReadCost + mcpInfoAgg.cost.cacheReadCost,
    totalCost: mcpWithInfoTotalCost
  };
  return {
    native: {
      totalCalls: nativeTotalCalls,
      totalCost: nativeTotalCost,
      perCallCost: nativePerCallCost,
      tokens: nativeAgg.tokens,
      cost: nativeAgg.cost
    },
    mcp: {
      totalCalls: mcpTotalCalls,
      totalCost: mcpTotalCost,
      perCallCost: mcpPerCallCost,
      tokens: mcpAgg.tokens,
      cost: mcpAgg.cost
    },
    mcpWithInfo: {
      totalCalls: mcpTotalCalls,
      totalCost: mcpWithInfoTotalCost,
      perCallCost: mcpWithInfoPerCallCost,
      tokens: mcpWithInfoTokens,
      cost: mcpWithInfoCost
    },
    infoOverhead
  };
}

// src/cost-analysis/formatter.ts
function formatOutput(result, format) {
  switch (format) {
    case "text":
      return formatText(result);
    case "json":
      return formatJson(result);
    case "markdown":
      return formatMarkdown(result);
    case "minimal":
      return formatMinimal(result);
    default:
      return formatText(result);
  }
}
function formatText(result) {
  const lines = [];
  lines.push("=".repeat(120));
  lines.push(`COMPLETE COST ANALYSIS: ${result.timeRange.description}`);
  lines.push("=".repeat(120));
  lines.push("\n\nPROJECT BREAKDOWN:");
  lines.push("-".repeat(100));
  for (const project of result.projects) {
    const shortName = project.project.replace("C--Users-buzzkill-Documents-", "").substring(0, 50);
    const costStr = `$${project.cost.totalCost.toFixed(2)}`;
    const calls = project.models.reduce((sum, m) => sum + m.tokens.calls, 0);
    lines.push(
      shortName.padEnd(55) + calls.toString().padStart(7) + " calls   " + costStr.padStart(10)
    );
  }
  lines.push("\n\nMODEL TOTALS:");
  lines.push("-".repeat(100));
  for (const modelResult of result.models) {
    const { tokens, cost, displayName } = modelResult;
    lines.push(displayName.padEnd(20) + tokens.calls.toString().padStart(8) + " calls");
    lines.push(
      "  Input:       " + tokens.input.toLocaleString().padStart(15) + " tokens   $" + cost.inputCost.toFixed(2)
    );
    lines.push(
      "  Output:      " + tokens.output.toLocaleString().padStart(15) + " tokens   $" + cost.outputCost.toFixed(2)
    );
    lines.push(
      "  Cache5m:     " + tokens.cache5m.toLocaleString().padStart(15) + " tokens   $" + cost.cache5mCost.toFixed(2)
    );
    lines.push(
      "  Cache1h:     " + tokens.cache1h.toLocaleString().padStart(15) + " tokens   $" + cost.cache1hCost.toFixed(2)
    );
    lines.push(
      "  CacheRead:   " + tokens.cacheRead.toLocaleString().padStart(15) + " tokens   $" + cost.cacheReadCost.toFixed(2)
    );
    lines.push("  SUBTOTAL:    $" + cost.totalCost.toFixed(2));
    lines.push("");
  }
  const grandCalls = result.grandTotal.tokens.calls;
  const grandCost = result.grandTotal.cost.totalCost;
  lines.push(
    "GRAND TOTAL: " + grandCalls.toLocaleString() + " calls, $" + grandCost.toFixed(2)
  );
  if (result.tools && result.tools.length > 0) {
    lines.push("\n\nTOOL BREAKDOWN (Top " + result.tools.length + "):");
    lines.push("-".repeat(100));
    for (const tool of result.tools) {
      const name = tool.tool === "__text_response__" ? "(text only)" : tool.tool;
      const costStr = `$${tool.cost.totalCost.toFixed(2)}`;
      lines.push(
        name.padEnd(60) + tool.usageCount.toString().padStart(7) + " calls   " + costStr.padStart(10)
      );
    }
  }
  if (result.mcpToolsSummary && result.mcpToolsSummary.topTools.length > 0) {
    lines.push("\n\nMCP TOOLS ONLY:");
    lines.push("-".repeat(100));
    for (const tool of result.mcpToolsSummary.topTools) {
      const costStr = `$${tool.cost.totalCost.toFixed(2)}`;
      lines.push(
        tool.tool.padEnd(60) + tool.usageCount.toString().padStart(7) + " calls   " + costStr.padStart(10)
      );
    }
    lines.push("-".repeat(100));
    lines.push(
      `MCP TOTAL: ${result.mcpToolsSummary.totalCalls} calls, $${result.mcpToolsSummary.cost.totalCost.toFixed(2)}`
    );
  }
  if (result.subagents) {
    lines.push("\n\nSUBAGENT ANALYSIS:");
    lines.push("-".repeat(100));
    lines.push(`Sessions: ${result.subagents.totalSessions} | Calls: ${result.subagents.totalCalls}`);
    lines.push(`MCP: ${result.subagents.mcpCallPercent.toFixed(1)}% | Native: ${result.subagents.nativeCallPercent.toFixed(1)}%`);
    lines.push(`Cost: $${result.subagents.totalCost.toFixed(2)}`);
  }
  if (result.batches) {
    lines.push("\n\nBATCH ANALYSIS:");
    lines.push("-".repeat(100));
    lines.push(`Batches: ${result.batches.totalBatches} | Operations: ${result.batches.totalOperations}`);
    lines.push(`Savings: $${result.batches.totalSavings.toFixed(2)} (${result.batches.avgSavingsPercent.toFixed(1)}%)`);
  }
  if (result.nativeVsMcp) {
    lines.push("\n\nNATIVE VS MCP:");
    lines.push("-".repeat(100));
    lines.push(`Native: ${result.nativeVsMcp.native.totalCalls} calls, $${result.nativeVsMcp.native.totalCost.toFixed(2)}`);
    lines.push(`MCP: ${result.nativeVsMcp.mcp.totalCalls} calls, $${result.nativeVsMcp.mcp.totalCost.toFixed(2)}`);
  }
  return lines.join("\n");
}
function formatJson(result) {
  return JSON.stringify(result, null, 2);
}
function formatMarkdown(result) {
  const lines = [];
  lines.push(`# Cost Analysis: ${result.timeRange.description}
`);
  lines.push("## Project Breakdown\n");
  lines.push("| Project | Calls | Cost |");
  lines.push("|---------|-------|------|");
  for (const project of result.projects) {
    const shortName = project.project.replace("C--Users-buzzkill-Documents-", "");
    const calls = project.models.reduce((sum, m) => sum + m.tokens.calls, 0);
    lines.push(`| ${shortName} | ${calls} | $${project.cost.totalCost.toFixed(2)} |`);
  }
  lines.push("\n## Model Totals\n");
  lines.push("| Model | Calls | Input | Output | Cache5m | Cache1h | CacheRead | Cost |");
  lines.push("|-------|-------|-------|--------|---------|---------|-----------|------|");
  for (const model of result.models) {
    lines.push(
      `| ${model.displayName} | ${model.tokens.calls} | ${model.tokens.input.toLocaleString()} | ${model.tokens.output.toLocaleString()} | ${model.tokens.cache5m.toLocaleString()} | ${model.tokens.cache1h.toLocaleString()} | ${model.tokens.cacheRead.toLocaleString()} | $${model.cost.totalCost.toFixed(2)} |`
    );
  }
  if (result.tools && result.tools.length > 0) {
    lines.push("\n## Tool Breakdown\n");
    lines.push("| Tool | Calls | Cost |");
    lines.push("|------|-------|------|");
    for (const tool of result.tools) {
      const name = tool.tool === "__text_response__" ? "(text only)" : tool.tool;
      lines.push(`| ${name} | ${tool.usageCount} | $${tool.cost.totalCost.toFixed(2)} |`);
    }
  }
  lines.push("\n## Grand Total\n");
  lines.push(
    `**${result.grandTotal.tokens.calls.toLocaleString()} calls, $${result.grandTotal.cost.totalCost.toFixed(2)}**`
  );
  if (result.comparisons && result.comparisons.headToHead) {
    lines.push("\n## Native vs MCP Tool Comparison\n");
    lines.push("| Operation | Native Tool | Native Cost | MCP Tool | MCP Cost | Savings |");
    lines.push("|-----------|-------------|-------------|----------|----------|---------|");
    for (const comp of result.comparisons.headToHead) {
      const nCost = comp.nativeTool?.totalCost?.toFixed(2) || "0.00";
      const mCost = comp.precisionTool?.totalCost?.toFixed(2) || "0.00";
      const save = comp.deltas?.costPercent?.toFixed(1) || "0.0";
      lines.push(`| ${comp.label} | ${comp.nativeTool?.displayName || "N/A"} | $${nCost} | ${comp.precisionTool?.displayName || "N/A"} | $${mCost} | ${save}% |`);
    }
  }
  if (result.subagents) {
    lines.push("\n## Subagent Analysis\n");
    lines.push(`**Sessions:** ${result.subagents.totalSessions} | **Calls:** ${result.subagents.totalCalls} | **Cost:** $${result.subagents.totalCost.toFixed(2)}`);
    lines.push(`**MCP Usage:** ${result.subagents.mcpCallPercent.toFixed(1)}% | **Native Usage:** ${result.subagents.nativeCallPercent.toFixed(1)}%`);
  }
  if (result.batches) {
    lines.push("\n## Batch Analysis\n");
    lines.push(`**Batches:** ${result.batches.totalBatches} | **Operations:** ${result.batches.totalOperations}`);
    lines.push(`**Savings:** $${result.batches.totalSavings.toFixed(2)} (${result.batches.avgSavingsPercent.toFixed(1)}%)`);
  }
  if (result.nativeVsMcp) {
    lines.push("\n## Native vs MCP Summary\n");
    lines.push(`**Native:** ${result.nativeVsMcp.native.totalCalls} calls, $${result.nativeVsMcp.native.totalCost.toFixed(2)}`);
    lines.push(`**MCP:** ${result.nativeVsMcp.mcp.totalCalls} calls, $${result.nativeVsMcp.mcp.totalCost.toFixed(2)}`);
  }
  return lines.join("\n");
}
function formatMinimal(result) {
  return `Cost: $${result.grandTotal.cost.totalCost.toFixed(2)} | Calls: ${result.grandTotal.tokens.calls.toLocaleString()} | Period: ${result.timeRange.description}`;
}

// src/cost-analysis/index.ts
async function analyzeCosts(options = {}) {
  const pricing = loadPricing();
  const timeRange = parseTimeFilter(options.timeFilter);
  const parsedProjects = parseAllProjects({
    timeFilter: options.timeFilter,
    projectFilter: options.projectFilter,
    modelFilter: options.modelFilter
  });
  const projects = aggregateByProject(parsedProjects, pricing);
  const models = aggregateByModel(parsedProjects, pricing);
  const includeTools = options.includeTools !== false;
  const topToolsLimit = options.topToolsLimit || 40;
  let tools;
  let mcpToolsSummary;
  if (includeTools) {
    const allTools = aggregateByTool(parsedProjects, pricing);
    tools = allTools.slice(0, topToolsLimit);
    const mcpTools = allTools.filter((t) => t.tool.startsWith("mcp:"));
    if (mcpTools.length > 0) {
      const mcpTotalCalls = mcpTools.reduce((sum, t) => sum + t.usageCount, 0);
      const mcpTokens = {
        input: mcpTools.reduce((sum, t) => sum + t.tokens.input, 0),
        output: mcpTools.reduce((sum, t) => sum + t.tokens.output, 0),
        cache5m: mcpTools.reduce((sum, t) => sum + t.tokens.cache5m, 0),
        cache1h: mcpTools.reduce((sum, t) => sum + t.tokens.cache1h, 0),
        cacheRead: mcpTools.reduce((sum, t) => sum + t.tokens.cacheRead, 0),
        calls: mcpTotalCalls
      };
      const mcpCost = {
        inputCost: mcpTools.reduce((sum, t) => sum + t.cost.inputCost, 0),
        outputCost: mcpTools.reduce((sum, t) => sum + t.cost.outputCost, 0),
        cache5mCost: mcpTools.reduce((sum, t) => sum + t.cost.cache5mCost, 0),
        cache1hCost: mcpTools.reduce((sum, t) => sum + t.cost.cache1hCost, 0),
        cacheReadCost: mcpTools.reduce((sum, t) => sum + t.cost.cacheReadCost, 0),
        totalCost: mcpTools.reduce((sum, t) => sum + t.cost.totalCost, 0)
      };
      mcpToolsSummary = {
        totalTools: mcpTools.length,
        totalCalls: mcpTotalCalls,
        tokens: mcpTokens,
        cost: mcpCost,
        topTools: mcpTools
      };
    }
  }
  const grandTotal = {
    tokens: {
      input: models.reduce((sum, m) => sum + m.tokens.input, 0),
      output: models.reduce((sum, m) => sum + m.tokens.output, 0),
      cache5m: models.reduce((sum, m) => sum + m.tokens.cache5m, 0),
      cache1h: models.reduce((sum, m) => sum + m.tokens.cache1h, 0),
      cacheRead: models.reduce((sum, m) => sum + m.tokens.cacheRead, 0),
      calls: models.reduce((sum, m) => sum + m.tokens.calls, 0)
    },
    cost: {
      inputCost: models.reduce((sum, m) => sum + m.cost.inputCost, 0),
      outputCost: models.reduce((sum, m) => sum + m.cost.outputCost, 0),
      cache5mCost: models.reduce((sum, m) => sum + m.cost.cache5mCost, 0),
      cache1hCost: models.reduce((sum, m) => sum + m.cost.cache1hCost, 0),
      cacheReadCost: models.reduce((sum, m) => sum + m.cost.cacheReadCost, 0),
      totalCost: models.reduce((sum, m) => sum + m.cost.totalCost, 0)
    }
  };
  let subagents;
  let batches;
  let nativeVsMcp;
  let comparisons;
  if (options.includeSubagents) {
    subagents = await analyzeSubagents(timeRange);
  }
  if (options.includeBatches) {
    batches = await analyzeBatches(timeRange);
  }
  if (options.includeNativeVsMcp || options.includeComparisons) {
    const allTools = aggregateByTool(parsedProjects, pricing);
    nativeVsMcp = summarizeNativeVsMcp(allTools);
  }
  if (options.includeComparisons) {
    const allTools = aggregateByTool(parsedProjects, pricing);
    comparisons = generateComparison(allTools);
  }
  return {
    timeRange,
    projects,
    models,
    tools,
    grandTotal,
    mcpToolsSummary,
    subagents,
    batches,
    nativeVsMcp,
    comparisons
  };
}

// src/cost-analysis-cli.ts
function printHelp() {
  console.log(`
Cost Analysis CLI - Analyze Claude API usage and costs

USAGE:
  cost-analysis [OPTIONS]

OPTIONS:
  -s, --start <date>       Start date (ISO format: 2026-01-15T16:00:00Z)
  -e, --end <date>         End date (ISO format)
  -l, --last <period>      Relative time period (e.g., "7d", "24h", "2w", "1m")
  -p, --project <name>     Filter to specific project(s) (can be used multiple times)
  -m, --model <id>         Filter to specific model(s) (can be used multiple times)
  -f, --format <format>    Output format: text, json, markdown, minimal (default: text)
  --top-tools <n>          Limit tool breakdown to top N tools (default: 40)
  --no-tools               Exclude tool breakdown from output
  --group-by <period>      Group results by period: daily, weekly, monthly, session
  --subagents              Include subagent session analysis
  --batches                Include batch engine analysis
  --compare                Include native vs MCP tool comparison
  --per-call               Include per-call token metrics
  --all                    Enable all extended analysis modes
  -h, --help               Show this help message

EXAMPLES:
  # Analyze last 7 days with default text output
  cost-analysis --last 7d

  # Analyze specific date range
  cost-analysis --start 2026-01-15T00:00:00Z --end 2026-01-22T23:59:59Z

  # Filter to specific project with JSON output
  cost-analysis --last 30d --project "my-project" --format json

  # Show only top 10 tools
  cost-analysis --last 7d --top-tools 10

  # Minimal one-line summary for the last 24 hours
  cost-analysis --last 24h --format minimal

  # Export to markdown report
  cost-analysis --last 1m --format markdown > report.md

  # Exclude tool breakdown for cleaner output
  cost-analysis --last 7d --no-tools
`);
}
async function main() {
  try {
    const { values } = parseArgs({
      options: {
        start: {
          type: "string",
          short: "s"
        },
        end: {
          type: "string",
          short: "e"
        },
        last: {
          type: "string",
          short: "l"
        },
        project: {
          type: "string",
          short: "p",
          multiple: true
        },
        model: {
          type: "string",
          short: "m",
          multiple: true
        },
        format: {
          type: "string",
          short: "f",
          default: "text"
        },
        "top-tools": {
          type: "string"
        },
        "no-tools": {
          type: "boolean"
        },
        "group-by": {
          type: "string"
        },
        subagents: {
          type: "boolean"
        },
        batches: {
          type: "boolean"
        },
        compare: {
          type: "boolean"
        },
        "per-call": {
          type: "boolean"
        },
        all: {
          type: "boolean"
        },
        help: {
          type: "boolean",
          short: "h"
        }
      },
      allowPositionals: false
    });
    if (values.help) {
      printHelp();
      process.exit(0);
    }
    let timeFilter;
    if (values.start || values.end) {
      timeFilter = {
        type: "absolute",
        startDate: values.start,
        endDate: values.end
      };
    } else if (values.last) {
      if (!/^\d+[hdwm]$/.test(values.last)) {
        console.error("Error: Invalid --last format. Use format like: 7d, 24h, 2w, 1m");
        process.exit(1);
      }
      timeFilter = {
        type: "relative",
        relativeStart: values.last
      };
    }
    const validFormats = ["text", "json", "markdown", "minimal"];
    const format = values.format || "text";
    if (!validFormats.includes(format)) {
      console.error(`Error: Invalid format "${format}". Must be one of: ${validFormats.join(", ")}`);
      process.exit(1);
    }
    const options = {
      timeFilter,
      outputFormat: format
    };
    if (values.project) {
      options.projectFilter = Array.isArray(values.project) ? values.project : [values.project];
    }
    if (values.model) {
      options.modelFilter = Array.isArray(values.model) ? values.model : [values.model];
    }
    if (values["top-tools"]) {
      const topTools = parseInt(values["top-tools"], 10);
      if (isNaN(topTools) || topTools < 1) {
        console.error("Error: --top-tools must be a positive integer");
        process.exit(1);
      }
      options.topToolsLimit = topTools;
    }
    if (values["no-tools"]) {
      options.includeTools = false;
    }
    if (values["group-by"]) {
      const validGroupBy = ["none", "daily", "weekly", "monthly", "session"];
      if (!validGroupBy.includes(values["group-by"])) {
        console.error(`Error: Invalid --group-by "${values["group-by"]}". Must be one of: ${validGroupBy.join(", ")}`);
        process.exit(1);
      }
      options.groupBy = values["group-by"];
    }
    if (values.subagents || values.all) {
      options.includeSubagents = true;
    }
    if (values.batches || values.all) {
      options.includeBatches = true;
    }
    if (values.compare || values.all) {
      options.includeComparisons = true;
      options.includeNativeVsMcp = true;
    }
    const result = await analyzeCosts(options);
    const output = formatOutput(result, format);
    console.log(output);
    process.exit(0);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
main();
