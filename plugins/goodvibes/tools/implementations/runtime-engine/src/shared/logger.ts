/**
 * Structured Logger
 *
 * Writes structured JSON log entries to stderr (MCP convention -- stdout is
 * reserved for the MCP protocol wire format). Log level is controlled by the
 * GOODVIBES_LOG_LEVEL environment variable (default: "info").
 *
 * Usage:
 *   const log = createLogger('my-component');
 *   log.info('Server started', { port: 3000 });
 *   log.error('Connection failed', { cause: err.message });
 */

/** Valid log severity levels */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** A single structured log entry as written to stderr */
export interface LogEntry {
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Severity level */
  level: LogLevel;
  /** Originating component name (e.g. "state-store", "ipc-server") */
  component: string;
  /** Human-readable message */
  message: string;
  /** Optional structured metadata for additional context */
  metadata?: Record<string, unknown>;
}

/** Logger interface returned by {@link createLogger} */
export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

/** Ordered list of levels for numeric comparison */
const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Cached resolved log level with a short TTL to avoid repeated env lookups */
let _cachedLevel: LogLevel | undefined;
let _cacheExpiresAt = 0;
const LOG_LEVEL_CACHE_TTL_MS = 5000;

/**
 * Resolves the active log level from the GOODVIBES_LOG_LEVEL environment variable.
 * Result is cached for 5 seconds to avoid repeated computation on every log call.
 * Defaults to "info" if unset or invalid.
 */
function resolveActiveLevel(): LogLevel {
  const now = Date.now();
  if (_cachedLevel !== undefined && now < _cacheExpiresAt) return _cachedLevel;
  const raw = (process.env['GOODVIBES_LOG_LEVEL'] ?? 'info').toLowerCase();
  _cachedLevel = (raw in LEVEL_ORDER ? raw : 'info') as LogLevel;
  _cacheExpiresAt = now + LOG_LEVEL_CACHE_TTL_MS;
  return _cachedLevel;
}

/**
 * Creates a structured logger bound to the given component name.
 *
 * Each log method writes a JSON {@link LogEntry} to `process.stderr`. Log entries
 * below the active level (set via `GOODVIBES_LOG_LEVEL`) are silently dropped.
 *
 * Logger instances are created fresh on every call — there is no instance-level
 * cache. Each caller receives its own closure capturing the component name.
 * The underlying log-level resolution IS cached (see {@link resolveActiveLevel}),
 * so repeated calls to the same log method do not re-parse the environment
 * variable on every invocation.
 *
 * Note: `process.stderr.write` is used intentionally in this module (approved). The logger
 * itself is the lowest-level output primitive in the runtime engine — it cannot
 * depend on another logger instance. Direct stderr writes are the correct
 * mechanism here and are consistent with MCP convention (stdout is reserved for
 * the protocol wire format).
 *
 * @param component - Name of the component emitting the logs (e.g. "state-store").
 * @returns A {@link Logger} instance scoped to the component.
 */
export function createLogger(component: string): Logger {
  function write(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    const activeLevel = resolveActiveLevel();
    if (LEVEL_ORDER[level] < LEVEL_ORDER[activeLevel]) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      ...(metadata !== undefined ? { metadata } : {}),
    };

    process.stderr.write(JSON.stringify(entry) + '\n');
  }

  return {
    debug: (msg, meta) => write('debug', msg, meta),
    info: (msg, meta) => write('info', msg, meta),
    warn: (msg, meta) => write('warn', msg, meta),
    error: (msg, meta) => write('error', msg, meta),
  };
}
