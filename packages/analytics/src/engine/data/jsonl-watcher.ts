/**
 * JSONLWatcher — Live tail watcher for Claude session JSONL files.
 *
 * Extends EventEmitter to emit batched JSONLRecord arrays as new content is
 * appended to the active session JSONL file. Supports:
 *
 *   - Automatic detection of the active JSONL file (most recently modified)
 *   - Incremental reads via byte-offset tracking (never re-reads old data)
 *   - Session rotation detection (new file → 'session-change' event)
 *   - Subagent JSONL watching (<session-id>/subagents/agent-*.jsonl)
 *   - fs.watch with mtime polling fallback
 *   - Configurable batch interval to debounce rapid appends
 *   - Clean shutdown via stop()
 *
 * Events:
 *   'records'        — emits JSONLRecord[] batched since last interval
 *   'error'          — emits Error for I/O failures
 *   'session-change' — emits new session ID string when active file changes
 */

import { EventEmitter } from 'node:events';
import { watch, existsSync, statSync } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';

import { loadModelPricing } from '../config.js';
import { JSONLReader, findActiveJsonlFile, sessionIdFromPath } from './jsonl-reader.js';
import type { JSONLRecord } from './jsonl-types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration options for JSONLWatcher.
 * All fields are optional — sensible defaults are provided.
 */
export interface JSONLWatcherOptions {
  /**
   * Milliseconds to batch parsed records before emitting 'records' event.
   * Default: 1000 ms. Higher values reduce event frequency at cost of latency.
   */
  batchIntervalMs?: number;
  /**
   * Polling interval in milliseconds used as fallback when fs.watch fails.
   * Default: 2000 ms.
   */
  pollIntervalMs?: number;
  /**
   * Cost config passed to JSONLReader for cost calculation.
   */
  costConfig?: {
    cost_per_1k_input_tokens: number;
    cost_per_1k_output_tokens: number;
  };
}

/** Typed event map for JSONLWatcher. */
export interface JSONLWatcherEvents {
  /** Emitted when a batch of parsed records is ready. */
  'records': (records: JSONLRecord[]) => void;
  /** Emitted when an I/O error occurs (non-fatal — watcher continues). */
  'error': (err: Error) => void;
  /** Emitted when the active session JSONL file changes (rotation event). */
  'session-change': (newSessionId: string) => void;
}

/** Internal state for a watched JSONL file. */
interface WatchedFile {
  /** Absolute path to the JSONL file. */
  path: string;
  /** Byte offset of the last read position. */
  offset: number;
  /** Active FSWatcher or polling handle. */
  handle: FSWatcher | { close(): void };
  /** Whether this file belongs to a subagent. */
  isSubagent: boolean;
}

// ---------------------------------------------------------------------------
// JSONLWatcher
// ---------------------------------------------------------------------------

/**
 * Live JSONL file watcher that emits parsed records as they are appended.
 *
 * @example
 * const watcher = new JSONLWatcher('/home/user/.claude/projects/abc123/', {
 *   batchIntervalMs: 500,
 *   costConfig: { cost_per_1k_input_tokens: 0.003, cost_per_1k_output_tokens: 0.015 },
 * });
 *
 * watcher.on('records', (records) => {
 *   console.log(`Received ${records.length} new records`);
 * });
 * watcher.on('session-change', (sessionId) => {
 *   console.log(`Session changed to ${sessionId}`);
 * });
 *
 * watcher.start();
 * // ... later:
 * watcher.stop();
 */
export class JSONLWatcher extends EventEmitter {
  private readonly projectDir: string;
  private readonly batchIntervalMs: number;
  private readonly pollIntervalMs: number;
  private readonly reader: JSONLReader;

  /** Currently active session JSONL path. */
  private activeSessionPath: string | null = null;

  /** Currently active session ID. */
  private activeSessionId: string | null = null;

  /** All watched files (main session + subagents). */
  private watchedFiles: Map<string, WatchedFile> = new Map();

  /** Pending records accumulated between batch flushes. */
  private pendingRecords: JSONLRecord[] = [];

  /** Batch flush interval handle. */
  private batchTimer: ReturnType<typeof setInterval> | null = null;

  /** Active session rotation detection interval. */
  private rotationTimer: ReturnType<typeof setInterval> | null = null;

  /** Whether the watcher is running. */
  private running = false;

