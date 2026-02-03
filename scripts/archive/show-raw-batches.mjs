import fs from 'fs';
import path from 'path';
import os from 'os';

// Find all jsonl files
function* walkDir(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* walkDir(fullPath);
      } else if (entry.name.endsWith('.jsonl')) {
        yield fullPath;
      }
    }
  } catch {}
}

const projectsDir = path.join(os.homedir(), '.claude', 'projects');
const batchCalls = [];

for (const file of walkDir(projectsDir)) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_use' && block.name === 'Bash' && block.input?.command) {
              const cmd = block.input.command;
              if (cmd.includes('batch-engine/batch') && !cmd.includes('batch_status') && !cmd.includes('batch_list') && !cmd.includes('batch_recover')) {
                batchCalls.push({
                  timestamp: entry.timestamp,
                  command: cmd,
                  cmdLength: cmd.length
                });
              }
            }
          }
        }
      } catch {}
    }
  } catch {}
}

// Sort by command length (longer = more complex)
batchCalls.sort((a, b) => b.cmdLength - a.cmdLength);

console.log('=== TOP 10 LONGEST BATCH COMMANDS ===\n');

batchCalls.slice(0, 10).forEach((b, i) => {
  console.log(`#${i + 1}: ${b.cmdLength} chars`);
  console.log(`Time: ${b.timestamp}`);
  console.log('Command (first 3000 chars):');
  console.log(b.command.slice(0, 3000));
  console.log('\n' + '='.repeat(80) + '\n');
});

// Also show a sample of the ones that likely have more ops
console.log('\n=== COMMANDS CONTAINING "operations" (sample) ===\n');

const withOps = batchCalls.filter(b => b.command.includes('"operations"'));
console.log(`Found ${withOps.length} commands mentioning "operations"\n`);

withOps.slice(0, 5).forEach((b, i) => {
  console.log(`#${i + 1}: ${b.cmdLength} chars`);
  console.log('Command:');
  console.log(b.command.slice(0, 2000));
  console.log('\n' + '-'.repeat(40) + '\n');
});
