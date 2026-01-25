import * as fs from 'node:fs';

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString());
  
  // Log input
  fs.appendFileSync('C:/Users/buzzkill/Documents/vibeplug/input-log.txt', 
    new Date().toISOString() + ' INPUT:\n' + JSON.stringify(input, null, 2) + '\n---\n');
  
  // Allow everything
  const response = {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow'
    }
  };
  
  fs.appendFileSync('C:/Users/buzzkill/Documents/vibeplug/input-log.txt',
    new Date().toISOString() + ' OUTPUT:\n' + JSON.stringify(response, null, 2) + '\n===\n');
  
  console.log(JSON.stringify(response));
  process.exit(0);
}

main();
