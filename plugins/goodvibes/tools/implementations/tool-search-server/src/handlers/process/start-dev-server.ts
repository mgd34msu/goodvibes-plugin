/**
 * Start Dev Server Handler
 *
 * Starts a development server process and waits for it to be ready.
 * Supports detection via stdout pattern matching and health URL polling.
 *
 * @module handlers/process/start-dev-server
 */

import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import * as https from 'https';

import { PROJECT_ROOT } from '../../config.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the start_dev_server tool.
 */
export interface StartDevServerArgs {
  /** Command to start the dev server (e.g., "npm run dev") */
  command: string;
  /** Regex pattern to detect ready state in stdout (default: "ready|listening|started|compiled") */
  ready_pattern?: string;
  /** URL to poll for health check (e.g., "http://localhost:3000/api/health") */
  health_url?: string;
  /** Maximum time to wait for server ready in milliseconds (default: 30000) */
  timeout?: number;
  /** Expected port number (auto-detected from output if not provided) */
  port?: number;
  /** Working directory for the command (default: PROJECT_ROOT) */
  cwd?: string;
}

/**
 * Server process status.
 */
export type ServerStatus = 'running' | 'ready' | 'failed';

/**
 * Result from the start_dev_server tool.
 */
export interface StartDevServerResult {
  /** Process ID of the spawned server */
  pid: number;
  /** Detected or configured port number */
  port: number | null;
  /** Current server status */
  status: ServerStatus;
  /** Server URL if port is known */
  url: string | null;
  /** Last 50 lines of combined stdout/stderr output */
  logs: string[];
  /** Error message if status is 'failed' */
  error?: string;
}

/**
 * Standard MCP tool response format.
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// =============================================================================
// Process Registry
// =============================================================================

/**
 * Registry of spawned server processes for cleanup.
 */
interface ProcessInfo {
  process: ChildProcess;
  port: number | null;
  command: string;
  startedAt: Date;
}

const spawnedProcesses = new Map<number, ProcessInfo>();

/**
 * Get information about all spawned processes.
 */
export function getSpawnedProcesses(): Map<number, ProcessInfo> {
  return spawnedProcesses;
}

/**
 * Kill a spawned process by PID.
 */
export function killProcess(pid: number): boolean {
  const info = spawnedProcesses.get(pid);
  if (info) {
    info.process.kill('SIGTERM');
    spawnedProcesses.delete(pid);
    return true;
  }
  return false;
}

/**
 * Kill all spawned processes.
 */
export function killAllProcesses(): void {
  for (const [pid, info] of spawnedProcesses) {
    info.process.kill('SIGTERM');
    spawnedProcesses.delete(pid);
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Maximum number of log lines to retain */
const MAX_LOG_LINES = 50;

/** Default ready detection pattern */
const DEFAULT_READY_PATTERN = 'ready|listening|started|compiled|Local:';

/** Port detection patterns */
const PORT_PATTERNS = [
  /(?:port|Port|PORT)[:\s]+(\d{4,5})/,
  /localhost:(\d{4,5})/,
  /127\.0\.0\.1:(\d{4,5})/,
  /0\.0\.0\.0:(\d{4,5})/,
  /:(\d{4,5})\s*$/m,
  /http:\/\/[^:]+:(\d{4,5})/,
];

/**
 * Ring buffer for log lines.
 */
class LogBuffer {
  private lines: string[] = [];
  private readonly maxLines: number;

  constructor(maxLines: number = MAX_LOG_LINES) {
    this.maxLines = maxLines;
  }

  push(line: string): void {
    this.lines.push(line);
    if (this.lines.length > this.maxLines) {
      this.lines.shift();
    }
  }

  pushMultiple(text: string): void {
    const newLines = text.split('\n').filter((l) => l.trim());
    for (const line of newLines) {
      this.push(line);
    }
  }

  getLines(): string[] {
    return [...this.lines];
  }
}

/**
 * Attempt to detect port from output text.
 */
function detectPort(text: string): number | null {
  for (const pattern of PORT_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const port = parseInt(match[1], 10);
      if (port >= 1024 && port <= 65535) {
        return port;
      }
    }
  }
  return null;
}

/**
 * Poll a URL until it returns a successful response.
 */
function pollHealthUrl(
  url: string,
  timeoutMs: number,
  intervalMs: number = 500
): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const client = url.startsWith('https') ? https : http;

    const poll = () => {
      if (Date.now() - startTime > timeoutMs) {
        resolve(false);
        return;
      }

      const req = client.get(url, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          resolve(true);
        } else {
          setTimeout(poll, intervalMs);
        }
        // Consume response data to free up memory
        res.resume();
      });

      req.on('error', () => {
        setTimeout(poll, intervalMs);
      });

      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(poll, intervalMs);
      });
    };

    poll();
  });
}

/**
 * Create a success response.
 */
function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Create an error response.
 */
