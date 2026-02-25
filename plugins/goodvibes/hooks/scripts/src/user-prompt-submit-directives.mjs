/**
 * UserPromptSubmit Directive Delivery Hook (standalone .mjs)
 *
 * Fires on every user message. When the message is a task-notification
 * (background agent completed), queries the runtime engine for pending
 * WRFC directives and injects them via additionalContext.
 *
 * Flow:
 * 1. Agent completes → SubagentStop sends agent:completed to runtime
 * 2. Runtime generates WRFC directive, queues it
 * 3. Claude Code delivers task-notification as user message
 * 4. THIS HOOK fires → detects <task-notification> → queries get_directives
 * 5. Directive injected via additionalContext → orchestrator sees it
 *
 * This is a standalone ESM script — no build step required.
 * Zero external dependencies, only Node.js stdlib.
 */

import * as net from 'node:net';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Constants ───────────────────────────────────────────────────────────────

const QUERY_TIMEOUT_MS = 500;
const TASK_NOTIFICATION_PATTERN = '<task-notification>';

// ─── Response helpers ────────────────────────────────────────────────────────

function respond(response) {
  console.log(JSON.stringify(response));
  process.exit(0);
}

function continueResponse(additionalContext) {
  const response = { continue: true };
  if (additionalContext) {
    response.additionalContext = additionalContext;
  }
  return response;
}

// ─── Socket discovery ────────────────────────────────────────────────────────

function discoverSocket(projectDir, sessionId) {
  // Strategy 1: Explicit env var
  const envPath = process.env['GOODVIBES_RUNTIME_SOCKET'];
  if (envPath) return envPath;

  const cwd = projectDir || process.env['CLAUDE_PROJECT_DIR'] || process.cwd();
  const stateDir = join(cwd, '.goodvibes', 'state');

  // Strategy 2: Session-keyed pointer file (exact match, no ambiguity)
  if (sessionId && existsSync(stateDir)) {
    try {
      const sessionPointer = join(stateDir, `runtime-${sessionId}.socket`);
      const socketPath = readFileSync(sessionPointer, 'utf-8').trim();
      if (socketPath && existsSync(socketPath)) return socketPath;
    } catch { /* fall through */ }
  }

  // Strategy 3: Per-PID pointer files
  if (existsSync(stateDir)) {
    try {
      const entries = readdirSync(stateDir);
      for (const entry of entries) {
        if (/^runtime-\d+\.socket$/.test(entry)) {
          try {
            const socketPath = readFileSync(join(stateDir, entry), 'utf-8').trim();
            if (socketPath && existsSync(socketPath)) return socketPath;
          } catch { /* next */ }
        }
      }
    } catch { /* fall through */ }
  }

  // Strategy 4: Legacy pointer file
  const legacyPointer = join(stateDir, 'runtime.socket');
  if (existsSync(legacyPointer)) {
    try {
      const socketPath = readFileSync(legacyPointer, 'utf-8').trim();
      if (socketPath) return socketPath;
    } catch { /* fall through */ }
  }

  // Strategy 5: Well-known tmpdir
  const defaultPath = join(tmpdir(), 'goodvibes-runtime', 'runtime.sock');
  if (existsSync(defaultPath)) return defaultPath;

  return null;
}

// ─── IPC query ───────────────────────────────────────────────────────────────

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sendMessage(socketPath, message, timeoutMs) {
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
      done(null);
    }, timeoutMs);

    const socket = net.createConnection({ path: socketPath });
    socket.once('error', () => done(null));

    socket.once('connect', () => {
      const payload = JSON.stringify(message) + '\n';
      socket.write(payload, 'utf-8');
    });

    let rawData = '';
    socket.on('data', (chunk) => {
      rawData += chunk.toString('utf-8');
      const newlineIdx = rawData.indexOf('\n');
      if (newlineIdx === -1) return;
      const line = rawData.slice(0, newlineIdx);
      socket.destroy();
      try {
        done(JSON.parse(line));
      } catch {
        done(null);
      }
    });

    socket.once('close', () => done(null));
  });
}

async function queryDirectives(socketPath) {
  const message = {
    type: 'query',
    id: generateId(),
    query: { kind: 'get_directives' },
  };
  const response = await sendMessage(socketPath, message, QUERY_TIMEOUT_MS);
  if (!response || response.status === 'error') return null;
  return response.data || null;
}

// ─── Stdin reader ────────────────────────────────────────────────────────────

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    const timer = setTimeout(() => {
      process.stdin.destroy();
      resolve(null);
    }, 200);
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve(null);
      }
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    process.stdin.resume();
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

try {
  const hookInput = await readStdin();

  // Debug: dump stdin to stderr and temp file
  const debugData = JSON.stringify(hookInput, null, 2);
  console.error(`[UPS-Directives] stdin keys: ${hookInput ? Object.keys(hookInput).join(', ') : 'null'}`);
  try { writeFileSync('/tmp/ups-directives-debug.json', debugData); } catch {}

  // Fast path: not a task-notification → exit immediately
  const userMessage = hookInput?.user_message || hookInput?.content || hookInput?.prompt || '';
  if (!userMessage.includes(TASK_NOTIFICATION_PATTERN)) {
    respond(continueResponse());
  }

  const projectDir = hookInput?.cwd || null;
  const sessionId = hookInput?.session_id || null;

  console.error(`[UPS-Directives] task-notification detected, querying runtime (session: ${sessionId})`);

  const socketPath = discoverSocket(projectDir, sessionId);

  if (!socketPath || !existsSync(socketPath)) {
    console.error('[UPS-Directives] no socket found');
    respond(continueResponse());
  }

  const result = await queryDirectives(socketPath);
  console.error(`[UPS-Directives] queryDirectives result: ${JSON.stringify(result)}`);

  if (result && result.directives && result.directives.length > 0) {
    // Build additionalContext with directives
    const directivePayload = JSON.stringify({
      action: 'directives',
      directives: result.directives,
    });
    const gvTag = `<gv>${directivePayload}</gv>`;
    console.error(`[UPS-Directives] injecting ${result.directives.length} directive(s)`);
    respond(continueResponse({ gv_directive: gvTag }));
  } else {
    console.error('[UPS-Directives] no pending directives');
    respond(continueResponse());
  }
} catch (err) {
  console.error(`[UPS-Directives] error: ${err}`);
  respond(continueResponse());
}
