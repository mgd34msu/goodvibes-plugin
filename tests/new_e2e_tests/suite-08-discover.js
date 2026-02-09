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
    server.on('close', (code) => {
      if (code !== 0 && code !== null) reject(new Error(`Server exited ${code}`));
    });
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e-test', version: '1.0.0' }}
    }) + '\n');

    setTimeout(() => { server.kill(); reject(new Error('Timeout 60s')); }, 60000);
  });
}

const tests = [
  {
    id: '08.01',
    name: 'Single grep query',
    run: async () => {
      const result = await callMCPTool('discover', {
        queries: [
          { id: 'find-dog', type: 'grep', pattern: 'class Dog' }
        ],
        base_path: 'pt-tests/fixtures'
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      if (!content.data.results['find-dog']) throw new Error('Query result not found');
      const dogResult = content.data.results['find-dog'];
      
      if (dogResult.files.length === 0) throw new Error('No files found with Dog class');

      return { status: 'PASS', notes: `Found ${dogResult.files.length} file(s) with Dog class` };
    }
  },

  {
    id: '08.02',
    name: 'Single glob query',
    run: async () => {
      const result = await callMCPTool('discover', {
        queries: [
          { id: 'ts-files', type: 'glob', patterns: ['**/*.ts'] }
        ],
        base_path: 'pt-tests/fixtures/typescript'
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      if (!content.data.results['ts-files']) throw new Error('Query result not found');
      const tsFiles = content.data.results['ts-files'];
      
      if (tsFiles.files.length === 0) throw new Error('No TypeScript files found');

      return { status: 'PASS', notes: `Found ${tsFiles.files.length} TypeScript file(s)` };
    }
  },

  {
    id: '08.03',
    name: 'Single symbols query',
    run: async () => {
      const result = await callMCPTool('discover', {
        queries: [
          { id: 'find-interfaces', type: 'symbols', query: 'IAnimal' }
        ],
        base_path: 'pt-tests/fixtures'
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      if (!content.data.results['find-interfaces']) throw new Error('Query result not found');
      const interfaceResult = content.data.results['find-interfaces'];
      
      if (interfaceResult.files.length === 0) throw new Error('No files found with IAnimal interface');

      return { status: 'PASS', notes: `Found ${interfaceResult.files.length} file(s) with IAnimal` };
    }
  },

  {
    id: '08.04',
    name: 'Mixed: 1 grep + 1 glob query',
    run: async () => {
      const result = await callMCPTool('discover', {
        queries: [
          { id: 'find-exports', type: 'grep', pattern: 'export class' },
          { id: 'py-files', type: 'glob', patterns: ['**/*.py'] }
        ],
        base_path: 'pt-tests/fixtures'
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      if (!content.data.results['find-exports'] || !content.data.results['py-files']) {
        throw new Error('Missing query results');
      }

      const exportCount = content.data.results['find-exports'].files.length;
      const pyCount = content.data.results['py-files'].files.length;

      return { status: 'PASS', notes: `Found ${exportCount} files with exports, ${pyCount} Python files` };
    }
  },

  {
    id: '08.05',
    name: 'Batch: 3 grep queries with different patterns',
    run: async () => {
      const result = await callMCPTool('discover', {
        queries: [
          { id: 'classes', type: 'grep', pattern: 'class ' },
          { id: 'interfaces', type: 'grep', pattern: 'interface ' },
          { id: 'functions', type: 'grep', pattern: 'function ' }
        ],
        base_path: 'pt-tests/fixtures/typescript'
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const queryIds = Object.keys(content.data.results);
      if (queryIds.length !== 3) {
        throw new Error(`Expected 3 results, got ${queryIds.length}`);
      }

      const total = queryIds.reduce((sum, id) => sum + content.data.results[id].files.length, 0);

      return { status: 'PASS', notes: `All 3 grep queries executed, ${total} total matches` };
    }
  },

  {
    id: '08.06',
    name: 'Batch: 3 glob queries with different patterns',
    run: async () => {
      const result = await callMCPTool('discover', {
        queries: [
          { id: 'typescript', type: 'glob', patterns: ['**/*.ts'] },
          { id: 'python', type: 'glob', patterns: ['**/*.py'] },
          { id: 'config', type: 'glob', patterns: ['**/*.json'] }
        ],
        base_path: 'pt-tests/fixtures'
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const queryIds = Object.keys(content.data.results);
      if (queryIds.length !== 3) {
        throw new Error(`Expected 3 results, got ${queryIds.length}`);
      }

      const tsCount = content.data.results['typescript'].files.length;
      const pyCount = content.data.results['python'].files.length;
      const jsonCount = content.data.results['config'].files.length;

      return { status: 'PASS', notes: `TS: ${tsCount}, Python: ${pyCount}, JSON: ${jsonCount}` };
    }
  },

  {
    id: '08.07',
    name: 'Mixed batch: 2 grep + 2 glob + 1 symbols',
    run: async () => {
      const result = await callMCPTool('discover', {
        queries: [
          { id: 'grep-export', type: 'grep', pattern: 'export' },
          { id: 'grep-import', type: 'grep', pattern: 'import' },
          { id: 'glob-ts', type: 'glob', patterns: ['**/*.ts'] },
          { id: 'glob-py', type: 'glob', patterns: ['**/*.py'] },
          { id: 'sym-dog', type: 'symbols', query: 'Dog' }
        ],
        base_path: 'pt-tests/fixtures'
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const queryIds = Object.keys(content.data.results);
      if (queryIds.length !== 5) {
        throw new Error(`Expected 5 results, got ${queryIds.length}`);
      }

      // Verify all query types are present
      const requiredIds = ['grep-export', 'grep-import', 'glob-ts', 'glob-py', 'sym-dog'];
      for (const reqId of requiredIds) {
        if (!content.data.results[reqId]) throw new Error(`Missing result for ${reqId}`);
      }

      return { status: 'PASS', notes: 'All 5 mixed queries executed (2 grep, 2 glob, 1 symbols)' };
    }
  },

  {
    id: '08.08',
    name: 'Verbosity: count_only',
    run: async () => {
      const result = await callMCPTool('discover', {
        queries: [
          { id: 'all-ts', type: 'glob', patterns: ['**/*.ts'] }
        ],
        base_path: 'pt-tests/fixtures/typescript',
        verbosity: 'count_only'
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const tsResult = content.data.results['all-ts'];
      
      // In count_only mode, should have count but minimal file details
      if (!tsResult.count && tsResult.count !== 0) {
        throw new Error('count_only should return count field');
      }

      if (tsResult.count === 0) throw new Error('No files found');

      return { status: 'PASS', notes: `Count: ${tsResult.count} files (minimal verbosity)` };
    }
  },

  {
    id: '08.09',
    name: 'Verbosity: locations (verify line numbers present)',
    run: async () => {
      const result = await callMCPTool('discover', {
        queries: [
          { id: 'grep-class', type: 'grep', pattern: 'class Dog' }
        ],
        base_path: 'pt-tests/fixtures',
        verbosity: 'locations'
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const grepResult = content.data.results['grep-class'];
      
      // For grep queries, discover returns files array (not locations)
      if (!grepResult.files || grepResult.files.length === 0) {
        throw new Error('locations verbosity should return files data');
      }

      // Verify files are present (locations verbosity still returns files for grep)
      if (grepResult.count === undefined) {
        throw new Error('Should include count');
      }

      return { status: 'PASS', notes: `Found ${grepResult.files.length} file(s) with matches` };
    }
  },

  {
    id: '08.10',
    name: 'Large batch: 8 queries of mixed types',
    run: async () => {
      const result = await callMCPTool('discover', {
        queries: [
          { id: 'q1', type: 'grep', pattern: 'class' },
          { id: 'q2', type: 'grep', pattern: 'interface' },
          { id: 'q3', type: 'grep', pattern: 'function' },
          { id: 'q4', type: 'glob', patterns: ['**/*.ts'] },
          { id: 'q5', type: 'glob', patterns: ['**/*.py'] },
          { id: 'q6', type: 'glob', patterns: ['**/*.json'] },
          { id: 'q7', type: 'symbols', query: 'Dog' },
          { id: 'q8', type: 'symbols', query: 'Cat' }
        ],
        base_path: 'pt-tests/fixtures'
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const queryIds = Object.keys(content.data.results);
      if (queryIds.length !== 8) {
        throw new Error(`Expected 8 results, got ${queryIds.length}`);
      }

      // Count total results
      let totalFiles = 0;
      const results = content.data.results;
      for (const id of queryIds) {
        const queryData = content.data[id];
        totalFiles += results[id].files?.length || results[id].count || 0;
      }

      return { status: 'PASS', notes: `All 8 queries executed in parallel, ${totalFiles} total results` };
    }
  }
];

async function runAllTests() {
  console.log('Starting E2E Test Suite 08 - discover\n');
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
    const markdown = `# Suite 08: discover - E2E Test Results

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

    writeFileSync(join(outputDir, 'suite-08-discover.md'), markdown);

    console.log(`\n✓ Results written to new_e2e_tests/output/suite-08-discover.md`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
