/* Bundled with esbuild */

// src/shared/hook-io.ts
import { stdin } from "process";
function isValidHookInput(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value;
  return typeof obj.session_id === "string" && typeof obj.cwd === "string" && typeof obj.hook_event_name === "string";
}
async function readHookInput() {
  const chunks = [];
  for await (const chunk of stdin) {
    chunks.push(chunk);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString());
  if (!isValidHookInput(parsed)) {
    throw new Error("Invalid hook input structure");
  }
  return parsed;
}
function allowTool(hookEventName, systemMessage, updatedInput) {
  return {
    continue: true,
    systemMessage,
    hookSpecificOutput: {
      hookEventName,
      permissionDecision: "allow",
      updatedInput
    }
  };
}

// src/pre-tool-use.ts
import { writeFileSync } from "fs";
async function main() {
  const input = await readHookInput();
  const toolName = input.tool_name ?? "";
  const chunks = [];
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  process.stdin.on("end", () => {
    const input2 = JSON.parse(Buffer.concat(chunks).toString());
    console.error(`[TOOL] ${input2.tool_name}`);
    console.log(JSON.stringify(allowTool("PreToolUse")));
  });
  writeFileSync("/tmp/hook-debug.log", `Tool Name: ${JSON.stringify(toolName)}
`, { flag: "a" });
}
main();
