/**
 * Telemetry - Session-scoped singleton for call tracking via SQLite.
 *
 * Provides zero-LLM-token telemetry: precision_ids are generated server-side,
 * calls are recorded to SQLite synchronously, and only the precision_id is
 * returned to the LLM (~1 token). The LLM never sees telemetry data unless
 * it explicitly queries via precision_config action='telemetry'.
 */

import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
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

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

export class Telemetry {
  private static instance: Telemetry | null = null;
  private static initializedDbPath: string | null = null;

  private readonly db: Database.Database;
  private readonly sessionId: string;

  // Prepared statements (compiled once, reused for performance)
  private readonly stmtInsert: Database.Statement;
  private readonly stmtQueryAll: Database.Statement;
  private readonly stmtQueryBySession: Database.Statement;

  private constructor(dbPath: string) {
    // Generate a new session ID (8-char hex = 4 random bytes)
    this.sessionId = randomBytes(4).toString('hex');

    // Ensure the directory exists (mkdirSync is a no-op if dir already exists)
    const dbDir = path.dirname(dbPath);
    mkdirSync(dbDir, { recursive: true });

    // Open (or create) the SQLite database
    this.db = new Database(dbPath);

    // WAL mode for better concurrent write performance
    this.db.pragma('journal_mode = WAL');

    // Create schema
    this.db.exec(CREATE_TABLE_SQL);
    this.db.exec(CREATE_IDX_SESSION);
    this.db.exec(CREATE_IDX_TOOL);
    this.db.exec(CREATE_IDX_STATUS);

    // Prepare reusable statements
    this.stmtInsert = this.db.prepare(`
      INSERT OR IGNORE INTO calls
        (id, session_id, tool, status, tokens_in, tokens_out,
         cache_hit, cache_bytes_saved, duration_ms, error, metadata, created_at)
      VALUES
        (@id, @session_id, @tool, @status, @tokens_in, @tokens_out,
         @cache_hit, @cache_bytes_saved, @duration_ms, @error, @metadata, @created_at)
    `);

    this.stmtQueryAll = this.db.prepare(`
      SELECT id, session_id, tool, status, tokens_in, tokens_out,
             cache_hit, cache_bytes_saved, duration_ms, error, metadata, created_at
      FROM calls
      ORDER BY created_at ASC
    `);

    this.stmtQueryBySession = this.db.prepare(`
      SELECT id, session_id, tool, status, tokens_in, tokens_out,
             cache_hit, cache_bytes_saved, duration_ms, error, metadata, created_at
      FROM calls
      WHERE session_id = @session_id
      ORDER BY created_at ASC
    `);
  }

  /**
   * Resolve the default database path relative to cwd.
   */
  private static defaultDbPath(): string {
    return path.join(process.cwd(), '.goodvibes', 'telemetry', 'telemetry.db');
  }

  /**
   * Get (or create) the singleton Telemetry instance.
   * Uses the default database path unless dbPath is provided (for testing).
   */
  public static getInstance(dbPath?: string): Telemetry {
    if (!Telemetry.instance) {
      const resolvedPath = dbPath ?? Telemetry.defaultDbPath();
      Telemetry.initializedDbPath = resolvedPath;
      Telemetry.instance = new Telemetry(resolvedPath);
    } else if (dbPath !== undefined && dbPath !== Telemetry.initializedDbPath) {
      console.warn(
        `[Telemetry] getInstance() called with dbPath "${dbPath}" but instance already initialized at "${Telemetry.initializedDbPath}". Using existing instance.`,
      );
    }
    return Telemetry.instance;
  }

