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
    server.on('close', (code) => { if (code !== 0 && code !== null) reject(new Error(`Server exited with code ${code}`)); });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e-test', version: '1.0.0' }} }) + '\n');
    setTimeout(() => { server.kill(); reject(new Error('Timeout after 30s')); }, 30000);
  });
}

const tests = [
  { id: '01.01', name: 'Basic content read of a single TypeScript file', run: async () => {
    const result = await callMCPTool('precision_read', {
      files: [{ path: join(projectRoot, 'pt-tests/fixtures/typescript/sample-functions.ts') }], extract: 'content'
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success) throw new Error('Call failed');
    const fileKey = Object.keys(content.data.files)[0];
    if (!fileKey || !content.data.files[fileKey].content) throw new Error('Invalid response');
    return { status: 'PASS', notes: 'Read single TypeScript file' };
  }},
  { id: '01.02', name: 'Line range read (start: 1, end: 10)', run: async () => {
    const result = await callMCPTool('precision_read', {
      files: [{ path: join(projectRoot, 'pt-tests/fixtures/typescript/sample-functions.ts'), range: { start: 1, end: 10 } }], extract: 'content'
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success) throw new Error('Call failed');
    const fileKey = Object.keys(content.data.files)[0];
    const lines = content.data.files[fileKey].content.split('\n');
    if (lines.length > 11) throw new Error(`Too many lines: ${lines.length}`);
    return { status: 'PASS', notes: `Line range limited to ${lines.length} lines` };
  }},
  { id: '01.03', name: 'Multi-file batch read (3 files)', run: async () => {
    const result = await callMCPTool('precision_read', {
      files: [
        { path: join(projectRoot, 'pt-tests/fixtures/typescript/sample-functions.ts') },
        { path: join(projectRoot, 'pt-tests/fixtures/typescript/sample-classes.ts') },
        { path: join(projectRoot, 'pt-tests/fixtures/typescript/sample-exports.ts') }
      ],
      extract: 'content'
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success || Object.keys(content.data.files).length !== 3) throw new Error('Expected 3 files');
    return { status: 'PASS', notes: 'Batch read 3 files' };
  }},
  { id: '01.04', name: 'Extract outline from TypeScript file', run: async () => {
    const result = await callMCPTool('precision_read', {
      files: [{ path: join(projectRoot, 'pt-tests/fixtures/typescript/sample-classes.ts') }], extract: 'outline'
    });
    const content = JSON.parse(result.content[0].text);
    const fileKey = Object.keys(content.data.files)[0];
    if (!content.success || !content.data.files[fileKey].outline || content.data.files[fileKey].outline.length === 0) throw new Error('No outline');
    return { status: 'PASS', notes: `Outline: ${content.data.files[fileKey].outline.length} items` };
  }},
  { id: '01.05', name: 'Extract symbols with filter (class + interface only)', run: async () => {
    const result = await callMCPTool('precision_read', {
      files: [{ path: join(projectRoot, 'pt-tests/fixtures/typescript/sample-classes.ts') }], extract: 'symbols', symbol_filter: ['class', 'interface']
    });
    const content = JSON.parse(result.content[0].text);
    const fileKey = Object.keys(content.data.files)[0];
    if (!content.success || !content.data.files[fileKey].symbols) throw new Error('No symbols');
    const kinds = content.data.files[fileKey].symbols.map(s => s.kind);
    const invalid = kinds.find(k => k !== 'class' && k !== 'interface');
    if (invalid) throw new Error(`Unexpected kind: ${invalid}`);
    return { status: 'PASS', notes: `Filtered: ${kinds.length} symbols` };
  }},
  { id: '01.06', name: 'Verbosity: count_only (verify minimal output)', run: async () => {
    const result = await callMCPTool('precision_read', {
      files: [{ path: join(projectRoot, 'pt-tests/fixtures/typescript/sample-functions.ts') }], extract: 'content', verbosity: 'count_only'
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success) throw new Error('Call failed');
    const fileKey = Object.keys(content.data.files)[0];
    if (content.data.files[fileKey].content) throw new Error('Should not return content in count_only');
    if (!content.data.files[fileKey].size_bytes) throw new Error('Should return size_bytes');
    return { status: 'PASS', notes: `count_only: size=${content.data.files[fileKey].size_bytes}` };
  }},
  { id: '01.07', name: 'Verbosity: minimal vs standard vs verbose', run: async () => {
    const file = join(projectRoot, 'pt-tests/fixtures/typescript/sample-functions.ts');
    const min = await callMCPTool('precision_read', { files: [{ path: file }], extract: 'content', verbosity: 'minimal' });
    const std = await callMCPTool('precision_read', { files: [{ path: file }], extract: 'content', verbosity: 'standard' });
    const verb = await callMCPTool('precision_read', { files: [{ path: file }], extract: 'content', verbosity: 'verbose' });
    const minData = JSON.parse(min.content[0].text);
    const stdData = JSON.parse(std.content[0].text);
    const verbData = JSON.parse(verb.content[0].text);
    const minFile = Object.values(minData.data.files)[0];
    const stdFile = Object.values(stdData.data.files)[0];
    const verbFile = Object.values(verbData.data.files)[0];
    const minKeys = Object.keys(minFile).length;
    const stdKeys = Object.keys(stdFile).length;
    const verbKeys = Object.keys(verbFile).length;
    if (!(minKeys <= stdKeys && stdKeys <= verbKeys)) throw new Error(`Field count order wrong: min=${minKeys}, std=${stdKeys}, verb=${verbKeys}`);
    if (!verbData.meta.execution_ms && verbData.meta.execution_ms !== 0) throw new Error('Verbose should include execution_ms');
    return { status: 'PASS', notes: `Fields: min=${minKeys}, std=${stdKeys}, verb=${verbKeys}` };
  }},
  { id: '01.08', name: 'Read with max_per_item limit', run: async () => {
    const result = await callMCPTool('precision_read', {
      files: [{ path: join(projectRoot, 'pt-tests/fixtures/large/generated-10k-lines.txt') }], extract: 'content', output: { max_per_item: 100 }
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success) throw new Error('Call failed');
    const fileKey = Object.keys(content.data.files)[0];
    const fileData = Object.values(content.data.files)[0];
    const lineCount = fileData.content.split('\n').length;
    if (lineCount > 250) throw new Error(`Expected truncated content (~200 lines), got ${lineCount} lines`);
    if (!fileData.pagination && (!fileData.line_count || fileData.line_count <= lineCount)) throw new Error('Expected pagination or line_count to indicate truncation');
    return { status: 'PASS', notes: `Truncated to ${lineCount} lines with pagination indicator` };
  }},
  { id: '01.09', name: 'Large file with token_budget pagination page 1', run: async () => {
    const result = await callMCPTool('precision_read', {
      files: [{ path: join(projectRoot, 'pt-tests/fixtures/large/generated-10k-lines.txt') }], extract: 'content', token_budget: 1000, page: 1
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success) throw new Error('Call failed');
    const fileData = Object.values(content.data.files)[0];
    if (!fileData.content) throw new Error('No content returned');
    return { status: 'PASS', notes: `Page 1 returned ${fileData.line_count} lines` };
  }},
  { id: '01.10', name: 'Token_budget pagination page 2 (verify different)', run: async () => {
    const p1 = await callMCPTool('precision_read', {
      files: [{ path: join(projectRoot, 'pt-tests/fixtures/large/generated-10k-lines.txt') }], extract: 'content', token_budget: 1000, page: 1
    });
    const p2 = await callMCPTool('precision_read', {
      files: [{ path: join(projectRoot, 'pt-tests/fixtures/large/generated-10k-lines.txt') }], extract: 'content', token_budget: 1000, page: 2
    });
    const c1 = JSON.parse(p1.content[0].text), c2 = JSON.parse(p2.content[0].text);
    if (!c1.success || !c2.success) throw new Error('Call failed');
    const content1 = Object.values(c1.data.files)[0].content;
    const content2 = Object.values(c2.data.files)[0].content;
    if (content1 === content2) throw new Error('Pages identical');
    return { status: 'PASS', notes: 'Page 2 differs from page 1' };
  }},
  { id: '01.11', name: 'Read image file - verify ImageContent', run: async () => {
    const result = await callMCPTool('precision_read', {
      files: [{ path: join(projectRoot, 'pt-tests/fixtures/media/tiny.png') }], extract: 'content'
    });
    const hasImg = result.content.some(i => i.type === 'image');
    if (!hasImg) throw new Error('No ImageContent');
    return { status: 'PASS', notes: 'Image returned ImageContent block' };
  }},
  { id: '01.12', name: 'Read PDF with pages parameter', run: async () => {
    const result = await callMCPTool('precision_read', {
      files: [{ path: join(projectRoot, 'pt-tests/fixtures/pdf/sample.pdf'), pages: '1' }], extract: 'content'
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success) throw new Error('Call failed');
    const fileData = Object.values(content.data.files)[0];
    if (!fileData.content) throw new Error('No PDF content');
    return { status: 'PASS', notes: `PDF extracted: ${fileData.content.substring(0, 30)}...` };
  }},
  { id: '01.13', name: 'Read Jupyter notebook', run: async () => {
    const result = await callMCPTool('precision_read', {
      files: [{ path: join(projectRoot, 'pt-tests/fixtures/notebook/sample.ipynb') }], extract: 'content'
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success) throw new Error('Call failed');
    const fileData = Object.values(content.data.files)[0];
    if (!fileData.content) throw new Error('No notebook content');
    const text = fileData.content;
    if (!text.toLowerCase().includes('cell')) throw new Error('No cell markers');
    return { status: 'PASS', notes: 'Notebook parsed' };
  }},
  { id: '01.14', name: 'Read empty + unicode + special chars in batch', run: async () => {
    const result = await callMCPTool('precision_read', {
      files: [{ path: join(projectRoot, 'pt-tests/fixtures/edge-cases/empty.txt') }, { path: join(projectRoot, 'pt-tests/fixtures/edge-cases/unicode.txt') }, { path: join(projectRoot, 'pt-tests/fixtures/edge-cases/special-chars.txt') }],
      extract: 'content'
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success || Object.keys(content.data.files).length !== 3) throw new Error('Expected 3 files');
    return { status: 'PASS', notes: 'Read 3 edge-case files' };
  }},
  { id: '01.15', name: 'Batch read 20 files simultaneously', run: async () => {
    const filePaths = ['typescript/sample-functions.ts', 'typescript/sample-classes.ts', 'typescript/sample-exports.ts', 'typescript/classes.ts', 'typescript/interfaces.ts', 'typescript/large-file.ts', 'config/sample.json', 'config/sample.yaml', 'config/sample.toml', 'edge-cases/empty.txt', 'edge-cases/unicode.txt', 'edge-cases/special-chars.txt', 'edge-cases/very-long-lines.txt', 'edge-cases/mixed-endings.txt', 'edge-cases/deeply/nested/path/file.txt', 'python/sample_classes.py', 'notebook/empty.ipynb', 'typescript/no-classes.ts', 'typescript/imports-example.ts', 'typescript/sample-imports.ts'].map(f => join(projectRoot, 'pt-tests/fixtures', f));
    const files = filePaths.map(p => ({ path: p }));
    const result = await callMCPTool('precision_read', { files, extract: 'content', verbosity: 'minimal' });
    const content = JSON.parse(result.content[0].text);
    if (!content.success || Object.keys(content.data.files).length !== 20) throw new Error(`Expected 20 files, got ${Object.keys(content.data.files).length}`);
    return { status: 'PASS', notes: 'Batch read 20 files' };
  }}
];

async function runAllTests() {
  const results = [];
  let passed = 0, failed = 0, partial = 0;
  for (const test of tests) {
    console.log(`Running ${test.id}: ${test.name}...`);
    try {
      const result = await test.run();
      results.push({ ...test, ...result });
      if (result.status === 'PASS') { passed++; console.log(`  ✓ PASS - ${result.notes}`); }
      else if (result.status === 'PARTIAL') { partial++; console.log(`  ⚠ PARTIAL - ${result.notes}`); }
      else { failed++; console.log(`  ✗ ${result.status} - ${result.notes}`); }
    } catch (error) {
      failed++;
      const errorMsg = error.message.substring(0, 200);
      results.push({ ...test, status: 'FAIL', notes: errorMsg });
      console.log(`  ✗ FAIL - ${errorMsg}`);
    }
  }
  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${tests.length} | Passed: ${passed} | Failed: ${failed} | Partial: ${partial}`);
  return { results, passed, failed, partial };
}

runAllTests()
  .then(({ results, passed, failed, partial }) => {
    const markdown = `# Suite 01: precision-read - E2E Test Results

**Date**: ${new Date().toISOString().split('T')[0]}
**Total Tests**: ${results.length}
**Passed**: ${passed}
**Failed**: ${failed}
**Partial**: ${partial}

| # | Test Name | Status | Notes |
|---|-----------|--------|-------|
${results.map(r => `| ${r.id} | ${r.name} | ${r.status} | ${r.notes} |`).join('\n')}
`;
    const outputDir = join(__dirname, 'output');
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, 'suite-01-precision-read.md'), markdown);
    console.log(`\n✓ Results written to new_e2e_tests/output/suite-01-precision-read.md`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => { console.error('Fatal error:', err); process.exit(1); });
