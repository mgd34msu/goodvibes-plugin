/**
 * ProcessManager singleton - manages background processes for precision_exec.
 */

import { spawn, ChildProcess } from 'child_process';
import { constants } from 'os';
import { openSync, closeSync, readSync, fstatSync, existsSync, mkdirSync, createWriteStream } from 'fs';
import * as path from 'path';
import { getExecMaxBackground, getExecOverflowDir } from '../runtime-config.js';

/**
 * Shell-escape a single argument for safe concatenation.
 * Wraps arguments containing special characters in single quotes,
 * escaping any single quotes within the argument.
 * This matches the escaping strategy used in the foreground execution path.
 * @param arg - The shell argument to escape
 * @returns The escaped argument safe for shell concatenation
 */
function shellEscape(arg: string): string {
  // If the argument contains no special characters, return as-is
  if (/^[a-zA-Z0-9_\/.,-]+$/.test(arg)) {
    return arg;
  }
  
  // Otherwise, wrap in single quotes and escape any single quotes
  return `'${arg.replace(/'/g, "'\\''")}' `;
}

/** Time in milliseconds to wait for graceful SIGTERM exit before escalating to SIGKILL. */
const SIGTERM_TIMEOUT_MS = 5000;

/** Polling interval in milliseconds for process status checks during graceful shutdown. */
const POLL_INTERVAL_MS = 100;

/** Exit code for SIGKILL termination (128 + 9). */
const SIGKILL_EXIT_CODE = 137;

/** Base value for signal exit codes (128 + signal number). */
const SIGNAL_EXIT_CODE_BASE = 128;

/** Default signal number (SIGKILL) when signal lookup fails. */
const DEFAULT_SIGNAL_NUMBER = 9;

/**
 * Background process metadata tracked by ProcessManager.
 */
export interface BackgroundProcess {
  /** Unique process identifier (e.g., "bg-1", "bg-2") */
  id: string;
  /** Operating system process ID */
  pid: number;
  /** The command string that was executed */
  command: string;
  /** Command arguments array */
  args: string[];
  /** Working directory where command was executed */
  cwd: string;
  /** Timestamp when process was started (Date.now()) */
  started_at: number;
  /** Current process status */
  status: 'running' | 'exited' | 'killed' | 'errored';
  /** Process exit code (null while running) */
  exit_code: number | null;
  /** Absolute path to log file containing stdout/stderr */
  log_file: string;
  /** Byte offset for incremental log reading (tracks last read position) */
  last_read_offset: number;
  /** Error message if process errored (undefined for adopted processes). */
  error_message?: string;
}

/**
 * Result returned when a background process is started or adopted.
 */
export interface BgStartResult {
  /** Status indicator (always 'started' on success) */
  status: 'started';
  /** Unique process identifier assigned to this process */
  process_id: string;
  /** Operating system process ID */
  pid: number;
  /** Full command string that was executed */
  command: string;
  /** Absolute path to log file containing process output */
  log_file: string;
  /** Hint message with commands for checking status, output, and stopping */
  hint: string;
}

export class ProcessManager {
  private static instance: ProcessManager | null = null;
  private processes: Map<string, BackgroundProcess> = new Map();
  private counter: number = 1;

  /** Prevent external instantiation; use getInstance(). */
  private constructor() {}

  /**
   * Get the singleton instance of ProcessManager.
   * @returns The singleton ProcessManager instance
   */
  static getInstance(): ProcessManager {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager();
    }
    return ProcessManager.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   * Destroys the current instance so a fresh one will be created on next getInstance call.
   */
  static resetInstance(): void {
    ProcessManager.instance = null;
  }

  /**
   * Generate a unique background process ID by incrementing internal counter.
   * @returns Next available process ID (e.g., "bg-1")
   */
  generateId(): string {
    return `bg-${this.counter++}`;
  }

  /**
   * Enforce maximum background process limit by checking running process count.
   * @throws Error if limit is reached
   */
  private enforceProcessLimit(): void {
    const maxBackground = getExecMaxBackground();
    const runningCount = Array.from(this.processes.values()).filter(
      (p) => p.status === 'running'
    ).length;
    if (runningCount >= maxBackground) {
      throw new Error(
        `Maximum background processes (${maxBackground}) reached. Stop a process with bg_stop <id> before starting new ones.`
      );
    }
  }

  /**
   * Ensure log directory exists and return the full log file path.
   * @param id Process ID to generate log file path for
   * @returns Absolute path to log file
   */
  private ensureLogDir(id: string): string {
    const overflowDir = getExecOverflowDir();
    if (!existsSync(overflowDir)) {
      mkdirSync(overflowDir, { recursive: true });
    }
    return path.join(overflowDir, `${id}.log`);
  }

  /**
   * Register exit and error handlers for a child process.
   * Handlers update process status and exit code in the processes map.
   * @param child ChildProcess to attach handlers to
   * @param id Process ID for looking up metadata in processes map
   */
  private registerProcessHandlers(child: ChildProcess, id: string): void {
    child.on('exit', (code, signal) => {
      const proc = this.processes.get(id);
      if (proc) {
        proc.status = signal ? 'killed' : 'exited';
        const signalNum = signal ? (constants.signals[signal] ?? DEFAULT_SIGNAL_NUMBER) : 0;
        proc.exit_code = code ?? (signal ? SIGNAL_EXIT_CODE_BASE + signalNum : 1);
      }
    });

    child.on('error', (err) => {
      const proc = this.processes.get(id);
      if (proc) {
        proc.status = 'errored';
        proc.exit_code = 1;
        proc.error_message = err.message;
      }
    });
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
    this.enforceProcessLimit();

    // Guard against undefined PID
    if (proc.pid === undefined) {
      throw new Error(`Cannot adopt process: no PID available for "${command}"`);
    }

    const logFile = this.ensureLogDir(id);

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
      args: [],
      cwd,
      started_at: Date.now(),
      status: 'running',
      exit_code: null,
      log_file: logFile,
      last_read_offset: 0,
    };

