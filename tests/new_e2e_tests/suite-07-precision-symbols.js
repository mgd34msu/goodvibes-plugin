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
    id: '07.01',
    name: 'Workspace mode: search for "Dog" symbol',
    run: async () => {
      const result = await callMCPTool('precision_symbols', {
        mode: 'workspace',
        query: 'Dog',
        base_path: 'pt-tests/fixtures'
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      if (!content.data.symbols || content.data.symbols.length === 0) {
        throw new Error('No symbols found');
      }

      const hasDogClass = content.data.symbols.some(s => s.name === 'Dog' && s.kind === 'class');
      if (!hasDogClass) throw new Error('Dog class not found');

      return { status: 'PASS', notes: `Found ${content.data.symbols.length} symbol(s) including Dog class` };
    }
  },

  {
    id: '07.02',
    name: 'Workspace mode: search for "IAnimal" (interface)',
    run: async () => {
      const result = await callMCPTool('precision_symbols', {
        mode: 'workspace',
        query: 'IAnimal',
        base_path: 'pt-tests/fixtures'
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      if (!content.data.symbols || content.data.symbols.length === 0) {
        throw new Error('No symbols found');
      }

      const hasInterface = content.data.symbols.some(s => s.name === 'IAnimal' && s.kind === 'interface');
      if (!hasInterface) throw new Error('IAnimal interface not found');

      return { status: 'PASS', notes: `Found ${content.data.symbols.length} symbol(s) including IAnimal interface` };
    }
  },

  {
    id: '07.03',
    name: 'Document mode: extract all symbols from sample-classes.ts',
    run: async () => {
      const result = await callMCPTool('precision_symbols', {
        mode: 'document',
        files: ['pt-tests/fixtures/typescript/sample-classes.ts']
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const symbols = content.data.symbols || [];
      // Symbols already assigned above

      if (symbols.length === 0) throw new Error('No symbols extracted');

      // Check for various symbol types
      const hasClass = symbols.some(s => s.kind === 'class');
      const hasInterface = symbols.some(s => s.kind === 'interface');
      const hasFunction = symbols.some(s => s.kind === 'function');

      if (!hasClass || !hasInterface) {
        throw new Error('Missing expected symbol types');
      }

      return { status: 'PASS', notes: `Extracted ${symbols.length} symbols (classes, interfaces, functions, etc.)` };
    }
  },

  {
    id: '07.04',
    name: 'Document mode: filter by kind (class only)',
    run: async () => {
      const result = await callMCPTool('precision_symbols', {
        mode: 'document',
        files: ['pt-tests/fixtures/typescript/sample-classes.ts'],
        kinds: ['class']
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const symbols = content.data.symbols || [];
      // Symbols already assigned above

      if (symbols.length === 0) throw new Error('No symbols found');

      const allAreClasses = symbols.every(s => s.kind === 'class');
      if (!allAreClasses) {
        const kinds = [...new Set(symbols.map(s => s.kind))];
        throw new Error(`Expected only classes, got: ${kinds.join(', ')}`);
      }

      return { status: 'PASS', notes: `Found ${symbols.length} class symbols (filtered correctly)` };
    }
  },

  {
    id: '07.05',
    name: 'Document mode: filter by kind (function only) on sample-functions.ts',
    run: async () => {
      const result = await callMCPTool('precision_symbols', {
        mode: 'document',
        files: ['pt-tests/fixtures/typescript/sample-functions.ts'],
        kinds: ['function']
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const symbols = content.data.symbols || [];
      // Symbols already assigned above

      if (symbols.length === 0) throw new Error('No function symbols found');

      const allAreFunctions = symbols.every(s => s.kind === 'function');
      if (!allAreFunctions) {
        const kinds = [...new Set(symbols.map(s => s.kind))];
        throw new Error(`Expected only functions, got: ${kinds.join(', ')}`);
      }

      return { status: 'PASS', notes: `Found ${symbols.length} function symbols` };
    }
  },

  {
    id: '07.06',
    name: 'Document mode: exported_only filter',
    run: async () => {
      const result = await callMCPTool('precision_symbols', {
        mode: 'document',
        files: ['pt-tests/fixtures/typescript/sample-classes.ts'],
        exported_only: true
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const symbols = content.data.symbols || [];
      // Symbols already assigned above

      if (symbols.length === 0) throw new Error('No exported symbols found');

      // Check that private symbols are filtered out
      const hasDog = symbols.some(s => s.name === 'Dog'); // exported
      const hasCat = symbols.some(s => s.name === 'Cat'); // not exported
      const hasHelperFunction = symbols.some(s => s.name === 'helperFunction'); // not exported

      if (hasCat || hasHelperFunction) {
        throw new Error('Non-exported symbols were included');
      }

      if (!hasDog) throw new Error('Exported Dog class not found');

      return { status: 'PASS', notes: `Found ${symbols.length} exported symbols (private symbols filtered)` };
    }
  },

  {
    id: '07.07',
    name: 'Output format: names_only',
    run: async () => {
      const result = await callMCPTool('precision_symbols', {
        mode: 'document',
        files: ['pt-tests/fixtures/typescript/sample-classes.ts'],
        output: { format: 'names_only' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const symbols = content.data.symbols || [];
      // Symbols already assigned above

      if (symbols.length === 0) throw new Error('No symbols found');

      // Verify symbols are simplified (just name/kind)
      const firstSymbol = symbols[0];
      if (firstSymbol.location || firstSymbol.signature) {
        throw new Error('names_only should not include location or signature');
      }

      if (!firstSymbol.name || !firstSymbol.kind) {
        throw new Error('names_only should include name and kind');
      }

      return { status: 'PASS', notes: `Returned ${symbols.length} symbol names (minimal format)` };
    }
  },

  {
    id: '07.08',
    name: 'Output format: locations',
    run: async () => {
      const result = await callMCPTool('precision_symbols', {
        mode: 'document',
        files: ['pt-tests/fixtures/typescript/sample-classes.ts'],
        output: { format: 'locations' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const symbols = content.data.symbols || [];
      // Symbols already assigned above

      if (symbols.length === 0) throw new Error('No symbols found');

      // Verify location data is included
      const firstSymbol = symbols[0];
      if (!firstSymbol.line && firstSymbol.line !== 0) {
        throw new Error('locations format should include line numbers');
      }

      return { status: 'PASS', notes: `Returned ${symbols.length} symbols with locations` };
    }
  },

  {
    id: '07.09',
    name: 'Output format: signatures',
    run: async () => {
      const result = await callMCPTool('precision_symbols', {
        mode: 'document',
        files: ['pt-tests/fixtures/typescript/sample-functions.ts'],
        output: { format: 'signatures' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const symbols = content.data.symbols || [];
      // Symbols already assigned above

      if (symbols.length === 0) throw new Error('No symbols found');

      // Find a function with signature
      const functionSymbol = symbols.find(s => s.kind === 'function');
      if (!functionSymbol) throw new Error('No function symbol found');

      if (!functionSymbol.signature || functionSymbol.signature.length === 0) {
        throw new Error('signatures format should include signature text');
      }

      return { status: 'PASS', notes: `Returned ${symbols.length} symbols with signatures` };
    }
  },

  {
    id: '07.10',
    name: 'Output format: full (with all details)',
    run: async () => {
      const result = await callMCPTool('precision_symbols', {
        mode: 'document',
        files: ['pt-tests/fixtures/typescript/sample-classes.ts'],
        output: { format: 'full' }
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const symbols = content.data.symbols || [];
      // Symbols already assigned above

      if (symbols.length === 0) throw new Error('No symbols found');

      // Verify full details are included
      const classSymbol = symbols.find(s => s.kind === 'class');
      if (!classSymbol) throw new Error('No class symbol found');

      if (!classSymbol.name || !classSymbol.kind || (!classSymbol.line && classSymbol.line !== 0)) {
        throw new Error('full format missing expected fields');
      }

      return { status: 'PASS', notes: `Returned ${symbols.length} symbols with full details` };
    }
  },

  {
    id: '07.11',
    name: 'Python file: extract symbols from sample_classes.py',
    run: async () => {
      const result = await callMCPTool('precision_symbols', {
        mode: 'document',
        files: ['pt-tests/fixtures/python/sample_classes.py']
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const symbols = content.data.symbols || [];
      // Symbols already assigned above

      if (symbols.length === 0) throw new Error('No Python symbols extracted');

      // Check for Python classes
      const hasPerson = symbols.some(s => s.name === 'Person' && s.kind === 'class');
      const hasAnimal = symbols.some(s => s.name === 'Animal' && s.kind === 'class');
      const hasDog = symbols.some(s => s.name === 'Dog' && s.kind === 'class');

      if (!hasPerson || !hasAnimal || !hasDog) {
        throw new Error('Missing expected Python classes');
      }

      return { status: 'PASS', notes: `Extracted ${symbols.length} Python symbols (classes, functions)` };
    }
  },

  {
    id: '07.12',
    name: 'Multi-file document mode: 3 TypeScript files at once',
    run: async () => {
      const result = await callMCPTool('precision_symbols', {
        mode: 'document',
        files: [
          'pt-tests/fixtures/typescript/sample-classes.ts',
          'pt-tests/fixtures/typescript/sample-functions.ts',
          'pt-tests/fixtures/typescript/sample-exports.ts'
        ]
      });

      const content = JSON.parse(result.content[0].text);
      if (!content.success) throw new Error('Call failed');

      const symbols = content.data.symbols || [];
      
      if (symbols.length === 0) {
        throw new Error('No symbols found');
      }

      // Count files by checking unique file paths in symbols
      const files = [...new Set(symbols.map(s => s.file))];
      if (files.length !== 3) {
        throw new Error(`Expected 3 files, got ${files.length}`);
      }

      // Verify each file has symbols
      for (const file of files) {
        const fileSymbols = symbols.filter(s => s.file === file);
        if (fileSymbols.length === 0) {
          throw new Error(`File ${file} has no symbols`);
        }
      }
      
      const totalSymbols = symbols.length;

      return { status: 'PASS', notes: `Extracted ${totalSymbols} symbols from 3 files` };
    }
  }
];

async function runAllTests() {
  console.log('Starting E2E Test Suite 07 - precision_symbols\n');
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
    const markdown = `# Suite 07: precision_symbols - E2E Test Results

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

    writeFileSync(join(outputDir, 'suite-07-precision-symbols.md'), markdown);

    console.log(`\n✓ Results written to new_e2e_tests/output/suite-07-precision-symbols.md`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
