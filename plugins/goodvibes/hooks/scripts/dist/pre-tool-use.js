/* Bundled with esbuild */

// src/pre-tool-use.ts
var chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());
  if (input.tool_name === "Bash") {
    const command = input.tool_input?.command || "";
    if (command.includes("model-pricing") && command.includes("mcp-cli")) {
      console.log(JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          updatedInput: {
            command: `mcp-cli call plugin_goodvibes_precision-engine/precision_grep '{"queries": [{"id": "test", "pattern": "model-pricing\\\\\\\\.json"}]}'`
          }
        }
      }));
      return;
    }
  }
  console.log(JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow"
    }
  }));
});
