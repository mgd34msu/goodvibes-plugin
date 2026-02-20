/**
 * DataWatcher — File-system watcher for analytics-engine daemon.
 *
 * Watches 4 key paths and emits typed events when their content changes:
 *   - telemetry/telemetry.db    → 'telemetry-change'
 *   - state/                    → 'session-change'
 *   - project-index.json        → 'index-change'
 *   - goodvibes.json            → 'config-change'
 *
 * Uses fs.watch with a polling fallback for filesystems that do not support
 * inotify (e.g. SQLite writes on some Linux mounts). Events are debounced to
 * 100 ms because SQLite WAL and atomic JSON writes can trigger multiple rapid
 * change events for a single logical update.
 *
 * Files that do not exist yet are handled gracefully: the watcher monitors
 * the parent directory and detects creation events.
 */

import { EventEmitter } from 'node:events';
import { watch, existsSync, statSync } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { join, dirname, basename } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Typed event map for DataWatcher. */
export interface WatcherEvents {
  /** Fired when telemetry.db changes (new tool calls recorded). */
  'telemetry-change': () => void;
  /** Fired when a session file in state/ is created or modified. */
  'session-change': () => void;
  /** Fired when project-index.json changes. */
  'index-change': () => void;
  /** Fired when goodvibes.json (config) changes. */
  'config-change': () => void;
}

/** Union of all event names emitted by DataWatcher. */
export type WatcherEventName = keyof WatcherEvents;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Debounce window in milliseconds. */
const DEBOUNCE_MS = 100;

// ---------------------------------------------------------------------------
// DataWatcher
// ---------------------------------------------------------------------------

/**
 * File-system watcher that emits typed change events for analytics daemon.
 *
 * @example
 * const watcher = new DataWatcher('/path/to/.goodvibes');
 * watcher.on('telemetry-change', () => refreshMetrics());
 * watcher.start();
 * // ... later:
 * watcher.stop();
 */
export class DataWatcher extends EventEmitter {
  private readonly goodvibesDir: string;
  private readonly pollIntervalMs: number;

  /** Active FSWatcher handles, keyed by the logical target path. */
  private watchers: Map<string, FSWatcher | { close(): void }> = new Map();

  /** Debounce timer handles, keyed by event name. */
  private debounceTimers: Map<WatcherEventName, ReturnType<typeof setTimeout>> = new Map();

  /** Whether the watcher is currently running. */
  private running = false;

  /**
   * @param goodvibesDir    - Absolute path to the .goodvibes directory.
   * @param options.pollIntervalMs - Polling interval for fallback mode (default: 1000 ms).
   */
  constructor(goodvibesDir: string, options?: { pollIntervalMs?: number }) {
    super();
    this.goodvibesDir = goodvibesDir;
    this.pollIntervalMs = options?.pollIntervalMs ?? 1000;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Start watching all tracked paths.
   * Safe to call multiple times — subsequent calls are no-ops if already running.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.attachWatchers();
  }

