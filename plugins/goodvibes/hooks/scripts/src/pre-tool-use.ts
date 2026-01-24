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

function extractAndFixJson(command: string): string | null {
  const match = /^(\S+)\s+(.+)$/.exec(command);
  if (!match) return null;

  const [, tool, arg] = match;
  const { fixed, wasFixed } = fixJsonEscaping(arg);

  if (wasFixed) {
    return `${tool} ${fixed}`;
  }
  return null;
}

const chunks: Buffer[] = [];
process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());
  let updatedInput = input.tool_input;

  if (input.tool_name === 'Bash') {
    const command = input.tool_input?.command || '';
    const fixedCommand = extractAndFixJson(command);
    if (fixedCommand) {
      updatedInput = { command: fixedCommand };
    }
  }

  console.log(JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput,
    },
  }));
});