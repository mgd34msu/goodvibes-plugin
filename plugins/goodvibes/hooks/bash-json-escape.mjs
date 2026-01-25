import * as fs from 'node:fs';

const BACKSLASH = String.fromCharCode(92);
const VALID_ESCAPES = new Set(['"', BACKSLASH, '/', 'b', 'f', 'n', 'r', 't', 'u']);

function log(msg) {
  fs.appendFileSync('C:/Users/buzzkill/Documents/vibeplug/json-escape.log',
    new Date().toISOString() + ' ' + msg + '\n');
}

function fixJsonEscaping(jsonString) {
  try {
    JSON.parse(jsonString);
    return { fixed: jsonString, wasFixed: false, fixCount: 0 };
  } catch {}

  let result = '';
  let inString = false;
  let fixCount = 0;

  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString[i];
    const nextChar = jsonString[i + 1];

    if (char === '"') {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && jsonString[j] === BACKSLASH) {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) {
        inString = !inString;
      }
      result += char;
      continue;
    }

    if (inString && char === BACKSLASH && nextChar !== undefined) {
      if (!VALID_ESCAPES.has(nextChar)) {
        result += BACKSLASH + BACKSLASH;
        fixCount++;
        continue;
      }
      if (nextChar === 'u') {
        const hex = jsonString.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          result += BACKSLASH + BACKSLASH;
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

function checkAndFixMcpCliJson(command) {
  log('checkAndFix called with: ' + command.substring(0, 100));
  const regex = /^(mcp-cli\s+call\s+plugin_goodvibes_(?:precision|batch|registry)-engine\/\S+\s+)(['"])(.+)\2\s*$/;
  const match = regex.exec(command);
  log('regex match: ' + (match ? 'YES' : 'NO'));
  if (!match) return null;

  const [, prefix, quote, json] = match;
  log('json extracted: ' + json.substring(0, 50));
  const { fixed, wasFixed, fixCount } = fixJsonEscaping(json);
  log('fix result: wasFixed=' + wasFixed + ' fixCount=' + fixCount);

  if (wasFixed) {
    return { fixedCommand: prefix + quote + fixed + quote, fixCount };
  }
  return null;
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString());

  log('Received tool: ' + (input.tool_name || 'unknown'));

  if (input.tool_name !== 'Bash' && !input.tool_name?.endsWith('__Bash')) {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  const command = input.tool_input?.command;
  log('Command: ' + (command ? command.substring(0, 80) : 'none'));

  if (!command) {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  const jsonFix = checkAndFixMcpCliJson(command);

  if (jsonFix) {
    log('Returning fixed command');
    const response = {
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: { command: jsonFix.fixedCommand }
      }
    };
    console.log(JSON.stringify(response));
    process.exit(0);
  }

  log('No fix needed, allowing');
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
