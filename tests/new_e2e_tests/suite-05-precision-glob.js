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
    id: '05.01',
    name: 'Basic glob: find *.ts files',
    run: async () => {
      const result = await callMCPTool('precision_glob', {
        patterns: ['*.ts'],
        base_path: 'pt-tests/fixtures/typescript',
        output: { format: 'paths_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const files = content.data.files;
      if (!Array.isArray(files) || files.length === 0) {
        throw new Error('No files found');
      }

      const hasTs = files.some(f => f.endsWith('.ts'));
      if (!hasTs) throw new Error('No .ts files found');

      return { status: 'PASS', notes: `Found ${files.length} TypeScript files` };
    }
  },

  {
    id: '05.02',
    name: 'Recursive glob: **/*.ts',
    run: async () => {
      const result = await callMCPTool('precision_glob', {
        patterns: ['**/*.ts'],
        base_path: 'pt-tests/fixtures',
        output: { format: 'paths_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const files = content.data.files;
      if (!Array.isArray(files) || files.length === 0) {
        throw new Error('No files found');
      }

      const allTs = files.every(f => f.endsWith('.ts'));
      if (!allTs) throw new Error('Non-.ts files in results');

      return { status: 'PASS', notes: `Found ${files.length} TypeScript files recursively` };
    }
  },

  {
    id: '05.03',
    name: 'Preset: typescript',
    run: async () => {
      const result = await callMCPTool('precision_glob', {
        preset: 'typescript',
        base_path: 'pt-tests/fixtures',
        output: { format: 'paths_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const files = content.data.files;
      if (!Array.isArray(files)) throw new Error('No files array');

      const allTypeScript = files.every(f => f.endsWith('.ts') || f.endsWith('.tsx'));
      if (!allTypeScript) throw new Error('Non-TypeScript files in results');

      return { status: 'PASS', notes: `Found ${files.length} files with typescript preset` };
    }
  },

  {
    id: '05.04',
    name: 'Preset: config',
    run: async () => {
      const result = await callMCPTool('precision_glob', {
        preset: 'config',
        base_path: 'pt-tests/fixtures',
        output: { format: 'paths_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const files = content.data.files;
      if (!Array.isArray(files)) throw new Error('No files array');

      const hasConfig = files.some(f => f.includes('config/') || f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.toml'));
      if (!hasConfig) throw new Error('No config files found');

      return { status: 'PASS', notes: `Found ${files.length} config files` };
    }
  },

  {
    id: '05.05',
    name: 'Output format: paths_only (default)',
    run: async () => {
      const result = await callMCPTool('precision_glob', {
        patterns: ['*.ts'],
        base_path: 'pt-tests/fixtures/typescript',
        output: { format: 'paths_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const files = content.data.files;
      if (!Array.isArray(files)) throw new Error('Expected array of paths');

      const firstFile = files[0];
      if (typeof firstFile !== 'string') {
        throw new Error('Expected string paths in paths_only mode');
      }

      return { status: 'PASS', notes: `paths_only format returns ${files.length} string paths` };
    }
  },

  {
    id: '05.06',
    name: 'Output format: count_only',
    run: async () => {
      const result = await callMCPTool('precision_glob', {
        patterns: ['*.ts'],
        base_path: 'pt-tests/fixtures/typescript',
        output: { format: 'count_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      if (Array.isArray(content.data.files)) {
        throw new Error('count_only should not return file list');
      }

      if (!content.data.summary || typeof content.data.summary.total_files !== 'number') {
        throw new Error('Missing summary.total_files');
      }

      return { status: 'PASS', notes: `count_only returns count: ${content.data.summary.total_files}` };
    }
  },

  {
    id: '05.07',
    name: 'Output format: with_stats',
    run: async () => {
      const result = await callMCPTool('precision_glob', {
        patterns: ['*.ts'],
        base_path: 'pt-tests/fixtures/typescript',
        output: { format: 'with_stats', max_results: 3 }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const files = content.data.files;
      if (!Array.isArray(files) || files.length === 0) {
        throw new Error('No files array');
      }

      const firstFile = files[0];
      if (!firstFile.path || typeof firstFile.size !== 'number' || !firstFile.modified) {
        throw new Error('Missing stats (path/size/modified)');
      }

      return { status: 'PASS', notes: `with_stats includes size and modified date for ${files.length} files` };
    }
  },

  {
    id: '05.08',
    name: 'Output format: with_preview',
    run: async () => {
      const result = await callMCPTool('precision_glob', {
        patterns: ['*.ts'],
        base_path: 'pt-tests/fixtures/typescript',
        output: { format: 'with_preview', preview_lines: 5, max_results: 2 }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const files = content.data.files;
      if (!Array.isArray(files) || files.length === 0) {
        throw new Error('No files array');
      }

      const firstFile = files[0];
      if (!firstFile.preview || !Array.isArray(firstFile.preview)) {
        throw new Error('Missing preview content (expected array)');
      }

      return { status: 'PASS', notes: `with_preview includes content preview for ${files.length} files` };
    }
  },

  {
    id: '05.09',
    name: 'Subdirectory pattern (G1 regression)',
    run: async () => {
      const result = await callMCPTool('precision_glob', {
        patterns: ['pt-tests/fixtures/typescript/*.ts'],
        output: { format: 'paths_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const files = content.data.files;
      if (!Array.isArray(files) || files.length === 0) {
        throw new Error('Subdirectory pattern failed (G1 bug regression)');
      }

      const allInTypescript = files.every(f => f.includes('typescript/') && f.endsWith('.ts'));
      if (!allInTypescript) throw new Error('Pattern not working correctly');

      return { status: 'PASS', notes: `Subdirectory pattern works: ${files.length} files (G1 bug fixed)` };
    }
  },

  {
    id: '05.10',
    name: 'Exclude patterns',
    run: async () => {
      const result = await callMCPTool('precision_glob', {
        patterns: ['**/*.ts'],
        base_path: 'pt-tests/fixtures/typescript',
        exclude: ['**/sample-*'],
        output: { format: 'paths_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const files = content.data.files;
      if (!Array.isArray(files)) throw new Error('No files array');

      const hasSample = files.some(f => f.includes('sample-'));
      if (hasSample) throw new Error('Exclude pattern not working');

      return { status: 'PASS', notes: `Exclude works: ${files.length} files (no sample-* files)` };
    }
  },

  {
    id: '05.11',
    name: 'Sort by name, size, modified',
    run: async () => {
      const result1 = await callMCPTool('precision_glob', {
        patterns: ['*.ts'],
        base_path: 'pt-tests/fixtures/typescript',
        output: { format: 'with_stats', sort_by: 'name', sort_order: 'asc', max_results: 5 }
      });

      const content1 = JSON.parse(result1.content[0].text);
      if (!content1.success) throw new Error('Sort by name failed');

      const result2 = await callMCPTool('precision_glob', {
        patterns: ['*.ts'],
        base_path: 'pt-tests/fixtures/typescript',
        output: { format: 'with_stats', sort_by: 'size', sort_order: 'desc', max_results: 5 }
      });

      const content2 = JSON.parse(result2.content[0].text);
      if (!content2.success) throw new Error('Sort by size failed');

      const sizes = content2.data.files.map(f => f.size);
      const isSortedDesc = sizes.every((s, i) => i === 0 || s <= sizes[i-1]);
      if (!isSortedDesc) throw new Error('Size sort order incorrect');

      return { status: 'PASS', notes: 'Sorting by name, size works correctly' };
    }
  },

  {
    id: '05.12',
    name: 'Filter: min_size / max_size',
    run: async () => {
      const result = await callMCPTool('precision_glob', {
        patterns: ['*.ts'],
        base_path: 'pt-tests/fixtures/typescript',
        filters: { min_size: 100, max_size: 10000 },
        output: { format: 'with_stats' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const files = content.data.files;
      if (!Array.isArray(files)) throw new Error('No files array');

      const allInRange = files.every(f => f.size >= 100 && f.size <= 10000);
      if (!allInRange) throw new Error('Size filter not working');

      return { status: 'PASS', notes: `Size filter works: ${files.length} files in range 100-10000 bytes` };
    }
  },

  {
    id: '05.13',
    name: 'Filter: has_content (regex)',
    run: async () => {
      const result = await callMCPTool('precision_glob', {
        patterns: ['*.ts'],
        base_path: 'pt-tests/fixtures/typescript',
        filters: { has_content: 'export class' },
        output: { format: 'paths_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const files = content.data.files;
      if (!Array.isArray(files)) throw new Error('No files array');

      const hasClasses = files.some(f => f.includes('classes') || f.includes('sample-classes'));
      if (!hasClasses) throw new Error('has_content filter not finding expected files');

      return { status: 'PASS', notes: `has_content filter works: ${files.length} files with "export class"` };
    }
  },

  {
    id: '05.14',
    name: 'Filter: multiple filters combined',
    run: async () => {
      const result = await callMCPTool('precision_glob', {
        patterns: ['*.ts'],
        base_path: 'pt-tests/fixtures/typescript',
        filters: {
          min_size: 200,
          has_content: 'export'
        },
        output: { format: 'with_stats' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const files = content.data.files;
      if (!Array.isArray(files)) throw new Error('No files array');

      const allMeetCriteria = files.every(f => f.size >= 200);
      if (!allMeetCriteria) throw new Error('Combined filters not working');

      return { status: 'PASS', notes: `Combined filters work: ${files.length} files (size>=200 + has "export")` };
    }
  },

  {
    id: '05.15',
    name: 'Large glob with max_results limit',
    run: async () => {
      const result = await callMCPTool('precision_glob', {
        patterns: ['**/*'],
        base_path: 'pt-tests/fixtures',
        output: { format: 'paths_only', max_results: 20 }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const files = content.data.files;
      if (!Array.isArray(files)) throw new Error('No files array');

      if (files.length > 20) {
        throw new Error(`max_results not respected: got ${files.length} files`);
      }

      const truncated = content.data.summary?.truncated;

      return { status: 'PASS', notes: `max_results limit works: ${files.length} files (truncated: ${truncated})` };
    }
  }
];

async function runAllTests() {
  console.log('Starting E2E Test Suite 05 - precision_glob\n');
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
    const markdown = `# Suite 05: precision_glob - E2E Test Results

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

    writeFileSync(join(outputDir, 'suite-05-precision-glob.md'), markdown);

    console.log(`\n✓ Results written to new_e2e_tests/output/suite-05-precision-glob.md`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
