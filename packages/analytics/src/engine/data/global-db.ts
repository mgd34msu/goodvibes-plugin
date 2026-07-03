/**
 * global-db.ts — Global SQLite database manager for analytics data.
 *
 * Uses sql.js (WASM-based SQLite) so the database can be bundled by esbuild
 * without native C++ addon issues. All data is stored at a single global path
 * (~/.claude/.goodvibes/analytics/analytics.db) shared across all projects.
 *
 * Architecture notes:
 * - sql.js operates in-memory; `saveToDisk()` flushes the in-memory state to
 *   the file. This is called after every write, debounced to avoid excessive I/O.
 * - WAL mode configured (no-op in sql.js, effective if migrated to native SQLite).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { atomicWriteFileSync, engineLogger } from '../runtime.js';
import type { SqlJsStatic, Database } from 'sql.js';
import type {
  GlobalSession,
  ApiCallRecord,
  ToolSummaryRecord,
  AgentRecord,
  TagEntry,
  SyncStateRecord,
} from '../types.js';
import {
  SCHEMA_SQL,
  SCHEMA_VERSION,
  getSchemaVersion,
  applyMigrations,
} from './db-schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Debounce delay for disk saves (ms). Prevents excessive I/O on bulk writes. */
const SAVE_DEBOUNCE_MS = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Row mapper helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert a sql.js query result into an array of plain objects. */
function rowsToObjects(
  result: ReturnType<Database['exec']>,
): Record<string, unknown>[] {
  if (!result.length) return [];
  const { columns, values } = result[0]!;
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i] ?? null;
    });
    return obj;
  });
}

/** Map a raw DB row to a GlobalSession (joins tags separately). */
function rowToSession(row: Record<string, unknown>, tags: string[]): GlobalSession {
  return {
    session_id:                 String(row['session_id'] ?? ''),
    project_hash:               String(row['project_hash'] ?? ''),
    project_path:               row['project_path'] != null ? String(row['project_path']) : undefined,
    started_at:                 String(row['started_at'] ?? ''),
    ended_at:                   row['ended_at'] != null ? String(row['ended_at']) : undefined,
    model:                      String(row['model'] ?? 'unknown'),
    total_input_tokens:         Number(row['total_input_tokens'] ?? 0),
    total_output_tokens:        Number(row['total_output_tokens'] ?? 0),
    total_cache_read_tokens:    Number(row['total_cache_read_tokens'] ?? 0),
    total_cache_write_tokens:   Number(row['total_cache_write_tokens'] ?? 0),
    total_cost_usd:             Number(row['total_cost_usd'] ?? 0),
    total_api_calls:            Number(row['total_api_calls'] ?? 0),
    total_tool_calls:           Number(row['total_tool_calls'] ?? 0),
    total_native_tool_calls:    Number(row['total_native_tool_calls'] ?? 0),
    total_precision_tool_calls: Number(row['total_precision_tool_calls'] ?? 0),
    total_agent_spawns:         Number(row['total_agent_spawns'] ?? 0),
    tags,
    status: (String(row['status'] ?? 'active')) as GlobalSession['status'],
  };
}

/** Map a raw DB row to an ApiCallRecord. */
function rowToApiCall(row: Record<string, unknown>): ApiCallRecord {
  return {
    session_id:         String(row['session_id'] ?? ''),
    timestamp:          String(row['timestamp'] ?? ''),
    model:              row['model'] != null ? String(row['model']) : undefined,
    input_tokens:       Number(row['input_tokens'] ?? 0),
    output_tokens:      Number(row['output_tokens'] ?? 0),
    cache_read_tokens:  Number(row['cache_read_tokens'] ?? 0),
    cache_write_tokens: Number(row['cache_write_tokens'] ?? 0),
    cost_usd:           Number(row['cost_usd'] ?? 0),
    duration_ms:        Number(row['duration_ms'] ?? 0),
    stop_reason:        row['stop_reason'] != null ? String(row['stop_reason']) : undefined,
  };
}

