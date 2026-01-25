/**
 * Standalone Bash PreToolUse Hook
 * 
 * Intercepts Bash commands and auto-fixes invalid JSON escapes in mcp-cli calls.
 * Only handles: precision-engine, batch-engine, registry-engine commands.
 */
import * as fs from 'node:fs';

// Valid JSON escape characters
const VALID_ESCAPES = new Set(['"', '\', '/', 'b', 'f', 'n', 'r', 't', 'u']);

/**
 * Fix invalid JSON escape sequences
 */
function fixJsonEscaping(jsonString) {
  try {
    JSON.parse(jsonString);
    return { fixed: jsonString, wasFixed: false, fixCount: 0 };
  } catch {
    // Continue to fix
  }

  let result = '';
  let inString = false;
  let fixCount = 0;

  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString[i];
    const nextChar = jsonString[i + 1];

    if (char === '"') {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && jsonString[j] === '\') {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) {
        inString = !inString;
      }
      result += char;
      continue;
    }

    if (inString && char === '\' && nextChar !== undefined) {
      if (!VALID_ESCAPES.has(nextChar)) {
        result += '\\';
        fixCount++;
        continue;
      }
      if (nextChar === 'u') {
        const hex = jsonString.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          result += '\\';
          fixCount++;
          continue;
        }
      }
    }

    result += char;
  }

  try {
    JSON.parse(result);
    return { fixed: result, wasFixed: fixCount > 0, fixCount };
  } catch {
    return { fixed: jsonString, wasFixed: false, fixCount: 0 };
  }
}

/**
 * Check if command is mcp-cli call to our engines and fix if needed
 */
function checkAndFixMcpCliJson(command) {
  // Match mcp-cli call to precision/batch/registry engines
  const match = /^(mcp-cli\s+call\s+plugin_goodvibes_(?:precision|batch|registry)-engine\/\S+\s+)(['"])(.+)\2\s*$/.exec(command);
  
  if (!match) {
    return null;
  }

  const [, prefix, quote, json] = match;
  const { fixed, wasFixed, fixCount } = fixJsonEscaping(json);

  if (wasFixed) {
    return {
      fixedCommand: `${prefix}${quote}${fixed}${quote}`,
      fixCount
    };
  }

  return null;
}

/**
 * Main hook entry point
 */
async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  
  const input = JSON.parse(Buffer.concat(chunks).toString());
  
  // Only handle Bash
  if (input.tool_name !== 'Bash' && !input.tool_name?.endsWith('__Bash')) {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  const command = input.tool_input?.command;
  
  if (!command) {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  // Check for mcp-cli calls that need fixing
  const jsonFix = checkAndFixMcpCliJson(command);
  
  if (jsonFix) {
    // Log for debugging
    console.error(`[GoodVibes] JSON auto-escape: fixed ${jsonFix.fixCount} invalid escape(s)`);
    
    const response = {
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: {
          command: jsonFix.fixedCommand
        }
      }
    };
    console.log(JSON.stringify(response));
    process.exit(0);
  }

  // Allow command as-is
  console.log(JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow'
    }
  }));
  process.exit(0);
}

main();