function createErrorResponse(message: string, context?: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) }],
    isError: true,
  };
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the start_dev_server MCP tool call.
 *
 * Spawns a development server process and waits for it to become ready.
 * Ready state is detected via:
 * 1. Pattern matching on stdout/stderr output
 * 2. Health URL polling (if provided)
 *
 * The process is kept running and registered for later cleanup.
 *
 * @param args - The start_dev_server tool arguments
 * @returns MCP tool response with server status
 *
 * @example
 * ```typescript
 * const result = await handleStartDevServer({
 *   command: 'npm run dev',
 *   ready_pattern: 'ready on',
 *   timeout: 60000
 * });
 * // Returns { pid: 12345, port: 3000, status: 'ready', url: 'http://localhost:3000', logs: [...] }
 * ```
 */
export async function handleStartDevServer(args: StartDevServerArgs): Promise<ToolResponse> {
  // Validate required arguments
  if (!args.command || typeof args.command !== 'string') {
    return createErrorResponse('Missing required argument: command');
  }

  const command = args.command.trim();
  if (!command) {
    return createErrorResponse('Command cannot be empty');
  }

  const readyPattern = args.ready_pattern || DEFAULT_READY_PATTERN;
  const timeout = args.timeout ?? 30000;
  const cwd = args.cwd || PROJECT_ROOT;
  let detectedPort = args.port ?? null;

  // Compile ready pattern regex
  let readyRegex: RegExp;
  try {
    readyRegex = new RegExp(readyPattern, 'i');
  } catch (err) {
    return createErrorResponse(`Invalid ready_pattern regex: ${err instanceof Error ? err.message : String(err)}`);
  }

  const logBuffer = new LogBuffer(MAX_LOG_LINES);
  let isReady = false;
  let processError: string | undefined;

  return new Promise<ToolResponse>((resolve) => {
    // Determine shell based on platform
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? true : '/bin/sh';
    const shellArgs = isWindows ? [] : ['-c', command];
    const spawnCommand = isWindows ? command : '/bin/sh';

    // Spawn the process
    const proc = spawn(spawnCommand, isWindows ? [] : shellArgs, {
      cwd,
      shell: isWindows ? true : false,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: !isWindows, // Allow process group management on Unix
      env: {
        ...process.env,
        FORCE_COLOR: '1', // Preserve color output
      },
    });

    if (!proc.pid) {
      resolve(createErrorResponse('Failed to spawn process - no PID assigned'));
      return;
    }

    const pid = proc.pid;

    // Register process for cleanup
    spawnedProcesses.set(pid, {
      process: proc,
      port: detectedPort,
      command,
      startedAt: new Date(),
    });

    // Set up output handlers
    const handleOutput = (data: Buffer) => {
      const text = data.toString();
      logBuffer.pushMultiple(text);

      // Try to detect port if not already set
      if (detectedPort === null) {
        const foundPort = detectPort(text);
        if (foundPort) {
          detectedPort = foundPort;
          // Update registry
          const info = spawnedProcesses.get(pid);
          if (info) {
            info.port = detectedPort;
          }
        }
      }

      // Check for ready pattern
      if (!isReady && readyRegex.test(text)) {
        isReady = true;
      }
    };

    proc.stdout?.on('data', handleOutput);
    proc.stderr?.on('data', handleOutput);

    // Handle process errors
    proc.on('error', (err) => {
      processError = err.message;
      spawnedProcesses.delete(pid);
    });

    // Handle process exit
    proc.on('exit', (code, signal) => {
      spawnedProcesses.delete(pid);
      if (!isReady) {
        processError = `Process exited with code ${code ?? 'null'} (signal: ${signal ?? 'none'})`;
      }
    });

    // Set up timeout and ready detection
    const startTime = Date.now();

    const checkReady = async () => {
      // Check if process has failed
      if (processError) {
        resolve(
          createSuccessResponse<StartDevServerResult>({
            pid,
            port: detectedPort,
            status: 'failed',
            url: null,
            logs: logBuffer.getLines(),
            error: processError,
          })
        );
        return;
      }

      // Check timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeout) {
        const result: StartDevServerResult = {
          pid,
          port: detectedPort,
          status: isReady ? 'ready' : 'running',
          url: detectedPort ? `http://localhost:${detectedPort}` : null,
          logs: logBuffer.getLines(),
        };
        if (!isReady) {
          result.error = `Timeout waiting for ready pattern (${timeout}ms elapsed)`;
        }
        resolve(createSuccessResponse(result));
        return;
      }

      // If ready pattern matched, optionally check health URL
      if (isReady) {
        if (args.health_url) {
          const remainingTime = timeout - elapsed;
          const isHealthy = await pollHealthUrl(args.health_url, remainingTime);
          resolve(
            createSuccessResponse<StartDevServerResult>({
              pid,
              port: detectedPort,
              status: isHealthy ? 'ready' : 'running',
              url: detectedPort ? `http://localhost:${detectedPort}` : null,
              logs: logBuffer.getLines(),
              error: isHealthy ? undefined : 'Health check did not pass within timeout',
            })
          );
        } else {
          resolve(
            createSuccessResponse<StartDevServerResult>({
              pid,
              port: detectedPort,
              status: 'ready',
              url: detectedPort ? `http://localhost:${detectedPort}` : null,
              logs: logBuffer.getLines(),
            })
          );
        }
        return;
      }

      // Continue polling
      setTimeout(checkReady, 250);
    };

    // Start checking after a brief delay to let the process initialize
    setTimeout(checkReady, 100);
  });
}
