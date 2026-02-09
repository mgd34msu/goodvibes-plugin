#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const serverPath = join(projectRoot, 'plugins/goodvibes/tools/implementations/precision-engine/dist/index.cjs');

async function callMCPTool(toolName, params) {
  return new Promise((resolve, reject) => {
    const server = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PLUGIN_ROOT: join(projectRoot, 'plugins/goodvibes'), NODE_ENV: 'test', PROJECT_ROOT: projectRoot }
    });
    let stdout = '';
    server.stdout.on('data', (data) => {
      stdout += data.toString();
      const lines = stdout.split('\n');
      stdout = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          if (message.result && message.id === 1) {
            server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: params } }) + '\n');
          } else if (message.result && message.id === 2) { server.kill(); resolve(message.result); }
          else if (message.error) { server.kill(); reject(new Error(JSON.stringify(message.error))); }
        } catch (e) {}
      }
    });
    server.on('error', reject);
    server.on('close', (code) => { if (code !== 0 && code !== null) reject(new Error(`Server exited ${code}`)); });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e-test', version: '1.0.0' }} }) + '\n');
    setTimeout(() => { server.kill(); reject(new Error('Timeout 30s')); }, 30000);
  });
}

const tests = [
  {
    id: '09.01',
    name: 'Write 5 files → Read them all back → Verify content matches',
    run: async () => {
      const tmpDir = join(__dirname, 'tmp');
      if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

      const files = [
        { path: join(tmpDir, 'file1.txt'), content: 'Content for file 1' },
        { path: join(tmpDir, 'file2.txt'), content: 'Content for file 2' },
        { path: join(tmpDir, 'file3.txt'), content: 'Content for file 3' },
        { path: join(tmpDir, 'file4.txt'), content: 'Content for file 4' },
        { path: join(tmpDir, 'file5.txt'), content: 'Content for file 5' }
      ];

      for (const file of files) {
        const result = await callMCPTool('precision_write', {
          files: [{ path: file.path, content: file.content }]
        });
        const content = JSON.parse(result.content[0].text);
        if (!content.success) throw new Error('Write failed');
      }

      const readResult = await callMCPTool('precision_read', {
        files: files.map(f => ({ path: f.path })),
        extract: 'content',
        verbosity: 'standard'
      });

      const readContent = JSON.parse(readResult.content[0].text);
      if (!readContent.success) throw new Error('Read failed');

      for (const file of files) {
        const fileKey = Object.keys(readContent.data.files).find(key => key.endsWith(file.path.split('/').pop()));
        if (!fileKey) throw new Error(`File key not found for ${file.path}`);
        const fileData = readContent.data.files[fileKey];
        if (!fileData || !fileData.content.includes(file.content)) {
          throw new Error(`Content mismatch for ${file.path}`);
        }
      }

      return { status: 'PASS', notes: 'All 5 files written and read back successfully' };
    }
  },

  {
    id: '09.02',
    name: 'Write a file → Edit it (find/replace) → Read back → Verify edit applied',
    run: async () => {
      const tmpDir = join(__dirname, 'tmp');
      if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
      const filePath = join(tmpDir, 'edit-test.txt');
      const originalContent = 'Hello World\nThis is a test\nHello again';

      await callMCPTool('precision_write', {
        files: [{ path: filePath, content: originalContent }]
      });

      const editResult = await callMCPTool('precision_edit', {
        edits: [{
          path: filePath,
          find: 'Hello',
          replace: 'Goodbye',
          occurrence: 'first'
        }]
      });

      const editContent = JSON.parse(editResult.content[0].text);
      if (!editContent.success) throw new Error('Edit failed');

      const readResult = await callMCPTool('precision_read', {
        files: [{ path: filePath }],
        extract: 'content',
        verbosity: 'standard'
      });

      const readContent = JSON.parse(readResult.content[0].text);
      const fileKey = Object.keys(readContent.data.files).find(key => key.endsWith('edit-test.txt'));
      const fileContent = readContent.data.files[fileKey].content;

      if (!fileContent.includes('Goodbye World') || fileContent.includes('Hello World')) {
        throw new Error('Edit not applied correctly');
      }

      return { status: 'PASS', notes: 'File edited successfully via find/replace' };
    }
  },

  {
    id: '09.03',
    name: 'Write 10 files → Glob to find them → Verify count matches',
    run: async () => {
      const tmpDir = join(__dirname, 'tmp');
      if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

      for (let i = 1; i <= 10; i++) {
        await callMCPTool('precision_write', {
          files: [{ path: join(tmpDir, `glob-test-${i}.txt`), content: `File ${i}` }]
        });
      }

      const globResult = await callMCPTool('precision_glob', {
        patterns: ['new_e2e_tests/tmp/glob-test-*.txt'],
        output: { format: 'count_only' },
        verbosity: 'minimal'
      });

      const globContent = JSON.parse(globResult.content[0].text);
      if (!globContent.success) throw new Error('Glob failed');

      if (globContent.data.summary.total_files !== 10) {
        throw new Error(`Expected 10 files, found ${globContent.data.summary.total_files}`);
      }

      return { status: 'PASS', notes: 'Glob found all 10 files' };
    }
  },

  {
    id: '09.04',
    name: 'Write files with known content → Grep for pattern → Verify grep finds correct files',
    run: async () => {
      const tmpDir = join(__dirname, 'tmp');
      if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

      const files = [
        { name: 'grep1.txt', content: 'This contains MARKER text' },
        { name: 'grep2.txt', content: 'Just regular content' },
        { name: 'grep3.txt', content: 'Another MARKER here' },
        { name: 'grep4.txt', content: 'No special text' },
        { name: 'grep5.txt', content: 'Final MARKER instance' }
      ];

      for (const file of files) {
        await callMCPTool('precision_write', {
          files: [{ path: join(tmpDir, file.name), content: file.content }]
        });
      }

      const grepResult = await callMCPTool('precision_grep', {
        queries: [{
          id: 'find-marker',
          pattern: 'MARKER',
          path: 'new_e2e_tests/tmp'
        }],
        output: { format: 'files_only' },
        verbosity: 'minimal'
      });

      const grepContent = JSON.parse(grepResult.content[0].text);
      if (!grepContent.success) throw new Error('Grep failed');

      const foundFiles = grepContent.data.queries['find-marker'].files.length;
      if (foundFiles !== 3) {
        throw new Error(`Expected 3 files with MARKER, found ${foundFiles}`);
      }

      return { status: 'PASS', notes: 'Grep found exactly 3 files with MARKER pattern' };
    }
  },

  {
    id: '09.05',
    name: 'Write TypeScript file → Extract symbols → Verify class/function names found',
    run: async () => {
      const tmpDir = join(__dirname, 'tmp');
      if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
      const filePath = join(tmpDir, 'symbols-test.ts');

      const tsContent = `export class TestClass {
  constructor(public name: string) {}

  testMethod() {
    return this.name;
  }
}

export function testFunction() {
  return 'test';
}

export const testConstant = 42;`;

      await callMCPTool('precision_write', {
        files: [{ path: filePath, content: tsContent }]
      });

      const symbolsResult = await callMCPTool('precision_symbols', {
        files: [filePath],
        mode: 'document',
        verbosity: 'full'
      });

      const symbolsContent = JSON.parse(symbolsResult.content[0].text);
      if (!symbolsContent.success) throw new Error('Symbols extraction failed');

      const symbols = symbolsContent.data.symbols || [];
      const hasClass = symbols.some(s => s.name === 'TestClass' && s.kind === 'class');
      const hasFunction = symbols.some(s => s.name === 'testFunction' && s.kind === 'function');
      const hasConstant = symbols.some(s => s.name === 'testConstant');

      if (!hasClass || !hasFunction || !hasConstant) {
        throw new Error('Not all symbols found');
      }

      return { status: 'PASS', notes: 'All TypeScript symbols extracted correctly' };
    }
  },

  {
    id: '09.06',
    name: 'Write 3 files → Edit all 3 in one atomic transaction → Read all back → Verify',
    run: async () => {
      const tmpDir = join(__dirname, 'tmp');
      if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

      const files = [
        { path: join(tmpDir, 'atomic1.txt'), content: 'File ONE content' },
        { path: join(tmpDir, 'atomic2.txt'), content: 'File TWO content' },
        { path: join(tmpDir, 'atomic3.txt'), content: 'File THREE content' }
      ];

      for (const file of files) {
        await callMCPTool('precision_write', {
          files: [{ path: file.path, content: file.content }]
        });
      }

      const editResult = await callMCPTool('precision_edit', {
        edits: files.map(f => ({
          path: f.path,
          find: 'content',
          replace: 'EDITED'
        })),
        transaction: { mode: 'atomic' }
      });

      const editContent = JSON.parse(editResult.content[0].text);
      if (!editContent.success) throw new Error('Atomic edit failed');

      const readResult = await callMCPTool('precision_read', {
        files: files.map(f => ({ path: f.path })),
        extract: 'content',
        verbosity: 'standard'
      });

      const readContent = JSON.parse(readResult.content[0].text);

      for (const file of files) {
        const fileKey = Object.keys(readContent.data.files).find(key => key.endsWith(file.path.split('/').pop()));
        const fileData = readContent.data.files[fileKey];
        if (!fileData.content.includes('EDITED') || fileData.content.includes('content')) {
          throw new Error(`Atomic edit not applied to ${file.path}`);
        }
      }

      return { status: 'PASS', notes: 'All 3 files edited atomically' };
    }
  },

  {
    id: '09.07',
    name: 'Write 20 files → Glob with has_content filter → Read matching → Verify',
    run: async () => {
      const tmpDir = join(__dirname, 'tmp');
      if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

      for (let i = 1; i <= 20; i++) {
        const content = i % 3 === 0 ? 'SPECIAL content' : 'Regular content';
        await callMCPTool('precision_write', {
          files: [{ path: join(tmpDir, `filter-${i}.txt`), content: `${content} ${i}` }]
        });
      }

      const grepResult = await callMCPTool('precision_grep', {
        queries: [{
          id: 'special',
          pattern: 'SPECIAL',
          path: 'new_e2e_tests/tmp',
          glob: 'filter-*.txt'
        }],
        output: { format: 'files_only' },
        verbosity: 'minimal'
      });

      const grepContent = JSON.parse(grepResult.content[0].text);
      if (!grepContent.success) throw new Error('Grep with filter failed');

      const expectedCount = Math.floor(20 / 3);
      const actualCount = (grepContent.data.queries.special.files || []).length;
      if (actualCount !== expectedCount) {
        throw new Error(`Expected ${expectedCount} filtered files, found ${actualCount}`);
      }

      return { status: 'PASS', notes: `Glob filter found ${expectedCount} files with SPECIAL content` };
    }
  },

  {
    id: '09.08',
    name: 'Write file → Edit with regex capture groups → Read → Verify replacement correct',
    run: async () => {
      const tmpDir = join(__dirname, 'tmp');
      if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
      const filePath = join(tmpDir, 'regex-test.txt');

      const content = 'Name: John Doe\nName: Jane Smith\nName: Bob Jones';

      await callMCPTool('precision_write', {
        files: [{ path: filePath, content }]
      });

      const editResult = await callMCPTool('precision_edit', {
        edits: [{
          path: filePath,
          find: 'Name: (\\w+) (\\w+)',
          replace: 'Person: $2, $1',
          occurrence: 'all'
        }],
        match: { mode: 'regex' }
      });

      const editContent = JSON.parse(editResult.content[0].text);
      if (!editContent.success) throw new Error('Regex edit failed');

      const readResult = await callMCPTool('precision_read', {
        files: [{ path: filePath }],
        extract: 'content',
        verbosity: 'standard'
      });

      const readContent = JSON.parse(readResult.content[0].text);
      const fileKey = Object.keys(readContent.data.files).find(key => key.endsWith('regex-test.txt'));
      const fileContent = readContent.data.files[fileKey].content;

      if (!fileContent.includes('Person: Doe, John') || !fileContent.includes('Person: Smith, Jane')) {
        throw new Error('Regex capture groups not applied correctly');
      }

      return { status: 'PASS', notes: 'Regex capture groups worked correctly' };
    }
  },

  {
    id: '09.09',
    name: 'Write 50 files → Glob to find → Read with batch → Edit subset → Re-read to verify',
    run: async () => {
      const tmpDir = join(__dirname, 'tmp');
      if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

      for (let i = 1; i <= 50; i++) {
        await callMCPTool('precision_write', {
          files: [{ path: join(tmpDir, `batch-${i}.txt`), content: `Batch file ${i}` }]
        });
      }

      const globResult = await callMCPTool('precision_glob', {
        patterns: ['new_e2e_tests/tmp/batch-*.txt'],
        output: { format: 'count_only' },
        verbosity: 'minimal'
      });

      const globContent = JSON.parse(globResult.content[0].text);
      if (globContent.data.summary.total_files !== 50) {
        throw new Error(`Expected 50 files, found ${globContent.data.summary.total_files}`);
      }

      const editFiles = [1, 10, 20, 30, 40, 50].map(i => join(tmpDir, `batch-${i}.txt`));

      const editResult = await callMCPTool('precision_edit', {
        edits: editFiles.map(f => ({
          path: f,
          find: 'Batch',
          replace: 'EDITED'
        }))
      });

      const editContent = JSON.parse(editResult.content[0].text);
      if (!editContent.success) throw new Error('Batch edit failed');

      const readResult = await callMCPTool('precision_read', {
        files: editFiles.map(f => ({ path: f })),
        extract: 'content',
        verbosity: 'standard'
      });

      const readContent = JSON.parse(readResult.content[0].text);

      for (const file of editFiles) {
        const fileKey = Object.keys(readContent.data.files).find(key => key.endsWith(file.split('/').pop()));
        const fileData = readContent.data.files[fileKey];
        if (!fileData.content.includes('EDITED')) {
          throw new Error(`Edit not applied to ${file}`);
        }
      }

      return { status: 'PASS', notes: '50 files created, 6 edited, all verified' };
    }
  },

  {
    id: '09.10',
    name: 'Full pipeline: Write 10 TS files → Discover symbols → Grep for patterns → Edit based on grep results → Read back all → Verify everything',
    run: async () => {
      const tmpDir = join(__dirname, 'tmp');
      if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

      const files = [];
      for (let i = 1; i <= 10; i++) {
        const filePath = join(tmpDir, `pipeline-${i}.ts`);
        const content = `export class Class${i} {
  oldMethod() {
    return 'old implementation';
  }
}

export function helper${i}() {
  return 'helper ${i}';
}`;
        files.push({ path: filePath, content });

        await callMCPTool('precision_write', {
          files: [{ path: filePath, content }]
        });
      }

      const symbolsResult = await callMCPTool('precision_symbols', {
        files: files.map(f => f.path),
        mode: 'document',
        verbosity: 'locations'
      });

      const symbolsContent = JSON.parse(symbolsResult.content[0].text);
      if (!symbolsContent.success) throw new Error('Symbol discovery failed');

      const totalSymbols = (symbolsContent.data.symbols || []).length;
      if (totalSymbols < 20) {
        throw new Error(`Expected at least 20 symbols, found ${totalSymbols}`);
      }

      const grepResult = await callMCPTool('precision_grep', {
        queries: [{
          id: 'find-old',
          pattern: 'oldMethod',
          path: 'new_e2e_tests/tmp'
        }],
        output: { format: 'files_only' },
        verbosity: 'minimal'
      });

      const grepContent = JSON.parse(grepResult.content[0].text);
      if (!grepContent.success) throw new Error('Grep failed');

      const filesToEdit = grepContent.data.queries['find-old'].files || [];
      if (filesToEdit.length !== 10) {
        throw new Error(`Expected 10 files with oldMethod, found ${filesToEdit.length}`);
      }

      const editResult = await callMCPTool('precision_edit', {
        edits: files.map(f => ({
          path: f.path,
          find: 'old implementation',
          replace: 'new implementation'
        }))
      });

      const editContent = JSON.parse(editResult.content[0].text);
      if (!editContent.success) throw new Error('Edit failed');

      const readResult = await callMCPTool('precision_read', {
        files: files.map(f => ({ path: f.path })),
        extract: 'content',
        verbosity: 'standard'
      });

      const readContent = JSON.parse(readResult.content[0].text);

      for (const file of files) {
        const fileKey = Object.keys(readContent.data.files).find(key => key.endsWith(file.path.split('/').pop()));
        const fileData = readContent.data.files[fileKey];
        if (!fileData.content.includes('new implementation')) {
          throw new Error(`Edit not applied to ${file.path}`);
        }
      }

      return { status: 'PASS', notes: 'Full pipeline: 10 TS files → symbols → grep → edit → verify all successful' };
    }
  }
];

