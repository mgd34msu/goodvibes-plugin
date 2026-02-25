/**
 * PostToolUse Task Hook (standalone .mjs)
 *
 * Fires after every Task tool use (agent launch or completion).
 * Reads hook input from stdin to discover the project directory,
 * then queries the runtime engine for pending directives and
 * injects them into the orchestrator's conversation via additionalContext.
 *
 * Sequence (background agents):
 * 1. Task tool spawns agent → PostToolUse fires immediately (async_launched)
 * 2. Agent completes later → SubagentStop fires → runtime queues directive
 * 3. Next Task tool return → PostToolUse fires → drains queue → injects
 *
 * Sequence (foreground agents):
 * 1. Agent completes → Task tool returns
 * 2. THIS HOOK fires → queries get_directives → drains queue → injects
 * 3. Orchestrator sees agent result + directive
 *
 * This is a standalone ESM script — no build step required.
 * Zero external dependencies, only Node.js stdlib.
 */

import * as net from 'node:net';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Constants ───────────────────────────────────────────────────────────────

const QUERY_TIMEOUT_MS = 500;

// ─── Response helpers ────────────────────────────────────────────────────────

function allowResponse(additionalContext) {
  const response = {
    continue: true,
  };
  if (additionalContext) {
    response.additionalContext = { gv_directive: additionalContext };
  }
  return response;
}

function respond(response) {
  console.log(JSON.stringify(response));
  process.exit(0);
}

function buildGvDirectiveTag(message) {
  const gvPayload = JSON.stringify({ action: 'directive', message });
  return `<gv>${gvPayload}</gv>`;
}

// ─── Socket discovery ────────────────────────────────────────────────────────

function discoverSocket(projectDir, sessionId) {
  // Strategy 1: Explicit env var
  const envPath = process.env['GOODVIBES_RUNTIME_SOCKET'];
  if (envPath) return envPath;

  // Use projectDir from stdin (most reliable), then env var, then cwd fallback
  const cwd = projectDir || process.env['CLAUDE_PROJECT_DIR'] || process.cwd();
  console.error(`[PostToolUse] discoverSocket cwd: ${cwd}, sessionId: ${sessionId || 'none'}`);
  const stateDir = join(cwd, '.goodvibes', 'state');

  // Strategy 2: Session-keyed pointer file (exact match, no ambiguity)
  if (sessionId && existsSync(stateDir)) {
    try {
      const sessionPointer = join(stateDir, `runtime-${sessionId}.socket`);
      const socketPath = readFileSync(sessionPointer, 'utf-8').trim();
      if (socketPath && existsSync(socketPath)) {
        console.error(`[PostToolUse] Found session-keyed pointer: ${sessionPointer}`);
        return socketPath;
      }
    } catch {
      // No session pointer yet — fall through to PID-based scan
    }
  }

  // Strategy 3: Per-PID pointer files (scan all, use first live socket)
  if (existsSync(stateDir)) {
    try {
      const entries = readdirSync(stateDir);
      for (const entry of entries) {
        if (/^runtime-\d+\.socket$/.test(entry)) {
          try {
            const socketPath = readFileSync(join(stateDir, entry), 'utf-8').trim();
            if (socketPath && existsSync(socketPath)) return socketPath;
          } catch {
            // Ignore — try next entry
          }
        }
      }
    } catch {
      // Ignore — fall through
    }
  }

  // Strategy 4: Legacy pointer file
  const legacyPointerFile = join(stateDir, 'runtime.socket');
  if (existsSync(legacyPointerFile)) {
    try {
      const socketPath = readFileSync(legacyPointerFile, 'utf-8').trim();
      if (socketPath) return socketPath;
    } catch {
      // Ignore — fall through
    }
  }

  // Strategy 5: Well-known tmpdir location
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

/**
 * Read and parse hook input from stdin.
 * Claude Code sends JSON with { session_id, cwd, hook_event_name, ... }.
 * Returns parsed object or null on failure.
 */
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
  // Read hook input from stdin — Claude Code provides { cwd, session_id, ... }
  const hookInput = await readStdin();
  const projectDir = (hookInput && typeof hookInput.cwd === 'string') ? hookInput.cwd : null;
  const sessionId = (hookInput && typeof hookInput.session_id === 'string') ? hookInput.session_id : null;

  console.error(`[PostToolUse] projectDir: ${projectDir}, sessionId: ${sessionId}`);

  const socketPath = discoverSocket(projectDir, sessionId);

  // Fast path: runtime not available
  if (!socketPath || !existsSync(socketPath)) {
    console.error('[PostToolUse] EXIT 1: no socket found');
    respond(allowResponse());
  } else {
    console.error(`[PostToolUse] Socket found: ${socketPath}`);
    // Query runtime for pending directives
    const result = await queryDirectives(socketPath);
    console.error(`[PostToolUse] queryDirectives result: ${JSON.stringify(result)}`);

    if (result && result.kind === 'system_message' && result.message) {
      const additionalContext = buildGvDirectiveTag(result.message);
      const resp = allowResponse(additionalContext);
      console.error(`[PostToolUse] EXIT 2 (with directive): ${JSON.stringify(resp)}`);
      respond(resp);
    } else {
      console.error('[PostToolUse] EXIT 3: socket found, no pending directives');
      respond(allowResponse());
    }
  }
} catch (err) {
  console.error(`[PostToolUse] EXIT 4 (error): ${err}`);
  respond(allowResponse());
}
