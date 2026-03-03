#!/usr/bin/env node
/**
 * Runtime Engine IPC Test Script
 *
 * Sends events and queries to the runtime engine to verify it's processing
 * them correctly. Uses the same socket discovery as the hooks.
 *
 * Usage: node test-runtime.mjs
 */

import * as net from 'node:net';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Socket Discovery ────────────────────────────────────────────────────────

function discoverSocket() {
  const envPath = process.env['GOODVIBES_RUNTIME_SOCKET'];
  if (envPath) return envPath;

  const cwd = process.env['CLAUDE_PROJECT_DIR'] || process.cwd();
  const stateDir = join(cwd, '.goodvibes', 'state');

  // Strategy 3: Pointer files sorted by mtime
  if (existsSync(stateDir)) {
    try {
      const entries = readdirSync(stateDir);
      const pointerFiles = [];
      for (const entry of entries) {
        if (/^runtime-[a-zA-Z0-9_-]+\.socket$/.test(entry)) {
          try {
            const mtimeMs = statSync(join(stateDir, entry)).mtimeMs;
            pointerFiles.push({ entry, mtimeMs });
          } catch { /* skip */ }
        }
      }
      pointerFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
      for (const { entry } of pointerFiles) {
        try {
          const socketPath = readFileSync(join(stateDir, entry), 'utf-8').trim();
          if (socketPath && existsSync(socketPath)) return socketPath;
        } catch { /* next */ }
      }
    } catch { /* fall through */ }
  }

  // Strategy 5: Well-known tmpdir
  const tmpFiles = join(tmpdir(), 'goodvibes');
  if (existsSync(tmpFiles)) {
    try {
      const entries = readdirSync(tmpFiles);
      for (const entry of entries) {
        if (entry.startsWith('goodvibes-runtime-') && entry.endsWith('.sock')) {
          const fullPath = join(tmpFiles, entry);
          if (existsSync(fullPath)) return fullPath;
        }
      }
    } catch { /* fall through */ }
  }

  return null;
}

// ─── IPC Communication ──────────────────────────────────────────────────────

let msgCounter = 0;
function nextId() {
  return `test-${Date.now().toString(36)}-${++msgCounter}`;
}

function sendMessage(socketPath, message, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (result) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      socket.destroy();
      done({ error: 'timeout' });
    }, timeoutMs);

    const socket = net.createConnection({ path: socketPath });
    socket.once('error', (err) => done({ error: err.message }));
    socket.once('connect', () => {
      socket.write(JSON.stringify(message) + '\n', 'utf-8');
    });

    let rawData = '';
    socket.on('data', (chunk) => {
      rawData += chunk.toString('utf-8');
      const idx = rawData.indexOf('\n');
      if (idx === -1) return;
      socket.destroy();
      try {
        done(JSON.parse(rawData.slice(0, idx)));
      } catch {
        done({ error: 'invalid JSON', raw: rawData });
      }
    });
    socket.once('close', () => done({ error: 'connection closed' }));
  });
}

// ─── Test Helpers ───────────────────────────────────────────────────────────

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const WARN = '\x1b[33m⚠\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

let passed = 0, failed = 0;

