/**
 * State directory cleanup with archive-then-delete pipeline.
 *
 * Archives stale files after a configurable threshold (default 24h).
 * Deletes archived files after a second threshold (default 7 days).
 * Never touches files belonging to live sessions.
 */

import { readdirSync, statSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { ensureDirSync } from '../../core/utils/fs-utils.js';
import { createLogger } from '../../shared/logger.js';
import { isPidAlive } from './process-utils.js';

const log = createLogger('state-cleanup');

/** Matches UUIDs used as session-keyed socket pointer names. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Matches numeric PIDs used as pid-keyed socket pointer names. */
const PID_RE = /^\d+$/;
/** Matches PID suffix in socket filenames: goodvibes-runtime-{hash}-{pid}.sock */
const SOCK_PID_RE = /-(\d+)\.sock$/;

export interface CleanupOptions {
  /** Base state directory (e.g., .goodvibes/state) */
  stateDir: string;
  /** Hours before stale files are archived (default: 24) */
  archiveAfterHours: number;
  /** Hours before archived files are deleted (default: 168 = 7 days) */
  deleteAfterHours: number;
  /** Set of PIDs known to be alive — their files won't be touched */
  livePids: Set<number>;
  /** Set of session IDs known to be active — their files won't be touched */
  liveSessions: Set<string>;
  /** Max session files to keep (oldest beyond this count are deleted). Default: 10. */
  maxSessionFiles?: number;
  /**
   * Optional path to the sockets/active directory.
   * When provided, socket files (.sock) belonging to dead PIDs are removed.
   * Expected directory size is small (typically 1–5 files) — sync I/O is acceptable.
   */
  activeSocketDir?: string;
}

export interface CleanupResult {
  /** Number of files moved to archive */
  archived: number;
  /** Number of archived files permanently deleted */
  deleted: number;
  /** Files that were skipped (live sessions/PIDs) */
  skipped: number;
  /** Number of dead-PID socket files removed from sockets/active */
  socketsRemoved: number;
  /** Errors encountered (non-fatal) */
  errors: string[];
}

/**
 * Format a date as YYYYMMDD for archive suffix.
 */
function dateSuffix(): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Move a file to the archive subdirectory with a timestamp suffix.
 * Returns true if the move succeeded.
 */
function archiveFile(srcPath: string, archiveDir: string, errors: string[]): boolean {
  try {
    ensureDirSync(archiveDir);
    const name = basename(srcPath);
    const suffix = dateSuffix();
    const destPath = join(archiveDir, `${name}.${suffix}.${Date.now()}`);
    renameSync(srcPath, destPath);
    log.debug('Archived stale file', { src: srcPath, dest: destPath });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('Failed to archive file', { src: srcPath, error: msg });
    errors.push(`archive:${srcPath}: ${msg}`);
    return false;
  }
}

/**
 * Perform time-based cleanup of the state directory.
 *
 * - Archives socket pointer files and session files older than archiveAfterHours
 *   (unless they belong to live PIDs or active sessions).
 * - Deletes already-archived files older than deleteAfterHours.
 * - Leaves active files (events.jsonl, hooks-state.json, etc.) untouched.
 */
export function performStateCleanup(opts: CleanupOptions): CleanupResult {
  const {
    stateDir,
    archiveAfterHours,
    deleteAfterHours,
    livePids,
    liveSessions,
    activeSocketDir,
  } = opts;

  const result: CleanupResult = { archived: 0, deleted: 0, skipped: 0, socketsRemoved: 0, errors: [] };

  if (!existsSync(stateDir)) {
    log.debug('State directory does not exist, skipping cleanup', { stateDir });
    return result;
  }

  const nowMs = Date.now();
  const archiveThresholdMs = archiveAfterHours * 60 * 60 * 1000;
  const deleteThresholdMs = deleteAfterHours * 60 * 60 * 1000;

  const archivePointersDir = join(stateDir, 'archive', 'pointers');
  const archiveSessionsDir = join(stateDir, 'archive', 'sessions');

  // Files that are always active — never touch.
  const PROTECTED_FILES = new Set([
    'retries.json',
    'queue-auditor.json',
    'events.jsonl',
    'hooks-state.json',
    'agent-tracking.json',
  ]);

  // -----------------------------------------------------------------------
  // Phase 1: Scan state root — archive stale pointer and session files
  // -----------------------------------------------------------------------
  let entries: string[] = [];
  try {
    entries = readdirSync(stateDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`readdirSync(${stateDir}): ${msg}`);
    return result;
  }

  for (const file of entries) {
    // Skip protected files and the archive subdirectory itself
    if (PROTECTED_FILES.has(file) || file === 'archive' || file === 'sockets') {
      continue;
    }

    const filePath = join(stateDir, file);

    // ---- socket pointer files: runtime-{key}.socket ----
    if (file.startsWith('runtime-') && file.endsWith('.socket')) {
      const key = file.slice('runtime-'.length, -'.socket'.length);

      if (UUID_RE.test(key)) {
        // Session-keyed pointer
        if (liveSessions.has(key)) {
          result.skipped++;
          continue;
        }
      } else if (PID_RE.test(key)) {
        // PID-keyed pointer
        const pid = Number(key);
        if (livePids.has(pid) || isPidAlive(pid)) {
          result.skipped++;
          continue;
        }
      } else {
        // Unknown format — skip to be safe
        result.skipped++;
        continue;
      }

      // Check mtime
      let mtimeMs = 0;
      try {
        mtimeMs = statSync(filePath).mtimeMs;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          const msg = err instanceof Error ? err.message : String(err);
          result.errors.push(`stat:${filePath}: ${msg}`);
        }
        result.skipped++;
        continue;
      }

      if (nowMs - mtimeMs > archiveThresholdMs) {
        if (archiveFile(filePath, archivePointersDir, result.errors)) {
          result.archived++;
        }
      }
      continue;
    }

    // ---- session state files: session_{id}.json ----
    if (file.startsWith('session_') && file.endsWith('.json')) {
      // Extract session id from filename: session_{id}.json
      const sessionId = file.slice('session_'.length, -'.json'.length);

      if (liveSessions.has(sessionId)) {
        result.skipped++;
        continue;
      }

      let mtimeMs = 0;
      try {
        mtimeMs = statSync(filePath).mtimeMs;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          const msg = err instanceof Error ? err.message : String(err);
          result.errors.push(`stat:${filePath}: ${msg}`);
        }
        result.skipped++;
        continue;
      }

      if (nowMs - mtimeMs > archiveThresholdMs) {
        if (archiveFile(filePath, archiveSessionsDir, result.errors)) {
          result.archived++;
        }
      }
      continue;
    }

    // All other files: leave alone
  }

  // -----------------------------------------------------------------------
  // Phase 1.5: Count-based session file pruning — keep only maxSessionFiles
  // -----------------------------------------------------------------------
  const maxFiles = opts.maxSessionFiles ?? 10;
  const sessionFiles = entries
    .filter(f => f.startsWith('session_') && f.endsWith('.json'))
    .map(f => {
      const filePath = join(stateDir, f);
      let mtimeMs = 0;
      try { mtimeMs = statSync(filePath).mtimeMs; } catch { /* skip */ }
      return { file: f, path: filePath, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs); // newest first

  if (sessionFiles.length > maxFiles) {
    const toDelete = sessionFiles.slice(maxFiles);
    for (const entry of toDelete) {
      try {
        unlinkSync(entry.path);
        log.debug('Pruned excess session file', { file: entry.file });
        result.deleted++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`prune:${entry.path}: ${msg}`);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase 2: Scan archive dirs — delete files older than deleteAfterHours
  // -----------------------------------------------------------------------
  const archiveDirs = [
    { dir: archivePointersDir, label: 'pointers' },
    { dir: archiveSessionsDir, label: 'sessions' },
  ];

  for (const { dir, label } of archiveDirs) {
    if (!existsSync(dir)) continue;

    let archiveEntries: string[] = [];
    try {
      archiveEntries = readdirSync(dir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`readdirSync(${dir}): ${msg}`);
      continue;
    }

    for (const file of archiveEntries) {
      const filePath = join(dir, file);
      let mtimeMs = 0;
      try {
        mtimeMs = statSync(filePath).mtimeMs;
      } catch {
        continue;
      }

      if (nowMs - mtimeMs > deleteThresholdMs) {
        try {
          unlinkSync(filePath);
          log.debug('Deleted archived file', { path: filePath, label });
          result.deleted++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn('Failed to delete archived file', { path: filePath, error: msg });
          result.errors.push(`unlink:${filePath}: ${msg}`);
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase 3: Clean sockets/active — remove .sock files for dead PIDs
  // -----------------------------------------------------------------------
  if (activeSocketDir && existsSync(activeSocketDir)) {
    // Socket filename format: goodvibes-runtime-{hash}-{pid}.sock
    let sockFiles: string[] = [];
    try {
      sockFiles = readdirSync(activeSocketDir).filter((f) => f.endsWith('.sock'));
    } catch { /* directory may not be readable — skip */ }
    for (const sockFile of sockFiles) {
      const match = SOCK_PID_RE.exec(sockFile);
      if (!match) continue;
      const pid = Number(match[1]);
      if (!isPidAlive(pid)) {
        try {
          unlinkSync(join(activeSocketDir, sockFile));
          log.info('Removed dead socket file', { sockFile, pid });
          result.socketsRemoved++;
        } catch { /* already gone — ignore */ }
      }
    }
  }

  return result;
}
