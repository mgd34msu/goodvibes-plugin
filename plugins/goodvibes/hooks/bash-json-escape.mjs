import * as fs from 'node:fs';
const log = m => fs.appendFileSync('C:/Users/buzzkill/Documents/vibeplug/hook.log', new Date().toISOString() + ' ' + m + '\n');
log('HOOK STARTED');

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString());

// Only handle Bash
if (input.tool_name !== 'Bash') {
  log('OTHER TOOL: ' + input.tool_name);
  console.log('{"continue":true}');
  process.exit(0);
}

const cmd = input.tool_input?.command || '';

// Match mcp-cli calls with JSON in single quotes
const match = cmd.match(/^(mcp-cli\s+call\s+\S+\s+')(.+)('\s*)$/);
if (!match) {
  log('NOT MCP-CLI: ' + cmd.substring(0, 50));
  console.log('{"continue":true}');
  process.exit(0);
}

const [, prefix, json, suffix] = match;

// If already valid, pass through
try {
  JSON.parse(json);
  log('JSON ALREADY VALID');
  console.log('{"continue":true}');
  process.exit(0);
} catch {}

// Fix invalid escapes: \x -> \\x when x is not a valid JSON escape char
const fixed = json.replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1');

// Verify fix worked, otherwise pass through original
try {
  JSON.parse(fixed);
} catch {
  log('FIX FAILED');
  console.log('{"continue":true}');
  process.exit(0);
}

log('JSON FIXED: ' + fixed.substring(0, 50));
// Return fixed command

const response = {
  continue: true,
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
    updatedInput: {
      command: prefix + fixed + suffix
    }
  }
};

log('RESPONSE: ' + JSON.stringify(response));
console.log(JSON.stringify(response));
