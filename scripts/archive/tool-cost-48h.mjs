import fs from "fs";
import path from "path";
import os from "os";

const HOURS = 48;
const cutoffTime = Date.now() - (HOURS * 60 * 60 * 1000);

function* walkDir(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) yield* walkDir(fullPath);
      else if (entry.name.endsWith(".jsonl")) yield fullPath;
    }
  } catch {}
}

const projectsDir = path.join(os.homedir(), ".claude", "projects");
const toolStats = {};
let totalCost = 0;
let totalInputTokens = 0;
let totalOutputTokens = 0;

for (const file of walkDir(projectsDir)) {
  try {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n").filter(l => l.trim());
    
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const ts = new Date(entry.timestamp).getTime();
        if (ts < cutoffTime) continue;
        
        // Extract cost from API responses
        if (entry.costUSD) totalCost += entry.costUSD;
        if (entry.message?.usage) {
          totalInputTokens += entry.message.usage.input_tokens || 0;
          totalOutputTokens += entry.message.usage.output_tokens || 0;
        }
        
        // Count tool uses
        if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
          const msgCost = entry.costUSD || 0;
          const toolsInMsg = [];
          
          for (const block of entry.message.content) {
            if (block.type === "tool_use") {
              let toolName = block.name;
              if (toolName === "Bash" && block.input?.command) {
                const cmd = block.input.command;
                if (cmd.includes("mcp-cli call")) {
                  const m = cmd.match(/mcp-cli call ([^\s]+)/);
                  if (m) toolName = "MCP:" + m[1].split("/").pop();
                } else if (cmd.includes("mcp-cli info")) {
                  toolName = "MCP:info";
                }
              }
              toolsInMsg.push(toolName);
            }
          }
          
          // Distribute cost across tools in message
          const costPerTool = toolsInMsg.length > 0 ? msgCost / toolsInMsg.length : 0;
          for (const tool of toolsInMsg) {
            if (!toolStats[tool]) toolStats[tool] = { calls: 0, cost: 0 };
            toolStats[tool].calls++;
            toolStats[tool].cost += costPerTool;
          }
        }
      } catch {}
    }
  } catch {}
}

// Calculate stats
const sorted = Object.entries(toolStats)
  .map(([name, s]) => ({
    name,
    calls: s.calls,
    cost: s.cost,
    perCall: s.calls > 0 ? s.cost / s.calls : 0,
    per100: s.calls > 0 ? (s.cost / s.calls) * 100 : 0
  }))
  .sort((a, b) => b.calls - a.calls);

const totalCalls = sorted.reduce((sum, t) => sum + t.calls, 0);
const toolCost = sorted.reduce((sum, t) => sum + t.cost, 0);

// MCP info overhead
const infoStats = toolStats["MCP:info"] || { calls: 0, cost: 0 };
const mcpTools = sorted.filter(t => t.name.startsWith("MCP:") && t.name !== "MCP:info");
const mcpCalls = mcpTools.reduce((sum, t) => sum + t.calls, 0);
const mcpCost = mcpTools.reduce((sum, t) => sum + t.cost, 0);

console.log("=== 48-HOUR TOOL COST ANALYSIS ===");
console.log("Period: " + new Date(cutoffTime).toISOString().slice(0,16) + " to " + new Date().toISOString().slice(0,16));
console.log("Total Cost: $" + totalCost.toFixed(2));
console.log("Total Calls: " + totalCalls + "\n");

console.log("=== PER-TOOL BREAKDOWN ===\n");
console.log("Tool".padEnd(30) + "Calls".padStart(7) + "Cost".padStart(10) + "$/call".padStart(10) + "$/100".padStart(10));
console.log("-".repeat(67));

sorted.slice(0, 30).forEach(t => {
  console.log(
    t.name.padEnd(30) +
    t.calls.toString().padStart(7) +
    ("$" + t.cost.toFixed(2)).padStart(10) +
    ("$" + t.perCall.toFixed(4)).padStart(10) +
    ("$" + t.per100.toFixed(2)).padStart(10)
  );
});