/** Map a raw DB row to a ToolSummaryRecord. */
function rowToToolSummary(row: Record<string, unknown>): ToolSummaryRecord {
  return {
    session_id:          String(row['session_id'] ?? ''),
    tool_name:           String(row['tool_name'] ?? ''),
    call_count:          Number(row['call_count'] ?? 0),
    success_count:       Number(row['success_count'] ?? 0),
    error_count:         Number(row['error_count'] ?? 0),
    total_duration_ms:   Number(row['total_duration_ms'] ?? 0),
    total_input_tokens:  Number(row['total_input_tokens'] ?? 0),
    total_output_tokens: Number(row['total_output_tokens'] ?? 0),
  };
}

/** Map a raw DB row to an AgentRecord. */
function rowToAgent(row: Record<string, unknown>): AgentRecord {
  return {
    session_id:        String(row['session_id'] ?? ''),
    agent_id:          String(row['agent_id'] ?? ''),
    agent_type:        row['agent_type'] != null ? String(row['agent_type']) : undefined,
    parent_session_id: row['parent_session_id'] != null ? String(row['parent_session_id']) : undefined,
    model:             row['model'] != null ? String(row['model']) : undefined,
    spawned_at:        String(row['spawned_at'] ?? ''),
    completed_at:      row['completed_at'] != null ? String(row['completed_at']) : undefined,
    total_tokens:      Number(row['total_tokens'] ?? 0),
    duration_ms:       Number(row['duration_ms'] ?? 0),
    exit_code:         row['exit_code'] != null ? Number(row['exit_code']) : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GlobalDB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GlobalDB — manages the global analytics SQLite database.
 *
 * All analytics data (sessions, API calls, tool summaries, agents, tags) is
 * stored in a single file at `~/.claude/.goodvibes/analytics/analytics.db`.
 *
 * sql.js operates entirely in-memory, so `saveToDisk()` must be called after
 * writes to persist changes. Saves are debounced (500ms) to coalesce bursts.
 *
 * @example
 * ```ts
 * const db = new GlobalDB('/home/user/.claude/.goodvibes/analytics/analytics.db');
 * await db.initialize();
 * db.upsertSession({ session_id: 'abc', project_hash: 'xyz', started_at: new Date().toISOString() });
 * db.close();
 * ```
 */
export class GlobalDB {
  private readonly dbPath: string;
  private db: Database | null = null;
  private SQL: SqlJsStatic | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * @param dbPath - Absolute path to the SQLite database file.
   */
  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Initialize the database: load sql.js WASM, open or create the DB file,
   * apply the schema and any pending migrations, and enable WAL mode.
   *
   * Must be called before any other method.
   *
   * @throws {Error} If sql.js WASM cannot be loaded or schema application fails.
   */
  async initialize(): Promise<void> {
    // Dynamically import sql.js to support both ESM and CJS bundles.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const initSqlJs = await this.loadSqlJs();

    // Resolve WASM path: prefer adjacent dist/ copy (bundled plugin installs),
    // fall back to node_modules (development).
    const wasmPath = this.resolveWasmPath();
    this.SQL = await initSqlJs({ locateFile: () => wasmPath });

    // Open existing DB or create a new one
    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
    } else {
      this.db = new this.SQL.Database();
    }

    // WAL mode is a no-op in sql.js (in-memory), but retained for documentation
    // and effective if migrated to native SQLite in the future.
    this.db.run('PRAGMA journal_mode=WAL;');
    this.db.run('PRAGMA synchronous=NORMAL;');
    this.db.run('PRAGMA foreign_keys=ON;');

    // Apply base schema (idempotent)
    this.db.run(SCHEMA_SQL);

    // Check version and apply any pending migrations
    const currentVersion = getSchemaVersion(this.db);
    if (currentVersion < SCHEMA_VERSION) {
      applyMigrations(this.db, currentVersion);
    }

    // Persist the initialized database
    this.saveToDisk();
  }

  /**
   * Flush the in-memory database to disk and close it.
   * Cancels any pending debounced save. Safe to call multiple times.
   */
  close(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.db) {
      this.saveToDisk();
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Return the active Database handle.
   *
   * @throws {Error} If `initialize()` has not been called.
   */
  getDb(): Database {
    if (!this.db) {
      throw new Error('GlobalDB: not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Write the in-memory database to disk immediately.
   *
   * sql.js keeps the entire database in memory and exports a Uint8Array for
   * persistence. This method performs a synchronous file write.
   *
   * Called automatically (debounced) after each write operation.
   */
  saveToDisk(): void {
    if (!this.db) return;
    try {
      const data = this.db.export();
      // Atomic temp-then-rename so a crash mid-write never corrupts the DB file.
      atomicWriteFileSync(this.dbPath, Buffer.from(data));
      // Route the persistence trace to the debug log ONLY — this is the
      // "SQLiteStore: saved to disk" chatter that used to pollute human logs.
      engineLogger().debug('GlobalDB saved to disk', { path: this.dbPath, bytes: data.byteLength });
    } catch (err) {
      engineLogger().error('GlobalDB saveToDisk failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Session CRUD
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Insert or update a session record.
   *
   * Uses `INSERT OR REPLACE` semantics so callers can pass partial updates;
   * fields absent from `session` fall back to their SQL DEFAULT values on
   * insert, or remain unchanged via a coalesce on replace.
   *
   * @param session - Session fields to persist. `session_id` is required.
   */
  upsertSession(session: Partial<GlobalSession> & { session_id: string }): void {
    const db = this.getDb();
    const s = session;
    db.run(
      `INSERT INTO sessions (
        session_id, project_hash, project_path, started_at, ended_at,
        model, total_input_tokens, total_output_tokens,
        total_cache_read_tokens, total_cache_write_tokens,
        total_cost_usd, total_api_calls, total_tool_calls,
        total_native_tool_calls, total_precision_tool_calls,
        total_agent_spawns, status
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(session_id) DO UPDATE SET
        project_hash              = COALESCE(excluded.project_hash, project_hash),
        project_path              = COALESCE(excluded.project_path, project_path),
        started_at                = COALESCE(excluded.started_at, started_at),
        ended_at                  = COALESCE(excluded.ended_at, ended_at),
        model                     = COALESCE(excluded.model, model),
        total_input_tokens        = COALESCE(excluded.total_input_tokens, total_input_tokens),
        total_output_tokens       = COALESCE(excluded.total_output_tokens, total_output_tokens),
        total_cache_read_tokens   = COALESCE(excluded.total_cache_read_tokens, total_cache_read_tokens),
        total_cache_write_tokens  = COALESCE(excluded.total_cache_write_tokens, total_cache_write_tokens),
        total_cost_usd            = COALESCE(excluded.total_cost_usd, total_cost_usd),
        total_api_calls           = COALESCE(excluded.total_api_calls, total_api_calls),
        total_tool_calls          = COALESCE(excluded.total_tool_calls, total_tool_calls),
        total_native_tool_calls   = COALESCE(excluded.total_native_tool_calls, total_native_tool_calls),
        total_precision_tool_calls = COALESCE(excluded.total_precision_tool_calls, total_precision_tool_calls),
        total_agent_spawns        = COALESCE(excluded.total_agent_spawns, total_agent_spawns),
        status                    = COALESCE(excluded.status, status)`,
      [
        s.session_id,
        s.project_hash ?? null,
        s.project_path ?? null,
        s.started_at ?? new Date().toISOString(),
        s.ended_at ?? null,
        s.model ?? 'unknown',
        s.total_input_tokens ?? 0,
        s.total_output_tokens ?? 0,
        s.total_cache_read_tokens ?? 0,
        s.total_cache_write_tokens ?? 0,
        s.total_cost_usd ?? 0,
        s.total_api_calls ?? 0,
        s.total_tool_calls ?? 0,
        s.total_native_tool_calls ?? 0,
        s.total_precision_tool_calls ?? 0,
        s.total_agent_spawns ?? 0,
        s.status ?? 'active',
      ],
    );
    this.scheduleSave();
  }

  /**
   * Retrieve a session by ID, with its tags joined.
   *
   * @param sessionId - The session identifier.
   * @returns The session, or null if not found.
   */
  getSession(sessionId: string): GlobalSession | null {
    const db = this.getDb();
    const rows = rowsToObjects(db.exec('SELECT * FROM sessions WHERE session_id = ?', [sessionId]));
    if (!rows.length) return null;
    const tags = this.getTagsForSession(sessionId).map((t) => t.tag);
    return rowToSession(rows[0]!, tags);
  }

  /**
   * List all sessions for a project, ordered by start time descending.
   *
   * @param projectHash - Hash identifying the project.
   * @returns Array of GlobalSession objects with tags.
   */
  getSessionsByProject(projectHash: string): GlobalSession[] {
    const db = this.getDb();
    const rows = rowsToObjects(
      db.exec('SELECT * FROM sessions WHERE project_hash = ? ORDER BY started_at DESC', [projectHash]),
    );
    const sessionIds = rows.map((row) => String(row['session_id'] ?? ''));
    const tagsMap = this._batchGetTags(sessionIds);
    return rows.map((row) => {
      const sid = String(row['session_id'] ?? '');
      return rowToSession(row, tagsMap.get(sid) ?? []);
    });
  }

  /**
   * List sessions that have ALL of the specified tags.
   *
   * @param tags - Tag strings that must all be present.
   * @returns Array of matching GlobalSession objects.
   */
  getSessionsByTags(tags: string[]): GlobalSession[] {
    if (tags.length === 0) return [];
    const db = this.getDb();
    const placeholders = tags.map(() => '?').join(',');
    const rows = rowsToObjects(
      db.exec(
        `SELECT s.* FROM sessions s
         INNER JOIN tags t ON t.session_id = s.session_id
         WHERE t.tag IN (${placeholders})
         GROUP BY s.session_id
         HAVING COUNT(DISTINCT t.tag) = ?
         ORDER BY s.started_at DESC`,
        [...tags, tags.length],
      ),
    );
    const sessionIds = rows.map((row) => String(row['session_id'] ?? ''));
    const tagsMap = this._batchGetTags(sessionIds);
    return rows.map((row) => {
      const sid = String(row['session_id'] ?? '');
      return rowToSession(row, tagsMap.get(sid) ?? []);
    });
  }

  /**
   * List all sessions with optional filtering and pagination.
   *
   * @param options.limit  - Max rows to return (default: 100).
   * @param options.offset - Rows to skip for pagination (default: 0).
   * @param options.status - Filter by session status (e.g. 'active', 'completed').
   * @returns Array of GlobalSession objects.
   */
  getAllSessions(options?: { limit?: number; offset?: number; status?: string }): GlobalSession[] {
    const db = this.getDb();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const status = options?.status;

    const params: Array<string | number> = [];
    let where = '';
    if (status) {
      where = 'WHERE status = ?';
      params.push(status);
    }
    params.push(limit, offset);

    const rows = rowsToObjects(
      db.exec(
        `SELECT * FROM sessions ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`,
        params,
      ),
    );
    const sessionIds = rows.map((row) => String(row['session_id'] ?? ''));
    const tagsMap = this._batchGetTags(sessionIds);
    return rows.map((row) => {
      const sid = String(row['session_id'] ?? '');
      return rowToSession(row, tagsMap.get(sid) ?? []);
    });
  }

  /**
   * Update the status field of a session.
   *
   * @param sessionId - Session to update.
   * @param status    - New status value ('active' | 'completed' | 'archived').
   */
  updateSessionStatus(sessionId: string, status: string): void {
    const db = this.getDb();
    db.run('UPDATE sessions SET status = ? WHERE session_id = ?', [status, sessionId]);
    this.scheduleSave();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // API Call Recording
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Insert a single API call record.
   *
   * @param call - API call data to persist.
   */
  insertApiCall(call: ApiCallRecord): void {
    const db = this.getDb();
    db.run(
      `INSERT INTO api_calls (
        session_id, timestamp, model, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, cost_usd, duration_ms, stop_reason
      ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        call.session_id, call.timestamp, call.model ?? null,
        call.input_tokens, call.output_tokens,
        call.cache_read_tokens, call.cache_write_tokens,
        call.cost_usd, call.duration_ms, call.stop_reason ?? null,
      ],
    );
    this.scheduleSave();
  }

  /**
   * Retrieve all API calls for a session, ordered by timestamp ascending.
   *
   * @param sessionId - Session identifier.
   * @returns Array of ApiCallRecord objects.
   */
  getApiCalls(sessionId: string): ApiCallRecord[] {
    const db = this.getDb();
    const rows = rowsToObjects(
      db.exec('SELECT * FROM api_calls WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]),
    );
    return rows.map(rowToApiCall);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tool Summary CRUD
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Insert or update a tool summary record.
   *
   * On conflict (same session + tool), all numeric counters are added to
   * the existing row (accumulate pattern).
   *
   * @param summary - Tool summary data to persist or accumulate.
   */
  upsertToolSummary(summary: ToolSummaryRecord): void {
    const db = this.getDb();
    db.run(
      `INSERT INTO tool_summaries (
        session_id, tool_name, call_count, success_count, error_count,
        total_duration_ms, total_input_tokens, total_output_tokens
      ) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(session_id, tool_name) DO UPDATE SET
        call_count          = call_count + excluded.call_count,
        success_count       = success_count + excluded.success_count,
        error_count         = error_count + excluded.error_count,
        total_duration_ms   = total_duration_ms + excluded.total_duration_ms,
        total_input_tokens  = total_input_tokens + excluded.total_input_tokens,
        total_output_tokens = total_output_tokens + excluded.total_output_tokens`,
      [
        summary.session_id, summary.tool_name,
        summary.call_count, summary.success_count, summary.error_count,
        summary.total_duration_ms, summary.total_input_tokens, summary.total_output_tokens,
      ],
    );
    this.scheduleSave();
  }

  /**
   * Retrieve all tool summaries for a session.
   *
   * @param sessionId - Session identifier.
   * @returns Array of ToolSummaryRecord objects.
   */
  getToolSummaries(sessionId: string): ToolSummaryRecord[] {
    const db = this.getDb();
    const rows = rowsToObjects(
      db.exec('SELECT * FROM tool_summaries WHERE session_id = ?', [sessionId]),
    );
    return rows.map(rowToToolSummary);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Agent CRUD
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Insert or update an agent record.
   *
   * @param agent - Agent data to persist.
   */
  upsertAgent(agent: AgentRecord): void {
    const db = this.getDb();
    db.run(
      `INSERT INTO agents (
        session_id, agent_id, agent_type, parent_session_id, model,
        spawned_at, completed_at, total_tokens, duration_ms, exit_code
      ) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(session_id, agent_id) DO UPDATE SET
        agent_type        = COALESCE(excluded.agent_type, agent_type),
        parent_session_id = COALESCE(excluded.parent_session_id, parent_session_id),
        model             = COALESCE(excluded.model, model),
        completed_at      = COALESCE(excluded.completed_at, completed_at),
        total_tokens      = COALESCE(excluded.total_tokens, total_tokens),
        duration_ms       = COALESCE(excluded.duration_ms, duration_ms),
        exit_code         = COALESCE(excluded.exit_code, exit_code)`,
      [
        agent.session_id, agent.agent_id, agent.agent_type ?? null,
        agent.parent_session_id ?? null, agent.model ?? null,
        agent.spawned_at, agent.completed_at ?? null,
        agent.total_tokens, agent.duration_ms, agent.exit_code ?? null,
      ],
    );
    this.scheduleSave();
  }

  /**
   * Retrieve all agent records for a session.
   *
   * @param sessionId - Session identifier.
   * @returns Array of AgentRecord objects.
   */
  getAgents(sessionId: string): AgentRecord[] {
    const db = this.getDb();
    const rows = rowsToObjects(
      db.exec('SELECT * FROM agents WHERE session_id = ?', [sessionId]),
    );
    return rows.map(rowToAgent);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tag CRUD
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Add a tag to a session. Silently ignores duplicate tags.
   *
   * @param sessionId - Session to tag.
   * @param tag       - Tag string to add.
   * @param source    - Origin of the tag ('manual' | 'auto'). Defaults to 'manual'.
   */
  addTag(sessionId: string, tag: string, source: 'manual' | 'auto' = 'manual'): void {
    const db = this.getDb();
    db.run(
      `INSERT OR IGNORE INTO tags (session_id, tag, source) VALUES (?, ?, ?)`,
      [sessionId, tag, source],
    );
    this.scheduleSave();
  }

  /**
   * Remove a tag from a session.
   *
   * @param sessionId - Session to remove the tag from.
   * @param tag       - Tag string to remove.
   */
  removeTag(sessionId: string, tag: string): void {
    const db = this.getDb();
    db.run('DELETE FROM tags WHERE session_id = ? AND tag = ?', [sessionId, tag]);
    this.scheduleSave();
  }

  /**
   * Retrieve all tags for a session, ordered by creation time.
   *
   * @param sessionId - Session identifier.
   * @returns Array of TagEntry objects.
   */
  getTagsForSession(sessionId: string): TagEntry[] {
    const db = this.getDb();
    const rows = rowsToObjects(
      db.exec(
        'SELECT tag, session_id, created_at, source FROM tags WHERE session_id = ? ORDER BY created_at ASC',
        [sessionId],
      ),
    );
    return rows.map((row) => ({
      tag:        String(row['tag'] ?? ''),
      session_id: String(row['session_id'] ?? ''),
      created_at: String(row['created_at'] ?? ''),
      source:     (String(row['source'] ?? 'manual')) as TagEntry['source'],
    }));
  }

  /**
   * Retrieve all session IDs associated with a tag.
   *
   * @param tag - Tag string to look up.
   * @returns Array of session_id strings.
   */
  getSessionsByTag(tag: string): string[] {
    const db = this.getDb();
    const rows = rowsToObjects(
      db.exec('SELECT session_id FROM tags WHERE tag = ?', [tag]),
    );
    return rows.map((row) => String(row['session_id'] ?? ''));
  }

  /**
   * List all unique tags with their usage counts, ordered by count descending.
   *
   * @returns Array of `{ tag, count }` objects.
   */
  getAllTags(): Array<{ tag: string; count: number }> {
    const db = this.getDb();
    const rows = rowsToObjects(
      db.exec('SELECT tag, COUNT(*) AS count FROM tags GROUP BY tag ORDER BY count DESC'),
    );
    return rows.map((row) => ({
      tag:   String(row['tag'] ?? ''),
      count: Number(row['count'] ?? 0),
    }));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Sync State
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Retrieve sync state for a JSONL file path.
   *
   * @param jsonlPath - Absolute path to the JSONL file being tracked.
   * @returns SyncStateRecord, or null if not yet tracked.
   */
  getSyncState(jsonlPath: string): SyncStateRecord | null {
    const db = this.getDb();
    const rows = rowsToObjects(
      db.exec('SELECT * FROM sync_state WHERE jsonl_path = ?', [jsonlPath]),
    );
    if (!rows.length) return null;
    const row = rows[0]!;
    return {
      jsonl_path:     String(row['jsonl_path'] ?? ''),
      session_id:     String(row['session_id'] ?? ''),
      last_offset:    Number(row['last_offset'] ?? 0),
      last_synced_at: String(row['last_synced_at'] ?? ''),
    };
  }

  /**
   * Insert or update sync state for a JSONL file.
   *
   * @param state - Sync state record to persist.
   */
  upsertSyncState(state: SyncStateRecord): void {
    const db = this.getDb();
    db.run(
      `INSERT INTO sync_state (jsonl_path, session_id, last_offset, last_synced_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(jsonl_path) DO UPDATE SET
         session_id     = excluded.session_id,
         last_offset    = excluded.last_offset,
         last_synced_at = excluded.last_synced_at`,
      [state.jsonl_path, state.session_id, state.last_offset, state.last_synced_at],
    );
    this.scheduleSave();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Batch Operations
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Bulk-insert API call records inside a single transaction.
   *
   * Significantly faster than individual `insertApiCall` calls for large
   * batches (e.g. initial JSONL sync).
   *
   * @param calls - Array of API call records to insert.
   */
  batchInsertApiCalls(calls: ApiCallRecord[]): void {
    if (calls.length === 0) return;
    const db = this.getDb();
    db.run('BEGIN');
    try {
      for (const call of calls) {
        db.run(
          `INSERT INTO api_calls (
            session_id, timestamp, model, input_tokens, output_tokens,
            cache_read_tokens, cache_write_tokens, cost_usd, duration_ms, stop_reason
          ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            call.session_id, call.timestamp, call.model ?? null,
            call.input_tokens, call.output_tokens,
            call.cache_read_tokens, call.cache_write_tokens,
            call.cost_usd, call.duration_ms, call.stop_reason ?? null,
          ],
        );
      }
      db.run('COMMIT');
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }
    this.scheduleSave();
  }

  /**
   * Bulk-upsert session records inside a single transaction.
   *
   * @param sessions - Array of partial session objects to upsert.
   */
  batchUpsertSessions(
    sessions: Array<Partial<GlobalSession> & { session_id: string }>,
  ): void {
    if (sessions.length === 0) return;
    const db = this.getDb();
    db.run('BEGIN');
    try {
      for (const session of sessions) {
        const s = session;
        db.run(
          `INSERT INTO sessions (
            session_id, project_hash, project_path, started_at, ended_at,
            model, total_input_tokens, total_output_tokens,
            total_cache_read_tokens, total_cache_write_tokens,
            total_cost_usd, total_api_calls, total_tool_calls,
            total_native_tool_calls, total_precision_tool_calls,
            total_agent_spawns, status
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(session_id) DO UPDATE SET
            project_hash              = COALESCE(excluded.project_hash, project_hash),
            project_path              = COALESCE(excluded.project_path, project_path),
            started_at                = COALESCE(excluded.started_at, started_at),
            ended_at                  = COALESCE(excluded.ended_at, ended_at),
            model                     = COALESCE(excluded.model, model),
            total_input_tokens        = COALESCE(excluded.total_input_tokens, total_input_tokens),
            total_output_tokens       = COALESCE(excluded.total_output_tokens, total_output_tokens),
            total_cache_read_tokens   = COALESCE(excluded.total_cache_read_tokens, total_cache_read_tokens),
            total_cache_write_tokens  = COALESCE(excluded.total_cache_write_tokens, total_cache_write_tokens),
            total_cost_usd            = COALESCE(excluded.total_cost_usd, total_cost_usd),
            total_api_calls           = COALESCE(excluded.total_api_calls, total_api_calls),
            total_tool_calls          = COALESCE(excluded.total_tool_calls, total_tool_calls),
            total_native_tool_calls   = COALESCE(excluded.total_native_tool_calls, total_native_tool_calls),
            total_precision_tool_calls = COALESCE(excluded.total_precision_tool_calls, total_precision_tool_calls),
            total_agent_spawns        = COALESCE(excluded.total_agent_spawns, total_agent_spawns),
            status                    = COALESCE(excluded.status, status)`,
          [
            s.session_id, s.project_hash ?? null, s.project_path ?? null,
            s.started_at ?? new Date().toISOString(), s.ended_at ?? null,
            s.model ?? 'unknown',
            s.total_input_tokens ?? 0, s.total_output_tokens ?? 0,
            s.total_cache_read_tokens ?? 0, s.total_cache_write_tokens ?? 0,
            s.total_cost_usd ?? 0, s.total_api_calls ?? 0, s.total_tool_calls ?? 0,
            s.total_native_tool_calls ?? 0, s.total_precision_tool_calls ?? 0,
            s.total_agent_spawns ?? 0, s.status ?? 'active',
          ],
        );
      }
      db.run('COMMIT');
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }
    this.scheduleSave();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Aggregate Queries
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Sum total cost for all sessions belonging to a project.
   *
   * @param projectHash - Project identifier hash.
   * @returns Total cost in USD as a number.
   */
  getTotalCostByProject(projectHash: string): number {
    const db = this.getDb();
    const rows = rowsToObjects(
      db.exec(
        'SELECT COALESCE(SUM(total_cost_usd), 0) AS total FROM sessions WHERE project_hash = ?',
        [projectHash],
      ),
    );
    return Number(rows[0]?.['total'] ?? 0);
  }

  /**
   * Sum total cost across all projects.
   *
   * @returns Total cost in USD as a number.
   */
  getTotalCostAllProjects(): number {
    const db = this.getDb();
    const rows = rowsToObjects(
      db.exec('SELECT COALESCE(SUM(total_cost_usd), 0) AS total FROM sessions'),
    );
    return Number(rows[0]?.['total'] ?? 0);
  }

  /**
   * Count the number of sessions for a project.
   *
   * @param projectHash - Project identifier hash.
   * @returns Session count.
   */
  getSessionCountByProject(projectHash: string): number {
    const db = this.getDb();
    const rows = rowsToObjects(
      db.exec(
        'SELECT COUNT(*) AS cnt FROM sessions WHERE project_hash = ?',
        [projectHash],
      ),
    );
    return Number(rows[0]?.['cnt'] ?? 0);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Batch-fetch tags for multiple sessions in a single query, eliminating N+1.
   *
   * @param sessionIds - Array of session IDs to fetch tags for.
   * @returns Map of session_id to array of tag strings.
   */
  private _batchGetTags(sessionIds: string[]): Map<string, string[]> {
    const result = new Map<string, string[]>();
    if (sessionIds.length === 0) return result;
    const db = this.getDb();
    const placeholders = sessionIds.map(() => '?').join(',');
    const rows = rowsToObjects(
      db.exec(
        `SELECT session_id, tag FROM tags WHERE session_id IN (${placeholders}) ORDER BY created_at ASC`,
        sessionIds,
      ),
    );
    for (const row of rows) {
      const sid = String(row['session_id'] ?? '');
      const tag = String(row['tag'] ?? '');
      const existing = result.get(sid);
      if (existing) {
        existing.push(tag);
      } else {
        result.set(sid, [tag]);
      }
    }
    return result;
  }

  /**
   * Schedule a debounced disk save.
   *
   * Multiple writes within `SAVE_DEBOUNCE_MS` will be coalesced into a
   * single disk write, reducing I/O pressure during bulk operations.
   */
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveToDisk();
    }, SAVE_DEBOUNCE_MS);
    // Debounced flush must never hold the event loop open (field issue 9).
    this.saveTimer.unref?.();
  }

  /**
   * Dynamically load the sql.js module.
   *
   * Handles both ESM (import()) and CJS (require()) environments by trying
   * dynamic import first, then falling back to require().
   *
   * @returns The initSqlJs function.
   */
  private async loadSqlJs(): Promise<(config: { locateFile: () => string }) => Promise<SqlJsStatic>> {
    try {
      // ESM / bundled path
      const mod = await import('sql.js') as { default: typeof import('sql.js') };
      return mod.default as unknown as (config: { locateFile: () => string }) => Promise<SqlJsStatic>;
    } catch {
      // CJS fallback — safe because esbuild bundles to CJS format
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('sql.js') as { default?: unknown };
      const initFn = (mod.default ?? mod) as (config: { locateFile: () => string }) => Promise<SqlJsStatic>;
      return initFn;
    }
  }

  /**
   * Resolve the path to the sql-wasm.wasm file.
   *
   * Search order:
   *   1. Adjacent to this file in the dist/ directory (bundled plugin installs).
   *   2. node_modules/sql.js/dist/ (development installs).
   *
   * @returns Absolute path to sql-wasm.wasm.
   */
  private resolveWasmPath(): string {
    // __dirname is available in CJS bundles. For ESM, fall back to a known
    // relative path from the working directory.
    let baseDir: string;
    try {
      // CJS: __dirname is defined
      baseDir = __dirname;
    } catch {
      // ESM: use process.cwd() as fallback
      baseDir = process.cwd();
    }

    // Option 1: wasm/ subdirectory beside the bundle — the v2 shipped layout
    // (build.mjs copies sql-wasm.wasm to server/<name>/wasm/). This candidate
    // was missing in the v1-ported resolver and crashed the first live query.
    const subdirWasm = resolve(join(baseDir, 'wasm', 'sql-wasm.wasm'));
    if (existsSync(subdirWasm)) return subdirWasm;

    // Option 2: bare sibling (v1's flat dist layout)
    const distWasm = resolve(join(baseDir, 'sql-wasm.wasm'));
    if (existsSync(distWasm)) return distWasm;

    // Option 3: node_modules (development)
    const nodeWasm = resolve(join(baseDir, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'));
    if (existsSync(nodeWasm)) return nodeWasm;

    // Last resort: let sql.js use its own default resolution
    return resolve(join(baseDir, 'sql-wasm.wasm'));
  }
}
