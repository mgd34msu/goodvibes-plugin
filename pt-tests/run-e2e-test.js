#!/usr/bin/env node
/**
 * E2E Test Runner for precision_read MCP tool
 * Invokes the MCP server directly via stdio protocol
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// MCP Server config
const serverPath = join(projectRoot, 'plugins/goodvibes/tools/implementations/precision-engine/dist/index.cjs');

/**
 * Call MCP tool via stdio protocol
 */
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
    let stderr = '';
    let initialized = false;
    let callId = 0;

    server.stdout.on('data', (data) => {
      stdout += data.toString();
      
      // Process line-by-line (MCP uses JSON-RPC with newline delimiters)
      const lines = stdout.split('\n');
      stdout = lines.pop(); // Keep incomplete line
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const message = JSON.parse(line);
          
          if (message.result && message.id === 1) {
            // Initialization response
            initialized = true;
            
            // Now send the actual tool call
            const request = {
              jsonrpc: '2.0',
              id: 2,
              method: 'tools/call',
              params: {
                name: toolName,
                arguments: params
              }
            };
            
            server.stdin.write(JSON.stringify(request) + '\n');
          } else if (message.result && message.id === 2) {
            // Tool call response
            server.kill();
            resolve(message.result);
          } else if (message.error) {
            server.kill();
            reject(new Error(JSON.stringify(message.error)));
          }
        } catch (e) {
          // Ignore parse errors for incomplete JSON
        }
      }
    });

    server.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    server.on('close', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Server exited with code ${code}\n${stderr}`));
      }
    });

    server.on('error', reject);

    // Send initialization request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'e2e-test-runner',
          version: '1.0.0'
        }
      }
    };

    server.stdin.write(JSON.stringify(initRequest) + '\n');

    // Timeout after 30 seconds
    setTimeout(() => {
      server.kill();
      reject(new Error('Tool call timeout after 30s'));
    }, 30000);
  });
}

// Export for use in tests
export { callMCPTool };

// If run directly, do a simple test
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Testing MCP connection...');
  callMCPTool('precision_read', {
    files: [{ path: join(projectRoot, 'package.json') }],
    verbosity: 'count_only'
  })
    .then(result => {
      console.log('✓ MCP connection successful');
      console.log('Result:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('✗ MCP connection failed:', err.message);
      process.exit(1);
    });
}
