#!/usr/bin/env node

/**
 * mcp-cli-auto - Auto-fixing JSON wrapper for mcp-cli
 *
 * PROBLEM:
 * Agents write JSON like: {"pattern": "model-pricing\.json"}
 * This fails because \. is not a valid JSON escape sequence.
 *
 * SOLUTION:
 * This wrapper intercepts JSON arguments, detects invalid escapes,
 * and automatically fixes them before passing to mcp-cli.
 */

const { readFileSync, existsSync } = require("fs");
const { resolve, join } = require("path");
const { spawnSync } = require("child_process");
const { homedir } = require("os");

const DEBUG = process.env.MCP_CLI_AUTO_DEBUG === "1";
// Valid JSON escape sequences (after the backslash)
const VALID_JSON_ESCAPES = new Set(["\"", String.fromCharCode(92), "/", "b", "f", "n", "r", "t", "u"]);
const BS = String.fromCharCode(92);

function debug(...args) {
  if (DEBUG) console.error("[mcp-cli-auto]", ...args);
}

function warn(...args) {
  console.error("[mcp-cli-auto WARNING]", ...args);
}

function fixJsonEscaping(jsonString) {
  try {
    JSON.parse(jsonString);
    debug("JSON valid, no fix needed");
    return jsonString;
  } catch (e) {
    debug("JSON invalid, attempting auto-fix:", e.message);
  }

  let result = "";
  let inString = false;
  let fixCount = 0;
  let i = 0;

  while (i < jsonString.length) {
    const char = jsonString[i];
    const nextChar = jsonString[i + 1];

    if (char === "\"") {
      let bsCount = 0;
      let j = i - 1;
      while (j >= 0 && jsonString[j] === BS) { bsCount++; j--; }
      if (bsCount % 2 === 0) inString = !inString;
      result += char;
      i++;
      continue;
    }

    if (inString && char === BS) {
      if (nextChar === undefined) { result += char; i++; continue; }
      if (!VALID_JSON_ESCAPES.has(nextChar)) {
        result += BS + BS;
        fixCount++;
        debug("Fixed invalid escape: " + BS + nextChar);
        i++;
        continue;
      }
      if (nextChar === "u") {
        const hex = jsonString.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          result += BS + BS;
          fixCount++;
          i++;
          continue;
        }
      }
    }
    result += char;
    i++;
  }

  try {
    JSON.parse(result);
    if (fixCount > 0) warn("Auto-fixed " + fixCount + " invalid JSON escape(s)");
    return result;
  } catch (e) {
    warn("Auto-fix failed, passing original JSON to mcp-cli");
    return jsonString;
  }
}

function getMcpCliCommand() {
  const paths = [
    join(homedir(), "AppData", "Roaming", "npm", "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
    join(homedir(), ".npm-global", "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
  ];
  for (const p of paths) if (existsSync(p)) return ["node", p, "--mcp-cli"];
  return ["mcp-cli"];
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", chunk => data += chunk);
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length >= 2 && args[0] === "call") {
    const serverTool = args[1];
    let jsonInput = null;
    let remainingArgs = args.slice(2);

    const jsonFileIndex = remainingArgs.indexOf("--json-file");
    if (jsonFileIndex !== -1) {
      const jsonFilePath = remainingArgs[jsonFileIndex + 1];
      if (!jsonFilePath) { console.error("Error: --json-file requires a path"); process.exit(1); }
      try {
        jsonInput = readFileSync(resolve(jsonFilePath), "utf-8");
        remainingArgs = [...remainingArgs.slice(0, jsonFileIndex), ...remainingArgs.slice(jsonFileIndex + 2)];
      } catch (e) { console.error("Error: Failed to read JSON file:", jsonFilePath); process.exit(1); }
    } else if (remainingArgs.includes("-")) {
      const idx = remainingArgs.indexOf("-");
      remainingArgs = [...remainingArgs.slice(0, idx), ...remainingArgs.slice(idx + 1)];
      jsonInput = await readStdin();
    } else if (remainingArgs.length > 0) {
      const lastArg = remainingArgs[remainingArgs.length - 1];
      if (lastArg.startsWith("{") || lastArg.startsWith("[")) {
        jsonInput = lastArg;
        remainingArgs = remainingArgs.slice(0, -1);
      }
    }

    if (jsonInput) {
      const fixedJson = fixJsonEscaping(jsonInput);
      const mcpCliCmd = getMcpCliCommand();
      const fullCmd = [...mcpCliCmd, "call", serverTool, ...remainingArgs, "-"];
      debug("Executing:", fullCmd.join(" "));
      const result = spawnSync(fullCmd[0], fullCmd.slice(1), {
        input: fixedJson,
        stdio: ["pipe", "inherit", "inherit"],
        maxBuffer: 50 * 1024 * 1024,
      });
      process.exit(result.status || 0);
    }
  }

  const mcpCliCmd = getMcpCliCommand();
  const result = spawnSync(mcpCliCmd[0], [...mcpCliCmd.slice(1), ...args], { stdio: "inherit" });
  process.exit(result.status || 0);
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });