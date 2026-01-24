import { appendFileSync } from 'fs';

const LOG_FILE = 'C:/Users/buzzkill/Documents/vibeplug/hook-debug.log';

function log(msg: string) {
  appendFileSync(LOG_FILE, `${new Date().toISOString()} ${msg}\n`);
}

const VALID_JSON_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);

function fixJsonEscaping(jsonString: string): { fixed: string; wasFixed: boolean } {
  try {
    JSON.parse(jsonString);
    return { fixed: jsonString, wasFixed: false };
  } catch {
    // Continue to fix
  }

  let result = '';
  let inString = false;
  let wasFixed = false;

  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString[i];
    const nextChar = jsonString[i + 1];

    if (char === '"') {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && jsonString[j] === '\\') {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) {
        inString = !inString;
      }
      result += char;
      continue;
    }

    if (inString && char === '\\' && nextChar !== undefined) {
      if (!VALID_JSON_ESCAPES.has(nextChar)) {
        result += '\\\\';
        wasFixed = true;
        continue;
      }
      if (nextChar === 'u') {
        const hex = jsonString.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          result += '\\\\';
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

function extractAndFixMcpCliJson(command: string): string | null {
  log(`extractAndFixMcpCliJson input: ${command}`);

  // Match: mcp-cli call server/tool '{...}' or mcp-cli call server/tool "{...}"
  const match = /^(mcp-cli\s+call\s+\S+\s+)(['"])(.+)\2\s*$/.exec(command);
  log(`regex match: ${match ? 'yes' : 'no'}`);

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

const chunks: Buffer[] = [];
process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());

  log(`tool_name: ${input.tool_name}`);
  log(`command: ${input.tool_input?.command}`);

  if (input.tool_name === 'Bash') {
    const command = input.tool_input?.command || '';
    const fixedCommand = extractAndFixMcpCliJson(command);
    log(`fixedCommand: ${fixedCommand}`);

    if (fixedCommand) {
      const response = {
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          updatedInput: { command: fixedCommand }
        }
      };
      log(`response with updatedInput: ${JSON.stringify(response)}`);
      console.log(JSON.stringify(response));
      return;
    }
  }

  // Allow without modification
  console.log(JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow'
    }
  }));
});