  /** Watcher for the subagent directory (kept separate from watchedFiles). */
  private subagentDirWatcher: { watcher: FSWatcher | { close(): void }; path: string } | null = null;

  /**
   * @param projectDir - Absolute path to the Claude project directory
   *                     (e.g. ~/.claude/projects/<project-hash>/).
   * @param options    - Optional configuration overrides.
   */
  constructor(projectDir: string, options?: JSONLWatcherOptions) {
    super();
    this.projectDir = projectDir;
    this.batchIntervalMs = options?.batchIntervalMs ?? 1000;
    this.pollIntervalMs = options?.pollIntervalMs ?? 2000;
    this.reader = new JSONLReader(
      options?.costConfig ?? { cost_per_1k_input_tokens: 0.003, cost_per_1k_output_tokens: 0.015 },
      loadModelPricing(),
    );
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Start watching the project directory for JSONL activity.
   *
   * Finds the active session JSONL, begins watching it, sets up subagent
   * watching, and starts the batch flush interval. Safe to call multiple
   * times — subsequent calls are no-ops if already running.
   */
  start(): void {
    if (this.running) {return;}
    this.running = true;

    // Initialise session watching asynchronously.
    this.initSessionWatch().catch((err: unknown) => {
      this.emitError(err instanceof Error ? err : new Error(String(err)));
    });

    // Batch flush interval.
    this.batchTimer = setInterval(() => {
      this.flushPendingRecords();
    }, this.batchIntervalMs);
    // Flush loop holds no wake-lock and exits with the process (field issue 9).
    this.batchTimer.unref?.();

    // Session rotation check: look for a newer JSONL file every 5 seconds.
    this.rotationTimer = setInterval(() => {
      this.checkSessionRotation().catch((err: unknown) => {
        this.emitError(err instanceof Error ? err : new Error(String(err)));
      });
    }, 5000);
    this.rotationTimer.unref?.();
  }

  /**
   * Stop all watchers, flush any pending records, and clean up timers.
   * Safe to call multiple times.
   */
  stop(): void {
    if (!this.running) {return;}
    this.running = false;

    // Cancel batch and rotation timers.
    if (this.batchTimer !== null) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    if (this.rotationTimer !== null) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }

    // Flush any remaining records.
    this.flushPendingRecords();

    // Close all FSWatcher handles.
    for (const watched of this.watchedFiles.values()) {
      try { watched.handle.close(); } catch { /* best-effort */ }
    }
    this.watchedFiles.clear();

    // Close subagent directory watcher.
    if (this.subagentDirWatcher !== null) {
      try { this.subagentDirWatcher.watcher.close(); } catch { /* best-effort */ }
      this.subagentDirWatcher = null;
    }

    this.activeSessionPath = null;
    this.activeSessionId = null;
    this.pendingRecords = [];
  }

  /**
   * Returns the currently active session ID, or null if none has been detected.
   */
  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  // -------------------------------------------------------------------------
  // Typed emit overrides
  // -------------------------------------------------------------------------

