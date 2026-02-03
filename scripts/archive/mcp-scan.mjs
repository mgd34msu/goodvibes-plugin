import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

const homeDir = os.homedir();
const projectDir = path.join(homeDir, '.claude', 'projects');

const seenHashes = new Set();
let mcpTools = {};
let totalMcp = 0;

function* walkDir(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) yield* walkDir(fullPath);
      else if (entry.name.endsWith('.jsonl')) yield fullPath;
    }
  } catch {}
}

for (const file of walkDir(projectDir)) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.trim().split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type !== 'assistant' || !entry.message?.usage) continue;

        const hash = crypto.createHash('sha256').update([(entry.message?.id || ''), (entry.requestId || '')].join('|')).digest('hex');
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);

        if (Array.isArray(entry.message.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_use' && block.name === 'Bash' && block.input?.command) {
              const match = block.input.command.match(/mcp-cli\s+(call|info)\s+([^\s'"]+)/);
              if (match) {
                totalMcp++;
                const tool = match[2];
                mcpTools[tool] = (mcpTools[tool] || 0) + 1;
              }
            }
          }
        }
      } catch {}
    }
  } catch {}
}

const sorted = Object.entries(mcpTools).sort((a,b) => b[1] - a[1]);

console.log('=== ALL TIME MCP USAGE ===');
console.log('Total unique MCP calls:', totalMcp);
console.log('');
console.log('Precision-engine tools:');
sorted.filter(([t]) => t.includes('precision')).forEach(([t, c]) => console.log('  ' + c + 'x ' + t.split('/')[1]));
console.log('');
console.log('Other MCP tools:');
sorted.filter(([t]) => !t.includes('precision')).forEach(([t, c]) => console.log('  ' + c + 'x ' + t));
