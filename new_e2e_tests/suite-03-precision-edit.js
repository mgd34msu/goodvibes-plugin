#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const serverPath = join(projectRoot, 'plugins/goodvibes/tools/implementations/precision-engine/dist/index.cjs');
const tmpDir = join(__dirname, 'tmp');

// Ensure tmp dir exists
mkdirSync(tmpDir, { recursive: true });

let testId = 0;
function callMCPTool(toolName, params) {
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
    server.on('close', (code) => { if (code !== 0 && code !== null) reject(new Error('Server exited ' + code)); });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e-test', version: '1.0.0' }} }) + '\n');
    setTimeout(() => { server.kill(); reject(new Error('Timeout 30s')); }, 30000);
  });
}

const results = [];

async function test(name, fn) {
  const id = String(++testId).padStart(2, '0');
  const fullName = '03.' + id + ' - ' + name;
  try {
    await fn();
    results.push({ name: fullName, status: 'PASS', error: null });
    console.log('✓ ' + fullName);
  } catch (error) {
    results.push({ name: fullName, status: 'FAIL', error: error.message });
    console.error('✗ ' + fullName + ': ' + error.message);
  }
}

(async () => {
  // Test 03.01 - Exact match
  await test('Exact match: replace World with Universe', async () => {
    const filePath = join(tmpDir, 'test01.txt');
    await callMCPTool('precision_write', { files: [{ path: filePath, content: 'Hello World' }] });
    const editResult = await callMCPTool('precision_edit', { edits: [{ path: filePath, find: 'World', replace: 'Universe' }] });
    const editData = JSON.parse(editResult.content[0].text);
    if (!editData.success) throw new Error('Edit failed');
    const readResult = await callMCPTool('precision_read', { files: [{ path: filePath }], output: { include_line_numbers: false } });
    const readData = JSON.parse(readResult.content[0].text);
    const content = Object.values(readData.data.files)[0].content;
    if (content !== 'Hello Universe') throw new Error('Expected Hello Universe, got: ' + content);
  });

  // Test 03.02 - Occurrence "first"
  await test('Occurrence first: replace only first foo', async () => {
    const filePath = join(tmpDir, 'test02.txt');
    await callMCPTool('precision_write', { files: [{ path: filePath, content: 'foo bar foo baz foo' }] });
    const editResult = await callMCPTool('precision_edit', { edits: [{ path: filePath, find: 'foo', replace: 'XXX', occurrence: 'first' }] });
    const editData = JSON.parse(editResult.content[0].text);
    if (!editData.success) throw new Error('Edit failed');
    const readResult = await callMCPTool('precision_read', { files: [{ path: filePath }], output: { include_line_numbers: false } });
    const readData = JSON.parse(readResult.content[0].text);
    const content = Object.values(readData.data.files)[0].content;
    if (content !== 'XXX bar foo baz foo') throw new Error('Expected XXX bar foo baz foo, got: ' + content);
  });

  // Test 03.03 - Occurrence "last"
  await test('Occurrence last: replace only last foo', async () => {
    const filePath = join(tmpDir, 'test03.txt');
    await callMCPTool('precision_write', { files: [{ path: filePath, content: 'foo bar foo baz foo' }] });
    const editResult = await callMCPTool('precision_edit', { edits: [{ path: filePath, find: 'foo', replace: 'XXX', occurrence: 'last' }] });
    const editData = JSON.parse(editResult.content[0].text);
    if (!editData.success) throw new Error('Edit failed');
    const readResult = await callMCPTool('precision_read', { files: [{ path: filePath }], output: { include_line_numbers: false } });
    const readData = JSON.parse(readResult.content[0].text);
    const content = Object.values(readData.data.files)[0].content;
    if (content !== 'foo bar foo baz XXX') throw new Error('Expected foo bar foo baz XXX, got: ' + content);
  });

  // Test 03.04 - Occurrence "all"
  await test('Occurrence all: replace all foo occurrences', async () => {
    const filePath = join(tmpDir, 'test04.txt');
    await callMCPTool('precision_write', { files: [{ path: filePath, content: 'foo bar foo baz foo' }] });
    const editResult = await callMCPTool('precision_edit', { edits: [{ path: filePath, find: 'foo', replace: 'XXX', occurrence: 'all' }] });
    const editData = JSON.parse(editResult.content[0].text);
    if (!editData.success) throw new Error('Edit failed');
    const readResult = await callMCPTool('precision_read', { files: [{ path: filePath }], output: { include_line_numbers: false } });
    const readData = JSON.parse(readResult.content[0].text);
    const content = Object.values(readData.data.files)[0].content;
    if (content !== 'XXX bar XXX baz XXX') throw new Error('Expected XXX bar XXX baz XXX, got: ' + content);
  });

  // Test 03.05 - Multiple edits atomic
  await test('Multiple edits in atomic transaction', async () => {
    const filePath = join(tmpDir, 'test05.txt');
    await callMCPTool('precision_write', { files: [{ path: filePath, content: 'Hello World and Universe' }] });
    const editResult = await callMCPTool('precision_edit', { edits: [{ path: filePath, find: 'Hello', replace: 'Hi' }, { path: filePath, find: 'World', replace: 'Earth' }], transaction: { mode: 'atomic' } });
    const editData = JSON.parse(editResult.content[0].text);
    if (!editData.success) throw new Error('Edit failed');
    const readResult = await callMCPTool('precision_read', { files: [{ path: filePath }], output: { include_line_numbers: false } });
    const readData = JSON.parse(readResult.content[0].text);
    const content = Object.values(readData.data.files)[0].content;
    if (content !== 'Hi Earth and Universe') throw new Error('Expected Hi Earth and Universe, got: ' + content);
  });

  // Test 03.06 - Fuzzy match
  await test('Fuzzy match mode with whitespace differences', async () => {
    const filePath = join(tmpDir, 'test06.txt');
    await callMCPTool('precision_write', { files: [{ path: filePath, content: 'Hello    World' }] });
    const editResult = await callMCPTool('precision_edit', { edits: [{ path: filePath, find: 'Hello World', replace: 'Greetings' }], match: { mode: 'fuzzy' } });
    const editData = JSON.parse(editResult.content[0].text);
    if (!editData.success) throw new Error('Edit failed');
    const readResult = await callMCPTool('precision_read', { files: [{ path: filePath }], output: { include_line_numbers: false } });
    const readData = JSON.parse(readResult.content[0].text);
    const content = Object.values(readData.data.files)[0].content;
    if (content !== 'Greetings') throw new Error('Expected Greetings, got: ' + content);
  });

  // Test 03.07 - Regex match
  await test('Regex match: replace version pattern', async () => {
    const filePath = join(tmpDir, 'test07.txt');
    await callMCPTool('precision_write', { files: [{ path: filePath, content: 'Version v1.5.3 released' }] });
    const editResult = await callMCPTool('precision_edit', { edits: [{ path: filePath, find: 'v[0-9]+\\.[0-9]+\\.[0-9]+', replace: 'v2.0.0' }], match: { mode: 'regex' } });
    const editData = JSON.parse(editResult.content[0].text);
    if (!editData.success) throw new Error('Edit failed');
    const readResult = await callMCPTool('precision_read', { files: [{ path: filePath }], output: { include_line_numbers: false } });
    const readData = JSON.parse(readResult.content[0].text);
    const content = Object.values(readData.data.files)[0].content;
    if (content !== 'Version v2.0.0 released') throw new Error('Expected Version v2.0.0 released, got: ' + content);
  });

  // Test 03.08 - Regex with capture groups
  await test('Regex with capture groups: swap words', async () => {
    const filePath = join(tmpDir, 'test08.txt');
    await callMCPTool('precision_write', { files: [{ path: filePath, content: 'firstName.lastName' }] });
    const editResult = await callMCPTool('precision_edit', { edits: [{ path: filePath, find: '(\\w+)\\.(\\w+)', replace: '$2.$1' }], match: { mode: 'regex' } });
    const editData = JSON.parse(editResult.content[0].text);
    if (!editData.success) throw new Error('Edit failed');
    const readResult = await callMCPTool('precision_read', { files: [{ path: filePath }], output: { include_line_numbers: false } });
    const readData = JSON.parse(readResult.content[0].text);
    const content = Object.values(readData.data.files)[0].content;
    if (content !== 'lastName.firstName') throw new Error('Expected lastName.firstName, got: ' + content);
  });

  // Test 03.09 - Hints near_line
  await test('Hints near_line: target duplicate text with line hint', async () => {
    const filePath = join(tmpDir, 'test09.txt');
    const content = Array(4).fill('filler').join('\n') + '\n' + 'target text' + '\n' + Array(9).fill('filler').join('\n') + '\n' + 'target text';
    await callMCPTool('precision_write', { files: [{ path: filePath, content }] });
    const editResult = await callMCPTool('precision_edit', { edits: [{ path: filePath, find: 'target text', replace: 'REPLACED', hints: { near_line: 15 } }] });
    const editData = JSON.parse(editResult.content[0].text);
    if (!editData.success) throw new Error('Edit failed');
    const readResult = await callMCPTool('precision_read', { files: [{ path: filePath }], output: { include_line_numbers: false } });
    const readData = JSON.parse(readResult.content[0].text);
    const lines = Object.values(readData.data.files)[0].content.split('\n');
    if (lines[5] !== 'target text') throw new Error('First occurrence should be unchanged');
    if (lines[15] !== 'REPLACED') throw new Error('Second occurrence at line 15 should be REPLACED');
  });

  // Test 03.10 - Hints in_function
  await test('Hints in_function: edit only inside specific function', async () => {
    const filePath = join(tmpDir, 'test10.js');
    const content = 'function foo() {\n  const value = 42;\n}\nfunction bar() {\n  const value = 42;\n}';
    await callMCPTool('precision_write', { files: [{ path: filePath, content }] });
    const editResult = await callMCPTool('precision_edit', { edits: [{ path: filePath, find: 'const value = 42', replace: 'const value = 99', hints: { in_function: 'bar' } }] });
    const editData = JSON.parse(editResult.content[0].text);
    if (!editData.success) throw new Error('Edit failed');
    const readResult = await callMCPTool('precision_read', { files: [{ path: filePath }], output: { include_line_numbers: false } });
    const readData = JSON.parse(readResult.content[0].text);
    const content2 = Object.values(readData.data.files)[0].content;
    if (!content2.includes('function foo() {\n  const value = 42;\n}')) throw new Error('foo() should be unchanged');
    if (!content2.includes('function bar() {\n  const value = 99;\n}')) throw new Error('bar() should have value = 99');
  });

  // Test 03.11 - dry_run mode
  await test('dry_run mode: verify file is NOT changed', async () => {
    const filePath = join(tmpDir, 'test11.txt');
    await callMCPTool('precision_write', { files: [{ path: filePath, content: 'Original Content' }] });
    const editResult = await callMCPTool('precision_edit', { edits: [{ path: filePath, find: 'Original', replace: 'Modified' }], dry_run: true });
    const editData = JSON.parse(editResult.content[0].text);
    if (!editData.success) throw new Error('Dry run should succeed');
    const readResult = await callMCPTool('precision_read', { files: [{ path: filePath }], output: { include_line_numbers: false } });
    const readData = JSON.parse(readResult.content[0].text);
    const content = Object.values(readData.data.files)[0].content;
    if (content !== 'Original Content') throw new Error('File should be unchanged in dry_run mode, got: ' + content);
  });

  // Test 03.12 - Atomic rollback
  await test('Atomic rollback: second edit fails, first is rolled back', async () => {
    const filePath = join(tmpDir, 'test12.txt');
    await callMCPTool('precision_write', { files: [{ path: filePath, content: 'Hello World' }] });
    try {
      await callMCPTool('precision_edit', { edits: [{ path: filePath, find: 'Hello', replace: 'Hi' }, { path: filePath, find: 'NONEXISTENT', replace: 'X' }], transaction: { mode: 'atomic' } });
      throw new Error('Should have failed');
    } catch (e) {
      // Expected to fail
    }
    const readResult = await callMCPTool('precision_read', { files: [{ path: filePath }], output: { include_line_numbers: false } });
    const readData = JSON.parse(readResult.content[0].text);
    const content = Object.values(readData.data.files)[0].content;
    if (content !== 'Hello World') throw new Error('File should be rolled back to original, got: ' + content);
  });

  // Test 03.13 - Case-insensitive matching
  await test('Case-insensitive matching: find hello matching HELLO', async () => {
    const filePath = join(tmpDir, 'test13.txt');
    await callMCPTool('precision_write', { files: [{ path: filePath, content: 'HELLO world' }] });
    const editResult = await callMCPTool('precision_edit', { edits: [{ path: filePath, find: 'hello', replace: 'Hi' }], match: { case_sensitive: false } });
    const editData = JSON.parse(editResult.content[0].text);
    if (!editData.success) throw new Error('Edit failed');
    const readResult = await callMCPTool('precision_read', { files: [{ path: filePath }], output: { include_line_numbers: false } });
    const readData = JSON.parse(readResult.content[0].text);
    const content = Object.values(readData.data.files)[0].content;
    if (content !== 'Hi world') throw new Error('Expected Hi world, got: ' + content);
  });

  // Test 03.14 - Whitespace-insensitive matching
  await test('Whitespace-insensitive matching: find a  b matching a b', async () => {
    const filePath = join(tmpDir, 'test14.txt');
    await callMCPTool('precision_write', { files: [{ path: filePath, content: 'a b c' }] });
    const editResult = await callMCPTool('precision_edit', { edits: [{ path: filePath, find: 'a  b', replace: 'X' }], match: { mode: 'fuzzy' } });
    const editData = JSON.parse(editResult.content[0].text);
    if (!editData.success) throw new Error('Edit failed');
    const readResult = await callMCPTool('precision_read', { files: [{ path: filePath }], output: { include_line_numbers: false } });
    const readData = JSON.parse(readResult.content[0].text);
    const content = Object.values(readData.data.files)[0].content;
    if (content !== 'X c') throw new Error('Expected X c, got: ' + content);
  });

  // Test 03.15 - Batch: edit 5 files
  await test('Batch: create 5 temp files, edit all 5 in one call', async () => {
    const files = Array.from({ length: 5 }, (_, i) => ({
      path: join(tmpDir, 'batch' + (i + 1) + '.txt'),
      content: 'File ' + (i + 1) + ': original'
    }));
    await callMCPTool('precision_write', { files });
    const edits = files.map(f => ({ path: f.path, find: 'original', replace: 'modified' }));
    const editResult = await callMCPTool('precision_edit', { edits });
    const editData = JSON.parse(editResult.content[0].text);
    if (!editData.success) throw new Error('Batch edit failed');
    for (let i = 0; i < 5; i++) {
      const readResult = await callMCPTool('precision_read', { files: [{ path: files[i].path }], output: { include_line_numbers: false } });
      const readData = JSON.parse(readResult.content[0].text);
      const content = Object.values(readData.data.files)[0].content;
      const expected = 'File ' + (i + 1) + ': modified';
      if (content !== expected) throw new Error('File ' + (i + 1) + ' expected ' + expected + ', got: ' + content);
    }
  });

  // Clean up tmp directory before writing results
  rmSync(tmpDir, { recursive: true, force: true });

  // Write results to markdown
  const outputPath = join(__dirname, 'output', 'suite-03-precision-edit.md');
  const header = '# Suite 03: precision_edit E2E Test Results\n\n';
  const table = '| Test | Status | Error |\n|------|--------|-------|\n';
  const rows = results.map(r => '| ' + r.name + ' | ' + r.status + ' | ' + (r.error || '-') + ' |').join('\n');
  const summary = '\n\n## Summary\n\nTotal: ' + results.length + ' | Passed: ' + results.filter(r => r.status === 'PASS').length + ' | Failed: ' + results.filter(r => r.status === 'FAIL').length + '\n';
  
  writeFileSync(outputPath, header + table + rows + summary, 'utf8');
  console.log('\nResults written to ' + outputPath);
})();