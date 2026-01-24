import { allowTool } from '../shared/hook-io.js';

const chunks: Buffer[] = [];
process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());
  console.error(`[TOOL] ${input.tool_name}`);
  console.log(JSON.stringify(allowTool('PreToolUse')));
});