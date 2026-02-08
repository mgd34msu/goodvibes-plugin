/**
 * ProcessManager singleton - manages background processes for precision_exec.
 */

import { spawn, ChildProcess } from 'child_process';
import { constants } from 'os';
import { openSync, closeSync, readSync, fstatSync, existsSync, mkdirSync, createWriteStream } from 'fs';
import * as path from 'path';
import { getExecMaxBackground, getExecOverflowDir } from '../runtime-config.js';

export interface BackgroundProcess {
  id: string;                    // "bg-1", "bg-2", etc.
  pid: number;                   // OS process ID
  command: string;               // The command string
  args: string[];                // Command arguments
  cwd: string;                   // Working directory used
  started_at: number;            // Date.now() timestamp
  status: 'running' | 'exited' | 'killed' | 'errored';
  exit_code: number | null;      // null while running
  log_file: string;              // Absolute path to log file
  last_read_offset: number;      // Byte offset for bg_output "since last check"
}

export interface BgStartResult {
  status: 'started';
  process_id: string;
  pid: number;
  command: string;
  log_file: string;
  hint: string;
}

export class ProcessManager {
  private static instance: ProcessManager | null = null;
  private processes: Map<string, BackgroundProcess> = new Map();
  private counter: number = 1;

  private constructor() {}

  static getInstance(): ProcessManager {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager();
    }
    return ProcessManager.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance(): void {
    ProcessManager.instance = null;
  }

  /**
   * Generate a unique background process ID.
   * @returns Next available process ID (e.g., "bg-1")
   */
  generateId(): string {
    return `bg-${this.counter++}`;
  }

  /**
   * Adopt an existing ChildProcess into background management.
   * Used for pattern-based early termination (Part J).
   * @param id Process ID to assign (e.g., "bg-1")
   * @param proc Existing ChildProcess to adopt
   * @param command Command string for logging
   * @param cwd Working directory
   * @returns BgStartResult with process info
   */
  adopt(
    id: string,
    proc: ChildProcess,
    command: string,
    cwd: string
  ): BgStartResult {
    // Check max background process limit
    const maxBackground = getExecMaxBackground();
    const runningCount = Array.from(this.processes.values()).filter(
      (p) => p.status === 'running'
    ).length;
    if (runningCount >= maxBackground) {
      throw new Error(
        `Maximum background processes (${maxBackground}) reached. Cannot promote process to background.`
      );
    }

    // Guard against undefined PID
    if (proc.pid === undefined) {
      throw new Error(`Cannot adopt process: no PID available for "${command}"`);
    }

    // Create log directory if needed
    const overflowDir = getExecOverflowDir();
    if (!existsSync(overflowDir)) {
      mkdirSync(overflowDir, { recursive: true });
    }

    // Create log file path
    const logFile = path.join(overflowDir, `${id}.log`);

    try {
      // Redirect stdout/stderr to log file
      // Since the process is already running, we pipe the streams
      if (proc.stdout) {
        proc.stdout.pipe(createWriteStream(logFile, { flags: 'a' }));
      }
      if (proc.stderr) {
        proc.stderr.pipe(createWriteStream(logFile, { flags: 'a' }));
      }

      // Unref so parent can exit
      proc.unref();

      // Store process info
      const bgProcess: BackgroundProcess = {
        id,
        pid: proc.pid,
        command,
        args: [],  // Not available for adopted processes
        cwd,
        started_at: Date.now(),
        status: 'running',
        exit_code: null,
        log_file: logFile,
        last_read_offset: 0,
      };

      this.processes.set(id, bgProcess);

      // Register exit handler
      proc.on('exit', (code, signal) => {
        const p = this.processes.get(id);
        if (p) {
          p.status = signal ? 'killed' : 'exited';
          const signalNum = signal ? (constants.signals[signal] ?? 9) : 0;
          p.exit_code = code ?? (signal ? 128 + signalNum : 1);
        }
      });

      // Register error handler
      proc.on('error', (err) => {
        const p = this.processes.get(id);
        if (p) {
          p.status = 'errored';
          p.exit_code = 1;
        }
      });

      // Return start result
      return {
        status: 'started',
        process_id: id,
        pid: proc.pid,
        command,
        log_file: logFile,
        hint: `Process promoted to background. Use bg_status ${id} to check status, bg_output ${id} to read output, bg_stop ${id} to terminate.`,
      };
    } catch (err) {
      throw err;
    }
  }

