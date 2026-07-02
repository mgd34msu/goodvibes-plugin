/**
 * `@goodvibes/core/telemetry` — the shared telemetry writer and record schema.
 *
 * Ported from v1 precision-engine `state/telemetry.ts` and `state/kv-state.ts`,
 * with two v2 changes:
 *  - Every shared state file is written atomically (temp file + rename), so a
 *    crash mid-write never corrupts the DB or a session file. v1's telemetry
 *    persist wrote in place; it is now atomic like KVState always was.
 *  - The database and session files live under the R15-namespaced
 *    `.goodvibes/v2/` state root, so v1 and v2 never share a telemetry DB.
 *
 * Token counts stored here are payload-true — analytics reads them; callers pass
 * counts sourced from rendered payloads (see `core/envelope`), never a tool's
 * own pre-serialization self-estimate.
 */

import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'fs';
import { readFile, writeFile, mkdir, rename, readdir, unlink, stat } from 'fs/promises';
import * as path from 'path';
import { statePath } from '../config/index.js';

// ── Telemetry record schema (analytics reads this shape) ─────────────────────

export interface TelemetryRecord {
  /** call id: "{shortTool}_{sessionShort}_{uniqueHex}" */
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
  since?: string;
  limit?: number;
}

function toShortTool(toolName: string): string {
  return toolName.slice(0, 12).replace(/[^a-z0-9_]/gi, '_') || 'unknown';
}

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

/**
 * Write a Buffer to a file atomically: temp file in the same directory, then
 * rename over the target (rename is atomic on the same filesystem).
 */
