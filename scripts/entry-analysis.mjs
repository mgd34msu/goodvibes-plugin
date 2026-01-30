import fs from 'fs';

const agentFile = 'C:/Users/buzzkill/.claude/projects/C--Users-buzzkill-Documents-pellux/92621566-39f6-4f47-8b66-bf1c3f3e50ad/subagents/agent-a8cbf09.jsonl';
const content = fs.readFileSync(agentFile, 'utf8');
const lines = content.split('\n').filter(l => l.trim());

// Group by msgId+reqId
const groups = {};

for (const line of lines) {
  try {
    const entry = JSON.parse(line);
    if (entry.type === 'assistant' && entry.message?.content) {
      const key = (entry.message?.id || '') + '|' + (entry.requestId || '');
      if (!groups[key]) groups[key] = [];

      const tools = [];
      if (Array.isArray(entry.message.content)) {
        for (const block of entry.message.content) {
          if (block.type === 'tool_use') {
            const toolName = block.name === 'Bash' && block.input?.command?.includes('mcp-cli')
              ? 'MCP:' + block.input.command.match(/mcp-cli\s+\w+\s+([^\s'"]+)/)?.[1]?.split('/').pop()
              : block.name;
            tools.push(toolName);
          }
        }
      }
      groups[key].push({ tools, hasUsage: !!entry.message?.usage });
    }
  } catch {}
}

// Show groups with multiple entries
const multipleEntries = Object.entries(groups).filter(([k, v]) => v.length > 1);

console.log('Total unique msgId+reqId combos:', Object.keys(groups).length);
console.log('Combos with multiple entries:', multipleEntries.length);
console.log('');

// Count total tools across all entries
let totalToolsAllEntries = 0;
let totalToolsFirstOnly = 0;

for (const [key, entries] of Object.entries(groups)) {
  for (const e of entries) {
    totalToolsAllEntries += e.tools.length;
  }
  // First entry only (what dedup does)
  totalToolsFirstOnly += entries[0].tools.length;
}

console.log('Total tools counting ALL entries:', totalToolsAllEntries);
console.log('Total tools counting FIRST entry only (current dedup):', totalToolsFirstOnly);
console.log('Tools LOST to dedup:', totalToolsAllEntries - totalToolsFirstOnly);
console.log('');

console.log('Sample multi-entry groups:');
multipleEntries.slice(0, 3).forEach(([key, entries]) => {
  console.log('Key:', key.slice(0, 40) + '...');
  console.log('  Entries:', entries.length);
  entries.slice(0, 5).forEach((e, i) => {
    console.log('    #' + i + ': tools=' + JSON.stringify(e.tools.slice(0, 3)) + (e.tools.length > 3 ? '...' : '') + ', hasUsage=' + e.hasUsage);
  });
});
