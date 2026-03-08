/**
 * SocketWatcher — monitors an IPC socket file for unexpected deletion.
 *
 * Uses fs.watch on the parent directory (not the file itself, since watching
 * a deleted file produces no further events) plus a periodic stat fallback
 * as a catch-all for events that slip through the directory watcher.
 *
 * On confirmed socket loss the `onSocketLost` callback is invoked once. The
 * watcher stops itself after firing so the caller can start a new one after
 * recreation.
 */

import { existsSync, watch, type FSWatcher } from 'node:fs';
import { dirname, basename } from 'node:path';

import { createLogger } from '../../shared/logger.js';

const log = createLogger('socket-watcher');

export interface SocketWatcherOptions {
  /** How often (ms) to poll existsSync as a fallback. Default: 30_000 ms. */
  pollIntervalMs?: number;
  /** Debounce window (ms) between detecting a rename event and declaring the socket lost. Default: 500 ms. */
  debounceMs?: number;
}

/**
 * Monitors a Unix domain socket file for unexpected deletion.
 * Watching the parent directory is the correct approach because `fs.watch`
 * stops emitting events once the watched file itself is deleted.
 */
export class SocketWatcher {
  private readonly socketPath: string;
  private readonly socketDir: string;
  private readonly socketName: string;
  private readonly onSocketLost: () => void | Promise<void>;
  private readonly pollIntervalMs: number;
  private readonly debounceMs: number;

  private dirWatcher: FSWatcher | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private watching = false;
  private fired = false;
  private pollInProgress = false;

  constructor(
    socketPath: string,
    onSocketLost: () => void | Promise<void>,
    options?: SocketWatcherOptions,
  ) {
    this.socketPath = socketPath;
    this.socketDir = dirname(socketPath);
    this.socketName = basename(socketPath);
    this.onSocketLost = onSocketLost;
    this.pollIntervalMs = options?.pollIntervalMs ?? 30_000;
    this.debounceMs = options?.debounceMs ?? 500;
  }

  /** Begin watching. Idempotent — calling twice is a no-op. */
  start(): void {
    if (this.watching) return;
    this.watching = true;
    this.fired = false;

    // Watch the parent directory for rename events that affect our socket.
    try {
      const watcher = watch(this.socketDir, (eventType, filename) => {
        if (filename !== this.socketName) return;
        if (eventType === 'rename') {
          // A rename event means the file was created or deleted. Stat to confirm loss.
          this.scheduleVerification();
        }
      });
      watcher.unref();
      this.dirWatcher = watcher;
    } catch (err) {
      log.warn(`SocketWatcher: fs.watch failed, operating in poll-only mode (detection latency up to ${this.pollIntervalMs}ms)`, {
        error: String(err),
      });
    }

    // Periodic fallback — catches deletions that don't produce directory events
    // (e.g. tmpfs remounts, cross-device renames, or kernel quirks).
    // pollInProgress guards against queued callbacks when existsSync is slow.
    const poll = setInterval(() => {
      if (this.pollInProgress) return;
      this.pollInProgress = true;
      try {
        if (!existsSync(this.socketPath)) {
          log.warn('SocketWatcher: periodic poll detected missing socket', { path: this.socketPath });
          this.declareLost();
        }
      } finally {
        this.pollInProgress = false;
      }
    }, this.pollIntervalMs);
    poll.unref();
    this.pollTimer = poll;

    log.debug('SocketWatcher: started', { path: this.socketPath });
  }

  /** Stop watching and cancel all pending timers. */
  stop(): void {
    if (!this.watching) return;
    this.watching = false;

    this.dirWatcher?.close();
    this.dirWatcher = null;

    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    log.debug('SocketWatcher: stopped', { path: this.socketPath });
  }

  /** Returns true if the watcher is currently active. */
  isWatching(): boolean {
    return this.watching;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Arm (or reset) the debounce timer. After `debounceMs` of silence, stat the
   * socket and declare it lost if it is still absent.
   */
  private scheduleVerification(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    const t = setTimeout(() => {
      this.debounceTimer = null;
      if (!existsSync(this.socketPath)) {
        log.warn('SocketWatcher: directory rename event confirmed socket missing', {
          path: this.socketPath,
        });
        this.declareLost();
      }
    }, this.debounceMs);
    t.unref();
    this.debounceTimer = t;
  }

  /**
   * Invoke the `onSocketLost` callback exactly once, then stop watching.
   * The caller is expected to recreate the socket and start a new watcher.
   */
  private declareLost(): void {
    if (this.fired) return; // Single-fire guard
    this.fired = true;
    this.stop();
    log.info('SocketWatcher: invoking onSocketLost callback', { path: this.socketPath });
    try {
      const result = this.onSocketLost();
      if (result && typeof result.catch === 'function') {
        result.catch((err: unknown) => {
          log.warn('SocketWatcher: onSocketLost callback rejected', { error: String(err) });
        });
      }
    } catch (err) {
      log.warn('SocketWatcher: onSocketLost callback threw', { error: String(err) });
    }
  }
}
