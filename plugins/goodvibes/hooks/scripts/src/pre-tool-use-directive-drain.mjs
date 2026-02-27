/**
 * PreToolUse Directive Drain Hook (standalone .mjs)
 *
 * Fallback mechanism for lost task-notifications. Claude Code has a bug where
 * task-notifications are silently discarded (queue-operation: "remove" instead
 * of "dequeue") when they arrive during active tool calls. This causes WRFC
 * directives to sit undelivered in the runtime engine's directive queue.
 *
 * This hook fires BEFORE every tool call and checks for pending directives.
 * If found, it injects them via additionalContext — recovering directives that
 * were lost due to the notification bug.
 *
 * Timeline:
 * 1. Agent completes → task-notification enqueued in Claude Code queue
 * 2. BUG: notification arrives during active tool call → "remove"d (lost)
 * 3. Directive sits in runtime engine queue, never drained
 * 4. Next tool call → THIS HOOK fires → finds pending directive → injects it
 *
 * Related:
 * - Claude Code queue bug: 12.8% notification loss rate during active tool calls
 * - PostToolUse additionalContext bug: https://github.com/anthropics/claude-code/issues/24788
 * - Primary delivery: user-prompt-submit-directives.mjs (fires on task-notifications)
 *
 * This is a standalone ESM script — no build step required.
 * Zero external dependencies, only Node.js stdlib.
 */

import * as net from 'node:net';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Constants ───────────────────────────────────────────────────────────────

const QUERY_TIMEOUT_MS = 300; // Tighter than UPS (500ms) — PreToolUse fires often

// ─── Response helpers ────────────────────────────────────────────────────────

function respond(response) {
  console.log(JSON.stringify(response));
  process.exit(0);
}

function allowResponse(additionalContext) {
  if (!additionalContext) {
    // Empty object = allow tool, no extra context
    return {};
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext,
    },
  };
}

// ─── Socket discovery (shared with UPS directives) ───────────────────────────

function discoverSocket(projectDir, sessionId) {
  // Strategy 1: Explicit env var
  const envPath = process.env['GOODVIBES_RUNTIME_SOCKET'];
  if (envPath) return envPath;

  const cwd = projectDir || process.env['CLAUDE_PROJECT_DIR'] || process.cwd();
  const stateDir = join(cwd, '.goodvibes', 'state');

  // Strategy 2: Session-keyed pointer file
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
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      process.stdin.destroy();
      resolve(null);
    }, 1000);

    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      if (timedOut) return;
      clearTimeout(timer);
      const raw = chunks.join('');
      if (!raw.trim()) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw));
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

  const projectDir = hookInput?.cwd || null;
  const sessionId = hookInput?.session_id || null;
  const socketPath = discoverSocket(projectDir, sessionId);

  // Fast path: no runtime engine running
  if (!socketPath || !existsSync(socketPath)) {
    respond(allowResponse());
  }

  // Query for pending directives
  const result = await queryDirectives(socketPath);

  if (result && result.directives && result.directives.length > 0) {
    const directivePayload = JSON.stringify({
      action: 'directives',
      directives: result.directives,
    });
    const gvTag = `<gv>${directivePayload}</gv>`;
    respond(allowResponse(gvTag));
  } else {
    respond(allowResponse());
  }
} catch (err) {
  // Never block a tool call — silently allow
  respond(allowResponse());
}
