/**
 * Queue Auditor — Layer 0 task-notification recovery
 *
 * Tails the Claude Code session JSONL to detect when task-notifications are
 * silently discarded (queue-operation: "remove" vs "dequeue"), enabling rapid
 * recovery of orphaned WRFC directives.
 *
 * This is a pure ESM module — only depends on node:fs and node:path.
 * All functions are defensive: never throw, return empty results on error.
 */

import {
  openSync,
  readSync,
  closeSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

// ─── State helpers ────────────────────────────────────────────────────────────

const DEFAULT_STATE = { offset: 0, pending: {} };

function loadState(stateDir) {
  const statePath = join(stateDir, 'queue-auditor.json');
  try {
    const raw = readFileSync(statePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      offset: typeof parsed.offset === 'number' ? parsed.offset : 0,
      pending: parsed.pending && typeof parsed.pending === 'object' ? parsed.pending : {},
    };
  } catch (e) {
    if (e?.code === 'ENOENT') {
      return null; // File doesn't exist yet — caller handles first-run initialization
    }
    console.error('[QueueAuditor] Failed to parse state file:', e?.message || e);
    return { offset: 0, pending: {} };
  }
}

function saveState(stateDir, state) {
  const statePath = join(stateDir, 'queue-auditor.json');
  try {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(statePath, JSON.stringify(state), 'utf-8');
  } catch (e) {
    // Non-critical: state loss means next run may re-detect orphans, but won't corrupt.
    console.error(`[QueueAuditor] Failed to save state to ${statePath}: ${e.message}`);
  }
}

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Constructs the session JSONL path from cwd and sessionId.
 * @param {string} cwd - Project directory
 * @param {string} sessionId - Claude Code session ID
 * @returns {string} Absolute path to the JSONL transcript file
 */
export function getTranscriptPath(cwd, sessionId) {
  const home = homedir() ||
    process.env.HOME ||
    (process.env.USER ? '/home/' + process.env.USER : null);
  if (!home) return '';  // Cannot construct path — caller will get a non-existent path
  const slug = cwd.replace(/\//g, '-');
  return join(home, '.claude', 'projects', slug, sessionId + '.jsonl');
}

/**
 * Tails the session JSONL from last-read offset, tracks task-notification
 * queue operations, and detects orphaned directives.
 *
 * @param {string} transcriptPath - Absolute path to session JSONL
 * @param {string} stateDir - Directory for queue-auditor state file
 * @returns {{ orphanedTaskIds: string[] }}
 */
export function audit(transcriptPath, stateDir) {
  try {
    // ── Load or initialize state ──────────────────────────────────────────
    let state = loadState(stateDir);
    let isNewState = false;

    if (state === null) {
      // First run: initialize offset to current file size to skip history
      isNewState = true;
      let fileSize = 0;
      try {
        fileSize = statSync(transcriptPath).size;
      } catch { /* file doesn't exist yet — start at 0 */ }
      state = { offset: fileSize, pending: {} };
      saveState(stateDir, state);
      return { orphanedTaskIds: [] };
    }

    // ── Read new bytes from JSONL ─────────────────────────────────────────
    let fd;
    let bytesRead = 0;
    let rawChunk = '';

    try {
      fd = openSync(transcriptPath, 'r');
      // Determine how many bytes are available
      const fileSize = statSync(transcriptPath).size;
      const available = fileSize - state.offset;
      if (available <= 0) {
        // Nothing new to read
        return checkOrphans(state, stateDir);
      }

      // Intentional design constraint: cap at 1MB per audit run to bound latency.
      // Hooks fire synchronously before tool calls — we must not stall the session.
      // Missed bytes are picked up on the next invocation via the persisted offset.
      const bufSize = Math.min(available, 1024 * 1024);
      const buf = Buffer.alloc(bufSize);
      bytesRead = readSync(fd, buf, 0, bufSize, state.offset);
      rawChunk = buf.slice(0, bytesRead).toString('utf-8');
    } catch (e) {
      console.error(`[QueueAuditor] Failed to read transcript: ${e.message}`);
      return checkOrphans(state, stateDir);
    } finally {
      if (fd !== undefined) {
        try { closeSync(fd); } catch { /* ignore */ }
      }
    }

    // ── Parse lines ──────────────────────────────────────────────────────
    const lines = rawChunk.split('\n');

    // Discard last element if it's a partial line (rawChunk doesn't end with \n)
    let consumedBytes = bytesRead;
    if (!rawChunk.endsWith('\n')) {
      const lastLine = lines[lines.length - 1];
      const partialBytes = Buffer.byteLength(lastLine, 'utf-8');
      consumedBytes = bytesRead - partialBytes;
      lines.pop();
    }

    // ── Process queue-operation entries ──────────────────────────────────
    const TASK_ID_RE = /<task-id>([^<]+)<\/task-id>/;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let entry;
      try {
        entry = JSON.parse(trimmed);
      } catch {
        continue; // Skip malformed lines
      }

      if (entry.type !== 'queue-operation') continue;

      const content = entry.content || '';
      const operation = entry.operation || '';

      if (operation === 'enqueue' && content.includes('<task-id>')) {
        const m = content.match(TASK_ID_RE);
        if (m) {
          const taskId = m[1];
          // Use the JSONL entry's own timestamp so enqueuedAt reflects when the
          // notification was actually enqueued, not when this audit run happened.
          // Fallback to Date.now() only if the timestamp field is missing or invalid.
          const rawTs = typeof entry.timestamp === 'string' ? new Date(entry.timestamp).getTime() : NaN;
          const enqueuedAt = Number.isFinite(rawTs) ? rawTs : Date.now();
          state.pending[taskId] = { enqueuedAt };
        }
      } else if (operation === 'dequeue' && content.includes('<task-id>')) {
        const m = content.match(TASK_ID_RE);
        if (m) {
          delete state.pending[m[1]];
        }
      }
      // skip: remove, popAll, others — content is empty/unreliable
    }

    // ── Update offset ────────────────────────────────────────────────────
    state.offset = state.offset + consumedBytes;

    return checkOrphans(state, stateDir);
  } catch (e) {
    console.error(`[QueueAuditor] Unexpected error in audit(): ${e.message}`);
    return { orphanedTaskIds: [] };
  }
}

/**
 * Checks for orphaned entries in pending, evicts stale ones, saves state.
 * @param {object} state
 * @param {string} stateDir
 * @returns {{ orphanedTaskIds: string[] }}
 */
function checkOrphans(state, stateDir) {
  const now = Date.now();
  const ORPHAN_THRESHOLD_MS = 5000;     // 5 seconds → orphaned (EXIT 1 equivalent)
  const STALE_EVICT_MS = 5 * 60 * 1000; // 5 minutes → stale, evict

  const orphanedTaskIds = [];

  for (const [taskId, entry] of Object.entries(state.pending)) {
    const age = now - entry.enqueuedAt;
    if (age > STALE_EVICT_MS) {
      // Too old — watchdog should have handled; remove from ledger
      delete state.pending[taskId];
    } else if (age > ORPHAN_THRESHOLD_MS) {
      // Still within stale window but older than orphan threshold
      orphanedTaskIds.push(taskId);
    }
  }

  saveState(stateDir, state);
  return { orphanedTaskIds };
}

/**
 * Removes a taskId from the pending ledger (marks as delivered).
 * Idempotent — no-op if not found.
 *
 * @param {string} stateDir
 * @param {string} taskId
 */
export function markDelivered(stateDir, taskId) {
  try {
    const state = loadState(stateDir);
    if (!state) return; // No state file — nothing to do
    if (!state.pending[taskId]) return; // Not in ledger — no-op
    delete state.pending[taskId];
    saveState(stateDir, state);
  } catch (e) {
    console.error(`[QueueAuditor] Failed in markDelivered(): ${e.message}`);
  }
}
