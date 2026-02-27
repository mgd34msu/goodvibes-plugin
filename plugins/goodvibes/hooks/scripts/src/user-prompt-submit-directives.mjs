/**
 * UserPromptSubmit Directive Delivery Hook (standalone .mjs)
 *
 * Fires on every user message. When the message is a task-notification
 * (background agent completed), queries the runtime engine for pending
 * WRFC directives and injects them via additionalContext.
 *
 * Flow:
 * 1. Agent completes → SubagentStop sends agent:completed to runtime
 * 2. Runtime triggers fire → WRFC handler enqueues directive
 * 3. Claude Code delivers task-notification as user message
 * 4. THIS HOOK fires → detects <task-notification> → queries get_directives
 * 5. Directive injected via additionalContext → orchestrator sees it
 *
 * This is a standalone ESM script — no build step required.
 * Zero external dependencies, only Node.js stdlib.
 */

import * as net from 'node:net';
import { existsSync, readFileSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { markDelivered, audit, getTranscriptPath } from './queue-auditor.mjs';

// ─── Constants ───────────────────────────────────────────────────────────────

const QUERY_TIMEOUT_MS = 500;
const TASK_NOTIFICATION_PATTERN = '<task-notification>';
const DEFAULT_TICK_COMMAND = 'tick';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Response helpers ────────────────────────────────────────────────────────

function respond(response) {
  console.log(JSON.stringify(response));
  process.exit(0);
}

function continueResponse(additionalContext) {
  const response = {};
  if (additionalContext) {
    response.hookSpecificOutput = {
      hookEventName: 'UserPromptSubmit',
      additionalContext,
    };
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

async function queryExecutorMode(socketPath) {
  const message = {
    type: 'query',
    id: generateId(),
    query: { kind: 'get_executor_mode' },
  };
  const response = await sendMessage(socketPath, message, QUERY_TIMEOUT_MS);
  if (!response || response.status === 'error') return null;
  return response.data?.mode ?? null;
}

async function sendProcessTick(socketPath) {
  const message = {
    type: 'query',
    id: generateId(),
    query: { kind: 'process_tick' },
  };
  const response = await sendMessage(socketPath, message, QUERY_TIMEOUT_MS);
  if (!response || response.status === 'error') return null;
  return response.data?.result ?? null;
}

function checkUrgentFile(projectDir) {
  const urgentPath = join(projectDir || process.cwd(), '.goodvibes', 'state', 'urgent-directives.json');
  const claimedPath = urgentPath + `.claimed.${process.pid}`;
  try {
    renameSync(urgentPath, claimedPath);  // Atomic on POSIX — exactly one hook wins
  } catch {
    return null;  // File doesn't exist or another hook already claimed it
  }
  try {
    const data = JSON.parse(readFileSync(claimedPath, 'utf-8'));
    unlinkSync(claimedPath);
    return data.directives || [];
  } catch {
    // Clean up claimed file on parse failure
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
    process.stdin.on('data', (chunk) => { if (!timedOut) chunks.push(chunk); });
    process.stdin.on('end', () => {
      if (timedOut) return;
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

  // The prompt field contains the user message / task-notification content
  const prompt = hookInput?.prompt || '';

  // Fast path: not a task-notification → check for daemon tick, then exit
  if (!prompt.includes(TASK_NOTIFICATION_PATTERN)) {
    const tickCommand = process.env['GOODVIBES_TICK_COMMAND'] || DEFAULT_TICK_COMMAND;
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt === tickCommand) {
      const projectDir = hookInput?.cwd || null;
      const sessionId = hookInput?.session_id || null;
      const socketPath = discoverSocket(projectDir, sessionId);

      if (socketPath && existsSync(socketPath)) {
        const mode = await queryExecutorMode(socketPath);
        if (mode === 'daemon' || mode === 'hybrid') {
          await sendProcessTick(socketPath);
        }
      }
    }
    respond(continueResponse()); // process.exit(0) — no code executes after this
  }

  const projectDir = hookInput?.cwd || null;
  const sessionId = hookInput?.session_id || null;

  const socketPath = discoverSocket(projectDir, sessionId);

  if (!socketPath || !existsSync(socketPath)) {
    respond(continueResponse()); // process.exit(0) — no code executes after this
  }

  // Keep queue auditor ledger current
  try {
    const transcriptPath = getTranscriptPath(projectDir, sessionId);
    const stateDir = join(projectDir || process.cwd(), '.goodvibes', 'state');
    audit(transcriptPath, stateDir);
  } catch (e) {
    console.error('[UPS-Auditor] audit error:', e?.message || e);
  }

  // Retry with backoff when get_directives returns empty on a task-notification.
  // This handles the race condition where SubagentStop hasn't finished processing
  // the agent:completed event and enqueuing the WRFC directive yet.
  const RETRY_DELAYS = [100, 250, 500];
  let result = await queryDirectives(socketPath);

  if (!result || !result.directives || result.directives.length === 0) {
    for (const delay of RETRY_DELAYS) {
      await sleep(delay);
      result = await queryDirectives(socketPath);
      if (result?.directives?.length > 0) break;
    }
  }

  // Check for urgent directives written by the watchdog's drain-stuck recovery.
  // This is the file-based fallback delivery channel (Layer 2 → hook bridge).
  const urgentDirectives = checkUrgentFile(projectDir);
  if (urgentDirectives?.length > 0) {
    if (!result || !result.directives) {
      result = { directives: urgentDirectives };
    } else {
      result.directives = [...result.directives, ...urgentDirectives];
    }
  }

  if (result && result.directives && result.directives.length > 0) {
    const directivePayload = JSON.stringify({
      action: 'directives',
      directives: result.directives,
    });
    const gvTag = `<gv>${directivePayload}</gv>`;
    const taskIdMatch = prompt?.match(/<task-id>([^<]+)<\/task-id>/);
    if (taskIdMatch) {
      try {
        const stateDir = join(projectDir || process.cwd(), '.goodvibes', 'state');
        markDelivered(stateDir, taskIdMatch[1]);
      } catch (e) {
        console.error('[UPS] markDelivered failed:', e?.message || e);
      }
    }
    respond(continueResponse(gvTag)); // process.exit(0) — no code executes after this
  } else {
    respond(continueResponse()); // process.exit(0) — no code executes after this
  }
} catch (err) {
  console.error(`[UPS-Directives] error: ${err}`);
  respond(continueResponse());
}
