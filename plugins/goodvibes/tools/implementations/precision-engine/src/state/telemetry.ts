/**
 * Telemetry - Session-scoped singleton for call tracking via SQLite (sql.js / WASM).
 *
 * Provides zero-LLM-token telemetry: precision_ids are generated server-side,
 * calls are recorded to SQLite synchronously (after async WASM init), and only
 * the precision_id is returned to the LLM (~1 token). The LLM never sees
 * telemetry data unless it explicitly queries via precision_config action='telemetry'.
 *
 * Lifecycle:
 *   1. Call `await Telemetry.initialize()` once at server startup.
 *   2. All subsequent calls to `Telemetry.getInstance()` are synchronous.
 */

import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TelemetryRecord {
  /** precision_id: "{tool}_{sessionShort}_{uniqueHex}" */
  id: string;
  session_id: string;
  tool: string;
  status: 'success' | 'failed' | 'partial';
  tokens_in?: number;
  tokens_out?: number;
  cache_hit?: boolean;
  cache_bytes_saved?: number;
  duration_ms?: number;
  error?: string;
  metadata?: Record<string, unknown>;
  /** ISO 8601 timestamp */
  created_at: string;
}

export interface ToolStats {
  calls: number;
  tokens: number;
  cache_hits: number;
  avg_ms: number;
}

export interface SessionSummary {
  session_id: string;
  total_calls: number;
  by_tool: Record<string, ToolStats>;
  total_tokens: number;
  total_cache_hits: number;
  total_duration_ms: number;
  success_rate: number;
}

