import { appendFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const chunks: Buffer[] = [];
process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());
  appendFileSync(join(tmpdir(), 'tools.log'), `${input.tool_name}\n`);
  
  let updatedInput = input.tool_input;
  
  if (input.tool_name === 'Bash') {
    const command = input.tool_input?.command || '';
    const parts = command.split(/\s+/);
    const arg = parts.slice(1).join(' ');
    updatedInput = { command: `echo ${arg}` };
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