  /**
   * Destroy the singleton instance and close the database connection.
   * Intended for use in tests and graceful shutdown.
   */
  public static resetInstance(): void {
    if (Telemetry.instance) {
      try {
        Telemetry.instance.db.close();
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
    const row = {
      id: entry.id,
      session_id: this.sessionId,
      tool: entry.tool,
      status: entry.status,
      tokens_in: entry.tokens_in ?? null,
      tokens_out: entry.tokens_out ?? null,
      // SQLite stores booleans as 0/1
      cache_hit: entry.cache_hit === undefined ? null : entry.cache_hit ? 1 : 0,
      cache_bytes_saved: entry.cache_bytes_saved ?? null,
      duration_ms: entry.duration_ms ?? null,
      error: entry.error ?? null,
      metadata: entry.metadata !== undefined ? JSON.stringify(entry.metadata) : null,
      created_at: new Date().toISOString(),
    };

    try {
      this.stmtInsert.run(row);
    } catch (err) {
      // Telemetry must never crash the caller — swallow and log.
      // Using console.error directly to avoid a circular dependency with the
      // project logger (which may itself use telemetry in the future).
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
    // Fast path: no filter — use the pre-compiled statement
    if (!filter || (!filter.tool && !filter.status && !filter.session_id && !filter.since && !filter.limit)) {
      const rows = this.stmtQueryAll.all() as Array<Record<string, unknown>>;
      return rows.map(Telemetry.rowToRecord);
    }

    // Fast path: session_id-only filter (used by getSummary) — use pre-compiled statement
    if (filter.session_id && !filter.tool && !filter.status && !filter.since && !filter.limit) {
      const rows = this.stmtQueryBySession.all({ session_id: filter.session_id }) as Array<Record<string, unknown>>;
      return rows.map(Telemetry.rowToRecord);
    }

    // General path: build dynamic SQL with bound parameters (no string interpolation for values)
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (filter.tool) {
      conditions.push('tool = @tool');
      params['tool'] = filter.tool;
    }
    if (filter.status) {
      conditions.push('status = @status');
      params['status'] = filter.status;
    }
    if (filter.session_id) {
      conditions.push('session_id = @session_id');
      params['session_id'] = filter.session_id;
    }
    if (filter.since) {
      conditions.push('created_at >= @since');
      params['since'] = filter.since;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const hasLimit = filter.limit !== undefined && filter.limit !== null;

    const sql = `
      SELECT id, session_id, tool, status, tokens_in, tokens_out,
             cache_hit, cache_bytes_saved, duration_ms, error, metadata, created_at
      FROM calls
      ${where}
      ORDER BY created_at ASC
      ${hasLimit ? 'LIMIT @_limit' : ''}
    `;

    if (hasLimit) {
      params['_limit'] = Math.max(1, Math.floor(filter.limit!));
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(params) as Array<Record<string, unknown>>;
    return rows.map(Telemetry.rowToRecord);
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

  // ───────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Convert a raw SQLite row to a typed TelemetryRecord.
   */
  private static rowToRecord(row: Record<string, unknown>): TelemetryRecord {
    const rec: TelemetryRecord = {
      id: row['id'] as string,
      session_id: row['session_id'] as string,
      tool: row['tool'] as string,
      status: row['status'] as 'success' | 'failed' | 'partial',
      created_at: row['created_at'] as string,
    };

    if (row['tokens_in'] !== null && row['tokens_in'] !== undefined) {
      rec.tokens_in = row['tokens_in'] as number;
    }
    if (row['tokens_out'] !== null && row['tokens_out'] !== undefined) {
      rec.tokens_out = row['tokens_out'] as number;
    }
    if (row['cache_hit'] !== null && row['cache_hit'] !== undefined) {
      rec.cache_hit = (row['cache_hit'] as number) !== 0;
    }
    if (row['cache_bytes_saved'] !== null && row['cache_bytes_saved'] !== undefined) {
      rec.cache_bytes_saved = row['cache_bytes_saved'] as number;
    }
    if (row['duration_ms'] !== null && row['duration_ms'] !== undefined) {
      rec.duration_ms = row['duration_ms'] as number;
    }
    if (row['error'] !== null && row['error'] !== undefined) {
      rec.error = row['error'] as string;
    }
    if (row['metadata'] !== null && row['metadata'] !== undefined) {
      try {
        rec.metadata = JSON.parse(row['metadata'] as string);
      } catch {
        rec.metadata = { raw: row['metadata'] };
      }
    }

    return rec;
  }
}

/**
 * Convenience getter for the Telemetry singleton.
 * Returns the existing instance (or creates one with the default path).
 * Matches the pattern of other state modules that export singleton getters.
 */
export const getTelemetry = () => Telemetry.getInstance();
