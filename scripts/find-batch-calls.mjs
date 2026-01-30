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
              if (cmd.includes('mcp-cli') && cmd.includes('batch-engine/batch')) {
                batchCalls.push({
                  file: file.split('projects')[1],
                  timestamp: entry.timestamp,
                  command: cmd
                });
              }
            }
          }
        }
      } catch {}
    }
  } catch {}
}

console.log('Found ' + batchCalls.length + ' batch calls total\n');

// Analyze each batch call
const analyzed = [];

for (const batch of batchCalls) {
  // Try to extract JSON payload - look for heredoc or inline JSON
  let payload = null;
  let operationCount = 0;
  let operations = [];

  // Check for heredoc style
  const heredocMatch = batch.command.match(/<<'?EOF'?\s*([\s\S]*?)\s*EOF/);
  if (heredocMatch) {
    try {
      payload = JSON.parse(heredocMatch[1]);
    } catch {}
  }

  // Check for inline JSON
  if (!payload) {
    const inlineMatch = batch.command.match(/mcp-cli\s+call\s+\S+\s+'(\{[\s\S]*\})'/);
    if (inlineMatch) {
      try {
        payload = JSON.parse(inlineMatch[1]);
      } catch {}
    }
  }

  // Check for stdin style with -
  if (!payload) {
    const stdinMatch = batch.command.match(/echo\s+'(\{[\s\S]*?\})'\s*\|\s*mcp-cli/);
    if (stdinMatch) {
      try {
        payload = JSON.parse(stdinMatch[1]);
      } catch {}
    }
  }

  if (payload) {
    // Count operations
    if (payload.operations && Array.isArray(payload.operations)) {
      operationCount = payload.operations.length;
      operations = payload.operations.map(op => ({
        tool: op.tool,
        type: op.type || 'unknown'
      }));
    } else if (payload.steps && Array.isArray(payload.steps)) {
      operationCount = payload.steps.length;
      operations = payload.steps.map(s => ({
        tool: s.tool || s.operation,
        type: s.type || 'step'
      }));
    }
  }

  analyzed.push({
    ...batch,
    operationCount,
    operations,
    payloadFound: !!payload
  });
}

// Sort by operation count
analyzed.sort((a, b) => b.operationCount - a.operationCount);

console.log('=== TOP BATCH CALLS BY OPERATION COUNT ===\n');

analyzed.slice(0, 15).forEach((b, i) => {
  console.log(`#${i + 1}: ${b.operationCount} operations`);
  console.log(`   File: ...${b.file?.slice(-60) || 'unknown'}`);
  console.log(`   Time: ${b.timestamp || 'unknown'}`);
  if (b.operations.length > 0) {
    const toolCounts = {};
    b.operations.forEach(op => {
      toolCounts[op.tool] = (toolCounts[op.tool] || 0) + 1;
    });
    console.log(`   Tools: ${JSON.stringify(toolCounts)}`);
  }
  console.log('');
});

// Stats
const withPayload = analyzed.filter(a => a.payloadFound);
const totalOps = analyzed.reduce((sum, a) => sum + a.operationCount, 0);

console.log('=== BATCH STATISTICS ===\n');
console.log(`Total batch calls: ${analyzed.length}`);
console.log(`Calls with parseable payload: ${withPayload.length}`);
console.log(`Total operations batched: ${totalOps}`);
console.log(`Average operations per batch: ${withPayload.length > 0 ? (totalOps / withPayload.length).toFixed(1) : 0}`);
console.log(`Max operations in single batch: ${analyzed[0]?.operationCount || 0}`);

// Show the biggest batch in detail
if (analyzed[0]?.operationCount > 0) {
  console.log('\n=== BIGGEST BATCH DETAILS ===\n');
  const biggest = analyzed[0];
  console.log(`Operations: ${biggest.operationCount}`);
  console.log(`File: ${biggest.file}`);
  console.log(`Timestamp: ${biggest.timestamp}`);
  console.log('\nCommand (first 2000 chars):');
  console.log(biggest.command.slice(0, 2000));
}
