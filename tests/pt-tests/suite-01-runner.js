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

    setTimeout(() => { server.kill(); reject(new Error('Timeout')); }, 30000);
  });
}

const tests = [
  {
    id: '01.01',
    name: 'Basic content read',
    run: async () => {
      const result = await callMCPTool('precision_read', {
        files: [{ path: 'pt-tests/fixtures/typescript/sample-classes.ts' }]
      });
      
      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');
      
      const fileKey = Object.keys(content.data.files)[0];
      const fileContent = content.data.files[fileKey]?.content || '';
      
      if (!fileContent.includes('export interface IAnimal')) throw new Error('Missing IAnimal');
      if (!fileContent.includes('export class Dog')) throw new Error('Missing Dog class');
      if (!fileContent.includes('export namespace Utils')) throw new Error('Missing Utils namespace');
      
      return { status: 'PASS', notes: 'All expected content found' };
    }
  },
  
  {
    id: '01.02',
    name: 'Line range read',
    run: async () => {
      const result = await callMCPTool('precision_read', {
        files: [{ 
          path: 'pt-tests/fixtures/typescript/sample-classes.ts',
          range: { start: 1, end: 10 }
        }]
      });
      
      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');
      
      const fileKey = Object.keys(content.data.files)[0];
      const lines = content.data.files[fileKey].content.split('\n').filter(l => l.trim()).length;
      if (lines > 15) throw new Error(`Too many lines: ${lines}`);
      
      return { status: 'PASS', notes: `Returned ${lines} lines (expected ~10)` };
    }
  },
  
  {
    id: '01.03',
    name: 'Multi-file batch read',
    run: async () => {
      const result = await callMCPTool('precision_read', {
        files: [
          { path: 'pt-tests/fixtures/typescript/sample-classes.ts' },
          { path: 'pt-tests/fixtures/typescript/sample-functions.ts' },
          { path: 'pt-tests/fixtures/config/sample.json' }
        ]
      });
      
      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');
      
      const files = Object.keys(content.data.files);
      if (files.length !== 3) throw new Error(`Expected 3 files, got ${files.length}`);
      
      return { status: 'PASS', notes: 'All 3 files read successfully' };
    }
  },
  
  {
    id: '01.04',
    name: 'Extract outline',
    run: async () => {
      const result = await callMCPTool('precision_read', {
        files: [{ path: 'pt-tests/fixtures/typescript/sample-classes.ts' }],
        extract: 'outline'
      });
      
      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');
      
      const fileKey = Object.keys(content.data.files)[0];
      const fileData = content.data.files[fileKey];
      
      // Check for outline array
      if (!fileData.outline || !Array.isArray(fileData.outline)) {
        throw new Error('No outline array found');
      }
      
      // Check for expected symbols
      const symbolNames = fileData.outline.map(s => s.name);
      const hasInterface = symbolNames.includes('IAnimal') || symbolNames.includes('IMovable');
      const hasClass = symbolNames.includes('Dog');
      
      if (!hasInterface || !hasClass) {
        throw new Error(`Missing expected symbols: has interface=${hasInterface}, has class=${hasClass}`);
      }
      
      return { status: 'PASS', notes: `Found ${fileData.outline.length} outline items including classes and interfaces` };
    }
  },
  
  {
    id: '01.05',
    name: 'Extract symbols with filter',
    run: async () => {
      const result = await callMCPTool('precision_read', {
        files: [{ path: 'pt-tests/fixtures/typescript/sample-classes.ts' }],
        extract: 'symbols',
        symbol_filter: ['class', 'interface']
      });
      
      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');
      
      const fileKey = Object.keys(content.data.files)[0];
      const fileData = content.data.files[fileKey];
      
      // Check for symbols array
      if (!fileData.symbols || !Array.isArray(fileData.symbols)) {
        throw new Error('No symbols array found');
      }
      
      // Verify filtering - should only have class and interface
      const kinds = [...new Set(fileData.symbols.map(s => s.kind))];
      const hasOnlyClassAndInterface = kinds.every(k => k === 'class' || k === 'interface');
      
      if (!hasOnlyClassAndInterface) {
        throw new Error(`Unexpected symbol kinds: ${kinds.join(', ')}`);
      }
      
      return { status: 'PASS', notes: `Found ${fileData.symbols.length} symbols (filtered to class/interface)` };
    }
  },
  
  {
    id: '01.06',
    name: 'Extract AST',
    run: async () => {
      const result = await callMCPTool('precision_read', {
        files: [{ path: 'pt-tests/fixtures/typescript/sample-functions.ts' }],
        extract: 'ast'
      });
      
      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');
      
      const fileKey = Object.keys(content.data.files)[0];
      const fileData = content.data.files[fileKey];
      
      // Check for AST object
      if (!fileData.ast || typeof fileData.ast !== 'object') {
        throw new Error('No AST object found');
      }
      
      // Verify AST structure has common properties
      if (!fileData.ast.type && !fileData.ast.kind) {
        throw new Error('AST missing type/kind property');
      }
      
      return { status: 'PASS', notes: 'AST structure returned with proper format' };
    }
  },
  
  {
    id: '01.07',
    name: 'Image file (PNG) - SAFE MODE',
    run: async () => {
      const result = await callMCPTool('precision_read', {
        files: [{ path: 'pt-tests/fixtures/media/tiny.png' }],
        verbosity: 'count_only'
      });
      
      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');
      
      return { status: 'PASS', notes: 'Tool accepts PNG files (verified count_only)' };
    }
  },
  
  {
    id: '01.08',
    name: 'Image file (JPG) - SAFE MODE',
    run: async () => {
      const result = await callMCPTool('precision_read', {
        files: [{ path: 'pt-tests/fixtures/media/tiny.jpg' }],
        verbosity: 'count_only'
      });
      
      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');
      
      return { status: 'PASS', notes: 'Tool accepts JPG files (verified count_only)' };
    }
  },
  
  {
    id: '01.09',
    name: 'SVG file (mixed content) - SAFE MODE',
    run: async () => {
      const result = await callMCPTool('precision_read', {
        files: [{ path: 'pt-tests/fixtures/media/sample.svg' }],
        verbosity: 'standard'
      });
      
      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');
      
      const fileKey = Object.keys(content.data.files)[0];
      const svgContent = content.data.files[fileKey]?.content || '';
      if (!svgContent.includes('svg') && !svgContent.includes('SVG')) {
        throw new Error('SVG content not accessible');
      }
      
      return { status: 'PASS', notes: 'SVG content accessible as text' };
    }
  },
  
  {
    id: '01.10',
    name: 'PDF with page range',
    run: async () => {
      const result = await callMCPTool('precision_read', {
        files: [{ path: 'pt-tests/fixtures/pdf/sample.pdf', pages: '1' }]
      });
      
      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');
      
      const fileKey = Object.keys(content.data.files)[0];
      const pdfContent = content.data.files[fileKey]?.content || '';
      if (!pdfContent || pdfContent.length === 0) {
        throw new Error('No PDF content extracted');
      }
      
      return { status: 'PASS', notes: 'PDF page 1 extracted' };
    }
  },
  
  {
    id: '01.11',
    name: 'Jupyter notebook',
    run: async () => {
      const result = await callMCPTool('precision_read', {
        files: [{ path: 'pt-tests/fixtures/notebook/sample.ipynb' }]
      });
      
      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');
      
      const fileKey = Object.keys(content.data.files)[0];
      const nbContent = content.data.files[fileKey]?.content || '';
      if (!nbContent.includes('cell') && !nbContent.includes('Cell')) {
        throw new Error('Notebook cell content not found');
      }
      
      return { status: 'PASS', notes: 'Notebook cells extracted' };
    }
  },
  
  {
    id: '01.12',
    name: 'Verbosity count_only',
    run: async () => {
      const result = await callMCPTool('precision_read', {
        files: [{ path: 'pt-tests/fixtures/typescript/sample-classes.ts' }],
        verbosity: 'count_only'
      });
      
      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');
      
      const fileKey = Object.keys(content.data.files)[0];
      const fileData = content.data.files[fileKey];
      if (fileData.content && fileData.content.length > 5000) {
        throw new Error('count_only returned too much content');
      }
      
      return { status: 'PASS', notes: 'Minimal response with counts' };
    }
  },
  
  {
    id: '01.13',
    name: 'Verbosity verbose',
    run: async () => {
      const result = await callMCPTool('precision_read', {
        files: [{ path: 'pt-tests/fixtures/config/sample.json' }],
        verbosity: 'verbose'
      });
      
      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');
      
      if (!content.meta || !content.data.summary) {
        throw new Error('Missing verbose metadata');
      }
      
      return { status: 'PASS', notes: 'Extra metadata included' };
    }
  },
  
  {
    id: '01.14',
    name: 'Large file with output limit',
    run: async () => {
      const result = await callMCPTool('precision_read', {
        files: [{ path: 'pt-tests/fixtures/typescript/large-file.ts' }],
        output: { max_lines_per_file: 50 }
      });
      
      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');
      
      const fileKey = Object.keys(content.data.files)[0];
      const lines = content.data.files[fileKey].content.split('\n').length;
      if (lines > 100) {
        throw new Error(`Too many lines: ${lines} (expected ~50)`);
      }
      
      return { status: 'PASS', notes: `Limited to ${lines} lines` };
    }
  },
  
  {
    id: '01.15',
    name: 'File not found error',
    run: async () => {
      const result = await callMCPTool('precision_read', {
        files: [{ path: 'pt-tests/fixtures/nonexistent-file.ts' }]
      });
      
      const content = JSON.parse(result.content[0].text);
      
      if (content.success && content.data.summary.files_not_found === 0) {
        throw new Error('Should have reported file not found');
      }
      
      return { status: 'PASS', notes: 'Error handled gracefully' };
    }
  }
];

async function runAllTests() {
  console.log('Starting E2E Test Suite 01 - precision_read\n');
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
    const markdown = `# Suite 01: precision_read - E2E Test Results

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

    const outputDir = join(projectRoot, 'pt-tests/output');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    
    writeFileSync(join(outputDir, 'suite-01-precision-read.md'), markdown);
    
    console.log(`\n✓ Results written to pt-tests/output/suite-01-precision-read.md`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
