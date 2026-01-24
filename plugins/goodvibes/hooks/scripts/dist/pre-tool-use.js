/* Bundled with esbuild */

// src/pre-tool-use.ts
import { appendFileSync } from "fs";
var LOG_FILE = "C:/Users/buzzkill/Documents/vibeplug/hook-debug.log";
function log(msg) {
  appendFileSync(LOG_FILE, `${(/* @__PURE__ */ new Date()).toISOString()} ${msg}
`);
}
var VALID_JSON_ESCAPES = /* @__PURE__ */ new Set(['"', "\\", "/", "b", "f", "n", "r", "t", "u"]);
function fixJsonEscaping(jsonString) {
  try {
    JSON.parse(jsonString);
    return { fixed: jsonString, wasFixed: false };
  } catch {
  }
  let result = "";
  let inString = false;
  let wasFixed = false;
  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString[i];
    const nextChar = jsonString[i + 1];
    if (char === '"') {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && jsonString[j] === "\\") {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) {
        inString = !inString;
      }
      result += char;
      continue;
    }
    if (inString && char === "\\" && nextChar !== void 0) {
      if (!VALID_JSON_ESCAPES.has(nextChar)) {
        result += "\\\\";
        wasFixed = true;
        continue;
      }
      if (nextChar === "u") {
        const hex = jsonString.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          result += "\\\\";
          wasFixed = true;
          continue;
        }
      }
    }
    result += char;
  }
  try {
    JSON.parse(result);
    return { fixed: result, wasFixed };
  } catch {
    return { fixed: jsonString, wasFixed: false };
  }
}
function extractAndFixMcpCliJson(command) {
  log(`extractAndFixMcpCliJson input: ${command}`);
  const match = /^(mcp-cli\s+call\s+\S+\s+)(['"])(.+)\2\s*$/.exec(command);
  log(`regex match: ${match ? "yes" : "no"}`);
  if (!match) return null;
  const [, prefix, quote, json] = match;
  log(`extracted json: ${json}`);
  const { fixed, wasFixed } = fixJsonEscaping(json);
  log(`fixed: ${fixed}, wasFixed: ${wasFixed}`);
  if (wasFixed) {
    return `${prefix}${quote}${fixed}${quote}`;
  }
  return null;
}
var chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());
  log(`tool_name: ${input.tool_name}`);
  log(`command: ${input.tool_input?.command}`);
  if (input.tool_name === "Bash") {
    const command = input.tool_input?.command || "";
    const fixedCommand = extractAndFixMcpCliJson(command);
    log(`fixedCommand: ${fixedCommand}`);
    if (fixedCommand) {
      const response = {
        continue: true,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          updatedInput: { command: fixedCommand }
        }
      };
      log(`response with updatedInput: ${JSON.stringify(response)}`);
      console.log(JSON.stringify(response));
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
