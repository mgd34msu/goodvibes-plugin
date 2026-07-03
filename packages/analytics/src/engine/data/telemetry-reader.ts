/**
 * TelemetryReader — read-only SQLite interface for precision-engine's telemetry database.
 *
 * Opens `.goodvibes/telemetry/telemetry.db` using sql.js (WASM). The database is loaded
 * from the file into memory on first call to `initialize()`. Since sql.js holds an
 * in-memory copy, `reload()` must be called to pick up writes made by precision-engine
 * after the initial load.
 *
 * Design:
 *   - Lazy initialization: WASM loads only on first `initialize()` call.
 *   - Missing DB: returns empty results / null gracefully.
 *   - Read-only intent: no INSERT/UPDATE/DELETE — the writer is precision-engine.
 *   - Thread safety: single-process Node.js — no concurrent access within this module.
 */

// `sql.js` is an externalized WASM dependency (analytics build.mjs) installed by
// the one-time plugin setup. Loaded LAZILY inside `initialize()` — never at
// module load — so the analytics server boots on a fresh install and the live
// JSONL-based modes (live_cost/doctor/agents) work even before setup runs. If
// the dep is missing, `initialize()`'s existing try/catch marks the reader
// unavailable (empty results); telemetry never blocks a tool.
import type initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';

/** Shape of the lazily-loaded `sql.js` default export (the init function). */
type SqlJsInit = (config?: Parameters<typeof initSqlJs>[0]) => Promise<SqlJsStatic>;

/** Lazily load `sql.js`'s init function; returns null when the dep is missing. */
async function loadSqlJsInit(): Promise<SqlJsInit | null> {
  try {
    const spec = ['sql', 'js'].join('.');
    const mod = (await import(spec as string)) as { default?: unknown };
    return (mod.default ?? mod) as SqlJsInit;
  } catch {
    return null;
  }
}
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { TelemetryRecord, ToolBreakdown, TokenMetrics } from '../types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Column indices — must match SELECT order in all queries
// ─────────────────────────────────────────────────────────────────────────────

const COL = {
  id: 0,
  session_id: 1,
  tool: 2,
  status: 3,
  tokens_in: 4,
  tokens_out: 5,
  cache_hit: 6,
  cache_bytes_saved: 7,
  duration_ms: 8,
  error: 9,
  metadata: 10,
  created_at: 11,
} as const;

const SELECT_COLS = `
  id, session_id, tool, status,
  tokens_in, tokens_out, cache_hit, cache_bytes_saved,
  duration_ms, error, metadata, created_at
`;

// Approximate bytes-per-token for cache savings estimation (matches precision-engine)
const BYTES_PER_TOKEN = 4;

// ─────────────────────────────────────────────────────────────────────────────
// TelemetryReader
// ─────────────────────────────────────────────────────────────────────────────

export class TelemetryReader {
  private db: Database | null = null;
  private _SQL: SqlJsStatic | null = null;
  private readonly dbPath: string;
  private _available = false;

  constructor(goodvibesDir: string) {
    this.dbPath = path.join(goodvibesDir, 'telemetry', 'telemetry.db');
  }

  /**
   * Initialize sql.js WASM and open the database from the file on disk.
   *
   * Safe to call multiple times — subsequent calls are no-ops if already
   * initialized. If the DB file does not exist, marks as unavailable and
   * returns without error (callers get empty results).
   */
  async initialize(): Promise<void> {
    if (this.db !== null) {
      // Already initialized
      return;
    }

    if (!existsSync(this.dbPath)) {
      // DB does not exist yet — precision-engine may not have run any calls.
      this._available = false;
      return;
    }

    try {
      // Locate WASM beside the bundle when running from dist/; fall back to
      // node_modules resolution in the source / test environment.
      let bundleDir: string;
      try {
        bundleDir = path.dirname(new URL(import.meta.url).pathname);
      } catch {
        // CJS bundle: import.meta.url is undefined — fall back to __dirname or process.argv[1]
        bundleDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(process.argv[1]);
      }
      // v2 ships the WASM in a wasm/ subdirectory beside the bundle; v1 shipped
      // it flat. Try both before falling back to sql.js default resolution.
      const wasmSubdir = path.join(bundleDir, 'wasm', 'sql-wasm.wasm');
      const wasmBesideBundle = path.join(bundleDir, 'sql-wasm.wasm');
      const sqlConfig = existsSync(wasmSubdir)
        ? { locateFile: (file: string) => path.join(bundleDir, 'wasm', file) }
        : existsSync(wasmBesideBundle)
          ? { locateFile: (file: string) => path.join(bundleDir, file) }
          : {};

      const initSqlJs = await loadSqlJsInit();
      if (!initSqlJs) {
        // sql.js not installed yet — degrade to marked-unavailable (empty
        // results), exactly like a missing DB file, instead of throwing.
        this.db = null;
        this._available = false;
        return;
      }
      this._SQL = await initSqlJs(sqlConfig);
      const buffer = readFileSync(this.dbPath);
      this.db = new this._SQL.Database(buffer);
      this._available = true;
    } catch (err) {
      // Corrupt file or WASM load failure — degrade gracefully.
      console.warn('[TelemetryReader] Failed to open database:', String(err));
      this.db = null;
      this._available = false;
    }
  }