  /** Type-safe emit. */
  emit<K extends keyof JSONLWatcherEvents>(
    event: K,
    ...args: Parameters<JSONLWatcherEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  /** Type-safe on. */
  on<K extends keyof JSONLWatcherEvents>(event: K, listener: JSONLWatcherEvents[K]): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  /** Type-safe once. */
  once<K extends keyof JSONLWatcherEvents>(event: K, listener: JSONLWatcherEvents[K]): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  /** Type-safe off. */
  off<K extends keyof JSONLWatcherEvents>(event: K, listener: JSONLWatcherEvents[K]): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  // -------------------------------------------------------------------------
  // Session initialisation
  // -------------------------------------------------------------------------

  /**
   * Detect the active session JSONL file and begin watching it.
   */
  private async initSessionWatch(): Promise<void> {
    const activePath = await findActiveJsonlFile(this.projectDir);
    if (activePath === null) {
      // No JSONL files yet — watch the project directory for creation.
      this.watchDirectoryForNewSession();
      return;
    }

    await this.switchToSession(activePath);
  }

  /**
   * Switch to watching a new session JSONL file.
   * Stops watching the previous session file and subagents.
   */
  private async switchToSession(jsonlPath: string): Promise<void> {
    const newSessionId = sessionIdFromPath(jsonlPath);

    // Close existing watchers if switching sessions.
    if (this.activeSessionPath !== null && this.activeSessionPath !== jsonlPath) {
      for (const [path, watched] of this.watchedFiles.entries()) {
        try { watched.handle.close(); } catch { /* best-effort */ }
        this.watchedFiles.delete(path);
      }
      this.emit('session-change', newSessionId);
    }

    this.activeSessionPath = jsonlPath;
    this.activeSessionId = newSessionId;

    // Start watching the main session file.
    if (!this.watchedFiles.has(jsonlPath)) {
      this.attachFileWatcher(jsonlPath, false);
    }

    // Discover and watch subagent files.
    await this.watchSubagentFiles(newSessionId);
  }

  // -------------------------------------------------------------------------
  // File watching
  // -------------------------------------------------------------------------

  /**
   * Attach a watcher on a specific JSONL file.
   * Uses fs.watch with a polling fallback.
   *
   * @param filePath   - Absolute path to the JSONL file.
   * @param isSubagent - Whether this file belongs to a subagent.
   */
  private attachFileWatcher(filePath: string, isSubagent: boolean): void {
    if (this.watchedFiles.has(filePath)) {return;}

    const watched: WatchedFile = {
      path: filePath,
      offset: 0,
      handle: { close() {} }, // placeholder; replaced below
      isSubagent,
    };

    const onFileChange = (): void => {
      this.readNewLines(watched).catch((err: unknown) => {
        this.emitError(err instanceof Error ? err : new Error(String(err)));
      });
    };

    // Attempt fs.watch; fall back to mtime polling on failure.
    try {
      const fsWatcher = watch(filePath, { persistent: false }, onFileChange);
      fsWatcher.on('error', (_err: Error) => {
        try { fsWatcher.close(); } catch { /* best-effort */ }
        if (this.watchedFiles.has(filePath)) {
          const w = this.watchedFiles.get(filePath)!;
          w.handle = this.createPollingHandle(filePath, onFileChange);
        }
      });
      watched.handle = fsWatcher;
    } catch {
      watched.handle = this.createPollingHandle(filePath, onFileChange);
    }

    this.watchedFiles.set(filePath, watched);

    // Do an immediate read to pick up existing content.
    this.readNewLines(watched).catch((err: unknown) => {
      this.emitError(err instanceof Error ? err : new Error(String(err)));
    });
  }

  /**
   * Create a polling handle for filesystems that do not support inotify.
   *
   * @param filePath - Path to poll.
   * @param onChange - Callback to invoke when mtime changes.
   * @returns A { close() } compatible handle.
   */
  private createPollingHandle(
    filePath: string,
    onChange: () => void,
  ): { close(): void } {
    let lastMtime = 0;
    try { lastMtime = statSync(filePath).mtimeMs; } catch { /* file may not exist */ }

    const interval = setInterval(() => {
      if (!this.running) {
        clearInterval(interval);
        return;
      }
      try {
        const s = statSync(filePath);
        if (s.mtimeMs !== lastMtime) {
          lastMtime = s.mtimeMs;
          onChange();
        }
      } catch { /* file may have been removed — ignore */ }
    }, this.pollIntervalMs);
    interval.unref?.();

    return { close: () => clearInterval(interval) };
  }

  /**
   * Watch the project directory itself for new JSONL files (before any session starts).
   */
  private watchDirectoryForNewSession(): void {
    const dirPath = this.projectDir;
    if (!existsSync(dirPath)) {return;}

    let handle: FSWatcher | { close(): void };
    const onDirChange = (_eventType: string, filename: string | null): void => {
      if (filename === null || !filename.endsWith('.jsonl')) {return;}
      const fullPath = join(dirPath, filename);
      if (!existsSync(fullPath)) {return;}

      // A new JSONL appeared — switch to it.
      this.switchToSession(fullPath).catch((err: unknown) => {
        this.emitError(err instanceof Error ? err : new Error(String(err)));
      });

      // Remove the directory watcher once we have a session.
      try { handle.close(); } catch { /* best-effort */ }
    };

    try {
      handle = watch(dirPath, { persistent: false }, onDirChange);
    } catch {
      // Can't watch directory — the rotation timer will pick it up.
      handle = { close(): void { /* no-op */ } };
    }
  }

  // -------------------------------------------------------------------------
  // Subagent watching
  // -------------------------------------------------------------------------

  /**
   * Discover and watch subagent JSONL files for a session.
   *
   * Subagent files live at: <projectDir>/<sessionId>/subagents/agent-*.jsonl
   *
   * @param sessionId - The parent session ID.
   */
  private async watchSubagentFiles(sessionId: string): Promise<void> {
    const subagentDir = join(this.projectDir, sessionId, 'subagents');
    if (!existsSync(subagentDir)) {return;}

    let entries: string[];
    try {
      entries = await readdir(subagentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.startsWith('agent-') || !entry.endsWith('.jsonl')) {continue;}
      const fullPath = join(subagentDir, entry);
      if (!this.watchedFiles.has(fullPath)) {
        this.attachFileWatcher(fullPath, true);
      }
    }

    // Also watch the subagent directory for new agent files being created.
    this.watchSubagentDirectory(subagentDir, sessionId);
  }

  /**
   * Watch a subagent directory for newly created agent JSONL files.
   *
   * @param subagentDir - Absolute path to the subagents/ directory.
   * @param sessionId   - Parent session ID (for validation).
   */
  private watchSubagentDirectory(subagentDir: string, sessionId: string): void {
    // Only set up the directory watch once.
    if (this.subagentDirWatcher !== null && this.subagentDirWatcher.path === subagentDir) {return;}

    const onDirChange = (_eventType: string, filename: string | null): void => {
      // Only react to this session's subagents.
      if (this.activeSessionId !== sessionId) {return;}
      if (filename === null) {return;}
      if (!filename.startsWith('agent-') || !filename.endsWith('.jsonl')) {return;}

      const fullPath = join(subagentDir, filename);
      if (!existsSync(fullPath)) {return;}
      if (!this.watchedFiles.has(fullPath)) {
        this.attachFileWatcher(fullPath, true);
      }
    };

    let handle: FSWatcher | { close(): void };
    try {
      handle = watch(subagentDir, { persistent: false }, onDirChange);
    } catch {
      handle = { close(): void { /* no-op */ } };
    }

    this.subagentDirWatcher = { watcher: handle, path: subagentDir };
  }

  // -------------------------------------------------------------------------
  // Incremental reading
  // -------------------------------------------------------------------------

  /**
   * Read new lines from a watched file starting at its current offset.
   * Parsed records are accumulated in pendingRecords for batch flush.
   *
   * @param watched - The watched file state to read from.
   */
  private async readNewLines(watched: WatchedFile): Promise<void> {
    if (!this.running) {return;}

    try {
      const result = await this.reader.parseFile(watched.path, watched.offset);

      // Update the offset regardless of parse success/failure.
      watched.offset = result.newOffset;

      if (result.records.length > 0) {
        this.pendingRecords.push(...result.records);
      }

      // Log parse errors (non-fatal).
      for (const error of result.errors) {
        // Emit as non-fatal error (wrapped Error).
        this.emitError(new Error(`[JSONLWatcher] ${error}`));
      }
    } catch (err: unknown) {
      this.emitError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  // -------------------------------------------------------------------------
  // Batch flush
  // -------------------------------------------------------------------------

  /**
   * Emit and clear the accumulated pending records.
   * Called by the batch interval timer and on stop().
   */
  private flushPendingRecords(): void {
    if (this.pendingRecords.length === 0) {return;}
    const batch = this.pendingRecords.splice(0);
    this.emit('records', batch);
  }

  // -------------------------------------------------------------------------
  // Session rotation detection
  // -------------------------------------------------------------------------

  /**
   * Check whether a newer JSONL file has appeared (new session started).
   * Called periodically by the rotation timer.
   */
  private async checkSessionRotation(): Promise<void> {
    if (!this.running) {return;}

    const activePath = await findActiveJsonlFile(this.projectDir);
    if (activePath === null) {return;}
    if (activePath === this.activeSessionPath) {return;}

    // A newer JSONL file exists — switch to it.
    await this.switchToSession(activePath);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Emit an error event. Per EventEmitter convention, error events must have
   * a listener or they throw. We guard against this by checking listeners.
   */
  private emitError(err: Error): void {
    if (this.listenerCount('error') > 0) {
      this.emit('error', err);
    }
    // If no listener, swallow — avoid crashing on non-fatal I/O errors.
  }
}
