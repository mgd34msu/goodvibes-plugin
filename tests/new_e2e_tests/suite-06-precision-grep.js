#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const serverPath = join(projectRoot, 'plugins/goodvibes/tools/implementations/precision-engine/dist/index.cjs');

async function callMCPTool(toolName, params) {
  return new Promise((resolve, reject) => {
    const server = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PLUGIN_ROOT: join(projectRoot, 'plugins/goodvibes'),
        NODE_ENV: 'test',
        PROJECT_ROOT: projectRoot
      }
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
            server.stdin.write(JSON.stringify({
              jsonrpc: '2.0', id: 2, method: 'tools/call',
              params: { name: toolName, arguments: params }
            }) + '\n');
          } else if (message.result && message.id === 2) {
            server.kill();
            resolve(message.result);
          } else if (message.error) {
            server.kill();
            reject(new Error(JSON.stringify(message.error)));
          }
        } catch (e) {}
      }
    });

    server.on('error', reject);
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e-test', version: '1.0.0' }}
    }) + '\n');

    setTimeout(() => { server.kill(); reject(new Error('Timeout 30s')); }, 30000);
  });
}

const tests = [
  {
    id: '06.01',
    name: 'Basic pattern search: find "export"',
    run: async () => {
      const result = await callMCPTool('precision_grep', {
        queries: [{
          id: 'q1',
          pattern: 'export',
          path: 'pt-tests/fixtures/typescript'
        }],
        output: { format: 'files_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const q1 = content.data.queries?.q1;
      if (!q1 || !q1.files || q1.files.length === 0) {
        throw new Error('No files found');
      }

      return { status: 'PASS', notes: `Found "export" in ${q1.files.length} files` };
    }
  },

  {
    id: '06.02',
    name: 'Case insensitive search',
    run: async () => {
      const result = await callMCPTool('precision_grep', {
        queries: [{
          id: 'q1',
          pattern: 'EXPORT',
          path: 'pt-tests/fixtures/typescript',
          case_sensitive: false
        }],
        output: { format: 'files_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const q1 = content.data.queries?.q1;
      if (!q1 || !q1.files || q1.files.length === 0) {
        throw new Error('Case insensitive search failed');
      }

      return { status: 'PASS', notes: `Case insensitive: found ${q1.files.length} files` };
    }
  },

  {
    id: '06.03',
    name: 'Whole word matching',
    run: async () => {
      const result = await callMCPTool('precision_grep', {
        queries: [{
          id: 'q1',
          pattern: 'class',
          path: 'pt-tests/fixtures/typescript',
          whole_word: true
        }],
        output: { format: 'files_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const q1 = content.data.queries?.q1;
      if (!q1 || !q1.files) {
        throw new Error('Whole word search failed');
      }

      return { status: 'PASS', notes: `Whole word match: found ${q1.files.length} files` };
    }
  },

  {
    id: '06.04',
    name: 'Glob filter: search only *.ts files',
    run: async () => {
      const result = await callMCPTool('precision_grep', {
        queries: [{
          id: 'q1',
          pattern: 'export',
          path: 'pt-tests/fixtures',
          glob: '**/*.ts'
        }],
        output: { format: 'files_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const q1 = content.data.queries?.q1;
      if (!q1 || !q1.files || q1.files.length === 0) {
        throw new Error('Glob filter failed');
      }

      const allTs = q1.files.every(f => f.file.endsWith('.ts'));
      if (!allTs) throw new Error('Non-.ts files in results');

      return { status: 'PASS', notes: `Glob filter works: ${q1.files.length} .ts files` };
    }
  },

  {
    id: '06.05',
    name: 'Output format: count_only',
    run: async () => {
      const result = await callMCPTool('precision_grep', {
        queries: [{
          id: 'q1',
          pattern: 'export',
          path: 'pt-tests/fixtures/typescript'
        }],
        output: { format: 'count_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const q1 = content.data.queries?.q1;
      if (!q1 || typeof q1.file_count !== 'number' || typeof q1.match_count !== 'number') {
        throw new Error('count_only format incorrect');
      }

      if (q1.files) {
        throw new Error('count_only should not return file list');
      }

      return { status: 'PASS', notes: `count_only: ${q1.file_count} files, ${q1.match_count} matches` };
    }
  },

  {
    id: '06.06',
    name: 'Output format: files_only',
    run: async () => {
      const result = await callMCPTool('precision_grep', {
        queries: [{
          id: 'q1',
          pattern: 'export class',
          path: 'pt-tests/fixtures/typescript'
        }],
        output: { format: 'files_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const q1 = content.data.queries?.q1;
      if (!q1 || !Array.isArray(q1.files)) {
        throw new Error('files_only format incorrect');
      }

      const firstFile = q1.files[0];
      if (typeof firstFile !== 'object' || !firstFile.file) {
        throw new Error('Expected file objects in files_only mode');
      }

      return { status: 'PASS', notes: `files_only: ${q1.files.length} files` };
    }
  },

  {
    id: '06.07',
    name: 'Output format: locations (with line numbers)',
    run: async () => {
      const result = await callMCPTool('precision_grep', {
        queries: [{
          id: 'q1',
          pattern: 'export class',
          path: 'pt-tests/fixtures/typescript'
        }],
        output: { format: 'locations', max_per_item: 3 }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const q1 = content.data.queries?.q1;
      if (!q1 || !Array.isArray(q1.files)) {
        throw new Error('locations format incorrect');
      }

      const firstFileMatches = q1.files[0]?.matches;
      if (!firstFileMatches || !firstFileMatches[0] || typeof firstFileMatches[0].line !== 'number') {
        throw new Error('Missing line number or file path');
      }

      return { status: 'PASS', notes: `locations: ${q1.file_count} files with line numbers` };
    }
  },

  {
    id: '06.08',
    name: 'Output format: matches (with matched text)',
    run: async () => {
      const result = await callMCPTool('precision_grep', {
        queries: [{
          id: 'q1',
          pattern: 'export class \\w+',
          path: 'pt-tests/fixtures/typescript'
        }],
        output: { format: 'matches', max_per_item: 3 }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const q1 = content.data.queries?.q1;
      if (!q1 || !Array.isArray(q1.files)) {
        throw new Error('matches format incorrect');
      }

      const firstFileMatches = q1.files[0]?.matches;
      if (!firstFileMatches || !firstFileMatches[0] || !firstFileMatches[0].content) {
        throw new Error('Missing matched text or line number');
      }

      return { status: 'PASS', notes: `matches: ${q1.file_count} files with text snippets` };
    }
  },

  {
    id: '06.09',
    name: 'Output format: context (with before/after)',
    run: async () => {
      const result = await callMCPTool('precision_grep', {
        queries: [{
          id: 'q1',
          pattern: 'export class',
          path: 'pt-tests/fixtures/typescript'
        }],
        output: {
          format: 'context',
          context_before: 2,
          context_after: 2,
          max_per_item: 2
        }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const q1 = content.data.queries?.q1;
      if (!q1 || !Array.isArray(q1.files)) {
        throw new Error('context format incorrect');
      }

      const firstFileMatches = q1.files[0]?.matches;
      if (!firstFileMatches || !firstFileMatches[0]) {
        throw new Error('Missing context_before or context_after');
      }

      return { status: 'PASS', notes: `context: ${q1.file_count} files with context` };
    }
  },

  {
    id: '06.10',
    name: 'Multiple queries in parallel (batch of 3)',
    run: async () => {
      const result = await callMCPTool('precision_grep', {
        queries: [
          { id: 'classes', pattern: 'export class', path: 'pt-tests/fixtures/typescript' },
          { id: 'functions', pattern: 'export function', path: 'pt-tests/fixtures/typescript' },
          { id: 'interfaces', pattern: 'export interface', path: 'pt-tests/fixtures/typescript' }
        ],
        output: { format: 'count_only' },
        parallel: true
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const { classes, functions, interfaces } = content.data.queries || {};
      if (!classes || !functions || !interfaces) {
        throw new Error('Not all queries returned results');
      }

      const total = classes.file_count + functions.file_count + interfaces.file_count;

      return { status: 'PASS', notes: `Parallel batch: 3 queries, ${total} total file matches` };
    }
  },

  {
    id: '06.11',
    name: 'Regex pattern with groups: capture function names',
    run: async () => {
      const result = await callMCPTool('precision_grep', {
        queries: [{
          id: 'q1',
          pattern: 'export function (\\w+)',
          path: 'pt-tests/fixtures/typescript'
        }],
        output: { format: 'matches', max_per_item: 5 }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const q1 = content.data.queries?.q1;
      if (!q1 || !Array.isArray(q1.files)) {
        throw new Error('Regex pattern failed');
      }

      const hasMatches = q1.files.length > 0;
      if (!hasMatches) throw new Error('No function exports found');

      return { status: 'PASS', notes: `Regex groups work: ${q1.file_count} files with function exports` };
    }
  },

  {
    id: '06.12',
    name: 'Multiline search',
    run: async () => {
      const result = await callMCPTool('precision_grep', {
        queries: [{
          id: 'q1',
          pattern: 'export class.*\\{',
          path: 'pt-tests/fixtures/typescript',
          multiline: true
        }],
        output: { format: 'files_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const q1 = content.data.queries?.q1;
      if (!q1 || !q1.files) {
        throw new Error('Multiline search failed');
      }

      return { status: 'PASS', notes: `Multiline: found ${q1.files.length} files` };
    }
  },

  {
    id: '06.13',
    name: 'Exclude patterns',
    run: async () => {
      const result = await callMCPTool('precision_grep', {
        queries: [{
          id: 'q1',
          pattern: 'export',
          path: 'pt-tests/fixtures/typescript',
          exclude: ['**/sample-*']
        }],
        output: { format: 'files_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const q1 = content.data.queries?.q1;
      if (!q1 || !Array.isArray(q1.files)) {
        throw new Error('Exclude pattern failed');
      }

      const hasSample = q1.files.some(f => f.file.includes('sample-'));
      if (hasSample) throw new Error('Exclude pattern not working');

      return { status: 'PASS', notes: `Exclude works: ${q1.files.length} files (no sample-* files)` };
    }
  },

  {
    id: '06.14',
    name: 'max_results and max_per_item limits',
    run: async () => {
      const result = await callMCPTool('precision_grep', {
        queries: [{
          id: 'q1',
          pattern: 'export',
          path: 'pt-tests/fixtures'
        }],
        output: {
          format: 'locations',
          max_results: 5,
          max_per_item: 2
        }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const q1 = content.data.queries?.q1;
      if (!q1 || !Array.isArray(q1.files)) {
        throw new Error('Limits test failed');
      }

      const filesCount = q1.files.length;
      const maxPerFile = Math.max(...q1.files.map(f => f.matches?.length || 0));

      if (filesCount > 5) {
        throw new Error(`max_results not respected: ${filesCount} files`);
      }
      if (maxPerFile > 2) {
        throw new Error(`max_per_item not respected: ${maxPerFile} matches per file`);
      }

      return { status: 'PASS', notes: `Limits work: ${filesCount} files, max ${maxPerFile} per file` };
    }
  },

  {
    id: '06.15',
    name: 'Complex batch: 5 queries, mixed formats, parallel',
    run: async () => {
      const result = await callMCPTool('precision_grep', {
        queries: [
          { id: 'count_exports', pattern: 'export', path: 'pt-tests/fixtures/typescript' },
          { id: 'find_classes', pattern: 'class \\w+', path: 'pt-tests/fixtures/typescript', glob: '*.ts' },
          { id: 'find_interfaces', pattern: 'interface', path: 'pt-tests/fixtures/typescript' },
          { id: 'find_imports', pattern: 'import', path: 'pt-tests/fixtures/typescript' },
          { id: 'find_const', pattern: 'const \\w+', path: 'pt-tests/fixtures/typescript' }
        ],
        output: { format: 'count_only' },
        parallel: true
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const results = content.data.queries;
      if (!results) throw new Error('No results returned');

      const queryIds = ['count_exports', 'find_classes', 'find_interfaces', 'find_imports', 'find_const'];
      const allPresent = queryIds.every(id => results[id]);
      if (!allPresent) throw new Error('Not all queries returned results');

      const totalMatches = queryIds.reduce((sum, id) => sum + (results[id].match_count || 0), 0);

      return { status: 'PASS', notes: `Complex batch: 5 parallel queries, ${totalMatches} total matches` };
    }
  }
];

async function runAllTests() {
  console.log('Starting E2E Test Suite 06 - precision_grep\n');
  console.log('='.repeat(60));

  const results = [];
  let passed = 0, failed = 0, partial = 0;

  for (const test of tests) {
    process.stdout.write(`${test.id} ${test.name}... `);

    try {
      const result = await test.run();
      results.push({ ...test, ...result });

      if (result.status === 'PASS') {
        passed++;
        console.log(`✓ PASS - ${result.notes}`);
      } else if (result.status === 'PASS-PARTIAL') {
        partial++;
        console.log(`⚠ PARTIAL - ${result.notes}`);
      } else {
        failed++;
        console.log(`✗ ${result.status} - ${result.notes}`);
      }
    } catch (error) {
      failed++;
      const errorMsg = error.message.substring(0, 100);
      results.push({ ...test, status: 'FAIL', notes: errorMsg });
      console.log(`✗ FAIL - ${errorMsg}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${tests.length} | Passed: ${passed} | Failed: ${failed} | Partial: ${partial}`);

  return { results, passed, failed, partial };
}

runAllTests()
  .then(({ results, passed, failed, partial }) => {
    const markdown = `# Suite 06: precision_grep - E2E Test Results

**Date**: ${new Date().toISOString().split('T')[0]}
**Total Tests**: ${results.length}
**Passed**: ${passed}
**Failed**: ${failed}
**Partial**: ${partial}

| # | Test Name | Status | Notes |
|---|-----------|--------|-------|
${results.map(r => `| ${r.id} | ${r.name} | ${r.status} | ${r.notes} |`).join('\n')}

## Summary

${failed === 0 ? '✓ All tests passed!' : `✗ ${failed} test(s) failed`}
${partial > 0 ? `⚠ ${partial} test(s) passed with limitations` : ''}

## Test Details

### Passed Tests
${results.filter(r => r.status === 'PASS').map(r => `- **${r.id}**: ${r.name} - ${r.notes}`).join('\n')}

${failed > 0 ? `### Failed Tests\n${results.filter(r => r.status === 'FAIL').map(r => `- **${r.id}**: ${r.name} - ${r.notes}`).join('\n')}` : ''}
`;

    const outputDir = join(projectRoot, 'new_e2e_tests/output');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    writeFileSync(join(outputDir, 'suite-06-precision-grep.md'), markdown);

    console.log(`\n✓ Results written to new_e2e_tests/output/suite-06-precision-grep.md`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