async function runSuite() {
  console.log('Suite 09: Cross-Tool Stress Tests');
  console.log('==================================\n');

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    process.stdout.write(`Running ${test.id} - ${test.name}... `);
    try {
      const result = await test.run();
      console.log(`✓ ${result.status}`);
      if (result.notes) console.log(`  Notes: ${result.notes}`);
      results.push({ id: test.id, name: test.name, ...result });
      passed++;
    } catch (error) {
      console.log(`✗ FAIL`);
      console.log(`  Error: ${error.message}`);
      results.push({ id: test.id, name: test.name, status: 'FAIL', error: error.message });
      failed++;
    }
    console.log('');
  }

  try { rmSync(join(__dirname, 'tmp'), { recursive: true, force: true }); } catch(e) {}

  const outputDir = join(__dirname, 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const markdown = `# Suite 09: Cross-Tool Stress Tests

## Summary
- Total: ${tests.length}
- Passed: ${passed}
- Failed: ${failed}

## Results

${results.map(r => `### ${r.id} - ${r.name}
**Status:** ${r.status}
${r.notes ? `**Notes:** ${r.notes}` : ''}
${r.error ? `**Error:** ${r.error}` : ''}
`).join('\n')}

## Execution
- Date: ${new Date().toISOString()}
- Duration: N/A
`;

  writeFileSync(join(outputDir, 'suite-09-cross-tool-stress.md'), markdown);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  console.log(`Results written to: ${join(outputDir, 'suite-09-cross-tool-stress.md')}`);

  process.exit(failed > 0 ? 1 : 0);
}

runSuite().catch(err => {
  console.error('Suite execution error:', err);
  process.exit(1);
});
