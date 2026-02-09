#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'debug', version: '1.0.0' }}
    }) + '\n');

    setTimeout(() => { server.kill(); reject(new Error('Timeout')); }, 10000);
  });
}

async function debug() {
  console.log('Testing extract modes...\n');
  
  // Test outline
  console.log('=== OUTLINE MODE ===');
  try {
    const outline = await callMCPTool('precision_read', {
      files: [{ path: 'pt-tests/fixtures/typescript/sample-classes.ts' }],
      extract: 'outline'
    });
    const outlineContent = JSON.parse(outline.content[0].text);
    console.log('Full response:', JSON.stringify(outlineContent, null, 2));
    const outlineFileKey = Object.keys(outlineContent.data?.files || {})[0];
    if (outlineFileKey) {
      const contentStr = String(outlineContent.data.files[outlineFileKey].content || '');
      console.log('Outline content:', contentStr.substring(0, 500));
    } else {
      console.log('No files in response');
    }
  } catch (e) {
    console.error('Outline error:', e.message);
  }
  
  // Test symbols
  console.log('\n=== SYMBOLS MODE ===');
  try {
    const symbols = await callMCPTool('precision_read', {
      files: [{ path: 'pt-tests/fixtures/typescript/sample-classes.ts' }],
      extract: 'symbols',
      symbol_filter: ['class', 'interface']
    });
    const symbolsContent = JSON.parse(symbols.content[0].text);
    console.log('Full response:', JSON.stringify(symbolsContent, null, 2));
    const symbolsFileKey = Object.keys(symbolsContent.data?.files || {})[0];
    if (symbolsFileKey) {
      const contentStr = String(symbolsContent.data.files[symbolsFileKey].content || '');
      console.log('Symbols content:', contentStr.substring(0, 500));
    } else {
      console.log('No files in response');
    }
  } catch (e) {
    console.error('Symbols error:', e.message);
  }
  
  // Test AST
  console.log('\n=== AST MODE ===');
  try {
    const ast = await callMCPTool('precision_read', {
      files: [{ path: 'pt-tests/fixtures/typescript/sample-functions.ts' }],
      extract: 'ast'
    });
    const astContent = JSON.parse(ast.content[0].text);
    console.log('Full response:', JSON.stringify(astContent, null, 2));
    const astFileKey = Object.keys(astContent.data?.files || {})[0];
    if (astFileKey) {
      const contentStr = String(astContent.data.files[astFileKey].content || '');
      console.log('AST content:', contentStr.substring(0, 500));
    } else {
      console.log('No files in response');
    }
  } catch (e) {
    console.error('AST error:', e.message);
  }
}

debug().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
