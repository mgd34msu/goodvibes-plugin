#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test configuration
const serverPath = path.join(__dirname, '..', 'plugins', 'goodvibes', 'tools', 'implementations', 'precision-engine', 'dist', 'index.cjs');
const projectRoot = path.join(__dirname, '..');
const outputDir = path.join(__dirname, 'output');
const outputFile = path.join(outputDir, 'suite-04-precision-exec.md');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

let testResults = [];
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Helper to call MCP tool
function callMCPTool(toolName, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PLUGIN_ROOT: path.join(projectRoot, 'plugins/goodvibes'),
        NODE_ENV: 'test',
        PROJECT_ROOT: projectRoot
      }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      try {
        const lines = stdout.split('\n').filter(line => line.trim());
        let initResponse, toolResponse;

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === 1) initResponse = parsed;
            if (parsed.id === 2) toolResponse = parsed;
          } catch (e) {
            // Skip non-JSON lines
          }
        }

        if (toolResponse?.result?.content?.[0]?.text) {
          const result = JSON.parse(toolResponse.result.content[0].text);
          resolve(result);
        } else {
          reject(new Error('No valid tool response found'));
        }
      } catch (error) {
        reject(error);
      }
    });

    // Send initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'e2e-test', version: '1.0.0' }
      }
    };
    child.stdin.write(JSON.stringify(initRequest) + '\n');

    // Send tool call request
    setTimeout(() => {
      const toolRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      };
      child.stdin.write(JSON.stringify(toolRequest) + '\n');
      child.stdin.end();
    }, 100);
  });
}

// Test runner
async function runTest(testNumber, testName, testFn) {
  totalTests++;
  const testId = `04.${testNumber.toString().padStart(2, '0')}`;
  console.log(`\nRunning ${testId}: ${testName}...`);

  try {
    await testFn();
    console.log(`✓ PASSED: ${testId}`);
    testResults.push(`## ✅ ${testId}: ${testName}\n\nStatus: PASSED\n`);
    passedTests++;
  } catch (error) {
    console.error(`✗ FAILED: ${testId}`);
    console.error(`  Error: ${error.message}`);
    testResults.push(`## ❌ ${testId}: ${testName}\n\nStatus: FAILED\n\nError:\n\`\`\`\n${error.message}\n\`\`\`\n`);
    failedTests++;
  }
}

// Test 04.01 - Simple echo command
async function test01() {
  const result = await callMCPTool('precision_exec', {
    commands: [{ cmd: 'echo "Hello E2E"' }]
  });

  if (!result.success) throw new Error('Command failed');
  if (!result.data.commands[0].stdout.includes('Hello E2E')) {
    throw new Error(`Expected stdout to contain 'Hello E2E', got: ${result.data.commands[0].stdout}`);
  }
  if (result.data.commands[0].exit_code !== 0) {
    throw new Error(`Expected exit code 0, got: ${result.data.commands[0].exit_code}`);
  }
}

// Test 04.02 - Command with cwd
async function test02() {
  const result = await callMCPTool('precision_exec', {
    commands: [{ cmd: 'pwd', cwd: projectRoot }]
  });

  if (!result.success) throw new Error('Command failed');
  if (!result.data.commands[0].stdout.includes(projectRoot)) {
    throw new Error(`Expected stdout to contain project root, got: ${result.data.commands[0].stdout}`);
  }
}

// Test 04.03 - Command with env vars
async function test03() {
  const result = await callMCPTool('precision_exec', {
    commands: [{
      cmd: 'node -e "console.log(process.env.TEST_VAR)"',
      env: { TEST_VAR: 'test_value_123' }
    }]
  });

  if (!result.success) throw new Error('Command failed');
  if (!result.data.commands[0].stdout.includes('test_value_123')) {
    throw new Error(`Expected stdout to contain 'test_value_123', got: ${result.data.commands[0].stdout}`);
  }
}

// Test 04.04 - Expected exit code 0
async function test04() {
  const result = await callMCPTool('precision_exec', {
    commands: [{
      cmd: 'node -e "process.exit(0)"',
      expect: { exit_code: 0 }
    }]
  });

  if (!result.success) throw new Error('Command failed expectation');
  if (result.data.commands[0].exit_code !== 0) {
    throw new Error(`Expected exit code 0, got: ${result.data.commands[0].exit_code}`);
  }
}

// Test 04.05 - Expected stdout_contains
async function test05() {
  const result = await callMCPTool('precision_exec', {
    commands: [{
      cmd: 'echo "foobar"',
      expect: { stdout_contains: 'foo' }
    }]
  });

  if (!result.success) throw new Error('Command failed expectation');
  if (!result.data.commands[0].stdout.includes('foo')) {
    throw new Error(`Expected stdout to contain 'foo', got: ${result.data.commands[0].stdout}`);
  }
}

