/**
 * PreToolUse Directive Drain Hook (standalone .mjs)
 *
 * Fires BEFORE every tool call. Drains ALL pending directives from the
 * runtime engine's directive queue and injects them via additionalContext.
 *
 * This is the primary directive delivery mechanism. It completely bypasses
 * Claude Code's task-notification queue, which has a known bug where
 * notifications are silently discarded (queue:remove) when they arrive
 * during active tool calls.
 *
 * Flow:
 * 1. Agent completes → SubagentStop sends agent:completed to runtime
 * 2. Runtime triggers fire → WRFC handler enqueues directive(s)
 * 3. Next tool call → THIS HOOK fires → drains ALL pending directives
 * 4. Directives injected via additionalContext → orchestrator receives them
 *
 * Key design decisions:
 * - Drains ALL pending directives (no agent_id = drain everything)
 * - Multiple directives may be returned at once (parallel WRFC chains)
 * - No auditor needed — just drain the queue directly
 * - Fast path when no runtime engine is running (<1ms)
 *
 * This is a standalone ESM script — no build step required.
 * Zero external dependencies, only Node.js stdlib.
 */

import * as net from 'node:net';
import { existsSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Constants ───────────────────────────────────────────────────────────────

const QUERY_TIMEOUT_MS = 300;

// ─── Response helpers ────────────────────────────────────────────────────────

/** Writes JSON response to stdout and terminates the process. */
function respond(response) {
  console.log(JSON.stringify(response));
  process.exit(0);
}

function allowResponse(additionalContext) {
  if (!additionalContext) {
    return {};
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext,
    },
  };
}

// ─── Socket discovery ────────────────────────────────────────────────────────

function discoverSocket(projectDir, sessionId) {
  // Strategy 1: Manual override only — not set by the runtime engine.
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

  // Strategy 3: Per-PID pointer files, sorted by mtime descending (newest first)
  // to prefer the most recently written pointer file — same as RuntimeClient.ts.
  if (existsSync(stateDir)) {
    try {
      const entries = readdirSync(stateDir);

      // Collect matching pointer files with their mtime for sorting.
      const pointerFiles = [];
      for (const entry of entries) {
        if (/^runtime-[a-zA-Z0-9_-]+\.socket$/.test(entry)) {
          try {
            const mtimeMs = statSync(join(stateDir, entry)).mtimeMs;
            pointerFiles.push({ entry, mtimeMs });
          } catch { /* skip */ }
        }
      }

      // Sort newest first so the live runtime wins over stale predecessors.
      pointerFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);

      for (const { entry } of pointerFiles) {
        try {
          const socketPath = readFileSync(join(stateDir, entry), 'utf-8').trim();
          if (!socketPath || !existsSync(socketPath)) continue;

          // PID liveness check: extract PID from filename and verify the
          // owning process is still alive. If dead, clean up both the pointer
          // file and the stale socket file before trying the next entry.
          const pidMatch = /^runtime-(\d+)\.socket$/.exec(entry);
          if (pidMatch) {
            const pid = parseInt(pidMatch[1], 10);
            let processAlive = false;
            try { process.kill(pid, 0); processAlive = true; } catch { /* dead */ }
            if (!processAlive) {
              try { unlinkSync(join(stateDir, entry)); } catch { /* ignore */ }
              try { unlinkSync(socketPath); } catch { /* ignore */ }
              continue;
            }
          }

          return socketPath;
        } catch { /* next */ }
      }
    } catch { /* fall through */ }
  }

  const legacyPointer = join(stateDir, 'runtime.socket');
  if (existsSync(legacyPointer)) {
    try {
      const socketPath = readFileSync(legacyPointer, 'utf-8').trim();
      if (socketPath) return socketPath;
    } catch { /* fall through */ }
  }

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

async function drainAllDirectives(socketPath) {
  const message = {
    type: 'query',
    id: generateId(),
    query: { kind: 'get_directives' },  // No agent_id = drain ALL pending
  };
  const response = await sendMessage(socketPath, message, QUERY_TIMEOUT_MS);
  if (!response || response.status === 'error') return null;
  return response.data || null;
}

// ─── Urgent file fallback ────────────────────────────────────────────────────

function checkUrgentFile(projectDir) {
  const urgentPath = join(projectDir || process.cwd(), '.goodvibes', 'state', 'urgent-directives.json');
  const claimedPath = urgentPath + `.claimed.${process.pid}`;
  try {
    renameSync(urgentPath, claimedPath);
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(readFileSync(claimedPath, 'utf-8'));
    unlinkSync(claimedPath);
    return data.directives || [];
  } catch {
    try { unlinkSync(claimedPath); } catch { /* ignore */ }
    return null;
  }
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
    }, 200);

    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { if (!timedOut) chunks.push(chunk); });
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

async function main() {
  const hookInput = await readStdin();

  // Guard: never drain directives in subagent contexts.
  // Directives are orchestrator-only — subagent drain causes silent loss.
  if (hookInput?.is_subagent) {
    process.stderr.write('[directive-drain] skipped: is_subagent=true\n');
    return respond(allowResponse());
  }

  const projectDir = hookInput?.cwd || null;
  const sessionId = hookInput?.session_id || null;
  const socketPath = discoverSocket(projectDir, sessionId);

  // Fast path: no runtime engine running
  if (!socketPath || !existsSync(socketPath)) {
    return respond(allowResponse());
  }

  // Drain ALL pending directives from the queue (no agent_id = drain everything)
  const result = await drainAllDirectives(socketPath);

  // Also check urgent file fallback
  const urgentDirectives = checkUrgentFile(projectDir);

  const allDirectives = [];
  if (result?.directives?.length > 0) {
    allDirectives.push(...result.directives);
  }
  if (urgentDirectives?.length > 0) {
    allDirectives.push(...urgentDirectives);
  }

  if (allDirectives.length > 0) {
    const gvTag = `<gv>${JSON.stringify({ action: 'directives', directives: allDirectives })}</gv>`;
    return respond(allowResponse(gvTag));
  } else {
    return respond(allowResponse());
  }
}

try {
  await main();
} catch {
  // Never block a tool call
  respond(allowResponse());
}