function atomicWriteFileSync(filePath: string, data: Buffer): void {
  const tmp = `${filePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, data);
  try {
    renameSync(tmp, filePath);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/** Session-scoped telemetry singleton backed by SQLite (sql.js / WASM). */
export class Telemetry {
  private static instance: Telemetry | null = null;
  private static initializedDbPath: string | null = null;

  private readonly db: SqlJsDatabase;
  private readonly sessionId: string;
  private readonly dbPath: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  private constructor(SQL: SqlJsStatic, dbPath: string) {
    this.sessionId = randomBytes(4).toString('hex');
    this.dbPath = dbPath;
    mkdirSync(path.dirname(dbPath), { recursive: true });

    if (existsSync(dbPath)) {
      try {
        this.db = new SQL.Database(readFileSync(dbPath));
      } catch (err) {
        console.warn('[Telemetry] Corrupt DB file, starting fresh:', String(err));
        this.db = new SQL.Database();
      }
    } else {
      this.db = new SQL.Database();
    }

    this.db.run(CREATE_TABLE_SQL);
    this.db.run(CREATE_IDX_SESSION);
    this.db.run(CREATE_IDX_TOOL);
    this.db.run(CREATE_IDX_STATUS);
    this.persist();
  }

  /** Default DB path, namespaced under `.goodvibes/v2/` (R15). */
  private static defaultDbPath(): string {
    return statePath('telemetry', 'telemetry.db');
  }

  /**
   * Resolve the sql.js config. In a bundled server, `sql-wasm.wasm` sits beside
   * the bundle (or in `server/wasm/`); point sql.js there. In tests (source via
   * Vitest) it resolves from node_modules by sql.js defaults.
   */
  private static sqlConfig(): Parameters<typeof initSqlJs>[0] {
    const candidates = [
      path.join(__dirname, 'sql-wasm.wasm'),
      path.join(__dirname, 'wasm', 'sql-wasm.wasm'),
    ];
    for (const c of candidates) {
      if (existsSync(c)) {
        const dir = path.dirname(c);
        return { locateFile: (file: string) => path.join(dir, file) };
      }
    }
    return {};
  }

  /** Initialize the singleton. Loads the WASM module (the only async step). */
  public static async initialize(dbPath?: string): Promise<void> {
    if (Telemetry.instance) return;
    const resolvedPath = dbPath ?? Telemetry.defaultDbPath();
    Telemetry.initializedDbPath = resolvedPath;
    const SQL = await initSqlJs(Telemetry.sqlConfig());
    Telemetry.instance = new Telemetry(SQL, resolvedPath);
  }

  /** Get the singleton (throws if `initialize()` has not run). */
  public static getInstance(): Telemetry {
    if (!Telemetry.instance) {
      throw new Error('[Telemetry] getInstance() called before initialize().');
    }
    return Telemetry.instance;
  }

  /** Destroy the singleton (persist + close). For tests and graceful shutdown. */
  public static resetInstance(): void {
    if (Telemetry.instance) {
      try {
        Telemetry.instance.close();
      } catch {
        /* ignore */
      }
      Telemetry.instance = null;
      Telemetry.initializedDbPath = null;
    }
  }

  /** Generate a call id: "{shortTool}_{sessionShort}_{uniqueHex}". */
  public generateId(tool: string): string {
    return `${toShortTool(tool)}_${this.sessionId}_${randomBytes(4).toString('hex')}`;
  }

  /** The 8-char hex session id for this server startup. */
  public getSessionId(): string {
    return this.sessionId;
  }

  /** Record a telemetry entry (never throws to the caller). */
  public record(entry: Omit<TelemetryRecord, 'session_id' | 'created_at'>): void {
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
      console.error('[Telemetry] Failed to record entry:', err);
    }
  }

  /** Query telemetry records in ascending chronological order. */
  public query(filter?: TelemetryQueryFilter): TelemetryRecord[] {
    const selectCols = `SELECT id, session_id, tool, status, tokens_in, tokens_out,
             cache_hit, cache_bytes_saved, duration_ms, error, metadata, created_at
      FROM calls`;

    if (!filter || (!filter.tool && !filter.status && !filter.session_id && !filter.since && !filter.limit)) {
      return this.resultsToRecords(this.db.exec(`${selectCols} ORDER BY created_at ASC`));
    }

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
    const sql = `${selectCols} ${where} ORDER BY created_at ASC ${hasLimit ? 'LIMIT ?' : ''}`;
    if (hasLimit) params.push(Math.max(1, Math.floor(filter.limit as number)));
    return this.resultsToRecords(this.db.exec(sql, params));
  }

  /** Aggregate an in-session summary for the current session. */
  public getSummary(): SessionSummary {
    const rows = this.query({ session_id: this.sessionId });
    const byTool: Record<string, { calls: number; tokens: number; cache_hits: number; total_ms: number }> = {};
    let totalTokens = 0;
    let totalCacheHits = 0;
    let totalDurationMs = 0;
    let successCount = 0;

    for (const row of rows) {
      const t = (byTool[row.tool] ??= { calls: 0, tokens: 0, cache_hits: 0, total_ms: 0 });
      t.calls++;
      const tokens = (row.tokens_in ?? 0) + (row.tokens_out ?? 0);
      t.tokens += tokens;
      totalTokens += tokens;
      if (row.cache_hit) {
        t.cache_hits++;
        totalCacheHits++;
      }
      const ms = row.duration_ms ?? 0;
      t.total_ms += ms;
      totalDurationMs += ms;
      if (row.status === 'success') successCount++;
    }

    const byToolOut: Record<string, ToolStats> = {};
    for (const [tool, s] of Object.entries(byTool)) {
      byToolOut[tool] = {
        calls: s.calls,
        tokens: s.tokens,
        cache_hits: s.cache_hits,
        avg_ms: s.calls > 0 ? Math.round(s.total_ms / s.calls) : 0,
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

  /** Persist the in-memory DB to disk atomically. */
  public persist(): void {
    try {
      const data = this.db.export();
      const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      atomicWriteFileSync(this.dbPath, buf);
    } catch (err) {
      console.error('[Telemetry] Failed to persist database:', err);
    }
  }

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
      // Never hold the event loop open for a debounced flush.
      this.persistTimer.unref?.();
    }
  }

  /** Persist and close the database. */
  public close(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persist();
    this.dirty = false;
    try {
      this.db.close();
    } catch {
      /* ignore */
    }
  }

  private resultsToRecords(results: ReturnType<SqlJsDatabase['exec']>): TelemetryRecord[] {
    if (!results || results.length === 0) return [];
    return results[0].values.map((row) => Telemetry.rowArrayToRecord(row as (string | number | null)[]));
  }

  private static rowArrayToRecord(row: (string | number | null)[]): TelemetryRecord {
    const rec: TelemetryRecord = {
      id: row[0] as string,
      session_id: row[1] as string,
      tool: row[2] as string,
      status: row[3] as 'success' | 'failed' | 'partial',
      created_at: row[11] as string,
    };
    if (row[4] != null) rec.tokens_in = row[4] as number;
    if (row[5] != null) rec.tokens_out = row[5] as number;
    if (row[6] != null) rec.cache_hit = (row[6] as number) !== 0;
    if (row[7] != null) rec.cache_bytes_saved = row[7] as number;
    if (row[8] != null) rec.duration_ms = row[8] as number;
    if (row[9] != null) rec.error = row[9] as string;
    if (row[10] != null) {
      try {
        rec.metadata = JSON.parse(row[10] as string);
      } catch {
        rec.metadata = { raw: row[10] };
      }
    }
    return rec;
  }
}

/** Convenience getter for the Telemetry singleton. */
export const getTelemetry = (): Telemetry => Telemetry.getInstance();

// ── Session key-value state (atomic temp-then-rename writes) ──────────────────

export interface SessionStateData {
  id: string;
  started_at: string;
  [key: string]: unknown;
}

/** Per-session KV store persisted under the namespaced `.goodvibes/v2/state/`. */
export class KVState {
  private static instance: KVState | null = null;
  private readonly sessionId: string;
  private readonly sessionFile: string;
  private readonly stateDir: string;
  private data: SessionStateData;
  private loaded = false;

  private constructor(externalSessionId?: string) {
    this.sessionId = externalSessionId ?? randomBytes(4).toString('hex');
    this.stateDir = statePath('state');
    this.sessionFile = path.join(this.stateDir, `session_${this.sessionId}.json`);
    this.data = { id: this.sessionId, started_at: new Date().toISOString() };
  }

  static getInstance(): KVState {
    return (KVState.instance ??= new KVState());
  }

  static initWithSessionId(sessionId: string): KVState {
    return (KVState.instance ??= new KVState(sessionId));
  }

  static resetInstance(): void {
    KVState.instance = null;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  async get(keys: string[]): Promise<Record<string, unknown>> {
    await this.ensureLoaded();
    const result: Record<string, unknown> = {};
    for (const key of keys) result[key] = this.data[key];
    return result;
  }

  async set(values: Record<string, unknown>): Promise<void> {
    await this.ensureLoaded();
    const RESERVED = new Set(['id', 'started_at', '__proto__', 'constructor', 'prototype']);
    for (const [key, value] of Object.entries(values)) {
      if (RESERVED.has(key)) continue;
      this.data[key] = value;
    }
    await this.persist();
  }

  async list(prefix?: string): Promise<Record<string, unknown>> {
    await this.ensureLoaded();
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this.data)) {
      if (!prefix || key.startsWith(prefix)) result[key] = value;
    }
    return result;
  }

  async clear(keys: string[]): Promise<void> {
    await this.ensureLoaded();
    for (const key of keys) {
      if (key === 'id' || key === 'started_at') continue;
      delete this.data[key];
    }
    await this.persist();
  }

  async listSessions(): Promise<string[]> {
    try {
      const entries = await readdir(this.stateDir);
      return entries
        .map((e) => e.match(/^session_([0-9a-f]{8})\.json$/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => m[1]);
    } catch {
      return [];
    }
  }

  async cleanupOldSessions(keepCount = 5): Promise<number> {
    try {
      const entries = await readdir(this.stateDir);
      const results = await Promise.all(
        entries
          .filter((e) => /^session_[0-9a-f]{8}\.json$/.test(e))
          .map(async (entry) => {
            try {
              const s = await stat(path.join(this.stateDir, entry));
              return { file: entry, mtime: s.mtimeMs };
            } catch {
              return null;
            }
          }),
      );
      const files = results.filter((r): r is { file: string; mtime: number } => r !== null);
      files.sort((a, b) => a.mtime - b.mtime);
      const toDelete = files.slice(0, Math.max(0, files.length - keepCount));
      await Promise.all(toDelete.map(({ file }) => unlink(path.join(this.stateDir, file)).catch(() => {})));
      return toDelete.length;
    } catch {
      return 0;
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) await this.load();
  }

  async load(): Promise<void> {
    try {
      await mkdir(this.stateDir, { recursive: true });
    } catch {
      /* proceed with in-memory defaults */
    }
    try {
      const parsed = JSON.parse(await readFile(this.sessionFile, 'utf-8')) as SessionStateData;
      const { id, started_at } = this.data;
      this.data = { ...this.data, ...parsed, id, started_at };
    } catch {
      /* keep in-memory defaults */
    }
    this.loaded = true;
  }

  async persist(): Promise<void> {
    await mkdir(this.stateDir, { recursive: true });
    const tmp = `${this.sessionFile}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
    try {
      await rename(tmp, this.sessionFile);
    } catch (err) {
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }
}

/** Lazy getter for the KVState singleton. */
export function getKvState(): KVState {
  return KVState.getInstance();
}
