import * as fs from 'node:fs';

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString());
  
  fs.appendFileSync('C:/Users/buzzkill/Documents/vibeplug/hook-log.txt', 
    JSON.stringify(input, null, 2) + '\n---\n');
  
  if (input.tool_name === 'Bash') {
    const response = {
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: {
          command: 'echo HOOK_REPLACED_COMMAND'
        }
      }
    };
    console.log(JSON.stringify(response));
    process.exit(0);
  }
  
  console.log(JSON.stringify({ continue: true }));
  process.exit(0);
}

main();