  /**
   * Spawn a detached background process.
   * Returns a BgStartResult with process info.
   */
  spawn(
    command: string,
    args: string[],
    options: { cwd?: string; env?: Record<string, string> } = {}
  ): BgStartResult {
    // Check if we've hit the max background limit
    const maxBackground = getExecMaxBackground();
    const runningCount = Array.from(this.processes.values()).filter(
      (p) => p.status === 'running'
    ).length;

    if (runningCount >= maxBackground) {
      throw new Error(
        `Maximum background processes (${maxBackground}) reached. Stop a process with bg_stop <id> before starting new ones.`
      );
    }

    // Generate process ID
    const id = `bg-${this.counter++}`;

    // Create log directory if needed
    const overflowDir = getExecOverflowDir();
    if (!existsSync(overflowDir)) {
      mkdirSync(overflowDir, { recursive: true });
    }

    // Create log file path
    const logFile = path.join(overflowDir, `${id}.log`);

    // Open log file descriptor
    const logFd = openSync(logFile, 'a');
    let fdClosed = false;

    try {
      // Spawn detached process
      const child: ChildProcess = spawn(command, args, {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        cwd: options.cwd || process.cwd(),
        env: options.env ? { ...process.env, ...options.env } : process.env,
      });

      // Close the log file descriptor in the parent process
      closeSync(logFd);
      fdClosed = true;

      // Guard against undefined PID (can happen on some platforms when spawn fails)
      if (child.pid === undefined) {
        child.kill();
        throw new Error(`Failed to spawn process: no PID returned for "${command}"`);
      }

      // Unref so parent can exit
      child.unref();

      // Store process info
      const bgProcess: BackgroundProcess = {
        id,
        pid: child.pid!,
        command,
        args,
        cwd: options.cwd || process.cwd(),
        started_at: Date.now(),
        status: 'running',
        exit_code: null,
        log_file: logFile,
        last_read_offset: 0,
      };

      this.processes.set(id, bgProcess);

      // Register exit handler
      child.on('exit', (code, signal) => {
        const proc = this.processes.get(id);
        if (proc) {
          proc.status = signal ? 'killed' : 'exited';
          // Properly map signal to exit code using OS constants
          const signalNum = signal ? (constants.signals[signal] ?? 9) : 0;
          proc.exit_code = code ?? (signal ? 128 + signalNum : 1);
        }
      });

      // Register error handler
      child.on('error', (err) => {
        const proc = this.processes.get(id);
        if (proc) {
          proc.status = 'errored';
          proc.exit_code = 1;
        }
      });

      // Return start result
      return {
        status: 'started',
        process_id: id,
        pid: child.pid!,
        command: [command, ...args].join(' '),
        log_file: logFile,
        hint: `Use bg_status ${id} to check status, bg_output ${id} to read output, bg_stop ${id} to terminate.`,
      };
    } catch (err) {
      // Clean up on failure - only close if we haven't already
      if (!fdClosed) {
        closeSync(logFd);
      }
      throw err;
    }
  }

  /**
   * Get status of a background process.
   */
  getStatus(id: string): BackgroundProcess | undefined {
    return this.processes.get(id);
  }

  /**
   * Read new output from the log file since last read.
   * Updates last_read_offset unless peek=true.
   * @param id Process ID
   * @param lines Optional limit to return only last N lines
   * @param peek If true, don't update last_read_offset (for bg_status)
   */
  getOutput(id: string, lines?: number, peek = false): { output: string; complete: boolean; bytes_read: number; total_bytes: number } {
    const proc = this.processes.get(id);
    if (!proc) {
      throw new Error(`Background process ${id} not found`);
    }

    if (!existsSync(proc.log_file)) {
      return { output: '', complete: proc.status !== 'running', bytes_read: 0, total_bytes: 0 };
    }

    // Use byte-based reading instead of reading entire file
    const fd = openSync(proc.log_file, 'r');
    try {
      const stats = fstatSync(fd);
      const totalBytes = stats.size;
      const startOffset = proc.last_read_offset;

      if (startOffset >= totalBytes) {
        return { output: '', complete: proc.status !== 'running', bytes_read: 0, total_bytes: totalBytes };
      }

      const bytesToRead = totalBytes - startOffset;
      const buffer = Buffer.alloc(bytesToRead);
      readSync(fd, buffer, 0, bytesToRead, startOffset);

      let output = buffer.toString('utf-8');

      // If lines limit is specified, return only last N lines
      if (lines !== undefined && lines > 0) {
        const allLines = output.split('\n');
        if (allLines.length > lines) {
          output = allLines.slice(-lines).join('\n');
        }
      }

      // Update offset only if not peeking
      if (!peek) {
        proc.last_read_offset = totalBytes;
      }

      return {
        output,
        complete: proc.status !== 'running',
        bytes_read: bytesToRead,
        total_bytes: totalBytes,
      };
    } finally {
      closeSync(fd);
    }
  }

  /**
   * Stop a background process.
   * Sends SIGTERM, waits 5s, then SIGKILL if needed.
   */
  async stop(id: string): Promise<{ stopped: boolean; reason: string }> {
    const proc = this.processes.get(id);
    if (!proc) {
      throw new Error(`Background process ${id} not found`);
    }

    if (proc.status !== 'running') {
      return {
        stopped: false,
        reason: `Process ${id} is already ${proc.status} (exit code: ${proc.exit_code})`,
      };
    }

    try {
      // Send SIGTERM
      process.kill(proc.pid, 'SIGTERM');

      // Wait up to 5 seconds for graceful exit
      // Use polling approach since exit handler updates proc.status asynchronously
      const startWait = Date.now();
      while (proc.status === 'running' && Date.now() - startWait < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // If still running, SIGKILL
      if (proc.status === 'running') {
        process.kill(proc.pid, 'SIGKILL');
        proc.status = 'killed';
        proc.exit_code = 137; // 128 + 9 (SIGKILL)
      }

      return {
        stopped: true,
        reason: `Process ${id} terminated (exit code: ${proc.exit_code})`,
      };
    } catch (err) {
      // Process may have already exited
      if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
        proc.status = 'exited';
        proc.exit_code = proc.exit_code ?? 0;
        return {
          stopped: true,
          reason: `Process ${id} had already exited`,
        };
      }
      throw err;
    }
  }

  /**
   * List all background processes, sorted by started_at descending.
   */
  list(): BackgroundProcess[] {
    return Array.from(this.processes.values()).sort(
      (a, b) => b.started_at - a.started_at
    );
  }

  /**
   * Kill all running background processes.
   * Used during shutdown.
   */
  async killAll(): Promise<void> {
    const running = Array.from(this.processes.values()).filter(
      (p) => p.status === 'running'
    );

    await Promise.all(running.map((p) => this.stop(p.id).catch(() => {})));
  }

  /**
   * Reset all state (for testing).
   * Kills all running processes before clearing.
   */
  async reset(): Promise<void> {
    await this.killAll();
    this.processes.clear();
    this.counter = 1;
  }
}

// Export singleton instance
export const processManager = ProcessManager.getInstance();
