/**
 * DaemonLifecycle — manages the daemon process lifecycle.
 * Handles checking if daemon is running, starting it, stopping it,
 * and health checking.
 */

import { existsSync, readFileSync, unlinkSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { createLogger } from '../shared/logger.js';
import { toErrorMessage } from '../shared/utils.js';
import { DAEMON_PID_FILE, DAEMON_SOCKET_POINTER, DAEMON_ENTRY, DAEMON_LOCK_FILE } from './daemon-constants.js';

const logger = createLogger('daemon-lifecycle');
const STARTUP_TIMEOUT_MS = 10_000;
const HEALTH_CHECK_INTERVAL_MS = 500;
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 30_000;

export interface DaemonStatus {
  running: boolean;
  pid: number | null;
  socketPath: string | null;
  uptime?: number;
}

/**
 * Cached health state maintained by the polling loop.
 *
 * Semantics:
 *   - `running` is the authoritative liveness signal: true only when the process
 *     is alive AND the socket is responsive.
 *   - `pid` reflects process existence and is set whenever the process is alive,
 *     regardless of socket responsiveness. It is null only when the process is
 *     confirmed dead or no PID file exists. Use `pid` for diagnostics.
 *
 * Examples:
 *   - Process alive + socket responsive  → running=true,  pid=<value>
 *   - Process alive + socket unresponsive → running=false, pid=<value>
 *   - Process dead (stale PID file)       → running=false, pid=null
 *   - No PID file                         → running=false, pid=null
 */
export interface HealthState {
  running: boolean;
  pid: number | null;
  socketPath: string | null;
  /** Was the last socket probe successful? */
  socketResponsive: boolean;
  /** Timestamp (ms since epoch) of the last health check. */
  lastChecked: number;
  /** Uptime in milliseconds from daemon RPC, if available. */
  uptime: number | null;
}

export interface DaemonLifecycleOptions {
  /** Interval between health checks in milliseconds. Default: 30_000. */
  healthCheckIntervalMs?: number;
}

export class DaemonLifecycle {
  private startPromise: Promise<void> | null = null;
  private readonly projectRoot: string;
  private readonly goodvibesDir: string;
  private readonly pidFilePath: string;
  private readonly socketPointerPath: string;
  private readonly lockFilePath: string;
  private healthCheckIntervalMs: number;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private cachedHealth: HealthState | null = null;

  constructor(projectRoot: string, options?: DaemonLifecycleOptions) {
    this.projectRoot = projectRoot;
    this.goodvibesDir = resolve(projectRoot, '.goodvibes');
    this.pidFilePath = resolve(this.goodvibesDir, DAEMON_PID_FILE);
    this.socketPointerPath = resolve(this.goodvibesDir, DAEMON_SOCKET_POINTER);
    this.lockFilePath = resolve(this.goodvibesDir, DAEMON_LOCK_FILE);
    this.healthCheckIntervalMs = options?.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL_MS;
  }

  /**
   * Check if the daemon is currently running.
   * Verifies both PID file existence AND process liveness AND socket responsiveness.
   */
  async isRunning(): Promise<boolean> {
    const pid = this.readPid();
    if (pid === null) return false;

    // Check if process is alive
    if (!this.isProcessAlive(pid)) {
      this.cleanupStaleFiles();
      return false;
    }

    // Check if socket is responsive
    const socketPath = this.readSocketPointer();
    if (!socketPath) {
      return false; // Process alive but no socket yet (starting up?)
    }

    return this.probeSocket(socketPath);
  }

  /**
   * Start the daemon process.
   * Uses a single-instance guard to prevent concurrent starts spawning duplicate daemons.
   */
  async start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.doStart().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    if (await this.isRunning()) {
      logger.info('Daemon already running');
      return;
    }

    if (!this.acquireLock()) {
      logger.info('Daemon start in progress by another process, waiting...');
      await this.waitForLockRelease(STARTUP_TIMEOUT_MS);
      if (await this.isRunning()) return;
      throw new Error('Daemon failed to start (spawned by another process)');
    }

    try {
      await this.doStartLocked();
    } finally {
      this.releaseLock();
    }
  }

  private async doStartLocked(): Promise<void> {
    // Clean up any stale files from a previous run
    this.cleanupStaleFiles();

    // Resolve the daemon entry point
    // CLAUDE_PLUGIN_ROOT points to the installed plugin location
    const pluginRoot = process.env['CLAUDE_PLUGIN_ROOT'] ?? process.cwd();
    const daemonScript = resolve(
      pluginRoot,
      'tools/implementations/runtime-engine',
      DAEMON_ENTRY,
    );

    if (!existsSync(daemonScript)) {
      throw new Error(
        `Daemon entry point not found: ${daemonScript}. Run the build first.`,
      );
    }

    logger.info('Starting daemon process', { script: daemonScript });

    // Spawn detached process
    const child = spawn(process.execPath, [daemonScript], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        GV_PROJECT_ROOT: this.projectRoot,
      },
    });

    child.unref();

    if (!child.pid) {
      throw new Error('Failed to spawn daemon process — no PID returned');
    }
    const daemonPid = child.pid;

    // Wait for the daemon to become responsive
    await this.waitForSocket(STARTUP_TIMEOUT_MS);

    logger.info('Daemon started', { pid: daemonPid });
    this.startHealthCheck();
  }

  /**
   * Attempt to acquire the startup lock using atomic file creation (O_EXCL).
   * Returns true if lock was acquired, false if another process holds it.
   * Cleans up stale locks (holder PID dead) and retries once.
   */
  private acquireLock(): boolean {
    return this._tryAcquireLock(true);
  }

  private _tryAcquireLock(allowStaleRetry: boolean): boolean {
    try {
      const fd = openSync(this.lockFilePath, 'wx');
      try {
        writeSync(fd, String(process.pid));
      } finally {
        closeSync(fd);
      }
      return true;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        logger.warn('Unexpected error acquiring daemon lock', { err: toErrorMessage(err) });
        return false;
      }

      // Lock exists — check if holder is alive
      try {
        const content = readFileSync(this.lockFilePath, 'utf-8').trim();
        const lockerPid = parseInt(content, 10);
        if (Number.isFinite(lockerPid) && this.isProcessAlive(lockerPid)) {
          return false; // Holder is alive, we must wait
        }
      } catch {
        // Can't read lock — assume stale
      }

      // Stale lock: holder is dead — clean it up and retry once
      if (allowStaleRetry) {
        try { unlinkSync(this.lockFilePath); } catch { /* ignore */ }
        return this._tryAcquireLock(false);
      }
      return false;
    }
  }

  /**
   * Release the startup lock by removing the lock file.
   */
  private releaseLock(): void {
    try { unlinkSync(this.lockFilePath); } catch { /* ignore */ }
  }

  /**
   * Wait for the lock file to disappear (i.e., the other process finishes starting).
   * After the lock is released, the caller should check isRunning().
   */
  private async waitForLockRelease(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!existsSync(this.lockFilePath)) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    // Timed out waiting — proceed anyway; caller will check isRunning()
  }

  /**
   * Stop the daemon process by sending SIGTERM.
   */
  async stop(): Promise<void> {
    this.stopHealthCheck();
    const pid = this.readPid();
    if (pid === null) {
      logger.info('No daemon PID file found');
      return;
    }

    if (!this.isProcessAlive(pid)) {
      logger.info('Daemon process already dead, cleaning up');
      this.cleanupStaleFiles();
      return;
    }

    logger.info('Sending SIGTERM to daemon', { pid });
    try {
      process.kill(pid, 'SIGTERM');
    } catch (err) {
      logger.warn('Failed to send SIGTERM', { err: toErrorMessage(err) });
    }

    // Wait for process to exit (up to 5s)
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (!this.isProcessAlive(pid)) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    // Force kill if still alive
    if (this.isProcessAlive(pid)) {
      logger.warn('Daemon did not exit gracefully, sending SIGKILL', { pid });
      try {
        process.kill(pid, 'SIGKILL');
      } catch { /* ignore */ }
    }

    this.cleanupStaleFiles();
  }

  /**
   * Get daemon status information.
   * Returns cached health if available and fresh (< healthCheckIntervalMs old).
   * Otherwise runs updateHealth() and returns the fresh result.
   */
  async getStatus(): Promise<DaemonStatus> {
    const now = Date.now();
    if (
      this.cachedHealth !== null &&
      now - this.cachedHealth.lastChecked < this.healthCheckIntervalMs
    ) {
      const h = this.cachedHealth;
      return {
        running: h.running,
        pid: h.pid,
        socketPath: h.socketPath,
        uptime: h.uptime ?? undefined,
      };
    }

    await this.updateHealth();
    if (!this.cachedHealth) {
      throw new Error('updateHealth failed to set cached state');
    }
    const h = this.cachedHealth;
    return {
      running: h.running,
      pid: h.pid,
      socketPath: h.socketPath,
      uptime: h.uptime ?? undefined,
    };
  }

  /**
   * Start periodic health check polling.
   * Runs updateHealth() immediately, then on the given interval.
   */
  startHealthCheck(intervalMs: number = this.healthCheckIntervalMs): void {
    if (this.healthCheckTimer !== null) return;
    // Update the stored interval to match what is actually being used,
    // so getStatus() cache-freshness check stays consistent.
    this.healthCheckIntervalMs = intervalMs;
    // Run immediately
    void this.updateHealth();
    this.healthCheckTimer = setInterval(() => {
      void this.updateHealth();
    }, intervalMs);
  }

  /**
   * Stop periodic health check polling.
   */
  stopHealthCheck(): void {
    if (this.healthCheckTimer !== null) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Read PID file, check process liveness, probe socket, and update cachedHealth.
   * If the process is dead but PID file exists, cleans up stale files.
   */
  private async updateHealth(): Promise<void> {
    const pid = this.readPid();
    const now = Date.now();

    if (pid === null) {
      this.cachedHealth = {
        running: false,
        pid: null,
        socketPath: null,
        socketResponsive: false,
        lastChecked: now,
        uptime: null,
      };
      return;
    }

    if (!this.isProcessAlive(pid)) {
      // Process is dead but PID file exists — clean up stale files
      this.cleanupStaleFiles();
      this.cachedHealth = {
        running: false,
        pid: null,
        socketPath: null,
        socketResponsive: false,
        lastChecked: now,
        uptime: null,
      };
      return;
    }

    const socketPath = this.readSocketPointer();
    if (!socketPath) {
      this.cachedHealth = {
        running: false,
        pid,
        socketPath: null,
        socketResponsive: false,
        lastChecked: now,
        uptime: null,
      };
      return;
    }

    const socketResponsive = await this.probeSocket(socketPath);
    this.cachedHealth = {
      running: socketResponsive,
      // pid is always set when the process is alive (for diagnostics), regardless
      // of socket responsiveness. running is the authoritative liveness signal.
      pid,
      socketPath,
      socketResponsive,
      lastChecked: now,
      uptime: null,
    };
  }

  // ── Private Helpers ────────────────────────────────────────────

  private readPid(): number | null {
    if (!existsSync(this.pidFilePath)) return null;
    try {
      const content = readFileSync(this.pidFilePath, 'utf-8').trim();
      const pid = parseInt(content, 10);
      return Number.isFinite(pid) ? pid : null;
    } catch (err) {
      logger.debug('Failed to read PID file', { path: this.pidFilePath, err: toErrorMessage(err) });
      return null;
    }
  }

  private readSocketPointer(): string | null {
    if (!existsSync(this.socketPointerPath)) return null;
    try {
      const content = readFileSync(this.socketPointerPath, 'utf-8').trim();
      return content || null;
    } catch (err) {
      logger.debug('Failed to read socket pointer file', { path: this.socketPointerPath, err: toErrorMessage(err) });
      return null;
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch { /* expected — ESRCH when process is dead */
      return false;
    }
  }

  private probeSocket(socketPath: string): Promise<boolean> {
    return new Promise((done) => {
      if (!existsSync(socketPath)) {
        done(false);
        return;
      }
      const timer = setTimeout(() => {
        socket.destroy();
        done(false);
      }, 1000);
      const socket = createConnection(socketPath, () => {
        clearTimeout(timer);
        socket.destroy();
        done(true);
      });
      socket.on('error', () => {
        clearTimeout(timer);
        done(false);
      });
    });
  }

  private cleanupStaleFiles(): void {
    for (const path of [this.pidFilePath, this.socketPointerPath]) {
      try { unlinkSync(path); } catch { /* ignore */ }
    }
    // Clean stale lock file if holder is dead
    if (existsSync(this.lockFilePath)) {
      try {
        const content = readFileSync(this.lockFilePath, 'utf-8').trim();
        const lockerPid = parseInt(content, 10);
        if (!Number.isFinite(lockerPid) || !this.isProcessAlive(lockerPid)) {
          try { unlinkSync(this.lockFilePath); } catch { /* ignore */ }
        }
      } catch {
        // Can't read — try to remove
        try { unlinkSync(this.lockFilePath); } catch { /* ignore */ }
      }
    }
  }

  private async waitForSocket(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const socketPath = this.readSocketPointer();
      if (socketPath && await this.probeSocket(socketPath)) {
        return;
      }
      await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
    }
    throw new Error(
      `Daemon did not become responsive within ${timeoutMs}ms`,
    );
  }
}