function logResult(name, response, check) {
  const ok = check(response);
  if (ok) {
    console.log(`  ${PASS} ${name}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${name}`);
    console.log(`    ${DIM}Response: ${JSON.stringify(response)}${RESET}`);
    failed++;
  }
  return ok;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function runTests(socketPath) {
  console.log(`\n${BOLD}Runtime Engine IPC Tests${RESET}`);
  console.log(`Socket: ${socketPath}\n`);

  // ── Query Tests ──────────────────────────────────────────────────────
  console.log(`${BOLD}Queries:${RESET}`);

  // 1. get_directives
  const r1 = await sendMessage(socketPath, {
    type: 'query', id: nextId(),
    query: { kind: 'get_directives' }
  });
  logResult('get_directives returns ok + directives array', r1,
    r => r.status === 'ok' && Array.isArray(r.data?.directives));

  // 2. get_executor_mode
  const r2 = await sendMessage(socketPath, {
    type: 'query', id: nextId(),
    query: { kind: 'get_executor_mode' }
  });
  logResult('get_executor_mode returns ok + mode string', r2,
    r => r.status === 'ok' && typeof r.data?.mode === 'string');

  // 3. get_workflow_state
  const r3 = await sendMessage(socketPath, {
    type: 'query', id: nextId(),
    query: { kind: 'get_workflow_state' }
  });
  logResult('get_workflow_state returns ok', r3,
    r => r.status === 'ok');

  // 4. get_agent_status
  const r4 = await sendMessage(socketPath, {
    type: 'query', id: nextId(),
    query: { kind: 'get_agent_status', agent_id: 'test-agent-123' }
  });
  logResult('get_agent_status returns ok', r4,
    r => r.status === 'ok');

  // 5. get_context_injection
  const r5 = await sendMessage(socketPath, {
    type: 'query', id: nextId(),
    query: { kind: 'get_context_injection' }
  });
  logResult('get_context_injection returns ok', r5,
    r => r.status === 'ok');

  // 6. should_block_tool
  const r6 = await sendMessage(socketPath, {
    type: 'query', id: nextId(),
    query: { kind: 'should_block_tool', tool_name: 'Read' }
  });
  logResult('should_block_tool returns ok + allow boolean', r6,
    r => r.status === 'ok' && typeof r.data?.allow === 'boolean');

  // 7. Unknown query kind
  const r7 = await sendMessage(socketPath, {
    type: 'query', id: nextId(),
    query: { kind: 'nonexistent_query' }
  });
  logResult('unknown query returns ack (not error)', r7,
    r => r.status === 'ok');

  // ── Event Tests ─────────────────────────────────────────────────────
  console.log(`\n${BOLD}Hook Events:${RESET}`);

  // 8. Emit agent:spawned
  const r8 = await sendMessage(socketPath, {
    type: 'hook_event', id: nextId(),
    hook_name: 'agent:spawned',
    timestamp: new Date().toISOString(),
    hook_input: {
      session_id: 'test-session',
      agent_id: 'test-agent-001',
      agent_type: 'goodvibes:engineer',
      description: 'Test agent spawn'
    }
  });
  logResult('agent:spawned event accepted', r8,
    r => r.status === 'ok');

  // 9. Emit agent:completed
  const r9 = await sendMessage(socketPath, {
    type: 'hook_event', id: nextId(),
    hook_name: 'agent:completed',
    timestamp: new Date().toISOString(),
    hook_input: {
      session_id: 'test-session',
      agent_id: 'test-agent-001',
      result: 'Task completed successfully',
      files: ['src/test.ts']
    }
  });
  logResult('agent:completed event accepted', r9,
    r => r.status === 'ok');

  // 10. Check if directives were generated from the agent:completed
  const r10 = await sendMessage(socketPath, {
    type: 'query', id: nextId(),
    query: { kind: 'get_directives' }
  });
  const hasDirectives = r10.data?.directives?.length > 0;
  if (hasDirectives) {
    console.log(`  ${PASS} agent:completed generated ${r10.data.directives.length} directive(s)`);
    console.log(`    ${DIM}Directives: ${JSON.stringify(r10.data.directives.map(d => d.type || d.action))}${RESET}`);
    passed++;
  } else {
    console.log(`  ${WARN} agent:completed generated 0 directives (no active WRFC workflow)`);
  }

  // 11. Emit custom event
  const r11 = await sendMessage(socketPath, {
    type: 'hook_event', id: nextId(),
    hook_name: 'test:custom_event',
    timestamp: new Date().toISOString(),
    hook_input: { foo: 'bar', test: true }
  });
  logResult('custom event accepted', r11,
    r => r.status === 'ok');

  // ── Heartbeat ───────────────────────────────────────────────────────
  console.log(`\n${BOLD}Heartbeat:${RESET}`);

  const r12 = await sendMessage(socketPath, {
    type: 'heartbeat', id: nextId()
  });
  logResult('heartbeat returns ok', r12,
    r => r.status === 'ok');

  // ── State Update ────────────────────────────────────────────────────
  console.log(`\n${BOLD}State Updates:${RESET}`);

  const r13 = await sendMessage(socketPath, {
    type: 'state_update', id: nextId(),
    updates: { 'test.value': 42 }
  });
  logResult('state_update returns not-implemented error', r13,
    r => r.status === 'error' && r.error?.includes('not yet implemented'));

  // ── Unknown Message Type ────────────────────────────────────────────
  console.log(`\n${BOLD}Edge Cases:${RESET}`);

  const r14 = await sendMessage(socketPath, {
    type: 'nonexistent_type', id: nextId()
  });
  logResult('unknown message type returns error', r14,
    r => r.status === 'error');

  // ── Summary ─────────────────────────────────────────────────────────
  console.log(`\n${BOLD}Results: ${passed} passed, ${failed} failed${RESET}\n`);
  return failed === 0;
}

// ─── Main ───────────────────────────────────────────────────────────────────

const socketPath = discoverSocket();
if (!socketPath) {
  console.error('No runtime engine socket found. Is the runtime running?');
  process.exit(1);
}

const ok = await runTests(socketPath);
process.exit(ok ? 0 : 1);