// Test 04.06 - Non-zero exit
async function test06() {
  const result = await callMCPTool('precision_exec', {
    commands: [{ cmd: 'node -e "process.exit(1)"' }]
  });

  // Command should still succeed (we got a result), but exit code should be 1
  if (result.data.commands[0].exit_code !== 1) {
    throw new Error(`Expected exit code 1, got: ${result.data.commands[0].exit_code}`);
  }
}

// Test 04.07 - Sequential commands
async function test07() {
  const result = await callMCPTool('precision_exec', {
    commands: [
      { cmd: 'echo "first"' },
      { cmd: 'echo "second"' }
    ]
  });

  if (!result.success) throw new Error('Commands failed');
  if (result.data.commands.length !== 2) {
    throw new Error(`Expected 2 command results, got: ${result.data.commands.length}`);
  }
  if (!result.data.commands[0].stdout.includes('first')) {
    throw new Error('First command output incorrect');
  }
  if (!result.data.commands[1].stdout.includes('second')) {
    throw new Error('Second command output incorrect');
  }
}

// Test 04.08 - Parallel commands
async function test08() {
  const result = await callMCPTool('precision_exec', {
    commands: [
      { cmd: 'echo "parallel1"' },
      { cmd: 'echo "parallel2"' },
      { cmd: 'echo "parallel3"' }
    ],
    parallel: true
  });

  if (!result.success) throw new Error('Parallel commands failed');
  if (result.data.commands.length !== 3) {
    throw new Error(`Expected 3 command results, got: ${result.data.commands.length}`);
  }
}

// Test 04.09 - Timeout
async function test09() {
  const result = await callMCPTool('precision_exec', {
    commands: [{
      cmd: 'node -e "setTimeout(() => {}, 10000)"',
      timeout_ms: 500
    }]
  });

  // Should either timeout or fail
  if (result.success && result.data.commands[0].exit_code === 0) {
    throw new Error('Expected timeout or error, but command succeeded');
  }
}

// Test 04.10 - Background execution
async function test10() {
  const result = await callMCPTool('precision_exec', {
    commands: [{
      cmd: 'node -e "setTimeout(() => console.log(\'done\'), 100)"',
      background: true
    }]
  });

  if (!result.success) throw new Error('Background command failed');
  if (!result.data.processes || !result.data.processes[0]) {
    throw new Error(`Expected processes array in response, got: ${JSON.stringify(result.data).substring(0, 100)}`);
  }
  if (!result.data.processes[0].pid) {
    throw new Error(`Expected PID for background command, got: ${JSON.stringify(result.data.processes[0])}`);
  }
}

// Test 04.11 - Command with args array
async function test11() {
  const result = await callMCPTool('precision_exec', {
    commands: [{
      cmd: 'echo',
      args: ['arg1', 'arg2']
    }]
  });

  if (!result.success) throw new Error('Command with args failed');
  if (!result.data.commands[0].stdout.includes('arg1')) {
    throw new Error('Expected stdout to contain arg1');
  }
}

// Test 04.12 - Batch parallel commands
async function test12() {
  const commands = [];
  for (let i = 1; i <= 10; i++) {
    commands.push({ cmd: `echo "batch${i}"` });
  }

  const result = await callMCPTool('precision_exec', {
    commands,
    parallel: true
  });

  if (!result.success) throw new Error('Batch commands failed');
  if (result.data.commands.length !== 10) {
    throw new Error(`Expected 10 command results, got: ${result.data.commands.length}`);
  }
  if (result.data.summary.succeeded !== 10) {
    throw new Error(`Expected 10 succeeded, got: ${result.data.summary.succeeded}`);
  }
}

// Main test runner
async function main() {
  console.log('='.repeat(60));
  console.log('E2E Test Suite 04: precision_exec');
  console.log('='.repeat(60));

  await runTest(1, 'Simple echo command', test01);
  await runTest(2, 'Command with cwd', test02);
  await runTest(3, 'Command with env vars', test03);
  await runTest(4, 'Expected exit code 0', test04);
  await runTest(5, 'Expected stdout_contains', test05);
  await runTest(6, 'Non-zero exit', test06);
  await runTest(7, 'Sequential commands', test07);
  await runTest(8, 'Parallel commands', test08);
  await runTest(9, 'Timeout', test09);
  await runTest(10, 'Background execution', test10);
  await runTest(11, 'Command with args array', test11);
  await runTest(12, 'Batch parallel commands', test12);

  console.log('\n' + '='.repeat(60));
  console.log(`Test Results: ${passedTests}/${totalTests} passed`);
  console.log('='.repeat(60));

  // Write results to file
  const report = [
    '# E2E Test Suite 04: precision_exec',
    '',
    `**Total Tests:** ${totalTests}`,
    `**Passed:** ✅ ${passedTests}`,
    `**Failed:** ❌ ${failedTests}`,
    '',
    '---',
    '',
    ...testResults
  ].join('\n');

  fs.writeFileSync(outputFile, report);
  console.log(`\nReport written to: ${outputFile}`);

  process.exit(failedTests > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
