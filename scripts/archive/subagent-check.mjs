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
let mainCount = 0, subagentCount = 0;
let mainFiles = 0, subagentFiles = 0;

for (const file of walkDir(projectsDir)) {
  const isSubagent = path.basename(file).startsWith("agent-");
  let hasRecentData = false;
  
  try {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n").filter(l => l.trim());
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const ts = new Date(entry.timestamp).getTime();
        if (ts >= cutoffTime && entry.type === "assistant" && Array.isArray(entry.message?.content)) {
          hasRecentData = true;
          for (const block of entry.message.content) {
            if (block.type === "tool_use") {
              if (isSubagent) subagentCount++;
              else mainCount++;
            }
          }
        }
      } catch {}
    }
  } catch {}
  
  if (hasRecentData) {
    if (isSubagent) subagentFiles++;
    else mainFiles++;
  }
}

console.log("=== 48H TOOL CALLS BY SOURCE ===\n");
console.log("Main sessions:    " + mainCount.toString().padStart(6) + " calls from " + mainFiles + " sessions");
console.log("Subagent sessions:" + subagentCount.toString().padStart(6) + " calls from " + subagentFiles + " sessions");
console.log("Total:            " + (mainCount + subagentCount).toString().padStart(6) + " calls");
console.log("\nSubagent %: " + (subagentCount / (mainCount + subagentCount) * 100).toFixed(1) + "%");

