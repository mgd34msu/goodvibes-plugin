/**
 * `@goodvibes/core/logging` — level-routed logging with rotation.
 *
 * Fixes plan §7.5: debug output (the `SQLiteStore: saved to disk` TUI spam)
 * never interleaves into human logs again — debug routes to its own file, while
 * info/warn/error go to the human activity log. Both files rotate with a size
 * cap so `activity.md` can never grow to 1.2 MB / 54k lines again. Files live
 * under the namespaced `.goodvibes/logs/`.
 *
 * stdout stays clean for the MCP protocol; human-facing lines also mirror to
 * stderr so `--mcp-debug` shows them. Ported from v1 precision-engine
 * `logging.ts` (logger, startTimer, estimateTokens) plus the file sink.
 */

import { appendFileSync, mkdirSync, renameSync, statSync } from 'fs';
import * as path from 'path';
import { statePath } from '../config/index.js';
import { estimatePayloadTokens } from '../shared/tokens.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'tool';

export interface LoggerOptions {
  /** Directory for log files (default `.goodvibes/logs`). */
  dir?: string;
  /** Rotate a file once it exceeds this many bytes (default 1 MiB). */
  maxBytes?: number;
  /** Number of rotated files to keep (default 3). */
  keep?: number;
  /** Also mirror info/warn/error/tool to stderr (default true). */
  stderr?: boolean;
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  tool(name: string, args?: unknown): void;
}

const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_KEEP = 3;

function formatLine(level: LogLevel, message: string, data?: unknown): string {
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  const body = data !== undefined ? `${message} ${safeStringify(data)}` : message;
  return `${prefix} ${body}\n`;
}

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

/**
 * Create a level-routed, size-capped file logger.
 * - `debug` → `debug.log` (never mixed into the human log)
 * - `info` / `warn` / `error` / `tool` → `activity.log`
 * @param options - directory, size cap, retention, stderr mirroring
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const keep = options.keep ?? DEFAULT_KEEP;
  const mirror = options.stderr ?? true;
  // Resolve the directory lazily per write so the runtime cwd is honoured, but
  // an explicit `dir` pins it.
  const resolveDir = (): string => options.dir ?? statePath('logs');

  function rotateIfNeeded(file: string): void {
    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      return; // file does not exist yet — nothing to rotate
    }
    if (size < maxBytes) return;
    // Shift file.(keep-1) → file.keep, ... , file → file.1
    for (let i = keep; i >= 1; i--) {
      const from = i === 1 ? file : `${file}.${i - 1}`;
      const to = `${file}.${i}`;
      try {
        renameSync(from, to);
      } catch {
        // missing intermediate rotation — skip
      }
    }
  }

  function write(fileName: string, line: string): void {
    try {
      const dir = resolveDir();
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, fileName);
      rotateIfNeeded(file);
      appendFileSync(file, line);
    } catch {
      // Logging must never crash the server.
    }
  }

  function emit(level: LogLevel, message: string, data?: unknown): void {
    const line = formatLine(level, message, data);
    if (level === 'debug') {
      write('debug.log', line);
    } else {
      write('activity.log', line);
      if (mirror) process.stderr.write(line);
    }
  }

  return {
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, data) => emit('error', message, data),
    tool: (name, args) => emit('tool', `Calling ${name}`, args),
  };
}

/** A lazily-created default logger writing under `.goodvibes/logs/`. */
let defaultLogger: Logger | null = null;

/** The shared default logger (level-routed, rotating). */
export const logger: Logger = {
  debug: (m, d) => (defaultLogger ??= createLogger()).debug(m, d),
  info: (m, d) => (defaultLogger ??= createLogger()).info(m, d),
  warn: (m, d) => (defaultLogger ??= createLogger()).warn(m, d),
  error: (m, d) => (defaultLogger ??= createLogger()).error(m, d),
  tool: (n, a) => (defaultLogger ??= createLogger()).tool(n, a),
};

/** Start a timer; the returned function yields elapsed whole milliseconds. */
export function startTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}

/**
 * Payload-true token estimate (~3.5 chars/token), re-exported so callers that
 * only need logging need not reach into `core/envelope`.
 */
export function estimateTokens(text: string): number {
  return estimatePayloadTokens(text);
}