  /**
   * Stop all active watchers and cancel pending debounce timers.
   * Safe to call multiple times — subsequent calls on a stopped watcher are no-ops.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    // Cancel all debounce timers.
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Close all FSWatcher handles.
    for (const watcher of this.watchers.values()) {
      try {
        watcher.close();
      } catch {
        /* best-effort cleanup — ignore errors during teardown */
      }
    }
    this.watchers.clear();
  }

  /**
   * Returns true if the watcher is currently active.
   */
  isRunning(): boolean {
    return this.running;
  }

  // -------------------------------------------------------------------------
  // Typed emit overrides
  // -------------------------------------------------------------------------

  /** Type-safe emit. */
  emit<K extends WatcherEventName>(event: K): boolean {
    return super.emit(event);
  }

  /** Type-safe on. */
  on<K extends WatcherEventName>(event: K, listener: WatcherEvents[K]): this {
    return super.on(event, listener as () => void);
  }

  /** Type-safe once. */
  once<K extends WatcherEventName>(event: K, listener: WatcherEvents[K]): this {
    return super.once(event, listener as () => void);
  }

  /** Type-safe off. */
  off<K extends WatcherEventName>(event: K, listener: WatcherEvents[K]): this {
    return super.off(event, listener as () => void);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Attach FSWatcher instances for each tracked path.
   * Paths that do not yet exist are watched via their parent directory.
   */
  private attachWatchers(): void {
    const entries: Array<{ targetPath: string; event: WatcherEventName }> = [
      {
        targetPath: join(this.goodvibesDir, 'telemetry', 'telemetry.db'),
        event: 'telemetry-change',
      },
      {
        targetPath: join(this.goodvibesDir, 'state'),
        event: 'session-change',
      },
      {
        targetPath: join(this.goodvibesDir, 'project-index.json'),
        event: 'index-change',
      },
      {
        targetPath: join(this.goodvibesDir, 'goodvibes.json'),
        event: 'config-change',
      },
    ];

    for (const entry of entries) {
      this.watchPath(entry.targetPath, entry.event);
    }
  }

  /**
   * Attach a single FSWatcher for a path.
   *
   * If the target path does not yet exist, watches the parent directory instead
   * and fires the event when the target filename is created or changed.
   * For directory targets (e.g. state/), any change within the directory fires.
   *
   * Falls back to mtime polling when fs.watch throws (e.g. ENOSYS on some
   * container filesystems or network mounts).
   *
   * @param targetPath - Logical path we care about (file or directory).
   * @param event      - Watcher event name to emit on change.
   */
  private watchPath(targetPath: string, event: WatcherEventName): void {
    const targetBasename = basename(targetPath);
    const isDir = this.pathIsDirectory(targetPath);

    // If the target doesn't exist, watch the parent directory for its creation.
    const watchTarget = existsSync(targetPath) ? targetPath : dirname(targetPath);

    const handler = (_eventType: string, filename: string | null): void => {
      if (existsSync(targetPath)) {
        // Watching the target directly (or target now exists).
        // For file targets, any change is relevant.
        // For directory targets (state/), any filename change is relevant.
        if (!isDir && filename !== null && filename !== targetBasename) {
          return;
        }
      } else {
        // Watching parent directory for target creation.
        // Only react when the target file itself appears.
        if (filename !== targetBasename) return;
        // File appeared — re-watch directly and fire immediately.
        if (existsSync(targetPath)) {
          this.rewatchPath(targetPath, event);
          return;
        }
      }

      this.debounceEmit(event);
    };

    try {
      const watcher = watch(watchTarget, { persistent: false /* watcher won't keep the Node.js process alive */ }, handler);
      watcher.on('error', (_err: Error) => {
        // On error, close this watcher and attempt mtime polling.
        try { watcher.close(); } catch { /* best-effort cleanup */ }
        this.watchers.delete(targetPath);
        this.attachPollingFallback(targetPath, event);
      });
      this.watchers.set(targetPath, watcher);
    } catch { /* best-effort — fs.watch not supported on this filesystem; fall back to mtime polling */
      this.attachPollingFallback(targetPath, event);
    }
  }

  /**
   * Re-attach a direct watcher for a path that has just been created.
   * Replaces any existing parent-directory watcher and emits the event once.
   *
   * @param targetPath - The path that now exists.
   * @param event      - Event name to emit.
   */
  private rewatchPath(targetPath: string, event: WatcherEventName): void {
    const existing = this.watchers.get(targetPath);
    if (existing) {
      try { existing.close(); } catch { /* best-effort cleanup */ }
      this.watchers.delete(targetPath);
    }
    // Fire the event for the creation itself.
    this.debounceEmit(event);
    // Attach a new watcher on the now-existing path.
    this.watchPath(targetPath, event);
  }

  /**
   * Polling-based fallback for filesystems that do not support inotify.
   * Uses setInterval to periodically check the target file's mtime.
   *
   * @param targetPath    - Path to poll.
   * @param event         - Event to emit on change.
   */
  private attachPollingFallback(targetPath: string, event: WatcherEventName): void {
    // Guard against double-attach.
    if (this.watchers.has(targetPath)) return;

    let lastMtime = 0;
    try { lastMtime = statSync(targetPath).mtimeMs; } catch { /* file may not exist yet */ }
    const interval = setInterval(() => {
      if (!this.running) {
        clearInterval(interval);
        return;
      }
      try {
        const stat = statSync(targetPath);
        if (stat.mtimeMs !== lastMtime) {
          lastMtime = stat.mtimeMs;
          this.debounceEmit(event);
        }
      } catch { /* best-effort — file does not exist yet; poll again next interval */
      }
    }, this.pollIntervalMs);

    // Store a close()-compatible object so stop() can clean it up uniformly.
    const closeableInterval: { close(): void } = {
      close: () => { clearInterval(interval); },
    };
    this.watchers.set(targetPath, closeableInterval);
  }

  /**
   * Returns true if the given path is an existing directory.
   */
  private pathIsDirectory(targetPath: string): boolean {
    try {
      return statSync(targetPath).isDirectory();
    } catch { /* best-effort — path may not exist */
      return false;
    }
  }

  /**
   * Debounce-emit an event. Subsequent calls within DEBOUNCE_MS reset the timer.
   *
   * @param event - Event name to emit after the debounce delay.
   */
  private debounceEmit(event: WatcherEventName): void {
    const existing = this.debounceTimers.get(event);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.debounceTimers.delete(event);
      if (this.running) {
        this.emit(event);
      }
    }, DEBOUNCE_MS);
    this.debounceTimers.set(event, timer);
  }
}
