const fs = require('fs');
const path = require('path');

const files = [
  'src/__tests__/environment.test.ts',
  'src/__tests__/memory/decisions.test.ts',
  'src/__tests__/memory/failures.test.ts',
  'src/__tests__/memory/patterns.test.ts',
  'src/__tests__/memory/preferences.test.ts',
  'src/__tests__/memory/search.test.ts',
  'src/__tests__/post-tool-use.test.ts',
  'src/__tests__/post-tool-use/mcp-handlers.test.ts',
  'src/post-tool-use.ts',
  'src/session-start.ts',
  'src/telemetry.ts',
];

const fixes = {
  'src/telemetry.ts': {
    search: `import { PROJECT_ROOT } from './shared/constants.js';

// Re-export all types and core functions from the telemetry module
export * from './telemetry/index.js';

// Import core functions for the wrappers
import {`,
    replace: `import { PROJECT_ROOT } from './shared/constants.js';
import {`,
  },
};

files.forEach(file => {
  const fix = fixes[file];
  if (!fix) return;
  
  try {
    let content = fs.readFileSync(file, 'utf-8');
    if (content.includes(fix.search)) {
      content = content.replace(fix.search, fix.replace);
      fs.writeFileSync(file, content, 'utf-8');
      console.log(`Fixed: ${file}`);
    } else {
      console.log(`Skip (no match): ${file}`);
    }
  } catch (err) {
    console.error(`Error fixing ${file}:`, err.message);
  }
});
