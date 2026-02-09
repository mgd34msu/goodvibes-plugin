#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';

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
  { id: '02.01', name: 'Create single file with content', run: async () => {
    const result = await callMCPTool('precision_write', {
      files: [{ path: join(__dirname, 'tmp/test-01.txt'), content: 'Hello World', mode: 'fail_if_exists' }]
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success || content.data.summary.files_created !== 1) throw new Error('File not created');
    return { status: 'PASS', notes: 'Created single file' };
  }},
  { id: '02.02', name: 'Create file in nested directory', run: async () => {
    const result = await callMCPTool('precision_write', {
      files: [{ path: join(__dirname, 'tmp/deeply/nested/dirs/test.txt'), content: 'Nested content', mode: 'fail_if_exists' }]
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success || content.data.summary.files_created !== 1) throw new Error('Nested file not created');
    return { status: 'PASS', notes: 'Auto-created parent dirs' };
  }},
  { id: '02.03', name: 'fail_if_exists mode (write twice)', run: async () => {
    const path = join(__dirname, 'tmp/test-03.txt');
    await callMCPTool('precision_write', { files: [{ path, content: 'First', mode: 'fail_if_exists' }]});
    const result2 = await callMCPTool('precision_write', { files: [{ path, content: 'Second', mode: 'fail_if_exists' }], verbosity: 'verbose' });
    const content = JSON.parse(result2.content[0].text);
    if (!content.success) throw new Error(`Expected success=true, got ${content.success}`);
    if (!content.data.files || content.data.files.length === 0) throw new Error('No files in response');
    const fileResult = content.data.files[0];
    if (fileResult.status !== 'skipped') throw new Error(`Expected status=skipped, got ${fileResult.status}`);
    if (!fileResult.error || !fileResult.error.includes('fail_if_exists')) throw new Error(`Expected error message about fail_if_exists, got ${fileResult.error}`);
    return { status: 'PASS', notes: 'Correctly skipped existing file with error message' };
  }},
  { id: '02.04', name: 'overwrite mode', run: async () => {
    const path = join(__dirname, 'tmp/test-04.txt');
    await callMCPTool('precision_write', { files: [{ path, content: 'Original', mode: 'overwrite' }]});
    const result = await callMCPTool('precision_write', { files: [{ path, content: 'Updated', mode: 'overwrite' }]});
    const content = JSON.parse(result.content[0].text);
    if (!content.success || content.data.summary.files_overwritten !== 1) throw new Error('Not overwritten');
    return { status: 'PASS', notes: 'File overwritten' };
  }},
  { id: '02.05', name: 'backup mode', run: async () => {
    const path = join(__dirname, 'tmp/test-05.txt');
    await callMCPTool('precision_write', { files: [{ path, content: 'Original', mode: 'overwrite' }]});
    const result = await callMCPTool('precision_write', { files: [{ path, content: 'Updated', mode: 'backup' }]});
    const content = JSON.parse(result.content[0].text);
    if (!content.success) throw new Error('Backup failed');
    return { status: 'PASS', notes: 'Backup created' };
  }},
  { id: '02.06', name: 'Batch write 5 files', run: async () => {
    const files = [1,2,3,4,5].map(i => ({ path: join(__dirname, `tmp/batch-${i}.txt`), content: `Content ${i}`, mode: 'overwrite' }));
    const result = await callMCPTool('precision_write', { files });
    const content = JSON.parse(result.content[0].text);
    if (!content.success || content.data.files.length !== 5) throw new Error('Not all files written');
    return { status: 'PASS', notes: 'Wrote 5 files in batch' };
  }},
  { id: '02.07', name: 'Write with specific encoding', run: async () => {
    const result = await callMCPTool('precision_write', {
      files: [{ path: join(__dirname, 'tmp/test-07.txt'), content: 'UTF-8 content', encoding: 'utf-8', mode: 'overwrite' }]
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success) throw new Error('Encoding write failed');
    return { status: 'PASS', notes: 'Wrote with utf-8 encoding' };
  }},
  { id: '02.08', name: 'dry_run mode', run: async () => {
    const result = await callMCPTool('precision_write', {
      files: [{ path: join(__dirname, 'tmp/test-08-dryrun.txt'), content: 'Should not exist', mode: 'fail_if_exists' }],
      dry_run: true
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success || !content.data.dry_run) throw new Error('Dry run failed');
    if (existsSync(join(__dirname, 'tmp/test-08-dryrun.txt'))) throw new Error('File was created in dry_run');
    return { status: 'PASS', notes: 'Dry run succeeded, no file created' };
  }},
  { id: '02.09', name: 'Write with base64 content', run: async () => {
    const b64 = Buffer.from('Base64 encoded content').toString('base64');
    const result = await callMCPTool('precision_write', {
      files: [{ path: join(__dirname, 'tmp/test-09.txt'), content_base64: b64, mode: 'overwrite' }]
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success) throw new Error('Base64 write failed');
    return { status: 'PASS', notes: 'Wrote base64 content' };
  }},
  { id: '02.10', name: 'Write file with special chars in content', run: async () => {
    const special = `Quotes: "double" 'single'
Backticks: \`template\`
Dollars: \${variable}`;
    const result = await callMCPTool('precision_write', {
      files: [{ path: join(__dirname, 'tmp/test-10.txt'), content: special, mode: 'overwrite' }]
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success) throw new Error('Special chars write failed');
    return { status: 'PASS', notes: 'Wrote special characters' };
  }},
  { id: '02.11', name: 'Write file with special chars in path', run: async () => {
    const result = await callMCPTool('precision_write', {
      files: [{ path: join(__dirname, 'tmp/test-with-dashes-and_underscores.txt'), content: 'Path test', mode: 'overwrite' }]
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success) throw new Error('Special path write failed');
    return { status: 'PASS', notes: 'Wrote file with special path chars' };
  }},
  { id: '02.12', name: 'Batch write 20 files', run: async () => {
    const files = Array.from({length: 20}, (_, i) => ({ path: join(__dirname, `tmp/batch20-${i}.txt`), content: `Batch content ${i}`, mode: 'overwrite' }));
    const result = await callMCPTool('precision_write', { files });
    const content = JSON.parse(result.content[0].text);
    if (!content.success || content.data.files.length !== 20) throw new Error('Not all 20 files written');
    return { status: 'PASS', notes: 'Wrote 20 files in batch' };
  }},
  { id: '02.13', name: 'Write large content (10KB+)', run: async () => {
    const large = 'A'.repeat(12000);
    const result = await callMCPTool('precision_write', {
      files: [{ path: join(__dirname, 'tmp/test-13-large.txt'), content: large, mode: 'overwrite' }]
    });
    const content = JSON.parse(result.content[0].text);
    if (!content.success || content.data.summary.bytes_written < 10000) throw new Error('Large file not written');
    return { status: 'PASS', notes: `Wrote ${content.data.summary.bytes_written} bytes` };
  }},
  { id: '02.14', name: 'Batch write 50 files', run: async () => {
    const files = Array.from({length: 50}, (_, i) => ({ path: join(__dirname, `tmp/batch50-${i}.txt`), content: `Content ${i}`, mode: 'overwrite' }));
    const result = await callMCPTool('precision_write', { files });
    const content = JSON.parse(result.content[0].text);
    if (!content.success || content.data.files.length !== 50) throw new Error(`Expected 50 files, got ${content.data.files.length}`);
    return { status: 'PASS', notes: 'Wrote 50 files in batch' };
  }},
  { id: '02.15', name: 'Write → Read back → Verify exact match', run: async () => {
    const original = 'Exact content verification test with special chars: !@#$%';
    const path = join(__dirname, 'tmp/test-15-verify.txt');
    await callMCPTool('precision_write', { files: [{ path, content: original, mode: 'overwrite' }]});
    const readResult = await callMCPTool('precision_read', { files: [{ path }], extract: 'content' });
    const readContent = JSON.parse(readResult.content[0].text);
    if (!readContent.success) throw new Error('Read failed');
    const fileData = readContent.data.files[path] || readContent.data.files['tmp/test-15-verify.txt'] || Object.values(readContent.data.files)[0];
    if (!fileData || !fileData.content) throw new Error(`No content found in response: ${JSON.stringify(readContent.data.files).substring(0, 100)}`);
    const retrieved = fileData.content.replace(/^\s*\d+\s*\|\s*/gm, '').trim();
    if (retrieved !== original) throw new Error(`Content mismatch: '${retrieved}' !== '${original}'`);
    return { status: 'PASS', notes: 'Write/read roundtrip verified' };
  }}
];

try { rmSync(join(__dirname, 'tmp'), { recursive: true, force: true }); console.log('\nCleaned up tmp/ directory'); } catch(e) { console.warn('Cleanup warning:', e.message); }

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
    const markdown = `# Suite 02: precision-write - E2E Test Results

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
    writeFileSync(join(outputDir, 'suite-02-precision-write.md'), markdown);
    console.log(`\n✓ Results written to new_e2e_tests/output/suite-02-precision-write.md`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => { console.error('Fatal error:', err); process.exit(1); });
