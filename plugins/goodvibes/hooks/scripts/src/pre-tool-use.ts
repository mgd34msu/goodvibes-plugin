import { appendFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const chunks: Buffer[] = [];
process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());
  appendFileSync(join(tmpdir(), 'tools.log'), `${input.tool_name}\n`);
  console.log(JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  }));
});