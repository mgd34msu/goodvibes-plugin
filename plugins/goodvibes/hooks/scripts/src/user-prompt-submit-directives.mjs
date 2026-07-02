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
import { existsSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { markDelivered, audit, getTranscriptPath } from './queue-auditor.mjs';

// ─── Constants ───────────────────────────────────────────────────────────────

const QUERY_TIMEOUT_MS = 500;
const TASK_NOTIFICATION_PATTERN = '<task-notification>';
const DEFAULT_TICK_COMMAND = 'tick';

/** Delay for retry backoff in directive polling */
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
  // Strategy 1: Manual override only — not set by the runtime engine. Set this
  // env var to force a specific socket path. (The runtime engine runs as a child
  // process of MCP and cannot propagate env vars to the parent Claude Code process.)
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

async function queryDirectives(socketPath, agentId, sessionId) {
  const query = { kind: 'get_directives' };
  if (agentId) query.agent_id = agentId;
  // Pass session_id so the runtime engine only returns directives scoped to
  // this session, preventing the daemon session from stealing orchestrator directives.
  if (sessionId) query.session_id = sessionId;
  const message = {
    type: 'query',
    id: generateId(),
    query,
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

function checkUrgentFile(projectDir, sessionId) {
  // Session scoping: without a session id we cannot prove ownership of any
  // directive, so leave the urgent file untouched for the owning session.
  if (!sessionId) return null;
  const urgentPath = join(projectDir || process.cwd(), '.goodvibes', 'state', 'urgent-directives.json');
  const claimedPath = urgentPath + `.claimed.${process.pid}`;
  try {
    renameSync(urgentPath, claimedPath);  // Atomic on POSIX — exactly one hook wins
  } catch {
    return null;  // File doesn't exist or another hook already claimed it
  }
  let data;
  try {
    data = JSON.parse(readFileSync(claimedPath, 'utf-8'));
  } catch {
    // Clean up claimed file on parse failure
    try { unlinkSync(claimedPath); } catch { /* ignore */ }
    return null;
  }
  const directives = Array.isArray(data?.directives) ? data.directives : [];
  // Deliver only directives explicitly tagged for THIS session.
  const matched = directives.filter((d) => d && d.session_id === sessionId);
  const remaining = directives.filter((d) => !(d && d.session_id === sessionId));
  try {
    if (remaining.length > 0) {
      // Leave non-matching directives queued untouched: write them back for
      // their owning sessions, merging with any urgent file recreated since
      // our atomic claim.
      let merged = remaining;
      try {
        const current = JSON.parse(readFileSync(urgentPath, 'utf-8'));
        if (Array.isArray(current?.directives)) {
          merged = [...current.directives, ...remaining];
        }
      } catch { /* no new urgent file — write remaining as-is */ }
      writeFileSync(urgentPath, JSON.stringify({ ...data, directives: merged }), 'utf-8');
    }
    unlinkSync(claimedPath);
  } catch {
    try { unlinkSync(claimedPath); } catch { /* ignore */ }
  }
  return matched;
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

(async () => {
try {
  const hookInput = await readStdin();

  // The prompt field contains the user message / task-notification content
  const prompt = hookInput?.prompt || '';

  // Fast path: not a task-notification → check for daemon tick, then exit
  if (!prompt.includes(TASK_NOTIFICATION_PATTERN)) {
    const tickCommand = process.env['GOODVIBES_TICK_COMMAND'] || DEFAULT_TICK_COMMAND;
    const trimmedPrompt = prompt.trim();
    const projectDir = hookInput?.cwd || null;
    const sessionId = hookInput?.session_id || null;
    const isSubagent = hookInput?.is_subagent === true;
    const socketPath = discoverSocket(projectDir, sessionId);

    if (trimmedPrompt === tickCommand) {
      if (socketPath && existsSync(socketPath)) {
        const mode = await queryExecutorMode(socketPath);
        if (mode === 'daemon' || mode === 'hybrid') {
          await sendProcessTick(socketPath);
        }
      }
    } else if (!isSubagent && trimmedPrompt.length > 0 && socketPath && existsSync(socketPath)) {
      // Fire-and-forget: sends hook_event to daemon IPC.
      // Flow: hook_event → IPC router → HookProcessor → createUserPromptSubmitHandler → human:prompt emission on EventBus.
      // Also emits user_prompt_submit on EventBus directly from IPC router handleHookEvent().
      sendMessage(socketPath, {
        type: 'hook_event',
        id: generateId(),
        hook_name: 'user_prompt_submit',
        hook_input: { prompt: trimmedPrompt, session_id: sessionId },
        timestamp: new Date().toISOString(),
      }, QUERY_TIMEOUT_MS).catch(() => {}); // fire-and-forget, don't block response
    }
    respond(continueResponse()); // process.exit(0) — no code executes after this
    return;
  }

  const projectDir = hookInput?.cwd || null;
  const sessionId = hookInput?.session_id || null;

  // Session scoping guard: without a session id we cannot match directives to
  // this session, so never drain — an unscoped query would steal directives
  // queued for other sessions (see docs/runtime-engine-directive-loop-2026-07-01.md).
  if (!sessionId) {
    console.error('[UPS-Directives] no session_id in hook input, skipping directive drain');
    respond(continueResponse());
    return;
  }

  let socketPath = discoverSocket(projectDir, sessionId);

  // Retry socket discovery — project-level pointers may not exist yet if this
  // is the first hook event after plugin install/restart. The IPC router writes
  // them on the first hook_event it receives, so a brief retry covers the race.
  if (!socketPath || !existsSync(socketPath)) {
    for (const delay of [50, 150]) {
      await sleep(delay);
      socketPath = discoverSocket(projectDir, sessionId);
      if (socketPath && existsSync(socketPath)) break;
    }
  }

  if (!socketPath || !existsSync(socketPath)) {
    console.error('[UPS-Directives] runtime engine not available (socket not found after retries), skipping directive drain');
    respond(continueResponse()); // process.exit(0) — no code executes after this
    return;
  }

  console.error('[UPS-Directives] runtime engine socket found:', socketPath);

  // Keep queue auditor ledger current
  try {
    const transcriptPath = getTranscriptPath(projectDir, sessionId);
    const stateDir = join(projectDir || process.cwd(), '.goodvibes', 'state');
    audit(transcriptPath, stateDir);
  } catch (e) {
    console.error('[UPS-Auditor] audit error:', e?.message || e);
  }

  // Extract agent IDs from task-notifications for diagnostics (markDelivered).
  const taskIdMatches = [...(prompt?.matchAll(/<task-id>([^<]+)<\/task-id>/g) || [])];
  const agentIds = taskIdMatches.map(m => m[1]);

  // Drain ALL pending directives (no agent_id). Per-agent drain had a race
  // condition where PreToolUse drain-all grabs the directive before UPS fires,
  // causing per-agent queries to return empty. Drain-all is consistent with
  // PreToolUse and ensures whichever hook fires first gets all pending directives.
  // Exponential backoff: 100ms, 250ms, 500ms (total 850ms max wait).
  // Allows time for the runtime to process agent:completed -> triggers -> directive enqueue.
  // 850ms total is short enough to not noticeably delay the orchestrator's response.
  const RETRY_DELAYS = [100, 250, 500];
  let result = await queryDirectives(socketPath, null, sessionId);
  console.error('[UPS-Directives] initial query result:', result ? `${result.directives?.length ?? 0} directives` : 'null (IPC error)');

  if (!result || !result.directives || result.directives.length === 0) {
    for (let retryIdx = 0; retryIdx < RETRY_DELAYS.length; retryIdx++) {
      const delay = RETRY_DELAYS[retryIdx];
      console.error(`[UPS-Directives] no directives yet, retry ${retryIdx + 1}/${RETRY_DELAYS.length} in ${delay}ms`);
      await sleep(delay);
      result = await queryDirectives(socketPath, null, sessionId);
      console.error(`[UPS-Directives] retry ${retryIdx + 1} result:`, result ? `${result.directives?.length ?? 0} directives` : 'null (IPC error)');
      if (result?.directives?.length > 0) break;
    }
  }

  // Deliver only directives explicitly tagged for this session, even if the
  // runtime returned more (defense-in-depth on top of the scoped query).
  if (result?.directives?.length > 0) {
    const scoped = result.directives.filter((d) => d && d.session_id === sessionId);
    const droppedCount = result.directives.length - scoped.length;
    if (droppedCount > 0) {
      console.error(`[UPS-Directives] dropped ${droppedCount} directive(s) not scoped to session ${sessionId}`);
    }
    result.directives = scoped;
  }

  // Check for urgent directives written by the watchdog's drain-stuck recovery.
  // This is the file-based fallback delivery channel (Layer 2 → hook bridge).
  // Session-scoped: non-matching directives are written back untouched.
  const urgentDirectives = checkUrgentFile(projectDir, sessionId);
  if (urgentDirectives?.length > 0) {
    if (!result || !result.directives) {
      result = { directives: urgentDirectives };
    } else {
      result.directives = [...result.directives, ...urgentDirectives];
    }
  }

  if (result && result.directives && result.directives.length > 0) {
    console.error(`[UPS-Directives] delivering ${result.directives.length} directive(s) to orchestrator`);
    const directivePayload = JSON.stringify({
      action: 'directives',
      directives: result.directives,
    });
    const gvTag = `<gv>${directivePayload}</gv>`;
    if (agentIds.length > 0) {
      try {
        const stateDir = join(projectDir || process.cwd(), '.goodvibes', 'state');
        for (const agentId of agentIds) {
          markDelivered(stateDir, agentId);
        }
      } catch (e) {
        console.error('[UPS] markDelivered failed:', e?.message || e);
      }
    }
    respond(continueResponse(gvTag)); // process.exit(0) — no code executes after this
    return;
  } else {
    console.error('[UPS-Directives] no directives found after all retries, continuing without injection');
    respond(continueResponse()); // process.exit(0) — no code executes after this
  }
} catch (err) {
  console.error(`[UPS-Directives] error: ${err}`);
  respond(continueResponse());
}
})();