export interface TelemetryQueryFilter {
  tool?: string;
  status?: string;
  session_id?: string;
  /** ISO date string — only records at or after this time */
  since?: string;
  limit?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool short-name mapping
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_SHORT: Record<string, string> = {
  precision_read: 'read',
  precision_write: 'write',
  precision_edit: 'edit',
  precision_exec: 'exec',
  precision_grep: 'grep',
  precision_glob: 'glob',
  precision_fetch: 'fetch',
  precision_symbols: 'symbols',
  precision_config: 'config',
  precision_notebook: 'notebook',
  discover: 'discover',
  agent: 'agent',
  apply: 'apply',
};

/**
 * Normalize a tool name to its short form.
 * Falls back to the first 12 chars of the input if not in the map.
 */
function toShortTool(toolName: string): string {
  return TOOL_SHORT[toolName] ?? (toolName.slice(0, 12).replace(/[^a-z0-9_]/gi, '_') || 'unknown');
}

// ─────────────────────────────────────────────────────────────────────────────
// DDL
// ─────────────────────────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  status TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cache_hit BOOLEAN,
  cache_bytes_saved INTEGER,
  duration_ms INTEGER,
  error TEXT,
  metadata JSON,
  created_at TEXT NOT NULL
);
`;

const CREATE_IDX_SESSION = `CREATE INDEX IF NOT EXISTS idx_calls_session ON calls(session_id);`;
const CREATE_IDX_TOOL = `CREATE INDEX IF NOT EXISTS idx_calls_tool ON calls(tool);`;
const CREATE_IDX_STATUS = `CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);`;

// Column order must match SELECT order in all queries
const COLUMNS = [
  'id', 'session_id', 'tool', 'status',
  'tokens_in', 'tokens_out', 'cache_hit', 'cache_bytes_saved',
  'duration_ms', 'error', 'metadata', 'created_at',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

export class Telemetry {
  private static instance: Telemetry | null = null;
  private static initializedDbPath: string | null = null;

  private readonly db: SqlJsDatabase;
  private readonly sessionId: string;
  private readonly dbPath: string;

  /** Timer handle for debounced persistence (null when idle) */
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  /** True when in-memory DB has unpersisted writes */
  private dirty = false;

  private constructor(SQL: SqlJsStatic, dbPath: string) {
    // Generate a new session ID (8-char hex = 4 random bytes)
    this.sessionId = randomBytes(4).toString('hex');
    this.dbPath = dbPath;

    // Ensure the directory exists
    const dbDir = path.dirname(dbPath);
    mkdirSync(dbDir, { recursive: true });

    // Load from file if it exists, otherwise create in-memory.
    // Wrap the load in a try/catch so a corrupt file falls back to a fresh DB
    // rather than crashing the MCP server.
    if (existsSync(dbPath)) {
      try {
        const fileBuffer = readFileSync(dbPath);
        this.db = new SQL.Database(fileBuffer);
      } catch (err) {
        console.warn('[Telemetry] Corrupt DB file, starting fresh:', String(err));
        this.db = new SQL.Database();
      }
    } else {
      this.db = new SQL.Database();
    }

    // Create schema (idempotent — IF NOT EXISTS)
    this.db.run(CREATE_TABLE_SQL);
    this.db.run(CREATE_IDX_SESSION);
    this.db.run(CREATE_IDX_TOOL);
    this.db.run(CREATE_IDX_STATUS);

    // Persist initial state (creates the file if it did not exist)
    this.persist();
  }

  /**
   * Resolve the default database path relative to cwd.
   */
  private static defaultDbPath(): string {
    return path.join(process.cwd(), '.goodvibes', 'telemetry', 'telemetry.db');
  }

  /**
   * Initialize the Telemetry singleton.
   *
   * Loads the sql.js WASM module (one async operation), then opens or creates
   * the SQLite database synchronously. Safe to call multiple times — returns
   * early if already initialized.
   *
   * Must be called once before any call to getInstance().
   */
  public static async initialize(dbPath?: string): Promise<void> {
    if (Telemetry.instance) {
      // Already initialized — ignore (handles repeated calls gracefully)
      return;
    }

    const resolvedPath = dbPath ?? Telemetry.defaultDbPath();
    Telemetry.initializedDbPath = resolvedPath;

    // Load the WASM module — this is the only async step.
    // In the CJS bundle (dist/index.cjs), sql-wasm.wasm is copied next to the bundle
    // by build.mjs. Use locateFile to point sql.js there so it does not search cwd.
    // In the test environment (source files via Vitest), the WASM is resolved from
    // node_modules by sql.js defaults — so only activate locateFile when the file
    // actually exists beside __dirname (i.e. in the bundle).
    const wasmBesideBundle = path.join(__dirname, 'sql-wasm.wasm');
    const sqlConfig = existsSync(wasmBesideBundle)
      ? { locateFile: (file: string) => path.join(__dirname, file) }
      : {};
    const SQL = await initSqlJs(sqlConfig);

    Telemetry.instance = new Telemetry(SQL, resolvedPath);
  }

  /**
   * Get the singleton Telemetry instance.
   *
   * Throws if initialize() has not been called. In production, initialize()
   * is called during PrecisionRuntime.initialize(). In tests, call
   * await Telemetry.initialize(dbPath) in beforeEach.
   */
  public static getInstance(dbPath?: string): Telemetry {
    if (!Telemetry.instance) {
      throw new Error(
        '[Telemetry] getInstance() called before initialize(). ' +
        'Call await Telemetry.initialize() first.',
      );
    }
    if (dbPath !== undefined && dbPath !== Telemetry.initializedDbPath) {
      console.warn(
        `[Telemetry] getInstance() called with dbPath "${dbPath}" but instance already initialized at "${Telemetry.initializedDbPath}". Using existing instance.`,
      );
    }
    return Telemetry.instance;
  }

  /**
   * Destroy the singleton instance, persist, and close the database.
   * Intended for use in tests and graceful shutdown.
   */
  public static resetInstance(): void {
    if (Telemetry.instance) {
      try {
        Telemetry.instance.close();
      } catch {
        // Ignore close errors during reset
      }
      Telemetry.instance = null;
      Telemetry.initializedDbPath = null;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Generate a precision_id for the given tool.
   * Format: "{shortTool}_{sessionShort}_{uniqueHex}"
   */
  public generateId(tool: string): string {
    const shortTool = toShortTool(tool);
    const uniqueHex = randomBytes(4).toString('hex');
    return `${shortTool}_${this.sessionId}_${uniqueHex}`;
  }

  /**
   * Return the 8-char hex session ID for this server startup.
   */
  public getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Record a telemetry entry synchronously.
   *
   * The caller must have already generated an `id` via `generateId()` and
   * must supply `tool` and `status`. All other fields are optional.
   */
  public record(
    entry: Omit<TelemetryRecord, 'session_id' | 'created_at'>,
  ): void {
    try {
      this.db.run(
        `INSERT OR IGNORE INTO calls
           (id, session_id, tool, status, tokens_in, tokens_out,
            cache_hit, cache_bytes_saved, duration_ms, error, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          this.sessionId,
          entry.tool,
          entry.status,
          entry.tokens_in ?? null,
          entry.tokens_out ?? null,
          // SQLite stores booleans as 0/1
          entry.cache_hit === undefined ? null : entry.cache_hit ? 1 : 0,
          entry.cache_bytes_saved ?? null,
          entry.duration_ms ?? null,
          entry.error ?? null,
          entry.metadata !== undefined ? JSON.stringify(entry.metadata) : null,
          new Date().toISOString(),
        ],
      );
      this.schedulePersist();
    } catch (err) {
      // Telemetry must never crash the caller — swallow and log.
      console.error('[Telemetry] Failed to record entry:', err);
    }
  }

  /**
   * Estimate token cost of a value (input or output).
   * Uses the standard 4 chars/token heuristic.
   */
  public static estimateTokens(value: unknown): number {
    return Math.ceil(Buffer.byteLength(JSON.stringify(value), 'utf-8') / 4);
  }

  /**
   * Query telemetry records with optional filters.
   * Returns records in ascending chronological order.
   */
  public query(filter?: TelemetryQueryFilter): TelemetryRecord[] {
    const selectCols = `SELECT id, session_id, tool, status, tokens_in, tokens_out,
             cache_hit, cache_bytes_saved, duration_ms, error, metadata, created_at
      FROM calls`;

    // Fast path: no filter
    if (!filter || (!filter.tool && !filter.status && !filter.session_id && !filter.since && !filter.limit)) {
      const results = this.db.exec(`${selectCols} ORDER BY created_at ASC`);
      return this.resultsToRecords(results);
    }

    // Build dynamic SQL with positional ? params
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (filter.tool) {
      conditions.push('tool = ?');
      params.push(filter.tool);
    }
    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter.session_id) {
      conditions.push('session_id = ?');
      params.push(filter.session_id);
    }
    if (filter.since) {
      conditions.push('created_at >= ?');
      params.push(filter.since);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const hasLimit = filter.limit !== undefined && filter.limit !== null;

    const sql = `${selectCols}
      ${where}
      ORDER BY created_at ASC
      ${hasLimit ? 'LIMIT ?' : ''}`;

    if (hasLimit) {
      params.push(Math.max(1, Math.floor(filter.limit!)));
    }

    const results = this.db.exec(sql, params);
    return this.resultsToRecords(results);
  }

  /**
   * Compute an in-session summary from the database.
   * Aggregates calls for the current session_id only.
   */
  public getSummary(): SessionSummary {
    const rows = this.query({ session_id: this.sessionId });

    const byTool: Record<string, { calls: number; tokens: number; cache_hits: number; total_ms: number }> = {};
    let totalTokens = 0;
    let totalCacheHits = 0;
    let totalDurationMs = 0;
    let successCount = 0;

    for (const row of rows) {
      const tool = row.tool;
      if (!byTool[tool]) {
        byTool[tool] = { calls: 0, tokens: 0, cache_hits: 0, total_ms: 0 };
      }

      const ts = byTool[tool];
      ts.calls++;

      const tokensIn = row.tokens_in ?? 0;
      const tokensOut = row.tokens_out ?? 0;
      const tokens = tokensIn + tokensOut;
      ts.tokens += tokens;
      totalTokens += tokens;

      if (row.cache_hit) {
        ts.cache_hits++;
        totalCacheHits++;
      }

      const ms = row.duration_ms ?? 0;
      ts.total_ms += ms;
      totalDurationMs += ms;

      if (row.status === 'success') {
        successCount++;
      }
    }

    // Convert to output format with avg_ms
    const byToolOut: Record<string, ToolStats> = {};
    for (const [tool, stats] of Object.entries(byTool)) {
      byToolOut[tool] = {
        calls: stats.calls,
        tokens: stats.tokens,
        cache_hits: stats.cache_hits,
        avg_ms: stats.calls > 0 ? Math.round(stats.total_ms / stats.calls) : 0,
      };
    }

    return {
      session_id: this.sessionId,
      total_calls: rows.length,
      by_tool: byToolOut,
      total_tokens: totalTokens,
      total_cache_hits: totalCacheHits,
      total_duration_ms: totalDurationMs,
      success_rate: rows.length > 0 ? successCount / rows.length : 1,
    };
  }

  /**
   * Persist the in-memory database to disk.
   * Called after every write operation.
   */
  public persist(): void {
    try {
      const data = this.db.export();
      // Zero-copy: reuse the underlying ArrayBuffer instead of copying
      const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      writeFileSync(this.dbPath, buf);
    } catch (err) {
      console.error('[Telemetry] Failed to persist database:', err);
    }
  }

  /**
   * Schedule a debounced persist — at most once every 5 seconds.
   * Avoids blocking record() with a full db.export() + writeFileSync on each call.
   */
  private schedulePersist(): void {
    this.dirty = true;
    if (!this.persistTimer) {
      this.persistTimer = setTimeout(() => {
        this.persistTimer = null;
        if (this.dirty) {
          this.persist();
          this.dirty = false;
        }
      }, 5000);
    }
  }

  /**
   * Close the database (persist first, then close).
   */
  public close(): void {
    // Cancel any pending debounced persist and flush immediately
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.dirty) {
      this.persist();
      this.dirty = false;
    } else {
      // Always persist on close to ensure the latest state is on disk
      this.persist();
    }
    try {
      this.db.close();
    } catch {
      // Ignore close errors
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Convert sql.js exec() results (array of { columns, values }) to TelemetryRecord[].
   * sql.js returns rows as arrays, not objects.
   */
  private resultsToRecords(
    results: ReturnType<SqlJsDatabase['exec']>,
  ): TelemetryRecord[] {
    if (!results || results.length === 0) return [];
    const { values } = results[0];
    return values.map((row) => Telemetry.rowArrayToRecord(row as (string | number | null)[]));
  }

  /**
   * Convert a raw sql.js row array to a typed TelemetryRecord.
   * Column order must match COLUMNS constant and SELECT order.
   */
  private static rowArrayToRecord(row: (string | number | null)[]): TelemetryRecord {
    // Indices match COLUMNS: id(0), session_id(1), tool(2), status(3),
    // tokens_in(4), tokens_out(5), cache_hit(6), cache_bytes_saved(7),
    // duration_ms(8), error(9), metadata(10), created_at(11)
    const rec: TelemetryRecord = {
      id: row[0] as string,
      session_id: row[1] as string,
      tool: row[2] as string,
      status: row[3] as 'success' | 'failed' | 'partial',
      created_at: row[11] as string,
    };

    if (row[4] !== null && row[4] !== undefined) {
      rec.tokens_in = row[4] as number;
    }
    if (row[5] !== null && row[5] !== undefined) {
      rec.tokens_out = row[5] as number;
    }
    if (row[6] !== null && row[6] !== undefined) {
      rec.cache_hit = (row[6] as number) !== 0;
    }
    if (row[7] !== null && row[7] !== undefined) {
      rec.cache_bytes_saved = row[7] as number;
    }
    if (row[8] !== null && row[8] !== undefined) {
      rec.duration_ms = row[8] as number;
    }
    if (row[9] !== null && row[9] !== undefined) {
      rec.error = row[9] as string;
    }
    if (row[10] !== null && row[10] !== undefined) {
      try {
        rec.metadata = JSON.parse(row[10] as string);
      } catch {
        rec.metadata = { raw: row[10] };
      }
    }

    return rec;
  }
}

/**
 * Convenience getter for the Telemetry singleton.
 * Returns the existing instance (throws if not initialized — call initialize() first).
 * Matches the pattern of other state modules that export singleton getters.
 */
export const getTelemetry = () => Telemetry.getInstance();
