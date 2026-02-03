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
const toolCalls = [];

for (const file of walkDir(projectsDir)) {
  try {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n").filter(l => l.trim());
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const ts = new Date(entry.timestamp).getTime();
        if (ts >= cutoffTime && entry.type === "assistant" && Array.isArray(entry.message?.content)) {
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
              toolCalls.push({ tool: toolName, timestamp: entry.timestamp });
            }
          }
        }
      } catch {}
    }
  } catch {}
}

const toolCounts = {};
toolCalls.forEach(t => toolCounts[t.tool] = (toolCounts[t.tool] || 0) + 1);
const sorted = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]);

console.log("=== TOOL USE OVER LAST " + HOURS + " HOURS ===");
console.log("Period: " + new Date(cutoffTime).toISOString() + " to " + new Date().toISOString());
console.log("Total: " + toolCalls.length + "\n");

console.log("Tool".padEnd(35) + "Calls".padStart(8) + "  %".padStart(8));
console.log("-".repeat(55));
sorted.forEach(([t, c]) => console.log(t.padEnd(35) + c.toString().padStart(8) + ((c/toolCalls.length*100).toFixed(1)+"%").padStart(8)));

let native = 0, mcp = 0, info = 0;
for (const [t, c] of Object.entries(toolCounts)) {
  if (t.startsWith("MCP:")) { if (t === "MCP:info") info += c; else mcp += c; }
  else native += c;
}
console.log("\n=== NATIVE vs MCP ===\n");
console.log("Native: " + native + " (" + (native/toolCalls.length*100).toFixed(1) + "%)");
console.log("MCP:    " + mcp + " (" + (mcp/toolCalls.length*100).toFixed(1) + "%)");
console.log("Info:   " + info + " (" + (info/toolCalls.length*100).toFixed(1) + "%)");
console.log("Call-to-info ratio: " + (mcp / Math.max(info, 1)).toFixed(1) + ":1");

