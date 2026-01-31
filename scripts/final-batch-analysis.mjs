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
              if (cmd.includes('batch-engine/batch') && !cmd.includes('batch_status') && !cmd.includes('batch_list') && !cmd.includes('batch_recover') && !cmd.includes('batch_checkpoints')) {
                batchCalls.push({
                  file: file,
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

console.log('Found ' + batchCalls.length + ' batch-engine/batch calls\n');

// Parse batch payloads with proper schema understanding
function extractPayload(cmd) {
  // Try heredoc first
  let match = cmd.match(/<<'?EOF'?\s*\n([\s\S]*?)\nEOF/);
  if (match) {
    try {
      return JSON.parse(match[1].trim());
    } catch {}
  }

  // Try inline JSON with single quotes
  match = cmd.match(/batch-engine\/batch\s+-\s*<<'?EOF'?\s*([\s\S]*?)\s*EOF/);
  if (match) {
    try {
      return JSON.parse(match[1].trim());
    } catch {}
  }

  // Try inline single-quoted JSON
  match = cmd.match(/batch-engine\/batch\s+'(\{[\s\S]*\})'/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {}
  }

  return null;
}

// Count operations in a batch payload
function countOperations(payload) {
  if (!payload) return { total: 0, byType: {} };

  let total = 0;
  const byType = {};

  // Format 1: operations: {write: [...], read: [...], ...}
  if (payload.operations && typeof payload.operations === 'object' && !Array.isArray(payload.operations)) {
    for (const [type, ops] of Object.entries(payload.operations)) {
      if (Array.isArray(ops)) {
        const count = ops.length;
        byType[type] = count;
        total += count;

        // Some operations may have nested files arrays
        ops.forEach(op => {
          if (op.files && Array.isArray(op.files)) {
            // Each file in a write operation is essentially a file operation
            byType[type + '_files'] = (byType[type + '_files'] || 0) + op.files.length;
          }
        });
      }
    }
  }

  // Format 2: operations: [...]
  if (payload.operations && Array.isArray(payload.operations)) {
    total = payload.operations.length;
    payload.operations.forEach(op => {
      const tool = op.tool || op.type || 'unknown';
      byType[tool] = (byType[tool] || 0) + 1;
    });
  }

  // Format 3: steps: [...]
  if (payload.steps && Array.isArray(payload.steps)) {
    total = payload.steps.length;
    payload.steps.forEach(step => {
      const tool = step.tool || step.operation || 'unknown';
      byType[tool] = (byType[tool] || 0) + 1;
    });
  }

  return { total, byType };
}

// Analyze all batch calls
const analyzed = [];

for (const batch of batchCalls) {
  const payload = extractPayload(batch.command);
  const ops = countOperations(payload);

  analyzed.push({
    file: batch.file.split('projects')[1] || batch.file,
    timestamp: batch.timestamp,
    cmdLength: batch.cmdLength,
    payloadFound: !!payload,
    operationCount: ops.total,
    operationsByType: ops.byType,
    payload: payload
  });
}

// Sort by operation count (descending)
analyzed.sort((a, b) => b.operationCount - a.operationCount);

console.log('=== TOP 15 BATCHES BY OPERATION COUNT ===\n');

analyzed.slice(0, 15).forEach((b, i) => {
  console.log(`#${i + 1}: ${b.operationCount} operations (${b.cmdLength} chars)`);
  console.log(`   Time: ${b.timestamp}`);
  if (Object.keys(b.operationsByType).length > 0) {
    console.log(`   Operations by type: ${JSON.stringify(b.operationsByType)}`);
  }
  console.log('');
});

// Calculate cost savings
console.log('\n=== COST SAVINGS FOR TOP BATCHES ===\n');

const BATCH_COST = 0.0139;  // Cost per batch call
const NATIVE_WRITE_COST = 0.0973;  // Native Write per call
const NATIVE_READ_COST = 0.0255;   // Native Read per call
const NATIVE_EDIT_COST = 0.0383;   // Native Edit per call
const NATIVE_GREP_COST = 0.0283;   // Native Grep per call
const NATIVE_GLOB_COST = 0.0194;   // Native Glob per call
const NATIVE_AVG_COST = 0.0321;    // Average native cost

const withOps = analyzed.filter(a => a.operationCount > 0);

withOps.slice(0, 10).forEach((b, i) => {
  // Calculate equivalent native cost based on operation types
  let nativeCost = 0;
  const byType = b.operationsByType;

  if (byType.write) {
    // Each write operation with files
    const fileCount = byType.write_files || byType.write;
    nativeCost += fileCount * NATIVE_WRITE_COST;
  }
  if (byType.read) {
    nativeCost += byType.read * NATIVE_READ_COST;
  }
  if (byType.edit) {
    nativeCost += byType.edit * NATIVE_EDIT_COST;
  }
  if (byType.grep || byType.search) {
    nativeCost += (byType.grep || byType.search || 0) * NATIVE_GREP_COST;
  }
  if (byType.glob) {
    nativeCost += byType.glob * NATIVE_GLOB_COST;
  }

  // Fallback for other/unknown types
  if (nativeCost === 0) {
    nativeCost = b.operationCount * NATIVE_AVG_COST;
  }

  // Also add any precision_* tools at their rates
  if (byType.precision_glob) {
    nativeCost += byType.precision_glob * NATIVE_GLOB_COST;
  }
  if (byType.precision_read) {
    nativeCost += byType.precision_read * NATIVE_READ_COST;
  }

  const savings = nativeCost - BATCH_COST;
  const savingsPct = nativeCost > 0 ? ((savings / nativeCost) * 100).toFixed(1) : 0;
  const multiplier = nativeCost > 0 ? (nativeCost / BATCH_COST).toFixed(1) : 1;

  console.log(`#${i + 1}: ${b.operationCount} operations`);
  console.log(`   Types: ${JSON.stringify(b.operationsByType)}`);
  console.log(`   Batch cost: $${BATCH_COST.toFixed(4)}`);
  console.log(`   Native equivalent: $${nativeCost.toFixed(4)}`);
  console.log(`   SAVINGS: $${savings.toFixed(4)} (${savingsPct}%) - ${multiplier}x cheaper`);
  console.log('');
});

// Statistics
console.log('\n=== BATCH STATISTICS ===\n');

const withPayload = analyzed.filter(a => a.payloadFound);
const totalOps = withOps.reduce((sum, a) => sum + a.operationCount, 0);

console.log(`Total batch calls: ${analyzed.length}`);
console.log(`Calls with parseable payload: ${withPayload.length}`);
console.log(`Calls with operations: ${withOps.length}`);
console.log(`Total operations batched: ${totalOps}`);
console.log(`Max operations in single batch: ${analyzed[0]?.operationCount || 0}`);

if (withOps.length > 0) {
  console.log(`Average ops per batch (with ops): ${(totalOps / withOps.length).toFixed(1)}`);

  // Calculate total cost savings across all batches with ops
  let totalBatchCost = withOps.length * BATCH_COST;
  let totalNativeCost = withOps.reduce((sum, b) => {
    const byType = b.operationsByType;
    let cost = 0;
    if (byType.write_files) cost += byType.write_files * NATIVE_WRITE_COST;
    else if (byType.write) cost += byType.write * NATIVE_WRITE_COST;
    if (byType.read) cost += byType.read * NATIVE_READ_COST;
    if (byType.precision_glob) cost += byType.precision_glob * NATIVE_GLOB_COST;
    if (byType.precision_read) cost += byType.precision_read * NATIVE_READ_COST;
    return sum + (cost || b.operationCount * NATIVE_AVG_COST);
  }, 0);

  console.log(`\nTotal batch cost: $${totalBatchCost.toFixed(4)}`);
  console.log(`Total native equivalent: $${totalNativeCost.toFixed(4)}`);
  console.log(`TOTAL SAVINGS from batching: $${(totalNativeCost - totalBatchCost).toFixed(4)}`);
}

// Find and display THE GREATEST BATCH
console.log('\n\n' + '='.repeat(60));
console.log('🏆 THE GREATEST BATCH OF ALL TIME 🏆');
console.log('='.repeat(60) + '\n');

if (analyzed[0]?.operationCount > 0) {
  const greatest = analyzed[0];
  const byType = greatest.operationsByType;

  // Calculate cost savings
  let nativeCost = 0;
  if (byType.write_files) nativeCost += byType.write_files * NATIVE_WRITE_COST;
  else if (byType.write) nativeCost += byType.write * NATIVE_WRITE_COST;

  const savings = nativeCost - BATCH_COST;
  const multiplier = nativeCost > 0 ? (nativeCost / BATCH_COST).toFixed(1) : 1;

  console.log(`Operations: ${greatest.operationCount}`);
  console.log(`Operation Types: ${JSON.stringify(byType)}`);
  console.log(`Command size: ${greatest.cmdLength} characters`);
  console.log(`Timestamp: ${greatest.timestamp}`);
  console.log(`\nCost Analysis:`);
  console.log(`  • Single batch call: $${BATCH_COST.toFixed(4)}`);
  console.log(`  • Native equivalent: $${nativeCost.toFixed(4)}`);
  console.log(`  • SAVINGS: $${savings.toFixed(4)} (${multiplier}x cheaper)`);

  if (greatest.payload?.operations?.write) {
    console.log(`\nFiles created in single batch:`);
    greatest.payload.operations.write.forEach((op, i) => {
      if (op.files) {
        op.files.forEach((f, j) => {
          console.log(`  ${i+1}.${j+1} ${f.path}`);
        });
      }
    });
  }
} else {
  console.log('No batches with countable operations found.');
}