  /**
   * Returns true if the DB was opened successfully and is queryable.
   */
  isAvailable(): boolean {
    return this._available && this.db !== null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Query methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get records with optional filters.
   * Returns records in ascending chronological order.
   * Returns [] if the database is unavailable.
   */
  getRecords(filter?: {
    tool?: string;
    status?: 'success' | 'failed' | 'partial';
    since?: string;
    session_id?: string;
    limit?: number;
  }): TelemetryRecord[] {
    if (!this.db) return [];

    try {
      const conditions: string[] = [];
      const params: (string | number | null)[] = [];

      if (filter?.tool) {
        conditions.push('tool = ?');
        params.push(filter.tool);
      }
      if (filter?.status) {
        conditions.push('status = ?');
        params.push(filter.status);
      }
      if (filter?.since) {
        conditions.push('created_at >= ?');
        params.push(filter.since);
      }

      if (filter?.session_id) {
        conditions.push('session_id = ?');
        params.push(filter.session_id);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      let sql = `SELECT ${SELECT_COLS} FROM calls ${where} ORDER BY created_at ASC`;

      if (filter?.limit !== undefined && filter.limit > 0) {
        sql += ' LIMIT ?';
        params.push(Math.floor(filter.limit));
      }

      const results = this.db.exec(sql, params.length > 0 ? params : undefined);
      return this.resultsToRecords(results);
    } catch (err) {
      console.warn('[TelemetryReader] getRecords error:', String(err));
      return [];
    }
  }

  /**
   * Get a summary for the specified session (defaults to current/most recent).
   * Returns null if the database is unavailable or the session has no records.
   */
  getSessionSummary(sessionId?: string): {
    session_id: string;
    total_calls: number;
    by_tool: Record<string, ToolBreakdown>;
    total_tokens_in: number;
    total_tokens_out: number;
    total_cache_hits: number;
    total_duration_ms: number;
    success_rate: number;
  } | null {
    if (!this.db) return null;

    const sid = sessionId ?? this.getCurrentSessionId();
    if (!sid) return null;

    try {
      const results = this.db.exec(
        `SELECT ${SELECT_COLS} FROM calls WHERE session_id = ? ORDER BY created_at ASC`,
        [sid],
      );
      const records = this.resultsToRecords(results);
      if (records.length === 0) return null;

      const byTool: Record<
        string,
        { calls: number; tokens_in: number; tokens_out: number; cache_hits: number; total_ms: number; success: number }
      > = {};

      let totalTokensIn = 0;
      let totalTokensOut = 0;
      let totalCacheHits = 0;
      let totalDurationMs = 0;
      let successCount = 0;

      for (const rec of records) {
        if (!byTool[rec.tool]) {
          byTool[rec.tool] = { calls: 0, tokens_in: 0, tokens_out: 0, cache_hits: 0, total_ms: 0, success: 0 };
        }
        const t = byTool[rec.tool];
        t.calls++;

        const ti = rec.tokens_in ?? 0;
        const to = rec.tokens_out ?? 0;
        t.tokens_in += ti;
        t.tokens_out += to;
        totalTokensIn += ti;
        totalTokensOut += to;

        if (rec.cache_hit) {
          t.cache_hits++;
          totalCacheHits++;
        }

        const ms = rec.duration_ms ?? 0;
        t.total_ms += ms;
        totalDurationMs += ms;

        if (rec.status === 'success') {
          t.success++;
          successCount++;
        }
      }

      // Build ToolBreakdown records matching the existing types.ts shape:
      // { calls, avg_ms, cache_hit_rate?, tokens_in, tokens_out, success_rate }
      const byToolOut: Record<string, ToolBreakdown> = {};
      for (const [tool, s] of Object.entries(byTool)) {
        byToolOut[tool] = {
          calls: s.calls,
          avg_ms: s.calls > 0 ? Math.round(s.total_ms / s.calls) : 0,
          cache_hit_rate: s.calls > 0 ? s.cache_hits / s.calls : 0,
          tokens_in: s.tokens_in,
          tokens_out: s.tokens_out,
          success_rate: s.calls > 0 ? s.success / s.calls : 1,
        };
      }

      return {
        session_id: sid,
        total_calls: records.length,
        by_tool: byToolOut,
        total_tokens_in: totalTokensIn,
        total_tokens_out: totalTokensOut,
        total_cache_hits: totalCacheHits,
        total_duration_ms: totalDurationMs,
        success_rate: records.length > 0 ? successCount / records.length : 1,
      };
    } catch (err) {
      console.warn('[TelemetryReader] getSessionSummary error:', String(err));
      return null;
    }
  }

  /**
   * Get the most recent session ID in the database (highest created_at).
   * Returns null if unavailable or DB is empty.
   */
  getCurrentSessionId(): string | null {
    if (!this.db) return null;
    try {
      const results = this.db.exec(
        `SELECT session_id FROM calls ORDER BY created_at DESC LIMIT 1`,
      );
      if (!results.length || !results[0].values.length) return null;
      return results[0].values[0][0] as string;
    } catch (err) {
      console.warn('[TelemetryReader] getCurrentSessionId error:', String(err));
      return null;
    }
  }

  /**
   * List all distinct session IDs in the database, ordered by first appearance.
   */
  listSessionIds(): string[] {
    if (!this.db) return [];
    try {
      const results = this.db.exec(
        `SELECT session_id FROM calls GROUP BY session_id ORDER BY MIN(created_at) ASC`,
      );
      if (!results.length) return [];
      return results[0].values.map((row) => row[0] as string);
    } catch (err) {
      console.warn('[TelemetryReader] listSessionIds error:', String(err));
      return [];
    }
  }

  /**
   * Get all records created within the last `windowMs` milliseconds.
   * Useful for anomaly detection on recent activity.
   */
  getRecordsInWindow(windowMs: number): TelemetryRecord[] {
    const since = new Date(Date.now() - windowMs).toISOString();
    return this.getRecords({ since });
  }

  /**
   * Compute token metrics from recorded calls.
   *
   * Returns the TokenMetrics shape from types.ts:
   *   { input, output, total, saved, efficiency }
   *
   * If `sessionId` is provided, filters to that session; otherwise uses all records.
   */
  getTokenMetrics(sessionId?: string): TokenMetrics {
    const empty: TokenMetrics = {
      input: 0,
      output: 0,
      total: 0,
      saved: 0,
      efficiency: 0,
      api_input: 0,
      api_output: 0,
      cache_read: 0,
      cache_write: 0,
    };

    if (!this.db) return empty;

    try {
      // Default to current session — avoids summing all historical sessions.
      const sid = sessionId ?? this.getCurrentSessionId();
      const where = sid ? 'WHERE session_id = ?' : '';
      const params = sid ? [sid] : undefined;

      const results = this.db.exec(
        `SELECT tokens_in, tokens_out, cache_bytes_saved FROM calls ${where}`,
        params,
      );

      if (!results.length) return empty;

      let totalIn = 0;
      let totalOut = 0;
      let totalSavedBytes = 0;

      for (const row of results[0].values) {
        totalIn += (row[0] as number | null) ?? 0;
        totalOut += (row[1] as number | null) ?? 0;
        totalSavedBytes += (row[2] as number | null) ?? 0;
      }

      const total = totalIn + totalOut;
      const saved = Math.round(totalSavedBytes / BYTES_PER_TOKEN);
      // Efficiency: tokens saved as a fraction of total potential (actual + saved)
      const efficiency = total + saved > 0 ? saved / (total + saved) : 0;

      return {
        input: totalIn,
        output: totalOut,
        total,
        saved,
        efficiency: Math.round(efficiency * 10000) / 10000, // 4 decimal places
        // API-level token counts (Phase 2 will populate from JSONL sync)
        api_input: 0,
        api_output: 0,
        cache_read: 0,
        cache_write: 0,
      };
    } catch (err) {
      console.warn('[TelemetryReader] getTokenMetrics error:', String(err));
      return empty;
    }
  }

  /**
   * Get the most recent N records in ascending chronological order.
   * Returns [] if unavailable.
   */
  getRecentRecords(limit: number): TelemetryRecord[] {
    if (!this.db) return [];
    try {
      const n = Math.max(1, Math.floor(limit));
      // Use a subquery to get the last N records in ascending order without in-memory reverse()
      const results = this.db.exec(
        `SELECT * FROM (SELECT ${SELECT_COLS} FROM calls ORDER BY created_at DESC LIMIT ?) sub ORDER BY created_at ASC`,
        [n],
      );
      return this.resultsToRecords(results);
    } catch (err) {
      console.warn('[TelemetryReader] getRecentRecords error:', String(err));
      return [];
    }
  }

  /**
   * Reload the database from disk synchronously.
   *
   * Closes the current in-memory DB and re-reads the file. Use this to pick up
   * records written by precision-engine after the initial `initialize()` call.
   * If the file no longer exists, marks the reader as unavailable.
   *
   * Requires `initialize()` to have been called first (to cache the SqlJsStatic
   * instance). If called before initialize(), this is a no-op.
   */
  reload(): void {
    if (this.db) {
      try { this.db.close(); } catch { /* ignore */ }
      this.db = null;
      this._available = false;
    }

    if (!existsSync(this.dbPath)) return;
    if (!this._SQL) return; // Must initialize() first

    try {
      const buffer = readFileSync(this.dbPath);
      this.db = new this._SQL.Database(buffer);
      this._available = true;
    } catch (err) {
      console.warn('[TelemetryReader] reload error:', String(err));
    }
  }

  /**
   * Close the database and release resources.
   */
  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // Ignore close errors
      }
      this.db = null;
      this._available = false;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Convert sql.js exec() results to TelemetryRecord[].
   * sql.js returns rows as value arrays, not objects.
   */
  private resultsToRecords(
    results: ReturnType<Database['exec']>,
  ): TelemetryRecord[] {
    if (!results || results.length === 0) return [];
    const { values } = results[0];
    return values.map((row) => TelemetryReader.rowToRecord(row as (string | number | null)[]));
  }

  /**
   * Map a raw row array to a typed TelemetryRecord.
   * Column indices are defined in the COL constant.
   *
   * NOTE: The database stores `metadata` as a JSON string (written by precision-engine).
   * The `TelemetryRecord.metadata` field is typed as `string` to match the stored
   * representation. Consumers needing a structured object should call
   * `JSON.parse(record.metadata)` — the interface intentionally does not auto-parse
   * to avoid the cost on paths that don't need it.
   */
  private static rowToRecord(row: (string | number | null)[]): TelemetryRecord {
    const rec: TelemetryRecord = {
      id: row[COL.id] as string,
      session_id: row[COL.session_id] as string,
      tool: row[COL.tool] as string,
      status: row[COL.status] as 'success' | 'failed' | 'partial',
      created_at: row[COL.created_at] as string,
    };

    if (row[COL.tokens_in] !== null && row[COL.tokens_in] !== undefined) {
      rec.tokens_in = row[COL.tokens_in] as number;
    }
    if (row[COL.tokens_out] !== null && row[COL.tokens_out] !== undefined) {
      rec.tokens_out = row[COL.tokens_out] as number;
    }
    if (row[COL.cache_hit] !== null && row[COL.cache_hit] !== undefined) {
      rec.cache_hit = (row[COL.cache_hit] as number) !== 0;
    }
    if (row[COL.cache_bytes_saved] !== null && row[COL.cache_bytes_saved] !== undefined) {
      rec.cache_bytes_saved = row[COL.cache_bytes_saved] as number;
    }
    if (row[COL.duration_ms] !== null && row[COL.duration_ms] !== undefined) {
      rec.duration_ms = row[COL.duration_ms] as number;
    }
    if (row[COL.error] !== null && row[COL.error] !== undefined) {
      rec.error = row[COL.error] as string;
    }
    // metadata is stored as a JSON string in the DB; types.ts defines it as `string`
    if (row[COL.metadata] !== null && row[COL.metadata] !== undefined) {
      rec.metadata = row[COL.metadata] as string;
    }

    return rec;
  }
}