console.log("\n=== MCP OVERHEAD ANALYSIS ===\n");
console.log("MCP tool calls:     " + mcpCalls);
console.log("MCP tool cost:      $" + mcpCost.toFixed(2));
console.log("MCP info calls:     " + infoStats.calls);
console.log("MCP info cost:      $" + infoStats.cost.toFixed(2));
console.log("Call-to-info ratio: " + (mcpCalls / Math.max(infoStats.calls, 1)).toFixed(1) + ":1");
console.log("\nRaw MCP $/call:      $" + (mcpCost / Math.max(mcpCalls, 1)).toFixed(4));
console.log("Info overhead/call:  $" + (infoStats.cost / Math.max(mcpCalls, 1)).toFixed(4));
console.log("Adjusted MCP $/call: $" + ((mcpCost + infoStats.cost) / Math.max(mcpCalls, 1)).toFixed(4));
console.log("Adjusted MCP $/100:  $" + (((mcpCost + infoStats.cost) / Math.max(mcpCalls, 1)) * 100).toFixed(2));

// Native equivalents
const nativeTools = sorted.filter(t => !t.name.startsWith("MCP:"));
const nativeCalls = nativeTools.reduce((sum, t) => sum + t.calls, 0);
const nativeCost = nativeTools.reduce((sum, t) => sum + t.cost, 0);

console.log("\n=== NATIVE vs MCP COMPARISON ===\n");
console.log("Category".padEnd(20) + "Calls".padStart(8) + "Cost".padStart(12) + "$/call".padStart(10) + "$/100".padStart(10));
console.log("-".repeat(60));
console.log("Native".padEnd(20) + nativeCalls.toString().padStart(8) + ("$" + nativeCost.toFixed(2)).padStart(12) + ("$" + (nativeCost/Math.max(nativeCalls,1)).toFixed(4)).padStart(10) + ("$" + ((nativeCost/Math.max(nativeCalls,1))*100).toFixed(2)).padStart(10));
console.log("MCP (raw)".padEnd(20) + mcpCalls.toString().padStart(8) + ("$" + mcpCost.toFixed(2)).padStart(12) + ("$" + (mcpCost/Math.max(mcpCalls,1)).toFixed(4)).padStart(10) + ("$" + ((mcpCost/Math.max(mcpCalls,1))*100).toFixed(2)).padStart(10));
console.log("MCP (adjusted)".padEnd(20) + mcpCalls.toString().padStart(8) + ("$" + (mcpCost+infoStats.cost).toFixed(2)).padStart(12) + ("$" + ((mcpCost+infoStats.cost)/Math.max(mcpCalls,1)).toFixed(4)).padStart(10) + ("$" + (((mcpCost+infoStats.cost)/Math.max(mcpCalls,1))*100).toFixed(2)).padStart(10));

// Group comparison
console.log("\n=== GROUPED TOOL COMPARISON ===\n");

const groups = {
  "Read ops (Native)": ["Read"],
  "Read ops (MCP)": ["MCP:precision_read"],
  "Search ops (Native)": ["Grep", "Glob"],
  "Search ops (MCP)": ["MCP:precision_grep", "MCP:precision_glob", "MCP:discover"],
  "Modify ops (Native)": ["Edit", "Write"],
  "Modify ops (MCP)": ["MCP:precision_edit", "MCP:precision_write"],
  "Exec ops (Native)": ["Bash"],
  "Exec ops (MCP)": ["MCP:precision_exec"]
};

console.log("Group".padEnd(25) + "Calls".padStart(8) + "Cost".padStart(12) + "$/call".padStart(10) + "$/100".padStart(10));
console.log("-".repeat(65));

for (const [group, tools] of Object.entries(groups)) {
  const gCalls = tools.reduce((sum, t) => sum + (toolStats[t]?.calls || 0), 0);
  const gCost = tools.reduce((sum, t) => sum + (toolStats[t]?.cost || 0), 0);
  if (gCalls > 0) {
    console.log(
      group.padEnd(25) +
      gCalls.toString().padStart(8) +
      ("$" + gCost.toFixed(2)).padStart(12) +
      ("$" + (gCost/gCalls).toFixed(4)).padStart(10) +
      ("$" + ((gCost/gCalls)*100).toFixed(2)).padStart(10)
    );
  }
}