    this.processes.set(id, bgProcess);

    this.registerProcessHandlers(proc, id);

    // Return start result
    return {
      status: 'started',
      process_id: id,
      pid: proc.pid,
      command,
      log_file: logFile,
      hint: `Process promoted to background. Use bg_status ${id} to check status, bg_output ${id} to read output, bg_stop ${id} to terminate.`,
    };
  }

  /**
   * Spawn a detached background process with stdout/stderr redirected to a log file.
   * Process is detached and unref'd so the parent can exit independently.
   * @param command Command executable to run
   * @param args Array of command arguments
   * @param options Optional cwd and env overrides
   * @returns BgStartResult with process info including ID, PID, and log file path
   */
  spawn(
    command: string,
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv; stdinFile?: string } = {}
  ): BgStartResult {
    this.enforceProcessLimit();

    // Generate process ID
    const id = this.generateId();

    const logFile = this.ensureLogDir(id);

    // Open log file descriptor
    const logFd = openSync(logFile, 'a');
    let fdClosed = false;

    const resolvedCwd = options.cwd || process.cwd();

    try {
      // Spawn detached process
      // When shell: true, concatenate command and escaped args into a single string.
      // This matches the foreground execution path's escaping strategy.
      let fullCommand = args.length > 0 
        ? `${command} ${args.map(shellEscape).join(' ')}`.trim()
        : command;

      // If a stdin file is provided, append a shell redirect so the shell feeds
      // the file into the process's stdin. With shell: true, the redirect is
      // handled at the shell level — Node's stdio['ignore'] is for the shell
      // process itself, but the < redirect opens the file independently.
      if (options.stdinFile) {
        fullCommand += ` < ${shellEscape(options.stdinFile)}`;
      }

      const child: ChildProcess = spawn(fullCommand, [], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        cwd: resolvedCwd,
        env: options.env ?? process.env,
        shell: true,
      });

      // Close the log file descriptor in the parent process
      closeSync(logFd);
      fdClosed = true;

      // Guard against undefined PID (can happen on some platforms when spawn fails)
      if (child.pid === undefined) {
        try {
          child.kill();
        } catch {
          /* best-effort cleanup */
        }
        throw new Error(`Failed to spawn process: no PID returned for "${command}"`);
      }

      // Unref so parent can exit
      child.unref();

      // Store process info
      const bgProcess: BackgroundProcess = {
        id,
        pid: child.pid,
        command,
        args,
        cwd: resolvedCwd,
        started_at: Date.now(),
        status: 'running',
        exit_code: null,
        log_file: logFile,
        last_read_offset: 0,
      };

      this.processes.set(id, bgProcess);

      this.registerProcessHandlers(child, id);

      // Return start result
      return {
        status: 'started',
        process_id: id,
        pid: child.pid,
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
   * Get status and metadata of a background process.
   * @param id Process ID to query
   * @returns BackgroundProcess metadata if found, undefined otherwise
   */
  getStatus(id: string): BackgroundProcess | undefined {
    return this.processes.get(id);
  }

  /**
   * Read new output from the log file since last read.
   * Updates last_read_offset unless peek=true.
   * @param id Process ID to read output from
   * @param lines Optional limit to return only last N lines (undefined = all lines)
   * @param peek If true, don't update last_read_offset (for bg_status non-destructive reads)
   * @returns Object containing output string, completion status, bytes read, and total bytes
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
   * Stop a background process gracefully with SIGTERM, escalating to SIGKILL if needed.
   * Sends SIGTERM and waits up to SIGTERM_TIMEOUT_MS, then sends SIGKILL if still running.
   * @param id Process ID to stop
   * @returns Object indicating whether process was stopped and reason
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

      // Wait up to SIGTERM_TIMEOUT_MS for graceful exit
      // Use polling approach since exit handler updates proc.status asynchronously
      const startWait = Date.now();
      while (proc.status === 'running' && Date.now() - startWait < SIGTERM_TIMEOUT_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      // If still running, SIGKILL
      if (proc.status === 'running') {
        process.kill(proc.pid, 'SIGKILL');
        proc.status = 'killed';
        proc.exit_code = SIGKILL_EXIT_CODE;
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
   * List all background processes, sorted by started_at descending (newest first).
   * @returns Array of BackgroundProcess metadata sorted by start time
   */
  list(): BackgroundProcess[] {
    return Array.from(this.processes.values()).sort(
      (a, b) => b.started_at - a.started_at
    );
  }

  /**
   * Kill all running background processes in parallel.
   * Used during shutdown. Swallows errors to ensure all processes are attempted.
   * @returns Promise that resolves when all stop attempts complete
   */
  async killAll(): Promise<void> {
    const running = Array.from(this.processes.values()).filter(
      (p) => p.status === 'running'
    );

    await Promise.all(running.map((p) => this.stop(p.id).catch(() => {})));
  }

  /**
   * Reset all state (for testing).
   * Kills all running processes before clearing maps and resetting counter.
   * @returns Promise that resolves when reset is complete
   */
  async reset(): Promise<void> {
    await this.killAll();
    this.processes.clear();
    this.counter = 1;
  }
}

// Export singleton instance
export const processManager = ProcessManager.getInstance();
