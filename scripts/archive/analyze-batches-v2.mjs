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
              if (cmd.includes('batch-engine/batch') && !cmd.includes('batch_status') && !cmd.includes('batch_list')) {
                batchCalls.push({
                  file: file,
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

console.log('Found ' + batchCalls.length + ' batch-engine/batch calls\n');

// Parse payloads more robustly
const analyzed = [];

for (const batch of batchCalls) {
  let payload = null;
  let operations = [];

  // Try different JSON extraction methods
  const cmd = batch.command;

  // Method 1: Heredoc with EOF
  let match = cmd.match(/<<'?EOF'?\s*([\s\S]*?)\s*EOF/);
  if (match) {
    try { payload = JSON.parse(match[1].trim()); } catch {}
  }

  // Method 2: Inline JSON after batch '...'
  if (!payload) {
    match = cmd.match(/batch-engine\/batch\s+'(\{[\s\S]*?\})'\s*(?:$|&&|;|\|)/);
    if (match) {
      try { payload = JSON.parse(match[1]); } catch {}
    }
  }

  // Method 3: Inline JSON with double quotes (Windows style)
  if (!payload) {
    match = cmd.match(/batch-engine\/batch\s+"(\{[\s\S]*?\})"\s*(?:$|&&|;|\|)/);
    if (match) {
      try { payload = JSON.parse(match[1].replace(/\\"/g, '"')); } catch {}
    }
  }

  // Method 4: echo pipe style
  if (!payload) {
    match = cmd.match(/echo\s+['"](\{[\s\S]*?\})['"]\s*\|\s*mcp-cli/);
    if (match) {
      try { payload = JSON.parse(match[1]); } catch {}
    }
  }

  // Method 5: Try to extract any JSON object that looks like batch payload
  if (!payload) {
    // Look for operations array pattern
    match = cmd.match(/"operations"\s*:\s*\[([\s\S]*?)\]/);
    if (match) {
      try {
        // Reconstruct minimal payload
        const opsContent = match[0];
        payload = JSON.parse('{' + opsContent + '}');
      } catch {}
    }
  }

  // Extract operations info
  if (payload) {
    if (payload.operations && Array.isArray(payload.operations)) {
      operations = payload.operations.map(op => ({
        id: op.id,
        tool: op.tool,
        description: op.description || '',
        args: op.args
      }));
    }
  }

  analyzed.push({
    file: batch.file.split('projects')[1] || batch.file,
    timestamp: batch.timestamp,
    command: batch.command,
    payloadFound: !!payload,
    operationCount: operations.length,
    operations: operations,
    payload: payload
  });
}

// Sort by operation count
analyzed.sort((a, b) => b.operationCount - a.operationCount);

console.log('=== TOP 20 BATCHES BY OPERATION COUNT ===\n');

analyzed.slice(0, 20).forEach((b, i) => {
  console.log(`#${i + 1}: ${b.operationCount} operations`);
  console.log(`   Time: ${b.timestamp || 'unknown'}`);
  console.log(`   Payload Found: ${b.payloadFound}`);
  if (b.operations.length > 0) {
    const tools = b.operations.map(op => op.tool).filter(Boolean);
    const toolCounts = {};
    tools.forEach(t => toolCounts[t] = (toolCounts[t] || 0) + 1);
    console.log(`   Tools: ${JSON.stringify(toolCounts)}`);
    console.log(`   Operations:`);
    b.operations.forEach((op, j) => {
      console.log(`     ${j+1}. ${op.tool || 'unknown'} - ${op.id || ''}`);
    });
  }
  console.log('');
});

// Stats
const withPayload = analyzed.filter(a => a.payloadFound);
const withOps = analyzed.filter(a => a.operationCount > 0);
const totalOps = analyzed.reduce((sum, a) => sum + a.operationCount, 0);

console.log('=== BATCH STATISTICS ===\n');
console.log(`Total batch calls found: ${analyzed.length}`);
console.log(`Calls with parseable payload: ${withPayload.length}`);
console.log(`Calls with operations: ${withOps.length}`);
console.log(`Total operations batched: ${totalOps}`);
console.log(`Max operations in single batch: ${analyzed[0]?.operationCount || 0}`);

if (withOps.length > 0) {
  console.log(`Average ops per batch (with ops): ${(totalOps / withOps.length).toFixed(1)}`);
}

// Cost analysis
console.log('\n=== COST SAVINGS ANALYSIS ===\n');

// Estimate cost per batch call: ~$0.0139/call based on our data
const BATCH_COST_PER_CALL = 0.0139;
// Average native tool cost: $0.0321/call
const NATIVE_AVG_COST = 0.0321;

const topBatches = withOps.slice(0, 10);
topBatches.forEach((b, i) => {
  const batchCost = BATCH_COST_PER_CALL;
  const nativeCost = b.operationCount * NATIVE_AVG_COST;
  const savings = nativeCost - batchCost;
  const savingsPct = ((savings / nativeCost) * 100).toFixed(1);

  console.log(`#${i+1}: ${b.operationCount} ops batched`);
  console.log(`   Batch cost: $${batchCost.toFixed(4)}`);
  console.log(`   Native equivalent: $${nativeCost.toFixed(4)} (${b.operationCount} calls × $0.0321)`);
  console.log(`   Savings: $${savings.toFixed(4)} (${savingsPct}%)`);
  console.log('');
});

// Show the command for the top batch
if (analyzed[0]?.operationCount > 0) {
  console.log('\n=== GREATEST BATCH COMMAND ===\n');
  console.log('Operations:');
  analyzed[0].operations.forEach((op, i) => {
    console.log(`  ${i+1}. Tool: ${op.tool}`);
    if (op.args) {
      console.log(`     Args: ${JSON.stringify(op.args).slice(0, 200)}...`);
    }
  });
}
