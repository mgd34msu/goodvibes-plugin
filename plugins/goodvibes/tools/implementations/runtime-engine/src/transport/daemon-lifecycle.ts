/**
 * DaemonLifecycle — manages the daemon process lifecycle.
 * Handles checking if daemon is running, starting it, stopping it,
 * and health checking.
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { createLogger } from '../shared/logger.js';
import { toErrorMessage } from '../shared/utils.js';
import { DAEMON_PID_FILE, DAEMON_SOCKET_POINTER, DAEMON_ENTRY } from './daemon-constants.js';

const logger = createLogger('daemon-lifecycle');
const STARTUP_TIMEOUT_MS = 10_000;
const HEALTH_CHECK_INTERVAL_MS = 500;

export interface DaemonStatus {
  running: boolean;
  pid: number | null;
  socketPath: string | null;
  uptime?: number;
}

export class DaemonLifecycle {
  private startPromise: Promise<void> | null = null;
  private readonly projectRoot: string;
  private readonly goodvibesDir: string;
  private readonly pidFilePath: string;
  private readonly socketPointerPath: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.goodvibesDir = resolve(projectRoot, '.goodvibes');
    this.pidFilePath = resolve(this.goodvibesDir, DAEMON_PID_FILE);
    this.socketPointerPath = resolve(this.goodvibesDir, DAEMON_SOCKET_POINTER);
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
  }

  /**
   * Stop the daemon process by sending SIGTERM.
   */
  async stop(): Promise<void> {
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
   */
  async getStatus(): Promise<DaemonStatus> {
    const pid = this.readPid();
    const socketPath = this.readSocketPointer();
    const running = pid !== null && this.isProcessAlive(pid)
      && socketPath !== null && await this.probeSocket(socketPath);

    return {
      running,
      pid: running ? pid : null,
      socketPath: running ? socketPath : null,
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
