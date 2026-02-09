import { handlePrecisionGrep } from './src/handlers/precision-grep.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(__dirname);

// Test Bug 3: glob with subdirectory pattern
console.log('\n=== Testing Bug 3: glob with subdirectory pattern ===');
const bug3Result = await handlePrecisionGrep({
  queries: [{
    id: 'test1',
    pattern: 'export',
    glob: 'test-bugs/subdir/**/*.ts'
  }],
  output: {
    mode: 'files_only'
  }
});

console.log('Bug 3 Result:', JSON.stringify(bug3Result, null, 2));

// Test Bug 11: path parameter with file
console.log('\n=== Testing Bug 11: path parameter with file ===');
const bug11Result = await handlePrecisionGrep({
  queries: [{
    id: 'test2',
    pattern: 'CONSTANT',
    path: 'test-bugs/single-file.ts'
  }],
  output: {
    mode: 'files_only'
  }
});

console.log('Bug 11 Result:', JSON.stringify(bug11Result, null, 2));
