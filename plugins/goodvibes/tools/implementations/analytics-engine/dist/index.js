var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/types.ts
function toolResponse(text2, isError = false) {
  const response = { content: [{ type: "text", text: text2 }] };
  if (isError) response.isError = true;
  return response;
}
var DEFAULT_CONFIG;
var init_types = __esm({
  "src/types.ts"() {
    "use strict";
    DEFAULT_CONFIG = {
      enabled: true,
      auto_start_mini: true,
      auto_start_full: false,
      auto_start_dashboard: false,
      refresh_rate_ms: 2e3,
      full_tui_refresh_rate_ms: 5e3,
      dashboard_refresh_rate_ms: 5e3,
      cost_per_1k_input_tokens: 3e-3,
      cost_per_1k_output_tokens: 0.015,
      budget: null,
      budget_warn_thresholds: [0.5, 0.8, 1],
      mini_budget_bar: false,
      anomaly_detection: true,
      auto_report_on_shutdown: true,
      webhook_url: null,
      webhook_events: ["session_end"],
      global_db_path: "~/.claude/.goodvibes/analytics/analytics.db",
      jsonl_base_path: "~/.claude/projects",
      tmux: {
        mini_pane_size: 5,
        mini_position: "bottom",
        full_pane_size: "60%",
        dashboard_pane_size: "60%",
        full_position: "right",
        dashboard_position: "right"
      }
    };
    __name(toolResponse, "toolResponse");
  }
});

// src/config.ts
import {
  readFileSync,
  writeFileSync,
  existsSync,
  watchFile,
  unwatchFile
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
function tryLoadFile(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ...DEFAULT_CONFIG, ...parsed };
    }
    return { ...DEFAULT_CONFIG };
  } catch (err) {
    console.warn(
      `[analytics] Config load failed for ${filePath}, using defaults:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}
function loadConfig(goodvibesDir) {
  const globalConfig = tryLoadFile(GLOBAL_CONFIG_PATH);
  if (globalConfig) return globalConfig;
  const projectConfig = tryLoadFile(join(goodvibesDir, "analytics.json"));
  if (projectConfig) return projectConfig;
  return { ...DEFAULT_CONFIG };
}
var GLOBAL_CONFIG_PATH;
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    init_types();
    GLOBAL_CONFIG_PATH = join(
      homedir(),
      ".claude",
      ".goodvibes",
      "analytics",
      "analytics.json"
    );
    __name(tryLoadFile, "tryLoadFile");
    __name(loadConfig, "loadConfig");
  }
});

// src/data/db-schema.ts
function getSchemaVersion(db) {
  try {
    const result = db.exec(
      "SELECT MAX(version) AS v FROM schema_version"
    );
    const row = result[0]?.values[0];
    if (!row || row[0] === null || row[0] === void 0) return 0;
    const v = Number(row[0]);
    return isNaN(v) ? 0 : v;
  } catch {
    return 0;
  }
}
function applyMigrations(db, fromVersion) {
  for (let v = fromVersion + 1; v <= SCHEMA_VERSION; v++) {
    const sql = MIGRATIONS.get(v);
    if (!sql) {
      db.run(
        `INSERT OR IGNORE INTO schema_version (version, description) VALUES (?, 'baseline')`,
        [v]
      );
      continue;
    }
    db.run(`SAVEPOINT migration_v${v}`);
    try {
      db.run(sql);
      db.run(
        "INSERT OR IGNORE INTO schema_version (version, description) VALUES (?, ?)",
        [v, `migration from v${v - 1} to v${v}`]
      );
      db.run(`RELEASE SAVEPOINT migration_v${v}`);
    } catch (err) {
      db.run(`ROLLBACK TO SAVEPOINT migration_v${v}`);
      throw new Error(
        `Schema migration to v${v} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
var SCHEMA_VERSION, SCHEMA_SQL, MIGRATIONS;
var init_db_schema = __esm({
  "src/data/db-schema.ts"() {
    "use strict";
    SCHEMA_VERSION = 1;
    SCHEMA_SQL = `
-- Sessions: one row per Claude session, all projects
CREATE TABLE IF NOT EXISTS sessions (
  session_id                TEXT PRIMARY KEY,
  project_hash              TEXT NOT NULL,
  project_path              TEXT,
  started_at                TEXT NOT NULL,
  ended_at                  TEXT,
  model                     TEXT DEFAULT 'unknown',
  total_input_tokens        INTEGER DEFAULT 0,
  total_output_tokens       INTEGER DEFAULT 0,
  total_cache_read_tokens   INTEGER DEFAULT 0,
  total_cache_write_tokens  INTEGER DEFAULT 0,
  total_cost_usd            REAL DEFAULT 0,
  total_api_calls           INTEGER DEFAULT 0,
  total_tool_calls          INTEGER DEFAULT 0,
  total_native_tool_calls   INTEGER DEFAULT 0,
  total_precision_tool_calls INTEGER DEFAULT 0,
  total_agent_spawns        INTEGER DEFAULT 0,
  status                    TEXT DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status  ON sessions(status);

-- Tags: many-to-many session \u2194 tag relationship
CREATE TABLE IF NOT EXISTS tags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  source      TEXT NOT NULL DEFAULT 'manual',
  UNIQUE(session_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_tags_tag     ON tags(tag);
CREATE INDEX IF NOT EXISTS idx_tags_session ON tags(session_id);

-- Tool summaries: per-session per-tool aggregates
CREATE TABLE IF NOT EXISTS tool_summaries (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id           TEXT    NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  tool_name            TEXT    NOT NULL,
  call_count           INTEGER DEFAULT 0,
  success_count        INTEGER DEFAULT 0,
  error_count          INTEGER DEFAULT 0,
  total_duration_ms    INTEGER DEFAULT 0,
  total_input_tokens   INTEGER DEFAULT 0,
  total_output_tokens  INTEGER DEFAULT 0,
  UNIQUE(session_id, tool_name)
);
CREATE INDEX IF NOT EXISTS idx_tool_summaries_session ON tool_summaries(session_id);

-- API calls: individual records for trend analysis and cost breakdown
CREATE TABLE IF NOT EXISTS api_calls (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id          TEXT    NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  timestamp           TEXT    NOT NULL,
  model               TEXT,
  input_tokens        INTEGER DEFAULT 0,
  output_tokens       INTEGER DEFAULT 0,
  cache_read_tokens   INTEGER DEFAULT 0,
  cache_write_tokens  INTEGER DEFAULT 0,
  cost_usd            REAL    DEFAULT 0,
  duration_ms         INTEGER DEFAULT 0,
  stop_reason         TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_calls_session   ON api_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_api_calls_timestamp ON api_calls(timestamp);

-- Agent activity: spawned subagents with timing and token usage
CREATE TABLE IF NOT EXISTS agents (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id        TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  agent_id          TEXT NOT NULL,
  agent_type        TEXT,
  parent_session_id TEXT,
  model             TEXT,
  spawned_at        TEXT NOT NULL,
  completed_at      TEXT,
  total_tokens      INTEGER DEFAULT 0,
  duration_ms       INTEGER DEFAULT 0,
  exit_code         INTEGER,
  UNIQUE(session_id, agent_id)
);
CREATE INDEX IF NOT EXISTS idx_agents_session ON agents(session_id);

-- Sync state: tracks which JSONL files have been processed
CREATE TABLE IF NOT EXISTS sync_state (
  jsonl_path      TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  last_offset     INTEGER DEFAULT 0,
  last_synced_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Schema version tracking for future migrations
CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  description TEXT
);
`;
    MIGRATIONS = /* @__PURE__ */ new Map();
    __name(getSchemaVersion, "getSchemaVersion");
    __name(applyMigrations, "applyMigrations");
  }
});

// src/data/global-db.ts
import { readFileSync as readFileSync6, writeFileSync as writeFileSync3, existsSync as existsSync7 } from "node:fs";
import { join as join10, resolve } from "node:path";
function rowsToObjects(result) {
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i] ?? null;
    });
    return obj;
  });
}
function rowToSession(row, tags) {
  return {
    session_id: String(row["session_id"] ?? ""),
    project_hash: String(row["project_hash"] ?? ""),
    project_path: row["project_path"] != null ? String(row["project_path"]) : void 0,
    started_at: String(row["started_at"] ?? ""),
    ended_at: row["ended_at"] != null ? String(row["ended_at"]) : void 0,
    model: String(row["model"] ?? "unknown"),
    total_input_tokens: Number(row["total_input_tokens"] ?? 0),
    total_output_tokens: Number(row["total_output_tokens"] ?? 0),
    total_cache_read_tokens: Number(row["total_cache_read_tokens"] ?? 0),
    total_cache_write_tokens: Number(row["total_cache_write_tokens"] ?? 0),
    total_cost_usd: Number(row["total_cost_usd"] ?? 0),
    total_api_calls: Number(row["total_api_calls"] ?? 0),
    total_tool_calls: Number(row["total_tool_calls"] ?? 0),
    total_native_tool_calls: Number(row["total_native_tool_calls"] ?? 0),
    total_precision_tool_calls: Number(row["total_precision_tool_calls"] ?? 0),
    total_agent_spawns: Number(row["total_agent_spawns"] ?? 0),
    tags,
    status: String(row["status"] ?? "active")
  };
}
function rowToApiCall(row) {
  return {
    session_id: String(row["session_id"] ?? ""),
    timestamp: String(row["timestamp"] ?? ""),
    model: row["model"] != null ? String(row["model"]) : void 0,
    input_tokens: Number(row["input_tokens"] ?? 0),
    output_tokens: Number(row["output_tokens"] ?? 0),
    cache_read_tokens: Number(row["cache_read_tokens"] ?? 0),
    cache_write_tokens: Number(row["cache_write_tokens"] ?? 0),
    cost_usd: Number(row["cost_usd"] ?? 0),
    duration_ms: Number(row["duration_ms"] ?? 0),
    stop_reason: row["stop_reason"] != null ? String(row["stop_reason"]) : void 0
  };
}
function rowToToolSummary(row) {
  return {
    session_id: String(row["session_id"] ?? ""),
    tool_name: String(row["tool_name"] ?? ""),
    call_count: Number(row["call_count"] ?? 0),
    success_count: Number(row["success_count"] ?? 0),
    error_count: Number(row["error_count"] ?? 0),
    total_duration_ms: Number(row["total_duration_ms"] ?? 0),
    total_input_tokens: Number(row["total_input_tokens"] ?? 0),
    total_output_tokens: Number(row["total_output_tokens"] ?? 0)
  };
}
function rowToAgent(row) {
  return {
    session_id: String(row["session_id"] ?? ""),
    agent_id: String(row["agent_id"] ?? ""),
    agent_type: row["agent_type"] != null ? String(row["agent_type"]) : void 0,
    parent_session_id: row["parent_session_id"] != null ? String(row["parent_session_id"]) : void 0,
    model: row["model"] != null ? String(row["model"]) : void 0,
    spawned_at: String(row["spawned_at"] ?? ""),
    completed_at: row["completed_at"] != null ? String(row["completed_at"]) : void 0,
    total_tokens: Number(row["total_tokens"] ?? 0),
    duration_ms: Number(row["duration_ms"] ?? 0),
    exit_code: row["exit_code"] != null ? Number(row["exit_code"]) : void 0
  };
}
var SAVE_DEBOUNCE_MS, GlobalDB;
var init_global_db = __esm({
  "src/data/global-db.ts"() {
    "use strict";
    init_db_schema();
    SAVE_DEBOUNCE_MS = 500;
    __name(rowsToObjects, "rowsToObjects");
    __name(rowToSession, "rowToSession");
    __name(rowToApiCall, "rowToApiCall");
    __name(rowToToolSummary, "rowToToolSummary");
    __name(rowToAgent, "rowToAgent");
    GlobalDB = class {
      static {
        __name(this, "GlobalDB");
      }
      dbPath;
      db = null;
      SQL = null;
      saveTimer = null;
      /**
       * @param dbPath - Absolute path to the SQLite database file.
       */
      constructor(dbPath) {
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
      async initialize() {
        const initSqlJs2 = await this.loadSqlJs();
        const wasmPath = this.resolveWasmPath();
        this.SQL = await initSqlJs2({ locateFile: /* @__PURE__ */ __name(() => wasmPath, "locateFile") });
        if (existsSync7(this.dbPath)) {
          const buffer = readFileSync6(this.dbPath);
          this.db = new this.SQL.Database(buffer);
        } else {
          this.db = new this.SQL.Database();
        }
        this.db.run("PRAGMA journal_mode=WAL;");
        this.db.run("PRAGMA synchronous=NORMAL;");
        this.db.run("PRAGMA foreign_keys=ON;");
        this.db.run(SCHEMA_SQL);
        const currentVersion = getSchemaVersion(this.db);
        if (currentVersion < SCHEMA_VERSION) {
          applyMigrations(this.db, currentVersion);
        }
        this.saveToDisk();
      }
      /**
       * Flush the in-memory database to disk and close it.
       * Cancels any pending debounced save. Safe to call multiple times.
       */
      close() {
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
      getDb() {
        if (!this.db) {
          throw new Error("GlobalDB: not initialized. Call initialize() first.");
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
      saveToDisk() {
        if (!this.db) return;
        try {
          const data = this.db.export();
          writeFileSync3(this.dbPath, Buffer.from(data));
        } catch (err) {
          console.error(
            "[GlobalDB] saveToDisk failed:",
            err instanceof Error ? err.message : String(err)
          );
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
      upsertSession(session) {
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
            s.started_at ?? (/* @__PURE__ */ new Date()).toISOString(),
            s.ended_at ?? null,
            s.model ?? "unknown",
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
            s.status ?? "active"
          ]
        );
        this.scheduleSave();
      }
      /**
       * Retrieve a session by ID, with its tags joined.
       *
       * @param sessionId - The session identifier.
       * @returns The session, or null if not found.
       */
      getSession(sessionId) {
        const db = this.getDb();
        const rows = rowsToObjects(db.exec("SELECT * FROM sessions WHERE session_id = ?", [sessionId]));
        if (!rows.length) return null;
        const tags = this.getTagsForSession(sessionId).map((t) => t.tag);
        return rowToSession(rows[0], tags);
      }
      /**
       * List all sessions for a project, ordered by start time descending.
       *
       * @param projectHash - Hash identifying the project.
       * @returns Array of GlobalSession objects with tags.
       */
      getSessionsByProject(projectHash) {
        const db = this.getDb();
        const rows = rowsToObjects(
          db.exec("SELECT * FROM sessions WHERE project_hash = ? ORDER BY started_at DESC", [projectHash])
        );
        const sessionIds = rows.map((row) => String(row["session_id"] ?? ""));
        const tagsMap = this._batchGetTags(sessionIds);
        return rows.map((row) => {
          const sid = String(row["session_id"] ?? "");
          return rowToSession(row, tagsMap.get(sid) ?? []);
        });
      }
      /**
       * List sessions that have ALL of the specified tags.
       *
       * @param tags - Tag strings that must all be present.
       * @returns Array of matching GlobalSession objects.
       */
      getSessionsByTags(tags) {
        if (tags.length === 0) return [];
        const db = this.getDb();
        const placeholders = tags.map(() => "?").join(",");
        const rows = rowsToObjects(
          db.exec(
            `SELECT s.* FROM sessions s
         INNER JOIN tags t ON t.session_id = s.session_id
         WHERE t.tag IN (${placeholders})
         GROUP BY s.session_id
         HAVING COUNT(DISTINCT t.tag) = ?
         ORDER BY s.started_at DESC`,
            [...tags, tags.length]
          )
        );
        const sessionIds = rows.map((row) => String(row["session_id"] ?? ""));
        const tagsMap = this._batchGetTags(sessionIds);
        return rows.map((row) => {
          const sid = String(row["session_id"] ?? "");
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
      getAllSessions(options) {
        const db = this.getDb();
        const limit = options?.limit ?? 100;
        const offset = options?.offset ?? 0;
        const status = options?.status;
        const params = [];
        let where = "";
        if (status) {
          where = "WHERE status = ?";
          params.push(status);
        }
        params.push(limit, offset);
        const rows = rowsToObjects(
          db.exec(
            `SELECT * FROM sessions ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`,
            params
          )
        );
        const sessionIds = rows.map((row) => String(row["session_id"] ?? ""));
        const tagsMap = this._batchGetTags(sessionIds);
        return rows.map((row) => {
          const sid = String(row["session_id"] ?? "");
          return rowToSession(row, tagsMap.get(sid) ?? []);
        });
      }
      /**
       * Update the status field of a session.
       *
       * @param sessionId - Session to update.
       * @param status    - New status value ('active' | 'completed' | 'archived').
       */
      updateSessionStatus(sessionId, status) {
        const db = this.getDb();
        db.run("UPDATE sessions SET status = ? WHERE session_id = ?", [status, sessionId]);
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
      insertApiCall(call) {
        const db = this.getDb();
        db.run(
          `INSERT INTO api_calls (
        session_id, timestamp, model, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, cost_usd, duration_ms, stop_reason
      ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            call.session_id,
            call.timestamp,
            call.model ?? null,
            call.input_tokens,
            call.output_tokens,
            call.cache_read_tokens,
            call.cache_write_tokens,
            call.cost_usd,
            call.duration_ms,
            call.stop_reason ?? null
          ]
        );
        this.scheduleSave();
      }
      /**
       * Retrieve all API calls for a session, ordered by timestamp ascending.
       *
       * @param sessionId - Session identifier.
       * @returns Array of ApiCallRecord objects.
       */
      getApiCalls(sessionId) {
        const db = this.getDb();
        const rows = rowsToObjects(
          db.exec("SELECT * FROM api_calls WHERE session_id = ? ORDER BY timestamp ASC", [sessionId])
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
      upsertToolSummary(summary) {
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
            summary.session_id,
            summary.tool_name,
            summary.call_count,
            summary.success_count,
            summary.error_count,
            summary.total_duration_ms,
            summary.total_input_tokens,
            summary.total_output_tokens
          ]
        );
        this.scheduleSave();
      }
      /**
       * Retrieve all tool summaries for a session.
       *
       * @param sessionId - Session identifier.
       * @returns Array of ToolSummaryRecord objects.
       */
      getToolSummaries(sessionId) {
        const db = this.getDb();
        const rows = rowsToObjects(
          db.exec("SELECT * FROM tool_summaries WHERE session_id = ?", [sessionId])
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
      upsertAgent(agent) {
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
            agent.session_id,
            agent.agent_id,
            agent.agent_type ?? null,
            agent.parent_session_id ?? null,
            agent.model ?? null,
            agent.spawned_at,
            agent.completed_at ?? null,
            agent.total_tokens,
            agent.duration_ms,
            agent.exit_code ?? null
          ]
        );
        this.scheduleSave();
      }
      /**
       * Retrieve all agent records for a session.
       *
       * @param sessionId - Session identifier.
       * @returns Array of AgentRecord objects.
       */
      getAgents(sessionId) {
        const db = this.getDb();
        const rows = rowsToObjects(
          db.exec("SELECT * FROM agents WHERE session_id = ?", [sessionId])
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
      addTag(sessionId, tag, source = "manual") {
        const db = this.getDb();
        db.run(
          `INSERT OR IGNORE INTO tags (session_id, tag, source) VALUES (?, ?, ?)`,
          [sessionId, tag, source]
        );
        this.scheduleSave();
      }
      /**
       * Remove a tag from a session.
       *
       * @param sessionId - Session to remove the tag from.
       * @param tag       - Tag string to remove.
       */
      removeTag(sessionId, tag) {
        const db = this.getDb();
        db.run("DELETE FROM tags WHERE session_id = ? AND tag = ?", [sessionId, tag]);
        this.scheduleSave();
      }
      /**
       * Retrieve all tags for a session, ordered by creation time.
       *
       * @param sessionId - Session identifier.
       * @returns Array of TagEntry objects.
       */
      getTagsForSession(sessionId) {
        const db = this.getDb();
        const rows = rowsToObjects(
          db.exec(
            "SELECT tag, session_id, created_at, source FROM tags WHERE session_id = ? ORDER BY created_at ASC",
            [sessionId]
          )
        );
        return rows.map((row) => ({
          tag: String(row["tag"] ?? ""),
          session_id: String(row["session_id"] ?? ""),
          created_at: String(row["created_at"] ?? ""),
          source: String(row["source"] ?? "manual")
        }));
      }
      /**
       * Retrieve all session IDs associated with a tag.
       *
       * @param tag - Tag string to look up.
       * @returns Array of session_id strings.
       */
      getSessionsByTag(tag) {
        const db = this.getDb();
        const rows = rowsToObjects(
          db.exec("SELECT session_id FROM tags WHERE tag = ?", [tag])
        );
        return rows.map((row) => String(row["session_id"] ?? ""));
      }
      /**
       * List all unique tags with their usage counts, ordered by count descending.
       *
       * @returns Array of `{ tag, count }` objects.
       */
      getAllTags() {
        const db = this.getDb();
        const rows = rowsToObjects(
          db.exec("SELECT tag, COUNT(*) AS count FROM tags GROUP BY tag ORDER BY count DESC")
        );
        return rows.map((row) => ({
          tag: String(row["tag"] ?? ""),
          count: Number(row["count"] ?? 0)
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
      getSyncState(jsonlPath) {
        const db = this.getDb();
        const rows = rowsToObjects(
          db.exec("SELECT * FROM sync_state WHERE jsonl_path = ?", [jsonlPath])
        );
        if (!rows.length) return null;
        const row = rows[0];
        return {
          jsonl_path: String(row["jsonl_path"] ?? ""),
          session_id: String(row["session_id"] ?? ""),
          last_offset: Number(row["last_offset"] ?? 0),
          last_synced_at: String(row["last_synced_at"] ?? "")
        };
      }
      /**
       * Insert or update sync state for a JSONL file.
       *
       * @param state - Sync state record to persist.
       */
      upsertSyncState(state) {
        const db = this.getDb();
        db.run(
          `INSERT INTO sync_state (jsonl_path, session_id, last_offset, last_synced_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(jsonl_path) DO UPDATE SET
         session_id     = excluded.session_id,
         last_offset    = excluded.last_offset,
         last_synced_at = excluded.last_synced_at`,
          [state.jsonl_path, state.session_id, state.last_offset, state.last_synced_at]
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
      batchInsertApiCalls(calls) {
        if (calls.length === 0) return;
        const db = this.getDb();
        db.run("BEGIN");
        try {
          for (const call of calls) {
            db.run(
              `INSERT INTO api_calls (
            session_id, timestamp, model, input_tokens, output_tokens,
            cache_read_tokens, cache_write_tokens, cost_usd, duration_ms, stop_reason
          ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
              [
                call.session_id,
                call.timestamp,
                call.model ?? null,
                call.input_tokens,
                call.output_tokens,
                call.cache_read_tokens,
                call.cache_write_tokens,
                call.cost_usd,
                call.duration_ms,
                call.stop_reason ?? null
              ]
            );
          }
          db.run("COMMIT");
        } catch (err) {
          db.run("ROLLBACK");
          throw err;
        }
        this.scheduleSave();
      }
      /**
       * Bulk-upsert session records inside a single transaction.
       *
       * @param sessions - Array of partial session objects to upsert.
       */
      batchUpsertSessions(sessions) {
        if (sessions.length === 0) return;
        const db = this.getDb();
        db.run("BEGIN");
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
                s.session_id,
                s.project_hash ?? null,
                s.project_path ?? null,
                s.started_at ?? (/* @__PURE__ */ new Date()).toISOString(),
                s.ended_at ?? null,
                s.model ?? "unknown",
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
                s.status ?? "active"
              ]
            );
          }
          db.run("COMMIT");
        } catch (err) {
          db.run("ROLLBACK");
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
      getTotalCostByProject(projectHash) {
        const db = this.getDb();
        const rows = rowsToObjects(
          db.exec(
            "SELECT COALESCE(SUM(total_cost_usd), 0) AS total FROM sessions WHERE project_hash = ?",
            [projectHash]
          )
        );
        return Number(rows[0]?.["total"] ?? 0);
      }
      /**
       * Sum total cost across all projects.
       *
       * @returns Total cost in USD as a number.
       */
      getTotalCostAllProjects() {
        const db = this.getDb();
        const rows = rowsToObjects(
          db.exec("SELECT COALESCE(SUM(total_cost_usd), 0) AS total FROM sessions")
        );
        return Number(rows[0]?.["total"] ?? 0);
      }
      /**
       * Count the number of sessions for a project.
       *
       * @param projectHash - Project identifier hash.
       * @returns Session count.
       */
      getSessionCountByProject(projectHash) {
        const db = this.getDb();
        const rows = rowsToObjects(
          db.exec(
            "SELECT COUNT(*) AS cnt FROM sessions WHERE project_hash = ?",
            [projectHash]
          )
        );
        return Number(rows[0]?.["cnt"] ?? 0);
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
      _batchGetTags(sessionIds) {
        const result = /* @__PURE__ */ new Map();
        if (sessionIds.length === 0) return result;
        const db = this.getDb();
        const placeholders = sessionIds.map(() => "?").join(",");
        const rows = rowsToObjects(
          db.exec(
            `SELECT session_id, tag FROM tags WHERE session_id IN (${placeholders}) ORDER BY created_at ASC`,
            sessionIds
          )
        );
        for (const row of rows) {
          const sid = String(row["session_id"] ?? "");
          const tag = String(row["tag"] ?? "");
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
      scheduleSave() {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
          this.saveTimer = null;
          this.saveToDisk();
        }, SAVE_DEBOUNCE_MS);
      }
      /**
       * Dynamically load the sql.js module.
       *
       * Handles both ESM (import()) and CJS (require()) environments by trying
       * dynamic import first, then falling back to require().
       *
       * @returns The initSqlJs function.
       */
      async loadSqlJs() {
        try {
          const mod = await import("sql.js");
          return mod.default;
        } catch {
          const mod = __require("sql.js");
          const initFn = mod.default ?? mod;
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
      resolveWasmPath() {
        let baseDir;
        try {
          baseDir = __dirname;
        } catch {
          baseDir = process.cwd();
        }
        const distWasm = resolve(join10(baseDir, "sql-wasm.wasm"));
        if (existsSync7(distWasm)) return distWasm;
        const nodeWasm = resolve(join10(baseDir, "..", "..", "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm"));
        if (existsSync7(nodeWasm)) return nodeWasm;
        return resolve(join10(baseDir, "sql-wasm.wasm"));
      }
    };
  }
});

// src/data/db-init.ts
import { mkdirSync as mkdirSync2, existsSync as existsSync8 } from "node:fs";
import { join as join11, resolve as resolve2 } from "node:path";
import { homedir as homedir3 } from "node:os";
function ensureGlobalAnalyticsDir() {
  if (!existsSync8(ANALYTICS_DIR)) {
    mkdirSync2(ANALYTICS_DIR, { recursive: true });
  }
  return ANALYTICS_DIR;
}
function getGlobalDbPath() {
  return resolve2(join11(ANALYTICS_DIR, DB_FILENAME));
}
async function initializeGlobalDb(dbPath) {
  if (dbPath) {
    ensureGlobalAnalyticsDir();
    const db = new GlobalDB(dbPath);
    await db.initialize();
    return db;
  }
  if (_singleton) return _singleton;
  if (_singletonPromise) return _singletonPromise;
  _singletonPromise = (async () => {
    ensureGlobalAnalyticsDir();
    const resolvedPath = getGlobalDbPath();
    const db = new GlobalDB(resolvedPath);
    await db.initialize();
    _singleton = db;
    _singletonPromise = null;
    return db;
  })();
  return _singletonPromise;
}
var GOODVIBES_BASE, ANALYTICS_DIR, DB_FILENAME, _singleton, _singletonPromise;
var init_db_init = __esm({
  "src/data/db-init.ts"() {
    "use strict";
    init_global_db();
    GOODVIBES_BASE = join11(homedir3(), ".claude", ".goodvibes");
    ANALYTICS_DIR = join11(GOODVIBES_BASE, "analytics");
    DB_FILENAME = "analytics.db";
    _singleton = null;
    _singletonPromise = null;
    __name(ensureGlobalAnalyticsDir, "ensureGlobalAnalyticsDir");
    __name(getGlobalDbPath, "getGlobalDbPath");
    __name(initializeGlobalDb, "initializeGlobalDb");
  }
});

// src/tmux/detect.ts
import { execSync } from "node:child_process";
function detectTmux(force = false) {
  if (_cachedDetection !== null && !force) {
    return _cachedDetection;
  }
  const inSession = Boolean(process.env["TMUX"]);
  let available = false;
  let version = null;
  let sessionName = null;
  try {
    execSync("command -v tmux", { stdio: "pipe" });
    available = true;
  } catch {
  }
  if (available) {
    try {
      const raw = execSync("tmux -V", { stdio: "pipe", encoding: "utf-8" });
      version = raw.trim();
    } catch {
    }
  }
  if (inSession) {
    try {
      const raw = execSync("tmux display-message -p '#S'", {
        stdio: "pipe",
        encoding: "utf-8"
      });
      const name = raw.trim();
      if (name.length > 0) {
        sessionName = name;
      }
    } catch {
    }
  }
  _cachedDetection = { available, inSession, version, sessionName };
  return _cachedDetection;
}
function getFallbackMode() {
  const { available, inSession } = detectTmux();
  if (inSession) {
    return "none";
  }
  if (available) {
    return "file";
  }
  if (process.stdout.isTTY) {
    return "terminal";
  }
  return "none";
}
var _cachedDetection;
var init_detect = __esm({
  "src/tmux/detect.ts"() {
    "use strict";
    _cachedDetection = null;
    __name(detectTmux, "detectTmux");
    __name(getFallbackMode, "getFallbackMode");
  }
});

// src/tmux/manager.ts
import { execFileSync } from "node:child_process";
function _positionFlags(position) {
  switch (position) {
    case "bottom":
      return ["-v"];
    case "top":
      return ["-v", "-b"];
    case "right":
      return ["-h"];
    case "left":
      return ["-h", "-b"];
    default: {
      const _exhaustive = position;
      throw new Error(`Unknown position: ${_exhaustive}`);
    }
  }
}
var TmuxManager;
var init_manager = __esm({
  "src/tmux/manager.ts"() {
    "use strict";
    init_detect();
    __name(_positionFlags, "_positionFlags");
    TmuxManager = class {
      static {
        __name(this, "TmuxManager");
      }
      config;
      panes;
      /**
       * Create a new TmuxManager.
       *
       * @param config - The tmux configuration section from AnalyticsConfig.
       */
      constructor(config) {
        this.config = config;
        this.panes = /* @__PURE__ */ new Map();
      }
      /**
       * Create a new tmux pane for the given target slot and start the supplied
       * command inside it.
       *
       * If the slot already has a live pane, it is closed before the new one is
       * opened. Returns a PaneInfo describing the newly created pane, or throws
       * if tmux is unavailable or pane creation fails.
       *
       * @param target  - Which slot to use: `'mini'` (status bar) or `'full'` (dashboard).
       * @param command - Shell command to run inside the pane.
       * @returns PaneInfo for the created pane.
       * @throws Error when tmux is not available or pane creation fails.
       */
      createPane(target, command) {
        const detection = detectTmux();
        if (!detection.inSession) {
          throw new Error(
            "TmuxManager.createPane: cannot create a pane outside of a tmux session."
          );
        }
        if (this.isPaneAlive(target)) {
          this.closePane(target);
        }
        const isMini = target === "mini";
        const position = isMini ? this.config.mini_position : this.config.dashboard_position ?? this.config.full_position;
        const size = isMini ? this.config.mini_pane_size : this.config.dashboard_pane_size ?? this.config.full_pane_size;
        const dirFlags = _positionFlags(position);
        const sizeStr = String(size);
        if (!/^\d+%?$/.test(sizeStr)) {
          throw new Error(
            `TmuxManager.createPane: invalid size value "${sizeStr}". Must match /^\\d+%?$/.`
          );
        }
        try {
          const raw = execFileSync("tmux", [
            "split-window",
            ...dirFlags,
            "-l",
            sizeStr,
            "-P",
            "-F",
            "#{pane_id} #{pane_pid}",
            command
          ], { stdio: "pipe", encoding: "utf-8" }).trim();
          const parts = raw.split(/\s+/);
          const rawId = parts[0] ?? "";
          const rawPid = parts[1] ?? "";
          if (!/^%\d+$/.test(rawId)) {
            throw new Error(
              `TmuxManager.createPane: unexpected pane ID format "${rawId}". Expected /^%\\d+$/.`
            );
          }
          const pid = parseInt(rawPid, 10);
          if (Number.isNaN(pid)) {
            throw new Error(
              `TmuxManager.createPane: tmux returned non-numeric PID "${rawPid}" for pane ${rawId}.`
            );
          }
          try {
            execFileSync("tmux", ["select-pane", "-t", "{last}"], { stdio: "pipe" });
          } catch {
          }
          const paneInfo = { paneId: rawId, target, pid };
          this.panes.set(target, paneInfo);
          return paneInfo;
        } catch (err) {
          try {
            execFileSync("tmux", ["kill-pane", "-t", "{last}"], { stdio: "pipe" });
          } catch {
          }
          throw err;
        }
      }
      /**
       * Close the pane for the given target slot.
       *
       * If the pane is no longer alive (e.g. the process exited) the internal
       * state is cleaned up without running `tmux kill-pane`. Failures during
       * teardown are logged but not re-thrown.
       *
       * @param target - Which slot to close: `'mini'` or `'full'`.
       */
      closePane(target) {
        const info = this.panes.get(target);
        if (!info) return;
        try {
          execFileSync("tmux", ["kill-pane", "-t", info.paneId], { stdio: "pipe" });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(
            `[TmuxManager] warn: kill-pane ${info.paneId} failed: ${message}
`
          );
        }
        this.panes.delete(target);
      }
      /**
       * Close all managed panes.
       *
       * Equivalent to calling `closePane` for every active slot. Useful during
       * daemon shutdown to ensure no orphaned panes are left behind.
       */
      closeAll() {
        for (const target of ["mini", "full"]) {
          this.closePane(target);
        }
      }
      /**
       * Check whether the pane for a given target slot is still alive.
       *
       * The check is performed by listing all current panes in the session and
       * testing whether the tracked pane ID is present. Returns `false` when
       * there is no tracked pane or when the tmux command fails.
       *
       * @param target - Which slot to check: `'mini'` or `'full'`.
       * @returns `true` when the pane exists and is alive, otherwise `false`.
       */
      isPaneAlive(target) {
        const info = this.panes.get(target);
        if (!info) return false;
        try {
          const raw = execFileSync(
            "tmux",
            ["list-panes", "-F", "#{pane_id}"],
            { stdio: "pipe", encoding: "utf-8" }
          );
          const ids = raw.split("\n").map((l) => l.trim()).filter(Boolean);
          return ids.includes(info.paneId);
        } catch {
          return false;
        }
      }
      /**
       * Resize the pane for a given target slot.
       *
       * Uses `tmux resize-pane` with the `-x` flag for horizontal splits and
       * `-y` for vertical splits. If the pane is no longer alive the internal
       * state is cleaned up and the method returns early without error.
       * Failures are logged but never propagate.
       *
       * @param target - Which slot to resize: `'mini'` or `'full'`.
       * @param size   - New size in lines/columns (number) or a percentage string (e.g. `'40%'`).
       */
      resizePane(target, size) {
        const info = this.panes.get(target);
        if (!info) return;
        if (!this.isPaneAlive(target)) {
          this.panes.delete(target);
          return;
        }
        const sizeStr = String(size);
        if (!/^\d+%?$/.test(sizeStr)) {
          process.stderr.write(
            `[TmuxManager] warn: resize-pane skipped \u2014 invalid size "${sizeStr}". Must match /^\\d+%?$/.
`
          );
          return;
        }
        const position = target === "mini" ? this.config.mini_position : this.config.dashboard_position ?? this.config.full_position;
        const flag = position === "top" || position === "bottom" ? "-y" : "-x";
        try {
          execFileSync(
            "tmux",
            ["resize-pane", "-t", info.paneId, flag, sizeStr],
            { stdio: "pipe" }
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(
            `[TmuxManager] warn: resize-pane ${info.paneId} failed: ${message}
`
          );
        }
      }
      /**
       * Return a snapshot of the currently tracked panes.
       *
       * Note that a pane listed here may no longer be alive if its process has
       * exited since the last `isPaneAlive` check. Call `isPaneAlive` to confirm.
       *
       * @returns An object with `mini` and `full` slots, each holding a `PaneInfo`
       *          or `null` when no pane is tracked for that slot.
       */
      getStatus() {
        return {
          mini: this.panes.get("mini") ?? null,
          full: this.panes.get("full") ?? null
        };
      }
    };
  }
});

// src/handlers/types.ts
function text(msg) {
  return { content: [{ type: "text", text: msg }] };
}
var init_types2 = __esm({
  "src/handlers/types.ts"() {
    "use strict";
    __name(text, "text");
  }
});

// src/handlers/dashboard.ts
import { join as join12 } from "node:path";
function getManager() {
  if (_manager === null) {
    _manager = new TmuxManager(DEFAULT_CONFIG.tmux);
  }
  return _manager;
}
function buildCommand(target) {
  let distDir;
  if (typeof __dirname !== "undefined") {
    distDir = __dirname;
  } else {
    const pluginRoot = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || "";
    distDir = join12(pluginRoot, "tools", "implementations", "analytics-engine", "dist");
  }
  const ext = target === "full" ? "mjs" : "cjs";
  return `node "${join12(distDir, `${target}.${ext}`)}"`;
}
function handleStart(input) {
  const detection = detectTmux();
  if (!detection.inSession) {
    const fallback = getFallbackMode();
    const reason = !detection.available ? "tmux is not available on PATH" : "not running inside a tmux session";
    let fallbackMsg;
    if (fallback === "file") {
      fallbackMsg = "Analytics data is being written to disk; use analytics_query to read it.";
    } else if (fallback === "terminal") {
      fallbackMsg = "Use analytics_query to query metrics directly in the terminal.";
    } else {
      fallbackMsg = "Dashboard display is not available in this environment.";
    }
    return text(
      `Cannot start dashboard pane: ${reason}.
Fallback mode: ${fallback}.
` + fallbackMsg
    );
  }
  const manager = getManager();
  const targets = resolveTargets(input.target);
  const lines = [];
  for (const target of targets) {
    try {
      const paneInfo = manager.createPane(target, buildCommand(target));
      if (input.options?.pane_size != null) {
        manager.resizePane(target, input.options.pane_size);
      }
      lines.push(
        `Started ${target} dashboard in pane ${paneInfo.paneId} (PID ${paneInfo.pid}).`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lines.push(`Failed to start ${target} dashboard: ${message}`);
    }
  }
  return text(lines.join("\n"));
}
function handleStop(input) {
  const manager = getManager();
  const targets = resolveTargets(input.target);
  const lines = [];
  for (const target of targets) {
    const wasAlive = manager.isPaneAlive(target);
    manager.closePane(target);
    if (wasAlive) {
      lines.push(`Stopped ${target} dashboard.`);
    } else {
      lines.push(`${target} dashboard was not running.`);
    }
  }
  return text(lines.join("\n"));
}
function handleStatus() {
  const detection = detectTmux();
  if (!detection.inSession) {
    const fallback = getFallbackMode();
    return text(
      `tmux status: not in a session (fallback mode: ${fallback}).
Dashboard panes are only available inside a tmux session.`
    );
  }
  const manager = getManager();
  const status = manager.getStatus();
  const lines = [
    `tmux session: ${detection.sessionName ?? "unknown"} (${detection.version ?? "version unknown"})`
  ];
  for (const target of ["mini", "full"]) {
    const info = status[target];
    if (info === null) {
      lines.push(`${target}: not running`);
    } else {
      const alive = manager.isPaneAlive(target);
      lines.push(
        `${target}: pane ${info.paneId}, PID ${info.pid} \u2014 ${alive ? "alive" : "dead (process exited)"}`
      );
    }
  }
  return text(lines.join("\n"));
}
function resolveTargets(target) {
  switch (target) {
    case "mini":
      return ["mini"];
    case "full":
      return ["full"];
    case "both":
      return ["mini", "full"];
    default: {
      const _exhaustive = target;
      return [_exhaustive];
    }
  }
}
var _manager, handleDashboard;
var init_dashboard = __esm({
  "src/handlers/dashboard.ts"() {
    "use strict";
    init_manager();
    init_detect();
    init_config();
    init_types2();
    _manager = null;
    __name(getManager, "getManager");
    __name(buildCommand, "buildCommand");
    handleDashboard = /* @__PURE__ */ __name(async (_aggregator, input) => {
      try {
        switch (input.action) {
          case "start":
            return handleStart(input);
          case "stop":
            return handleStop(input);
          case "status":
            return handleStatus();
          default: {
            const _exhaustive = input.action;
            return text(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return text(`analytics_dashboard error: ${message}`);
      }
    }, "handleDashboard");
    __name(handleStart, "handleStart");
    __name(handleStop, "handleStop");
    __name(handleStatus, "handleStatus");
    __name(resolveTargets, "resolveTargets");
  }
});

// src/tui/mini/format.ts
function formatNumber(n) {
  if (!isFinite(n)) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${Math.round(abs)}`;
}
function formatDuration(ms) {
  if (!isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1e3) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.floor(ms / 1e3);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
function formatPercent(ratio) {
  if (!Number.isFinite(ratio)) return "0.0%";
  return `${(ratio * 100).toFixed(1)}%`;
}
function formatDollars(amount) {
  if (!isFinite(amount)) return "$0.00";
  if (amount < 0) return `-$${Math.abs(amount).toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
function formatBar(value, max, width) {
  if (!isFinite(value) || !isFinite(max) || width <= 0) {
    return EMPTY_CHAR.repeat(Math.max(0, width));
  }
  if (max <= 0) return EMPTY_CHAR.repeat(width);
  const ratio = Math.max(0, Math.min(1, value / max));
  const filled = Math.round(ratio * width);
  return FILL_CHAR.repeat(filled) + EMPTY_CHAR.repeat(width - filled);
}
function formatUptime(ms) {
  if (!isFinite(ms) || ms < 0) return "0s";
  const totalSeconds = Math.floor(ms / 1e3);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
var FILL_CHAR, EMPTY_CHAR, ansi, BOX_CHARS;
var init_format = __esm({
  "src/tui/mini/format.ts"() {
    "use strict";
    __name(formatNumber, "formatNumber");
    __name(formatDuration, "formatDuration");
    __name(formatPercent, "formatPercent");
    __name(formatDollars, "formatDollars");
    FILL_CHAR = "\u2588";
    EMPTY_CHAR = "\u2591";
    __name(formatBar, "formatBar");
    __name(formatUptime, "formatUptime");
    ansi = {
      reset: "\x1B[0m",
      bold: "\x1B[1m",
      dim: "\x1B[2m",
      green: "\x1B[32m",
      yellow: "\x1B[33m",
      red: "\x1B[31m",
      cyan: "\x1B[36m",
      white: "\x1B[37m",
      bgGreen: "\x1B[42m",
      bgYellow: "\x1B[43m",
      bgRed: "\x1B[41m",
      box: {
        topLeft: "\u250C",
        // ┌
        topRight: "\u2510",
        // ┐
        bottomLeft: "\u2514",
        // └
        bottomRight: "\u2518",
        // ┘
        horizontal: "\u2500",
        // ─
        vertical: "\u2502",
        // │
        teeRight: "\u251C",
        // ├
        teeLeft: "\u2524"
        // ┤
      }
    };
    BOX_CHARS = ansi.box;
  }
});

// src/handlers/query.ts
function filterByTimeRange(events, timeRange) {
  if (timeRange === "session") return events;
  const cutoffMs = TIME_RANGE_MS[timeRange];
  const cutoff = Date.now() - cutoffMs;
  return events.filter((e) => {
    const ts = new Date(e.timestamp).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  });
}
function applyActivityFilters(events, filters) {
  if (!filters) return events;
  return events.filter((e) => {
    if (filters.tool && e.tool !== filters.tool) return false;
    if (filters.status) {
      const status = typeof e.details["status"] === "string" ? e.details["status"] : void 0;
      if (status !== filters.status) return false;
    }
    if (filters.agent && e.agent_id !== filters.agent) return false;
    return true;
  });
}
function filterToolsBreakdown(breakdown, toolFilter) {
  if (!toolFilter) return breakdown;
  const result = {};
  for (const [key, value] of Object.entries(breakdown)) {
    if (key === toolFilter || key.startsWith(toolFilter)) {
      result[key] = value;
    }
  }
  return result;
}
function buildResponse(state, activity, toolsBreakdown, input) {
  const { scope, format, group_by } = input;
  const header = buildHeader(state, input);
  const body = buildBody(state, activity, toolsBreakdown, scope, format, group_by);
  if (format === "minimal") {
    return body;
  }
  return [header, body].filter(Boolean).join("\n\n");
}
function buildHeader(state, input) {
  const rangeLabel = {
    session: "full session",
    last_5m: "last 5 minutes",
    last_30m: "last 30 minutes",
    last_1h: "last 1 hour"
  };
  return `Session: ${state.session_id} | Uptime: ${formatUptime(state.uptime_ms)} | Range: ${rangeLabel[input.time_range]} | Health: ${state.health_status}`;
}
function buildBody(state, activity, toolsBreakdown, scope, format, group_by) {
  if (scope === "all") {
    const sections = [
      renderTokens(state, format),
      renderCache(state, format),
      renderCost(state, format),
      renderCommands(state, format),
      renderAgents(state, format),
      renderFiles(state, format),
      renderHealth(state, format),
      renderProject(state, format)
    ];
    if (format === "verbose") {
      sections.push(renderToolsBreakdown(toolsBreakdown, group_by));
      sections.push(renderActivity(activity));
    }
    return sections.filter(Boolean).join("\n\n");
  }
  switch (scope) {
    case "tokens":
      return renderTokens(state, format);
    case "cache":
      return renderCache(state, format);
    case "cost":
      return renderCost(state, format);
    case "commands":
      return renderCommands(state, format);
    case "agents":
      return renderAgents(state, format);
    case "files":
      return renderFiles(state, format);
    case "health":
      return renderHealth(state, format);
    case "project":
      return renderProject(state, format);
    default: {
      const _exhaustive = scope;
      return `Unknown scope: ${_exhaustive}`;
    }
  }
}
function renderTokens(state, format) {
  const { tokens } = state.metrics;
  if (format === "minimal") {
    return `tokens: in=${formatNumber(tokens.input)} out=${formatNumber(tokens.output)} saved=${formatNumber(tokens.saved)} eff=${formatPercent(tokens.efficiency)}`;
  }
  const lines = [
    "=== Tokens ===",
    `Input:      ${formatNumber(tokens.input)}`,
    `Output:     ${formatNumber(tokens.output)}`,
    `Total:      ${formatNumber(tokens.total)}`,
    `Saved:      ${formatNumber(tokens.saved)}`,
    `Efficiency: ${formatPercent(tokens.efficiency)}`
  ];
  if (format === "verbose") {
    lines.push(`Raw input:  ${tokens.input}`);
    lines.push(`Raw output: ${tokens.output}`);
    lines.push(`Raw saved:  ${tokens.saved}`);
  }
  return lines.join("\n");
}
function renderCache(state, format) {
  const { cache } = state.metrics;
  if (format === "minimal") {
    return `cache: hit_rate=${formatPercent(cache.hit_rate)} hits=${formatNumber(cache.hits)} misses=${formatNumber(cache.misses)}`;
  }
  const lines = [
    "=== Cache ===",
    `Hit rate: ${formatPercent(cache.hit_rate)}`,
    `Hits:     ${formatNumber(cache.hits)}`,
    `Misses:   ${formatNumber(cache.misses)}`
  ];
  if (format === "verbose") {
    lines.push(`Memory peak: ${cache.memory_peak_mb} MB`);
    lines.push(`Evictions:   ${cache.evictions}`);
  }
  return lines.join("\n");
}
function renderCost(state, format) {
  const { cost } = state.metrics;
  if (format === "minimal") {
    return `cost: total=${formatDollars(cost.total)} saved=${formatDollars(cost.saved)}`;
  }
  const lines = [
    "=== Cost ===",
    `Input:  ${formatDollars(cost.input)}`,
    `Output: ${formatDollars(cost.output)}`,
    `Total:  ${formatDollars(cost.total)}`,
    `Saved:  ${formatDollars(cost.saved)}`
  ];
  return lines.join("\n");
}
function renderCommands(state, format) {
  const { commands } = state.metrics;
  if (format === "minimal") {
    return `commands: total=${commands.total} success=${formatPercent(commands.success_rate)} failures=${commands.failures}`;
  }
  const lines = [
    "=== Commands ===",
    `Total:       ${commands.total}`,
    `Success rate: ${formatPercent(commands.success_rate)}`,
    `Failures:    ${commands.failures}`,
    `Avg duration: ${formatDuration(commands.avg_duration_ms)}`
  ];
  if (format === "verbose" && commands.slowest !== null) {
    lines.push(`Slowest: ${commands.slowest.command} (${formatDuration(commands.slowest.duration_ms)})`);
  }
  return lines.join("\n");
}
function renderAgents(state, format) {
  const { agents } = state.metrics;
  if (format === "minimal") {
    return `agents: spawned=${agents.spawned} active=${agents.active} completed=${agents.completed}`;
  }
  const lines = [
    "=== Agents ===",
    `Spawned:        ${agents.spawned}`,
    `Active:         ${agents.active}`,
    `Completed:      ${agents.completed}`,
    `Max concurrent: ${agents.max_concurrent}`
  ];
  if (format === "verbose") {
    lines.push(`Total tokens: ${formatNumber(agents.total_tokens)}`);
    if (state.agent_profiles.length > 0) {
      lines.push("");
      lines.push("Agent profiles:");
      for (const p of state.agent_profiles) {
        lines.push(
          `  ${p.agent_id} (${p.agent_type}): ${formatNumber(p.tokens_in + p.tokens_out)} tokens | ${p.tool_calls} calls | ${formatPercent(p.success_rate)} success | ${p.status}`
        );
      }
    }
  }
  return lines.join("\n");
}
function renderFiles(state, format) {
  const { files } = state.metrics;
  if (format === "minimal") {
    return `files: read=${files.unique_read} modified=${files.modified} created=${files.created} conflicts=${files.conflicts}`;
  }
  const lines = [
    "=== Files ===",
    `Unique read: ${files.unique_read}`,
    `Modified:    ${files.modified}`,
    `Created:     ${files.created}`,
    `Conflicts:   ${files.conflicts}`
  ];
  if (format === "verbose" && state.file_hotspots.length > 0) {
    lines.push("");
    lines.push("Hotspots:");
    for (const h of state.file_hotspots.slice(0, 10)) {
      lines.push(`  ${h.path}: r=${h.reads} w=${h.writes} c=${h.conflicts}`);
    }
  }
  return lines.join("\n");
}
function renderHealth(state, format) {
  const { health_status, anomalies } = state;
  if (format === "minimal") {
    return `health: ${health_status} anomalies=${anomalies.length}`;
  }
  const statusEmoji = health_status === "healthy" ? "OK" : health_status === "warning" ? "WARN" : "ALERT";
  const lines = [
    "=== Health ===",
    `Status:   ${statusEmoji} (${health_status})`,
    `Anomalies: ${anomalies.length}`
  ];
  if (format === "verbose" && anomalies.length > 0) {
    lines.push("");
    for (const a of anomalies) {
      lines.push(`  [${a.severity.toUpperCase()}] ${a.type}: ${a.message} (${a.timestamp})`);
    }
  } else if (format === "standard" && anomalies.length > 0) {
    lines.push("");
    for (const a of anomalies.slice(0, 5)) {
      lines.push(`  [${a.severity}] ${a.type}: ${a.message}`);
    }
  }
  return lines.join("\n");
}
function renderProject(state, format) {
  if (format === "minimal") {
    return `project: session=${state.session_id} uptime=${formatUptime(state.uptime_ms)}`;
  }
  const lines = [
    "=== Project ===",
    `Session ID: ${state.session_id}`,
    `Started at: ${state.started_at}`,
    `Uptime:     ${formatUptime(state.uptime_ms)}`
  ];
  return lines.join("\n");
}
function renderToolsBreakdown(breakdown, group_by) {
  const entries = Object.entries(breakdown);
  if (entries.length === 0) return "=== Tools Breakdown ===\n  (no data yet)";
  const lines = ["=== Tools Breakdown ==="];
  if (group_by === "tool" || !group_by) {
    const sorted = [...entries].sort(([, a], [, b]) => b.calls - a.calls);
    for (const [tool, bd] of sorted) {
      lines.push(
        `  ${tool.padEnd(20)} calls=${String(bd.calls).padStart(5)} avg=${formatDuration(bd.avg_ms).padStart(7)} success=${formatPercent(bd.success_rate)} in=${formatNumber(bd.tokens_in)} out=${formatNumber(bd.tokens_out)}` + (bd.cache_hit_rate !== void 0 ? ` cache=${formatPercent(bd.cache_hit_rate)}` : "")
      );
    }
  } else {
    lines.push(`  (group_by='${group_by}' requires activity-level data; showing tool summary)`);
    for (const [tool, bd] of entries) {
      lines.push(`  ${tool}: ${bd.calls} calls`);
    }
  }
  return lines.join("\n");
}
function renderActivity(activity) {
  if (activity.length === 0) return "=== Recent Activity ===\n  (no events in range)";
  const lines = [`=== Recent Activity (${activity.length} events) ===`];
  for (const e of activity.slice(0, 20)) {
    const duration = e.duration_ms !== void 0 ? ` ${formatDuration(e.duration_ms)}` : "";
    const cache = e.cache_hit === true ? " [cache]" : "";
    const tokens = e.tokens !== void 0 ? ` ${formatNumber(e.tokens)}t` : "";
    lines.push(`  ${e.timestamp} ${e.tool}${duration}${cache}${tokens} \u2014 ${e.description}`);
  }
  if (activity.length > 20) {
    lines.push(`  ... and ${activity.length - 20} more`);
  }
  return lines.join("\n");
}
var handleQuery, TIME_RANGE_MS;
var init_query = __esm({
  "src/handlers/query.ts"() {
    "use strict";
    init_format();
    init_types2();
    handleQuery = /* @__PURE__ */ __name(async (aggregator, input) => {
      try {
        const state = aggregator.getState();
        const filteredActivity = filterByTimeRange(state.recent_activity, input.time_range);
        const activity = applyActivityFilters(filteredActivity, input.filters);
        const toolsBreakdown = filterToolsBreakdown(
          state.tools_breakdown,
          input.filters?.tool
        );
        const result = buildResponse(state, activity, toolsBreakdown, input);
        return text(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return text(`analytics_query error: ${message}`);
      }
    }, "handleQuery");
    TIME_RANGE_MS = {
      last_5m: 5 * 60 * 1e3,
      last_30m: 30 * 60 * 1e3,
      last_1h: 60 * 60 * 1e3
    };
    __name(filterByTimeRange, "filterByTimeRange");
    __name(applyActivityFilters, "applyActivityFilters");
    __name(filterToolsBreakdown, "filterToolsBreakdown");
    __name(buildResponse, "buildResponse");
    __name(buildHeader, "buildHeader");
    __name(buildBody, "buildBody");
    __name(renderTokens, "renderTokens");
    __name(renderCache, "renderCache");
    __name(renderCost, "renderCost");
    __name(renderCommands, "renderCommands");
    __name(renderAgents, "renderAgents");
    __name(renderFiles, "renderFiles");
    __name(renderHealth, "renderHealth");
    __name(renderProject, "renderProject");
    __name(renderToolsBreakdown, "renderToolsBreakdown");
    __name(renderActivity, "renderActivity");
  }
});

// src/handlers/budget.ts
function handleSet(aggregator, input) {
  const amount = input.amount;
  if (amount === void 0) {
    return text("Budget amount is required for the set action.");
  }
  const unit = input.unit;
  aggregator.setBudget(amount, unit);
  const state = aggregator.getState();
  const currentUsed = unit === "dollars" ? state.metrics.cost.total : state.metrics.tokens.total;
  const remaining = Math.max(0, amount - currentUsed);
  const percentage = amount > 0 ? currentUsed / amount : 0;
  const lines = [
    "Budget set.",
    "",
    formatBudgetSummary({
      amount,
      unit,
      used: currentUsed,
      remaining,
      percentage,
      warn_thresholds: [...DEFAULT_WARN_THRESHOLDS],
      current_threshold: null
    })
  ];
  if (input.warn_at !== void 0 && input.warn_at.length > 0) {
    lines.push(
      `
Warn thresholds: ${input.warn_at.map((t) => formatPercent(t)).join(", ")}`
    );
    lines.push(
      "(Note: warn_at thresholds are configured in analytics_config; budget was set using the default thresholds.)"
    );
  }
  return text(lines.join("\n"));
}
function handleCheck(aggregator) {
  const state = aggregator.getState();
  const budget = state.budget;
  if (budget === null) {
    const cost = state.metrics.cost.total;
    const tokens = state.metrics.tokens.total;
    return text(
      `No budget configured.

Current usage (no limit):
  Cost:   ${formatDollars(cost)}
  Tokens: ${formatNumber(tokens)}

Use analytics_budget with action="set" to configure a budget.`
    );
  }
  return text(formatBudgetSummary(budget));
}
function handleClear(aggregator) {
  const stateBefore = aggregator.getState();
  const b = stateBefore.budget;
  aggregator.clearBudget();
  if (b === null) {
    return text("No budget was configured.");
  }
  return text(
    `Budget cleared.

Previous budget: ${formatBudgetAmount(b.amount, b.unit)}
Usage at clear:  ${formatBudgetUsed(b.used, b.unit)} (${formatPercent(b.percentage)})`
  );
}
function formatBudgetSummary(budget) {
  const BAR_WIDTH = 20;
  const bar = formatBar(budget.used, budget.amount, BAR_WIDTH);
  const pct = formatPercent(budget.percentage);
  const statusLabel = resolveStatusLabel(budget.percentage);
  const lines = [
    "=== Budget Status ===",
    `Limit:     ${formatBudgetAmount(budget.amount, budget.unit)}`,
    `Used:      ${formatBudgetUsed(budget.used, budget.unit)} (${pct})`,
    `Remaining: ${formatBudgetUsed(budget.remaining, budget.unit)}`,
    `Status:    ${statusLabel}`,
    `Progress:  [${bar}]`
  ];
  if (budget.warn_thresholds.length > 0) {
    lines.push(
      `Thresholds: ${budget.warn_thresholds.map((t) => formatPercent(t)).join(" | ")}`
    );
  }
  if (budget.current_threshold !== null) {
    lines.push(
      `Reached threshold: ${formatPercent(budget.current_threshold)}`
    );
  }
  return lines.join("\n");
}
function formatBudgetAmount(amount, unit) {
  return unit === "dollars" ? formatDollars(amount) : `${formatNumber(amount)} tokens`;
}
function formatBudgetUsed(used, unit) {
  return unit === "dollars" ? formatDollars(used) : `${formatNumber(used)} tokens`;
}
function resolveStatusLabel(ratio) {
  if (ratio >= DEFAULT_WARN_THRESHOLDS[2]) return "exceeded";
  if (ratio >= DEFAULT_WARN_THRESHOLDS[1]) return "warning";
  if (ratio >= DEFAULT_WARN_THRESHOLDS[0]) return "on-track";
  return "under";
}
var DEFAULT_WARN_THRESHOLDS, handleBudget;
var init_budget = __esm({
  "src/handlers/budget.ts"() {
    "use strict";
    init_format();
    init_types2();
    DEFAULT_WARN_THRESHOLDS = [0.5, 0.8, 1];
    handleBudget = /* @__PURE__ */ __name(async (aggregator, input) => {
      try {
        switch (input.action) {
          case "set":
            return handleSet(aggregator, input);
          case "check":
            return handleCheck(aggregator);
          case "clear":
            return handleClear(aggregator);
          default: {
            const _exhaustive = input.action;
            return text(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return text(`analytics_budget error: ${message}`);
      }
    }, "handleBudget");
    __name(handleSet, "handleSet");
    __name(handleCheck, "handleCheck");
    __name(handleClear, "handleClear");
    __name(formatBudgetSummary, "formatBudgetSummary");
    __name(formatBudgetAmount, "formatBudgetAmount");
    __name(formatBudgetUsed, "formatBudgetUsed");
    __name(resolveStatusLabel, "resolveStatusLabel");
  }
});

// src/data/tag-store.ts
import { readFileSync as readFileSync7, existsSync as existsSync9, readdirSync as readdirSync3, statSync as statSync7 } from "node:fs";
import { join as join13, resolve as resolve3 } from "node:path";
import { homedir as homedir4 } from "node:os";
function resolveJsonlPath(sessionId, jsonlBase = join13(homedir4(), ".claude", "projects")) {
  const targetFile = `${sessionId}.jsonl`;
  if (!existsSync9(jsonlBase)) return null;
  try {
    const projectDirs = readdirSync3(jsonlBase).filter((entry) => {
      try {
        return statSync7(join13(jsonlBase, entry)).isDirectory();
      } catch {
        return false;
      }
    });
    for (const projectDir of projectDirs) {
      const candidate = resolve3(join13(jsonlBase, projectDir, targetFile));
      if (existsSync9(candidate)) {
        return candidate;
      }
    }
  } catch {
  }
  return null;
}
var SCAN_HEAD_LINES, SCAN_TAIL_LINES, DOMAIN_PATTERNS, FRAMEWORK_PATTERNS, ACTIVITY_PATTERNS, TagStore;
var init_tag_store = __esm({
  "src/data/tag-store.ts"() {
    "use strict";
    SCAN_HEAD_LINES = 200;
    SCAN_TAIL_LINES = 100;
    DOMAIN_PATTERNS = [
      {
        tag: "authentication",
        patterns: [/\bauth\b/i, /\blogin\b/i, /\boauth\b/i, /\bjwt\b/i, /\bpassport\b/i, /\bsession\b.*\bstore\b/i],
        confidence: "high"
      },
      {
        tag: "payments",
        patterns: [/\bstripe\b/i, /\bpayment\b/i, /\bcheckout\b/i, /\blemon.?squeezy\b/i, /\bpaddle\b/i, /\binvoice\b/i, /\bsubscription\b/i],
        confidence: "high"
      },
      {
        tag: "analytics",
        patterns: [/\banalytics\b/i, /\bdashboard\b/i, /\bmetrics\b/i, /\btelemetry\b/i, /\btracking\b/i],
        confidence: "high"
      },
      {
        tag: "devops",
        patterns: [/\bdocker\b/i, /\bkubernetes\b/i, /\bci\b/i, /\bpipeline\b/i, /\.github\/workflows/i, /\bdeploy\b/i, /\bterraform\b/i, /\bhelm\b/i],
        confidence: "high"
      },
      {
        tag: "testing",
        patterns: [/\.spec\./i, /\.test\./i, /\bvitest\b/i, /\bjest\b/i, /\bplaywright\b/i, /\bcypress\b/i, /\bcoverage\b/i],
        confidence: "high"
      },
      {
        tag: "database",
        patterns: [/\bprisma\b/i, /\bdrizzle\b/i, /\bmigration\b/i, /\/prisma\//i, /\bschema\.prisma\b/i, /\bsqlite\b/i, /\bpostgres\b/i, /\bmysql\b/i],
        confidence: "high"
      },
      {
        tag: "multi-tenant",
        patterns: [/\bmulti.?tenant\b/i, /\btenant\b/i, /\borganization\b.*\bslug\b/i, /\bworkspace\b.*\bmember\b/i],
        confidence: "medium"
      },
      {
        tag: "revops",
        patterns: [/\brevenue\b/i, /\bbilling\b/i, /\bmrr\b/i, /\bchurn\b/i, /\bltv\b/i],
        confidence: "medium"
      },
      {
        tag: "api",
        patterns: [/\btrpc\b/i, /\bgraphql\b/i, /\/api\//i, /\brest\b.*\bendpoint\b/i, /\bwebhook\b/i],
        confidence: "high"
      },
      {
        tag: "infrastructure",
        patterns: [/\bnginx\b/i, /\btraefik\b/i, /\.env\b/i, /\bconfig\b.*\bfile\b/i, /\bsecret\b/i],
        confidence: "low"
      }
    ];
    FRAMEWORK_PATTERNS = [
      { tag: "react", patterns: [/\.tsx$/i, /\breact\b/i, /\bnext\.js\b/i, /\.jsx$/i] },
      { tag: "vue", patterns: [/\.vue$/i, /\bvue\b/i, /\bnuxt\b/i] },
      { tag: "typescript", patterns: [/\.ts$/i, /\btypescript\b/i, /tsconfig/i] },
      { tag: "nextjs", patterns: [/\bnext\.config\b/i, /\/app\/.*page\.tsx/i, /next\.js/i] },
      { tag: "prisma", patterns: [/\.prisma$/i, /prisma\/schema/i, /\bprisma\b/i] },
      { tag: "tailwind", patterns: [/\btailwind\b/i, /tailwind\.config/i, /\bcn\b.*\bclsx\b/i] }
    ];
    ACTIVITY_PATTERNS = [
      { tag: "feature-development", toolPatterns: [/precision_write|precision_edit/i], minCount: 10 },
      { tag: "refactoring", toolPatterns: [/precision_edit/i], minCount: 20 },
      { tag: "infrastructure", toolPatterns: [/precision_exec/i], minCount: 15 }
    ];
    TagStore = class {
      constructor(db) {
        this.db = db;
      }
      static {
        __name(this, "TagStore");
      }
      // ─────────────────────────────────────────────────────────────────────────
      // Core CRUD
      // ─────────────────────────────────────────────────────────────────────────
      /**
       * Add a single tag to a session.
       *
       * Silently ignores duplicate (sessionId, tag) pairs.
       *
       * @param sessionId - Target session identifier.
       * @param tag       - Tag string to add (trimmed, lowercased).
       * @param source    - Origin of the tag. Defaults to 'manual'.
       */
      addTag(sessionId, tag, source = "manual") {
        const normalized = tag.trim().toLowerCase();
        if (!normalized) return;
        this.db.addTag(sessionId, normalized, source);
      }
      /**
       * Add multiple tags to a session in a single operation.
       *
       * Duplicates are silently ignored. Empty strings are skipped.
       *
       * @param sessionId - Target session identifier.
       * @param tags      - Array of tag strings to add.
       * @param source    - Origin of the tags. Defaults to 'manual'.
       */
      addTags(sessionId, tags, source = "manual") {
        for (const tag of tags) {
          this.addTag(sessionId, tag, source);
        }
      }
      /**
       * Remove a tag from a session.
       *
       * No-op if the tag does not exist on the session.
       *
       * @param sessionId - Target session identifier.
       * @param tag       - Tag string to remove.
       */
      removeTag(sessionId, tag) {
        const normalized = tag.trim().toLowerCase();
        if (!normalized) return;
        this.db.removeTag(sessionId, normalized);
      }
      /**
       * Retrieve all tags for a session, ordered by creation time.
       *
       * @param sessionId - Session identifier.
       * @returns Array of TagEntry objects.
       */
      getTagsForSession(sessionId) {
        return this.db.getTagsForSession(sessionId);
      }
      /**
       * Retrieve all session IDs that have the given tag.
       *
       * @param tag - Tag string to look up.
       * @returns Array of session ID strings.
       */
      getSessionsByTag(tag) {
        const normalized = tag.trim().toLowerCase();
        return this.db.getSessionsByTag(normalized);
      }
      /**
       * List all unique tags with their usage counts across all sessions.
       *
       * @returns Array of `{ tag, count, sessions }` objects, sorted by count descending.
       */
      getAllTags() {
        const rows = this.db.getAllTags();
        return rows.map((row) => ({
          tag: row.tag,
          count: row.count,
          sessions: this.db.getSessionsByTag(row.tag)
        }));
      }
      // ─────────────────────────────────────────────────────────────────────────
      // Auto-tagging heuristics
      // ─────────────────────────────────────────────────────────────────────────
      /**
       * Suggest descriptive domain tags for a session by analyzing its JSONL file.
       *
       * Uses a local heuristic approach:
       * 1. Reads the first N and last M lines of the JSONL file for efficiency.
       * 2. Scans for framework/language signals in file paths and tool inputs.
       * 3. Infers domain from keywords (auth, payments, analytics, etc.).
       * 4. Detects activity type from tool usage patterns (write-heavy = feature dev).
       *
       * Returns deduplicated, sorted suggestions with confidence levels.
       * Does NOT apply tags automatically — callers confirm before persisting.
       *
       * Note: For higher-quality inference on complex or ambiguous sessions,
       * consider using precision_agent with LLM-based analysis. This heuristic
       * approach is intentionally fast and local.
       *
       * @param sessionId  - Session identifier (used for deduplication against existing tags).
       * @param jsonlPath  - Absolute path to the Claude session JSONL file.
       * @returns Array of `{ tag, confidence }` suggestion objects, sorted by confidence.
       */
      suggestTags(sessionId, jsonlPath) {
        const existing = new Set(
          this.db.getTagsForSession(sessionId).map((t) => t.tag)
        );
        const corpus = this._readJsonlCorpus(jsonlPath);
        if (!corpus) {
          return [];
        }
        const { headText, tailText, toolCounts } = corpus;
        const fullText = `${headText}
${tailText}`;
        const suggestions = /* @__PURE__ */ new Map();
        for (const { tag, patterns } of FRAMEWORK_PATTERNS) {
          if (existing.has(tag)) continue;
          const matchedPattern = patterns.find((p) => p.test(fullText));
          if (matchedPattern) {
            suggestions.set(tag, { confidence: "high", reason: `file paths match ${matchedPattern.source}` });
          }
        }
        for (const { tag, patterns, confidence } of DOMAIN_PATTERNS) {
          if (existing.has(tag)) continue;
          const matchedPattern = patterns.find((p) => p.test(fullText));
          if (matchedPattern) {
            const existingEntry = suggestions.get(tag);
            if (!existingEntry || this._confidenceRank(confidence) > this._confidenceRank(existingEntry.confidence)) {
              suggestions.set(tag, { confidence, reason: `keyword match: ${matchedPattern.source}` });
            }
          }
        }
        for (const { tag, toolPatterns, minCount } of ACTIVITY_PATTERNS) {
          if (existing.has(tag)) continue;
          const totalMatchCount = toolPatterns.reduce((sum, p) => {
            for (const [toolName, count] of toolCounts) {
              if (p.test(toolName)) sum += count;
            }
            return sum;
          }, 0);
          if (totalMatchCount >= minCount) {
            suggestions.set(tag, {
              confidence: "medium",
              reason: `${totalMatchCount} matching tool calls`
            });
          }
        }
        const sorted = [...suggestions.entries()].map(([tag, meta]) => ({ tag, ...meta })).sort((a, b) => {
          const rankDiff = this._confidenceRank(b.confidence) - this._confidenceRank(a.confidence);
          return rankDiff !== 0 ? rankDiff : a.tag.localeCompare(b.tag);
        });
        return sorted;
      }
      // ─────────────────────────────────────────────────────────────────────────
      // Private helpers
      // ─────────────────────────────────────────────────────────────────────────
      /**
       * Read and parse a JSONL file, returning a text corpus from head + tail.
       *
       * Extracts file paths and tool names from tool_use events for pattern matching.
       * Returns null if the file does not exist or cannot be read.
       *
       * @param jsonlPath - Absolute path to the JSONL file.
       */
      _readJsonlCorpus(jsonlPath) {
        if (!existsSync9(jsonlPath)) return null;
        let rawContent;
        try {
          rawContent = readFileSync7(jsonlPath, "utf-8");
        } catch {
          return null;
        }
        const lines = rawContent.split("\n").filter(Boolean);
        const headLines = lines.slice(0, SCAN_HEAD_LINES);
        const tailLines = lines.slice(-SCAN_TAIL_LINES);
        const sampleLines = [.../* @__PURE__ */ new Set([...headLines, ...tailLines])];
        const toolCounts = /* @__PURE__ */ new Map();
        for (const line of sampleLines) {
          let parsed;
          try {
            parsed = JSON.parse(line);
          } catch {
            continue;
          }
          const type = parsed["type"];
          if (type === "tool_use" || type === "tool_result") {
            const toolName = String(parsed["name"] ?? parsed["tool_name"] ?? "");
            if (toolName) {
              toolCounts.set(toolName, (toolCounts.get(toolName) ?? 0) + 1);
            }
          }
        }
        return {
          headText: headLines.join("\n"),
          tailText: tailLines.join("\n"),
          toolCounts
        };
      }
      /**
       * Map confidence level to a numeric rank for sorting.
       *
       * @param confidence - Confidence string.
       * @returns Numeric rank (higher = better).
       */
      _confidenceRank(confidence) {
        switch (confidence) {
          case "high":
            return 3;
          case "medium":
            return 2;
          case "low":
            return 1;
        }
      }
    };
    __name(resolveJsonlPath, "resolveJsonlPath");
  }
});

// src/handlers/tag.ts
async function getTagStore() {
  if (_tagStore) return _tagStore;
  if (!_initPromise) {
    _initPromise = initializeGlobalDb().then((db) => {
      _globalDb = db;
      _tagStore = new TagStore(db);
      _initPromise = null;
      return db;
    }).catch((err) => {
      _initPromise = null;
      throw err;
    });
  }
  await _initPromise;
  if (!_tagStore) throw new Error("TagStore initialization failed");
  return _tagStore;
}
async function handleTag(aggregator, input, _goodvibesDir) {
  try {
    const store = await getTagStore();
    const state = aggregator.getState();
    const sessionId = state.session_id;
    switch (input.action) {
      case "add":
        return handleAdd(store, sessionId, input.value);
      case "remove":
        return handleRemove(store, sessionId, input.value);
      case "list":
        return handleList(store, sessionId, input.scope ?? "session");
      case "auto":
        return handleAuto(store, sessionId);
      default: {
        const _exhaustive = input.action;
        return text(`analytics_tag: unknown action "${String(_exhaustive)}"`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return text(`analytics_tag error: ${message}`);
  }
}
function handleAdd(store, sessionId, tagValue) {
  store.addTag(sessionId, tagValue, "manual");
  const currentTags = store.getTagsForSession(sessionId);
  const tagList = currentTags.length > 0 ? currentTags.map((t) => `  - ${t.tag}`).join("\n") : "  (none)";
  return text(
    `Tag added: "${tagValue.trim().toLowerCase()}"

Current tags for session ${sessionId}:
${tagList}`
  );
}
function handleRemove(store, sessionId, tagValue) {
  store.removeTag(sessionId, tagValue);
  const remaining = store.getTagsForSession(sessionId);
  const tagList = remaining.length > 0 ? remaining.map((t) => `  - ${t.tag}`).join("\n") : "  (none)";
  return text(
    `Tag removed: "${tagValue.trim().toLowerCase()}"

Remaining tags for session ${sessionId}:
${tagList}`
  );
}
function handleList(store, sessionId, scope) {
  if (scope === "all") {
    const allTags = store.getAllTags();
    if (allTags.length === 0) {
      return text("No tags found across any sessions.");
    }
    const lines2 = allTags.map(
      (t) => `  ${t.tag.padEnd(24)} (${t.count} session${t.count === 1 ? "" : "s"})`
    );
    return text(`All tags (${allTags.length} unique):
${lines2.join("\n")}`);
  }
  const tags = store.getTagsForSession(sessionId);
  if (tags.length === 0) {
    return text(
      `No tags on session ${sessionId}.

Add tags with: analytics_tag { action: "add", value: "<tag>" }`
    );
  }
  const lines = tags.map((t) => `  - ${t.tag}  [${t.source}]`);
  return text(
    `Tags for session ${sessionId} (${tags.length}):
${lines.join("\n")}`
  );
}
function handleAuto(store, sessionId) {
  const jsonlPath = resolveJsonlPath(sessionId);
  if (!jsonlPath) {
    return text(
      `Could not locate JSONL file for session ${sessionId}.

Expected location: ~/.claude/projects/<project-hash>/${sessionId}.jsonl
Ensure the session file exists before using auto-tagging.`
    );
  }
  const suggestions = store.suggestTags(sessionId, jsonlPath);
  if (suggestions.length === 0) {
    return text(
      `No tag suggestions found for session ${sessionId}.

The session may be too short, or its content may not match known patterns.
For higher-quality inference on complex sessions, precision_agent LLM analysis
can provide better suggestions (not implemented in this heuristic layer).`
    );
  }
  const lines = suggestions.map(
    (s) => `  - ${s.tag.padEnd(24)} (${s.confidence} confidence: ${s.reason})`
  );
  const applyHints = suggestions.map((s) => `analytics_tag { action: "add", value: "${s.tag}" }`).join("\n");
  return text(
    `Suggested tags for session ${sessionId}:
${lines.join("\n")}

Apply with:
${applyHints}`
  );
}
var _globalDb, _tagStore, _initPromise;
var init_tag = __esm({
  "src/handlers/tag.ts"() {
    "use strict";
    init_types2();
    init_tag_store();
    init_db_init();
    _globalDb = null;
    _tagStore = null;
    _initPromise = null;
    __name(getTagStore, "getTagStore");
    __name(handleTag, "handleTag");
    __name(handleAdd, "handleAdd");
    __name(handleRemove, "handleRemove");
    __name(handleList, "handleList");
    __name(handleAuto, "handleAuto");
  }
});

// src/handlers/export.ts
import * as fs from "node:fs";
import * as path4 from "node:path";
function extractSections(state, sections) {
  const result = {};
  if (sections.includes("tokens")) {
    result["tokens"] = state.metrics.tokens;
  }
  if (sections.includes("cache")) {
    result["cache"] = state.metrics.cache;
  }
  if (sections.includes("commands")) {
    result["commands"] = state.metrics.commands;
  }
  if (sections.includes("agents")) {
    result["agents"] = state.metrics.agents;
  }
  if (sections.includes("files")) {
    result["files"] = state.metrics.files;
  }
  if (sections.includes("cost")) {
    result["cost"] = state.metrics.cost;
  }
  if (sections.includes("timeline")) {
    result["timeline"] = {
      session_id: state.session_id,
      started_at: state.started_at,
      uptime_ms: state.uptime_ms,
      recent_activity: state.recent_activity
    };
  }
  return result;
}
function extractArchiveSections(archive, sections) {
  const result = {};
  const m = archive.metrics;
  if (sections.includes("tokens")) result["tokens"] = m.tokens;
  if (sections.includes("cache")) result["cache"] = m.cache;
  if (sections.includes("commands")) result["commands"] = m.commands;
  if (sections.includes("agents")) result["agents"] = m.agents;
  if (sections.includes("files")) result["files"] = m.files;
  if (sections.includes("cost")) result["cost"] = m.cost;
  if (sections.includes("timeline")) {
    result["timeline"] = {
      session_id: archive.session_id,
      tags: archive.tags,
      tag: archive.tags?.[0] ?? null,
      name: archive.name,
      started_at: archive.started_at,
      ended_at: archive.ended_at,
      duration_minutes: archive.duration_minutes
    };
  }
  return result;
}
function renderJson(data) {
  return JSON.stringify(data, null, 2);
}
function renderCsv(data) {
  const rows = ["section,value"];
  function flattenInto(prefix, obj) {
    if (obj === null || obj === void 0) {
      rows.push(`${prefix},`);
      return;
    }
    if (typeof obj !== "object" || Array.isArray(obj)) {
      const cell = JSON.stringify(obj).replace(/"/g, '""');
      rows.push(`${prefix},"${cell}"`);
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      flattenInto(prefix ? `${prefix}.${k}` : k, v);
    }
  }
  __name(flattenInto, "flattenInto");
  if (typeof data === "object" && !Array.isArray(data)) {
    for (const [section, value] of Object.entries(data)) {
      flattenInto(section, value);
    }
  } else {
    flattenInto("data", data);
  }
  return rows.join("\n");
}
function renderMarkdown(data, title) {
  const lines = [`# ${title}`, ""];
  function renderSection(sectionName, obj) {
    lines.push(`## ${sectionName}`, "");
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      lines.push(`| key | value |`, `| --- | --- |`, `| ${sectionName} | ${JSON.stringify(obj)} |`, "");
      return;
    }
    lines.push("| metric | value |", "| --- | --- |");
    for (const [k, v] of Object.entries(obj)) {
      const cell = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
      lines.push(`| ${k} | ${cell} |`);
    }
    lines.push("");
  }
  __name(renderSection, "renderSection");
  for (const [section, value] of Object.entries(data)) {
    renderSection(section, value);
  }
  return lines.join("\n");
}
async function handleExport(aggregator, input, store) {
  try {
    const rawSections = input.sections;
    const sections = Array.isArray(rawSections) && rawSections.length > 0 ? rawSections.filter((s) => ALL_SECTIONS.includes(s)) : ALL_SECTIONS;
    let data;
    let title;
    if (input.scope === "current") {
      const state = aggregator.getState();
      data = extractSections(state, sections);
      title = `Session Export \u2014 ${state.session_id}`;
    } else if (input.scope === "historical") {
      const archives = store.list();
      if (archives.length === 0) {
        return {
          content: [{ type: "text", text: "No historical sessions found." }]
        };
      }
      const entries = {};
      for (const archive of archives) {
        entries[archive.session_id] = extractArchiveSections(archive, sections);
      }
      data = entries;
      title = `Historical Export \u2014 ${archives.length} sessions`;
    } else {
      const sessionId = input.scope.replace(/^session:/, "");
      const archive = store.load(sessionId);
      if (!archive) {
        return {
          content: [{ type: "text", text: `Session not found: ${sessionId}` }]
        };
      }
      data = extractArchiveSections(archive, sections);
      title = `Session Export \u2014 ${archive.tags?.[0] ?? archive.name ?? sessionId}`;
    }
    let rendered;
    switch (input.format) {
      case "json":
        rendered = renderJson(data);
        break;
      case "csv":
        rendered = renderCsv(data);
        break;
      case "markdown":
        rendered = renderMarkdown(data, title);
        break;
      default: {
        const _exhaustive = input.format;
        rendered = renderJson(data);
        void _exhaustive;
      }
    }
    if (input.output_path) {
      const absPath = path4.resolve(input.output_path);
      await fs.promises.mkdir(path4.dirname(absPath), { recursive: true });
      await fs.promises.writeFile(absPath, rendered, "utf-8");
      return {
        content: [{
          type: "text",
          text: `Export written to: ${absPath}

Format: ${input.format}  Scope: ${input.scope}  Sections: ${sections.join(", ")}`
        }]
      };
    }
    return {
      content: [{ type: "text", text: rendered }]
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `analytics_export error: ${message}` }]
    };
  }
}
var ALL_SECTIONS;
var init_export = __esm({
  "src/handlers/export.ts"() {
    "use strict";
    ALL_SECTIONS = ["tokens", "cache", "commands", "agents", "files", "cost", "timeline"];
    __name(extractSections, "extractSections");
    __name(extractArchiveSections, "extractArchiveSections");
    __name(renderJson, "renderJson");
    __name(renderCsv, "renderCsv");
    __name(renderMarkdown, "renderMarkdown");
    __name(handleExport, "handleExport");
  }
});

// src/handlers/config.ts
import * as fs2 from "node:fs";
import * as path5 from "node:path";
function getByPath(obj, keyPath) {
  const segments = keyPath.split(".");
  let current = obj;
  for (const segment of segments) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return void 0;
    }
    current = current[segment];
  }
  return current;
}
function setByPath(obj, keyPath, value) {
  const segments = keyPath.split(".");
  let current = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (current[segment] === null || current[segment] === void 0 || typeof current[segment] !== "object" || Array.isArray(current[segment])) {
      current[segment] = {};
    }
    current = current[segment];
  }
  const lastSegment = segments[segments.length - 1];
  current[lastSegment] = value;
}
async function persistConfig(goodvibesDir, config) {
  const configPath = path5.join(goodvibesDir, CONFIG_FILENAME);
  await fs2.promises.mkdir(goodvibesDir, { recursive: true });
  await fs2.promises.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}
async function handleConfig(_aggregator, input, config, goodvibesDir) {
  try {
    const configObj = config;
    if (input.action === "get") {
      if (input.key) {
        const value = getByPath(configObj, input.key);
        if (value === void 0) {
          return {
            content: [{
              type: "text",
              text: `Config key not found: "${input.key}"`
            }]
          };
        }
        return {
          content: [{
            type: "text",
            text: `${input.key} = ${JSON.stringify(value, null, 2)}`
          }]
        };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify(config, null, 2)
        }]
      };
    }
    if (!input.key) {
      return {
        content: [{ type: "text", text: 'analytics_config set: "key" is required.' }]
      };
    }
    if (input.value === void 0) {
      return {
        content: [{ type: "text", text: 'analytics_config set: "value" is required.' }]
      };
    }
    const existing = getByPath(configObj, input.key);
    if (existing === void 0) {
      return {
        content: [{
          type: "text",
          text: `Config key not found: "${input.key}". Use "get" (no key) to list all valid keys.`
        }]
      };
    }
    const updated = JSON.parse(JSON.stringify(config));
    setByPath(updated, input.key, input.value);
    await persistConfig(goodvibesDir, updated);
    return {
      content: [{
        type: "text",
        text: `Config updated: ${input.key} = ${JSON.stringify(input.value)}

Persisted to ${path5.join(goodvibesDir, CONFIG_FILENAME)}.
Restart the analytics daemon for changes to take effect.`
      }]
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `analytics_config error: ${message}` }]
    };
  }
}
var CONFIG_FILENAME;
var init_config2 = __esm({
  "src/handlers/config.ts"() {
    "use strict";
    CONFIG_FILENAME = "analytics.json";
    __name(getByPath, "getByPath");
    __name(setByPath, "setByPath");
    __name(persistConfig, "persistConfig");
    __name(handleConfig, "handleConfig");
  }
});

// src/handlers/index.ts
var handlers_exports = {};
__export(handlers_exports, {
  HANDLER_REGISTRY: () => HANDLER_REGISTRY,
  handleBudget: () => handleBudget,
  handleConfig: () => handleConfig,
  handleDashboard: () => handleDashboard,
  handleExport: () => handleExport,
  handleQuery: () => handleQuery,
  handleTag: () => handleTag
});
var HANDLER_REGISTRY;
var init_handlers = __esm({
  "src/handlers/index.ts"() {
    "use strict";
    init_dashboard();
    init_query();
    init_budget();
    init_tag();
    init_export();
    init_config2();
    HANDLER_REGISTRY = {
      analytics_dashboard: handleDashboard,
      analytics_query: handleQuery,
      analytics_budget: handleBudget,
      analytics_tag: handleTag,
      analytics_export: handleExport,
      analytics_config: handleConfig
    };
  }
});

// src/index.ts
init_types();
init_config();

// src/daemon/aggregator.ts
import { join as join9, dirname as dirname3, basename as basename3 } from "node:path";
import { homedir as homedir2 } from "node:os";
import { existsSync as existsSync6, readdirSync as readdirSync2, statSync as statSync6 } from "node:fs";

// src/data/telemetry-reader.ts
import initSqlJs from "sql.js";
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import * as path from "node:path";
var COL = {
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
  created_at: 11
};
var SELECT_COLS = `
  id, session_id, tool, status,
  tokens_in, tokens_out, cache_hit, cache_bytes_saved,
  duration_ms, error, metadata, created_at
`;
var BYTES_PER_TOKEN = 4;
var TelemetryReader = class _TelemetryReader {
  static {
    __name(this, "TelemetryReader");
  }
  db = null;
  _SQL = null;
  dbPath;
  _available = false;
  constructor(goodvibesDir) {
    this.dbPath = path.join(goodvibesDir, "telemetry", "telemetry.db");
  }
  /**
   * Initialize sql.js WASM and open the database from the file on disk.
   *
   * Safe to call multiple times — subsequent calls are no-ops if already
   * initialized. If the DB file does not exist, marks as unavailable and
   * returns without error (callers get empty results).
   */
  async initialize() {
    if (this.db !== null) {
      return;
    }
    if (!existsSync2(this.dbPath)) {
      this._available = false;
      return;
    }
    try {
      const bundleDir = path.dirname(new URL(import.meta.url).pathname);
      const wasmBesideBundle = path.join(bundleDir, "sql-wasm.wasm");
      const sqlConfig = existsSync2(wasmBesideBundle) ? { locateFile: /* @__PURE__ */ __name((file) => path.join(bundleDir, file), "locateFile") } : {};
      this._SQL = await initSqlJs(sqlConfig);
      const buffer = readFileSync2(this.dbPath);
      this.db = new this._SQL.Database(buffer);
      this._available = true;
    } catch (err) {
      console.warn("[TelemetryReader] Failed to open database:", String(err));
      this.db = null;
      this._available = false;
    }
  }
  /**
   * Returns true if the DB was opened successfully and is queryable.
   */
  isAvailable() {
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
  getRecords(filter) {
    if (!this.db) return [];
    try {
      const conditions = [];
      const params = [];
      if (filter?.tool) {
        conditions.push("tool = ?");
        params.push(filter.tool);
      }
      if (filter?.status) {
        conditions.push("status = ?");
        params.push(filter.status);
      }
      if (filter?.since) {
        conditions.push("created_at >= ?");
        params.push(filter.since);
      }
      if (filter?.session_id) {
        conditions.push("session_id = ?");
        params.push(filter.session_id);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      let sql = `SELECT ${SELECT_COLS} FROM calls ${where} ORDER BY created_at ASC`;
      if (filter?.limit !== void 0 && filter.limit > 0) {
        sql += " LIMIT ?";
        params.push(Math.floor(filter.limit));
      }
      const results = this.db.exec(sql, params.length > 0 ? params : void 0);
      return this.resultsToRecords(results);
    } catch (err) {
      console.warn("[TelemetryReader] getRecords error:", String(err));
      return [];
    }
  }
  /**
   * Get a summary for the specified session (defaults to current/most recent).
   * Returns null if the database is unavailable or the session has no records.
   */
  getSessionSummary(sessionId) {
    if (!this.db) return null;
    const sid = sessionId ?? this.getCurrentSessionId();
    if (!sid) return null;
    try {
      const results = this.db.exec(
        `SELECT ${SELECT_COLS} FROM calls WHERE session_id = ? ORDER BY created_at ASC`,
        [sid]
      );
      const records = this.resultsToRecords(results);
      if (records.length === 0) return null;
      const byTool = {};
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
        if (rec.status === "success") {
          t.success++;
          successCount++;
        }
      }
      const byToolOut = {};
      for (const [tool, s] of Object.entries(byTool)) {
        byToolOut[tool] = {
          calls: s.calls,
          avg_ms: s.calls > 0 ? Math.round(s.total_ms / s.calls) : 0,
          cache_hit_rate: s.calls > 0 ? s.cache_hits / s.calls : 0,
          tokens_in: s.tokens_in,
          tokens_out: s.tokens_out,
          success_rate: s.calls > 0 ? s.success / s.calls : 1
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
        success_rate: records.length > 0 ? successCount / records.length : 1
      };
    } catch (err) {
      console.warn("[TelemetryReader] getSessionSummary error:", String(err));
      return null;
    }
  }
  /**
   * Get the most recent session ID in the database (highest created_at).
   * Returns null if unavailable or DB is empty.
   */
  getCurrentSessionId() {
    if (!this.db) return null;
    try {
      const results = this.db.exec(
        `SELECT session_id FROM calls ORDER BY created_at DESC LIMIT 1`
      );
      if (!results.length || !results[0].values.length) return null;
      return results[0].values[0][0];
    } catch (err) {
      console.warn("[TelemetryReader] getCurrentSessionId error:", String(err));
      return null;
    }
  }
  /**
   * List all distinct session IDs in the database, ordered by first appearance.
   */
  listSessionIds() {
    if (!this.db) return [];
    try {
      const results = this.db.exec(
        `SELECT session_id FROM calls GROUP BY session_id ORDER BY MIN(created_at) ASC`
      );
      if (!results.length) return [];
      return results[0].values.map((row) => row[0]);
    } catch (err) {
      console.warn("[TelemetryReader] listSessionIds error:", String(err));
      return [];
    }
  }
  /**
   * Get all records created within the last `windowMs` milliseconds.
   * Useful for anomaly detection on recent activity.
   */
  getRecordsInWindow(windowMs) {
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
  getTokenMetrics(sessionId) {
    const empty = {
      input: 0,
      output: 0,
      total: 0,
      saved: 0,
      efficiency: 0,
      api_input: 0,
      api_output: 0,
      cache_read: 0,
      cache_write: 0
    };
    if (!this.db) return empty;
    try {
      const where = sessionId ? "WHERE session_id = ?" : "";
      const params = sessionId ? [sessionId] : void 0;
      const results = this.db.exec(
        `SELECT tokens_in, tokens_out, cache_bytes_saved FROM calls ${where}`,
        params
      );
      if (!results.length) return empty;
      let totalIn = 0;
      let totalOut = 0;
      let totalSavedBytes = 0;
      for (const row of results[0].values) {
        totalIn += row[0] ?? 0;
        totalOut += row[1] ?? 0;
        totalSavedBytes += row[2] ?? 0;
      }
      const total = totalIn + totalOut;
      const saved = Math.round(totalSavedBytes / BYTES_PER_TOKEN);
      const efficiency = total + saved > 0 ? saved / (total + saved) : 0;
      return {
        input: totalIn,
        output: totalOut,
        total,
        saved,
        efficiency: Math.round(efficiency * 1e4) / 1e4,
        // 4 decimal places
        // API-level token counts (Phase 2 will populate from JSONL sync)
        api_input: 0,
        api_output: 0,
        cache_read: 0,
        cache_write: 0
      };
    } catch (err) {
      console.warn("[TelemetryReader] getTokenMetrics error:", String(err));
      return empty;
    }
  }
  /**
   * Get the most recent N records in ascending chronological order.
   * Returns [] if unavailable.
   */
  getRecentRecords(limit) {
    if (!this.db) return [];
    try {
      const n = Math.max(1, Math.floor(limit));
      const results = this.db.exec(
        `SELECT * FROM (SELECT ${SELECT_COLS} FROM calls ORDER BY created_at DESC LIMIT ?) sub ORDER BY created_at ASC`,
        [n]
      );
      return this.resultsToRecords(results);
    } catch (err) {
      console.warn("[TelemetryReader] getRecentRecords error:", String(err));
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
  reload() {
    if (this.db) {
      try {
        this.db.close();
      } catch {
      }
      this.db = null;
      this._available = false;
    }
    if (!existsSync2(this.dbPath)) return;
    if (!this._SQL) return;
    try {
      const buffer = readFileSync2(this.dbPath);
      this.db = new this._SQL.Database(buffer);
      this._available = true;
    } catch (err) {
      console.warn("[TelemetryReader] reload error:", String(err));
    }
  }
  /**
   * Close the database and release resources.
   */
  close() {
    if (this.db) {
      try {
        this.db.close();
      } catch {
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
  resultsToRecords(results) {
    if (!results || results.length === 0) return [];
    const { values } = results[0];
    return values.map((row) => _TelemetryReader.rowToRecord(row));
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
  static rowToRecord(row) {
    const rec = {
      id: row[COL.id],
      session_id: row[COL.session_id],
      tool: row[COL.tool],
      status: row[COL.status],
      created_at: row[COL.created_at]
    };
    if (row[COL.tokens_in] !== null && row[COL.tokens_in] !== void 0) {
      rec.tokens_in = row[COL.tokens_in];
    }
    if (row[COL.tokens_out] !== null && row[COL.tokens_out] !== void 0) {
      rec.tokens_out = row[COL.tokens_out];
    }
    if (row[COL.cache_hit] !== null && row[COL.cache_hit] !== void 0) {
      rec.cache_hit = row[COL.cache_hit] !== 0;
    }
    if (row[COL.cache_bytes_saved] !== null && row[COL.cache_bytes_saved] !== void 0) {
      rec.cache_bytes_saved = row[COL.cache_bytes_saved];
    }
    if (row[COL.duration_ms] !== null && row[COL.duration_ms] !== void 0) {
      rec.duration_ms = row[COL.duration_ms];
    }
    if (row[COL.error] !== null && row[COL.error] !== void 0) {
      rec.error = row[COL.error];
    }
    if (row[COL.metadata] !== null && row[COL.metadata] !== void 0) {
      rec.metadata = row[COL.metadata];
    }
    return rec;
  }
};

// src/data/session-reader.ts
import { readFileSync as readFileSync3, readdirSync, statSync } from "node:fs";
import * as path2 from "node:path";
var SessionReader = class {
  static {
    __name(this, "SessionReader");
  }
  stateDir;
  constructor(goodvibesDir) {
    this.stateDir = path2.join(goodvibesDir, "state");
  }
  /**
   * Find the most recent session file by filesystem mtime.
   * Returns null if the state directory does not exist or is empty.
   */
  getCurrentSessionFile() {
    const files = this.listSessionFiles();
    if (files.length === 0) return null;
    const sorted = files.map((f) => {
      try {
        const fullPath = path2.join(this.stateDir, f);
        const mtime = statSync(fullPath).mtimeMs;
        return { file: f, mtime };
      } catch {
        return null;
      }
    }).filter((x) => x !== null).sort((a, b) => b.mtime - a.mtime);
    return sorted.length > 0 ? path2.join(this.stateDir, sorted[0].file) : null;
  }
  /**
   * Read and parse a session file by session ID.
   * Returns null if the file does not exist or cannot be parsed.
   */
  readSession(sessionId) {
    const filePath = path2.join(this.stateDir, `session_${sessionId}.json`);
    return this.parseSessionFile(filePath);
  }
  /**
   * Read and parse the most recent (current) session file.
   * Returns null if no session files exist.
   */
  readCurrentSession() {
    const filePath = this.getCurrentSessionFile();
    if (!filePath) return null;
    return this.parseSessionFile(filePath);
  }
  /**
   * List all available session IDs derived from filenames in the state directory.
   * Returns an empty array if the directory does not exist.
   */
  listSessionIds() {
    return this.listSessionFiles().map((f) => {
      const match = f.match(/^session_([0-9a-f]{8})\.json$/);
      return match ? match[1] : null;
    }).filter((id) => id !== null);
  }
  /**
   * Retrieve specific KV values from a session file by key name.
   * Missing keys are present in the result with value `undefined`.
   */
  getValues(sessionId, keys) {
    const session = this.readSession(sessionId);
    const result = {};
    if (!session) {
      for (const key of keys) result[key] = void 0;
      return result;
    }
    for (const key of keys) {
      result[key] = session.values[key];
    }
    return result;
  }
  /**
   * Read the auto-populated session counters from a session file.
   * Uses the current session when no sessionId is provided.
   */
  getSessionCounters(sessionId) {
    const session = sessionId ? this.readSession(sessionId) : this.readCurrentSession();
    const values = session?.values ?? {};
    return {
      tokens_used: toNumber(values["session.tokens_used"]),
      files_modified: toStringArray(values["session.files_modified"]),
      commands_run: toNumber(values["session.commands_run"]),
      agents_spawned: toNumber(values["session.agents_spawned"])
    };
  }
  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------
  /**
   * List raw session filenames from the state directory.
   */
  listSessionFiles() {
    try {
      return readdirSync(this.stateDir).filter(
        (f) => /^session_[0-9a-f]{8}\.json$/.test(f)
      );
    } catch {
      return [];
    }
  }
  /**
   * Parse a session JSON file into SessionData.
   * The raw file shape is { id, started_at, ...kvPairs }.
   * We normalise it by pulling id/started_at out and placing the rest in values.
   */
  parseSessionFile(filePath) {
    try {
      const raw = readFileSync3(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      const id = typeof parsed["id"] === "string" ? parsed["id"] : "";
      const started_at = typeof parsed["started_at"] === "string" ? parsed["started_at"] : "";
      const values = {};
      for (const [key, val] of Object.entries(parsed)) {
        if (key !== "id" && key !== "started_at") {
          values[key] = val;
        }
      }
      return { id, started_at, values };
    } catch {
      return null;
    }
  }
};
function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}
__name(toNumber, "toNumber");
function toStringArray(value) {
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === "string");
  }
  return [];
}
__name(toStringArray, "toStringArray");

// src/data/index-reader.ts
import { readFileSync as readFileSync4, statSync as statSync2, existsSync as existsSync3 } from "fs";
import * as path3 from "path";
var IndexReader = class {
  static {
    __name(this, "IndexReader");
  }
  indexPath;
  /** Parsed index, null if unread or unavailable. */
  cache = null;
  /** Mtime (ms) of the file when it was last parsed. */
  cacheMtime = -1;
  constructor(goodvibesDir) {
    this.indexPath = path3.join(goodvibesDir, "project-index.json");
  }
  /**
   * Read the current project index, using a cached copy when the file
   * has not been modified since the last read.
   * Returns null if the index file does not exist or cannot be parsed.
   */
  read() {
    if (!existsSync3(this.indexPath)) {
      this.cache = null;
      this.cacheMtime = -1;
      return null;
    }
    try {
      const mtime = statSync2(this.indexPath).mtimeMs;
      if (this.cache !== null && mtime === this.cacheMtime) {
        return this.cache;
      }
      const raw = readFileSync4(this.indexPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 4) {
        this.cache = null;
        this.cacheMtime = mtime;
        return null;
      }
      this.cache = parsed;
      this.cacheMtime = mtime;
      return this.cache;
    } catch {
      this.cache = null;
      return null;
    }
  }
  /**
   * Returns true when the project-index.json file exists on disk.
   */
  isAvailable() {
    return existsSync3(this.indexPath);
  }
  /**
   * Total file count from the index stats block.
   * Returns 0 if the index is unavailable.
   */
  getTotalFiles() {
    return this.read()?.stats.total_files ?? 0;
  }
  /**
   * Total estimated token count, summed across all files in the tree.
   * Returns 0 if the index is unavailable.
   */
  getTotalTokens() {
    const index = this.read();
    if (!index) return 0;
    let total = 0;
    for (const files of Object.values(index.tree)) {
      for (const tokens of Object.values(files)) {
        total += tokens;
      }
    }
    return total;
  }
  /**
   * File count broken down by extension category.
   * Extension categories match the precision-engine's categorizeFileType output:
   * ts, js, json, md, css, html, py, go, rs, yaml, other.
   *
   * Returns an empty object if the index is unavailable.
   */
  getTypeCounts() {
    const index = this.read();
    if (!index) return {};
    const counts = {};
    for (const files of Object.values(index.tree)) {
      for (const filename of Object.keys(files)) {
        const ext = path3.extname(filename).toLowerCase().slice(1);
        const type = extToCategory(ext);
        counts[type] = (counts[type] ?? 0) + 1;
      }
    }
    return counts;
  }
  /**
   * Return the top N files sorted descending by token count.
   * Each entry contains the full relative path and its token count.
   * Returns an empty array if the index is unavailable or n <= 0.
   */
  getLargestFiles(n) {
    if (n <= 0) return [];
    const index = this.read();
    if (!index) return [];
    const entries = [];
    for (const [dir, files] of Object.entries(index.tree)) {
      for (const [filename, tokens] of Object.entries(files)) {
        const filePath = dir ? `${dir}/${filename}` : filename;
        entries.push({ path: filePath, tokens });
      }
    }
    entries.sort((a, b) => b.tokens - a.tokens || a.path.localeCompare(b.path));
    return entries.slice(0, n);
  }
};
function extToCategory(ext) {
  switch (ext) {
    case "ts":
    case "tsx":
      return "ts";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "js";
    case "json":
      return "json";
    case "md":
    case "mdx":
      return "md";
    case "css":
    case "scss":
    case "less":
      return "css";
    case "html":
    case "htm":
      return "html";
    case "py":
      return "py";
    case "go":
      return "go";
    case "rs":
      return "rs";
    case "yaml":
    case "yml":
      return "yaml";
    default:
      return "other";
  }
}
__name(extToCategory, "extToCategory");

// src/data/jsonl-reader.ts
import { createReadStream, statSync as statSync3 } from "node:fs";
import { stat, readdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join as join5, basename } from "node:path";
var CACHE_READ_COST_RATIO = 0.1;
var CACHE_WRITE_COST_RATIO = 0.25;
var JSONLReader = class {
  static {
    __name(this, "JSONLReader");
  }
  costPer1kInput;
  costPer1kOutput;
  /**
   * @param config - Pricing config for cost calculation.
   * @param config.cost_per_1k_input_tokens  - USD cost per 1,000 input tokens.
   * @param config.cost_per_1k_output_tokens - USD cost per 1,000 output tokens.
   */
  constructor(config) {
    this.costPer1kInput = config.cost_per_1k_input_tokens;
    this.costPer1kOutput = config.cost_per_1k_output_tokens;
  }
  // -------------------------------------------------------------------------
  // Core parsing
  // -------------------------------------------------------------------------
  /**
   * Parse a JSONL file from an optional byte offset.
   *
   * Uses readline for memory-efficient line-by-line reading. The byte offset
   * enables incremental / tail-style reads: persist `result.newOffset` and
   * pass it as `fromOffset` on the next call to read only new content.
   *
   * @param filePath   - Absolute path to the JSONL file.
   * @param fromOffset - Byte offset to start reading from (default: 0).
   * @returns Parsed records, new byte offset, and parse statistics.
   */
  async parseFile(filePath, fromOffset = 0) {
    const errors = [];
    const records = [];
    let linesParsed = 0;
    let linesSkipped = 0;
    let byteOffset = fromOffset;
    let fileSize;
    try {
      const fileStat = await stat(filePath);
      fileSize = fileStat.size;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        records,
        newOffset: fromOffset,
        linesParsed: 0,
        linesSkipped: 0,
        errors: [`Failed to stat file "${filePath}": ${message}`]
      };
    }
    if (fromOffset >= fileSize) {
      return { records, newOffset: fromOffset, linesParsed: 0, linesSkipped: 0, errors };
    }
    const stream = createReadStream(filePath, { start: fromOffset, encoding: "utf8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let bytesConsumed = 0;
    let lastValidOffset = fromOffset;
    for await (const line of rl) {
      const lineByteLength = Buffer.byteLength(line, "utf8") + 1;
      const trimmed = line.trim();
      if (trimmed === "") {
        bytesConsumed += lineByteLength;
        linesSkipped++;
        continue;
      }
      linesParsed++;
      const record = this.parseLine(trimmed);
      if (record !== null) {
        records.push(record);
        bytesConsumed += lineByteLength;
        lastValidOffset = fromOffset + bytesConsumed;
      } else {
        errors.push(`Skipped malformed line at ~offset ${fromOffset + bytesConsumed}: ${trimmed.slice(0, 80)}...`);
        bytesConsumed += lineByteLength;
        lastValidOffset = fromOffset + bytesConsumed;
        linesSkipped++;
      }
    }
    byteOffset = lastValidOffset;
    return {
      records,
      newOffset: byteOffset,
      linesParsed,
      linesSkipped,
      errors
    };
  }
  /**
   * Parse an array of pre-split text lines.
   *
   * Useful for testing or when the caller has already split content.
   * Skips empty lines silently.
   *
   * @param lines - Array of raw text lines (not yet JSON.parse'd).
   * @returns Successfully parsed records (malformed lines silently dropped).
   */
  parseLines(lines) {
    const records = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      const record = this.parseLine(trimmed);
      if (record !== null) records.push(record);
    }
    return records;
  }
  /**
   * Parse a single JSON line into a JSONLRecord.
   *
   * Returns null on any parse failure (invalid JSON, missing type field,
   * or unrecognised type value) — never throws.
   *
   * @param line - Single trimmed line of text from a JSONL file.
   * @returns Parsed record, or null if the line is malformed or unrecognised.
   */
  parseLine(line) {
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed !== "object" || parsed === null) return null;
      const record = parsed;
      const type = record["type"];
      if (type === "assistant") return record;
      if (type === "user") return record;
      if (type === "progress") return record;
      if (type === "file-history-snapshot") return record;
      return null;
    } catch {
      return null;
    }
  }
  // -------------------------------------------------------------------------
  // Extraction: ApiCallRecord
  // -------------------------------------------------------------------------
  /**
   * Extract API call records from assistant JSONL records.
   *
   * Each assistant record represents one Claude API response. Token counts
   * and cost are extracted from message.usage. Cost is calculated from
   * configured rates (cost_usd is NOT present in the JSONL format).
   *
   * Cache tokens are costed at reduced rates:
   *   - cache_read:  10% of input token cost (reading from cache is cheap)
   *   - cache_write: 25% of input token cost (writing to cache has a premium)
   *
   * @param records - Parsed JSONL records to scan.
   * @returns One ApiCallRecord per assistant record with usage data.
   */
  extractApiCalls(records) {
    const results = [];
    for (const record of records) {
      if (record.type !== "assistant") continue;
      const assistant = record;
      const usage = assistant.message?.usage;
      if (usage === void 0) continue;
      const inputTokens = usage.input_tokens ?? 0;
      const outputTokens = usage.output_tokens ?? 0;
      const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
      const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
      if (inputTokens === 0 && outputTokens === 0 && cacheReadTokens === 0 && cacheWriteTokens === 0) continue;
      const inputCost = inputTokens / 1e3 * this.costPer1kInput;
      const outputCost = outputTokens / 1e3 * this.costPer1kOutput;
      const cacheReadCost = cacheReadTokens / 1e3 * this.costPer1kInput * CACHE_READ_COST_RATIO;
      const cacheWriteCost = cacheWriteTokens / 1e3 * this.costPer1kInput * CACHE_WRITE_COST_RATIO;
      const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;
      results.push({
        session_id: assistant.sessionId ?? "",
        timestamp: assistant.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
        model: assistant.message?.model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_tokens: cacheReadTokens,
        cache_write_tokens: cacheWriteTokens,
        cost_usd: totalCost,
        duration_ms: 0,
        // Not available in JSONL; may be filled in by progress record correlation.
        stop_reason: assistant.message?.stop_reason
      });
    }
    return results;
  }
  // -------------------------------------------------------------------------
  // Extraction: ToolCallInfo
  // -------------------------------------------------------------------------
  /**
   * Extract tool call information by correlating assistant tool_use blocks
   * with their corresponding user tool_result blocks.
   *
   * Correlation is by tool_use_id (present in both the tool_use block and
   * the tool_result block).
   *
   * @param records - Parsed JSONL records to scan.
   * @returns One ToolCallInfo per tool_use block found in assistant records.
   */
  extractToolCalls(records) {
    const results = [];
    const resultMap = /* @__PURE__ */ new Map();
    for (const record of records) {
      if (record.type !== "user") continue;
      const user = record;
      const content = user.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const b = block;
        if (b?.type === "tool_result" && b.tool_use_id !== void 0) {
          resultMap.set(b.tool_use_id, b);
        }
      }
    }
    for (const record of records) {
      if (record.type !== "assistant") continue;
      const assistant = record;
      const content = assistant.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const b = block;
        if (b?.type !== "tool_use") continue;
        if (b.id === void 0 || b.name === void 0) continue;
        const result = resultMap.get(b.id);
        results.push({
          id: b.id,
          name: b.name,
          input: b.input ?? {},
          sessionId: assistant.sessionId ?? "",
          timestamp: assistant.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
          assistantRecordUuid: assistant.uuid ?? "",
          resultContent: result?.content,
          isError: result?.is_error
        });
      }
    }
    return results;
  }
  // -------------------------------------------------------------------------
  // Extraction: AgentActivityInfo
  // -------------------------------------------------------------------------
  /**
   * Infer agent activity from JSONL records.
   *
   * Agent spawns are NOT explicit record types. They are inferred from assistant
   * records containing tool_use blocks with name === 'Task'. Completion is
   * inferred by the presence of a tool_result block for the Task tool_use_id.
   *
   * @param records - Parsed JSONL records to scan.
   * @returns One AgentActivityInfo per Task tool_use block found.
   */
  extractAgentActivity(records) {
    const taskCalls = this.extractToolCalls(records).filter((tc) => tc.name === "Task");
    return taskCalls.map((tc) => ({
      agentId: tc.id,
      parentSessionId: tc.sessionId,
      spawnedAt: tc.timestamp,
      taskInput: tc.input,
      completed: tc.resultContent !== void 0,
      exitStatus: tc.isError === true ? "error" : tc.resultContent !== void 0 ? "success" : void 0
    }));
  }
  // -------------------------------------------------------------------------
  // Extraction: SessionInfo
  // -------------------------------------------------------------------------
  /**
   * Extract session-level summary information from a set of JSONL records.
   *
   * Uses the first record for session ID, cwd, and git branch.
   * Scans all records to find the earliest and latest timestamps.
   * Model comes from the first assistant record.
   *
   * @param records - All parsed records for a session.
   * @returns Session summary, or a stub with empty strings if no records are provided.
   */
  extractSessionInfo(records) {
    if (records.length === 0) {
      return {
        sessionId: "",
        model: "unknown",
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastActivityAt: (/* @__PURE__ */ new Date()).toISOString(),
        cwd: "",
        gitBranch: "",
        version: ""
      };
    }
    const first = records[0];
    let model = "unknown";
    let startedAt = first.timestamp ?? (/* @__PURE__ */ new Date()).toISOString();
    let lastActivityAt = startedAt;
    for (const record of records) {
      if (record.timestamp !== void 0 && record.timestamp < startedAt) {
        startedAt = record.timestamp;
      }
      if (record.timestamp !== void 0 && record.timestamp > lastActivityAt) {
        lastActivityAt = record.timestamp;
      }
      if (model === "unknown" && record.type === "assistant") {
        const assistantRecord = record;
        const m = assistantRecord.message?.model;
        if (m !== void 0 && m !== "") model = m;
      }
    }
    return {
      sessionId: first.sessionId ?? "",
      model,
      startedAt,
      lastActivityAt,
      cwd: first.cwd ?? "",
      gitBranch: first.gitBranch ?? "",
      version: first.version ?? ""
    };
  }
  // -------------------------------------------------------------------------
  // Extraction: PrecisionToolTiming
  // -------------------------------------------------------------------------
  /**
   * Extract precision tool timing data from JSONL progress records.
   *
   * Only 'completed' progress records contain elapsedTimeMs — 'started'
   * records are ignored since we only need the total duration.
   *
   * @param records - Parsed JSONL records to scan.
   * @returns One PrecisionToolTiming per completed progress event.
   */
  extractPrecisionToolTimings(records) {
    const results = [];
    for (const record of records) {
      if (record.type !== "progress") continue;
      const progress = record;
      const data = progress.data;
      if (data?.status !== "completed") continue;
      if (data.elapsedTimeMs === void 0) continue;
      if (progress.toolUseID === void 0) continue;
      results.push({
        toolUseId: progress.toolUseID,
        serverName: data.serverName ?? "",
        toolName: data.toolName ?? "",
        elapsedTimeMs: data.elapsedTimeMs,
        sessionId: progress.sessionId ?? "",
        timestamp: progress.timestamp ?? (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return results;
  }
  // -------------------------------------------------------------------------
  // Cost calculation helper
  // -------------------------------------------------------------------------
  /**
   * Calculate the USD cost for a given token breakdown.
   *
   * Uses configured per-1k rates with reduced rates for cache operations:
   *   - Input tokens:       full input rate
   *   - Output tokens:      full output rate
   *   - Cache read tokens:  10% of input rate
   *   - Cache write tokens: 25% of input rate
   *
   * @param usage - Token counts to calculate cost for.
   * @returns Total estimated cost in USD.
   */
  calculateCost(usage) {
    const inputCost = (usage.input_tokens ?? 0) / 1e3 * this.costPer1kInput;
    const outputCost = (usage.output_tokens ?? 0) / 1e3 * this.costPer1kOutput;
    const cacheReadCost = (usage.cache_read_tokens ?? 0) / 1e3 * this.costPer1kInput * CACHE_READ_COST_RATIO;
    const cacheWriteCost = (usage.cache_write_tokens ?? 0) / 1e3 * this.costPer1kInput * CACHE_WRITE_COST_RATIO;
    return inputCost + outputCost + cacheReadCost + cacheWriteCost;
  }
};
async function findActiveJsonlFile(projectDir) {
  let entries;
  try {
    entries = await readdir(projectDir);
  } catch {
    return null;
  }
  const jsonlFiles = entries.filter((e) => e.endsWith(".jsonl"));
  if (jsonlFiles.length === 0) return null;
  let latestPath = null;
  let latestMtime = 0;
  for (const file of jsonlFiles) {
    const fullPath = join5(projectDir, file);
    try {
      const s = statSync3(fullPath);
      if (s.mtimeMs > latestMtime) {
        latestMtime = s.mtimeMs;
        latestPath = fullPath;
      }
    } catch {
    }
  }
  return latestPath;
}
__name(findActiveJsonlFile, "findActiveJsonlFile");
function sessionIdFromPath(jsonlPath) {
  return basename(jsonlPath, ".jsonl");
}
__name(sessionIdFromPath, "sessionIdFromPath");

// src/daemon/anomaly-detector.ts
var DEFAULT_LOGGER = {
  warn: /* @__PURE__ */ __name((msg) => console.warn(`[analytics] ${msg}`), "warn")
};
var MIN_RECORDS_THRESHOLD = 10;
var BUILD_CMD_RE = /npm\s+run\s+(build|test|lint|typecheck)|npx\s+tsc|jest|vitest/i;
function windowKey(type, windowMs, now = Date.now()) {
  const bucket = Math.floor(now / windowMs);
  return `${type}:${bucket}`;
}
__name(windowKey, "windowKey");
function anomalyId(type) {
  return `anomaly_${type}_${Date.now()}`;
}
__name(anomalyId, "anomalyId");
function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
__name(average, "average");
var WINDOW_5_MIN = 5 * 60 * 1e3;
var WINDOW_10_MIN = 10 * 60 * 1e3;
var cacheDegradationRule = {
  type: "cache_degradation",
  severity: "warning",
  windowMs: WINDOW_5_MIN,
  description: "Cache hit rate dropped >15% vs session average in a 5-min window",
  check(telemetry, state) {
    const windowRecords = telemetry.getRecordsInWindow(WINDOW_5_MIN);
    if (windowRecords.length === 0) return null;
    const windowHits = windowRecords.filter((r) => r.cache_hit).length;
    const windowRate = windowHits / windowRecords.length;
    const sessionRate = state.metrics.cache.hit_rate;
    const drop = sessionRate - windowRate;
    if (drop >= 0.15) {
      return {
        id: anomalyId("cache_degradation"),
        type: "cache_degradation",
        severity: "warning",
        message: `Cache hit rate degraded: ${(windowRate * 100).toFixed(1)}% in last 5m vs ${(sessionRate * 100).toFixed(1)}% session avg (drop: ${(drop * 100).toFixed(1)}pp)`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: {
          window_rate: windowRate,
          session_rate: sessionRate,
          drop_pp: drop,
          window_records: windowRecords.length
        }
      };
    }
    return null;
  }
};
var errorSpikeRule = {
  type: "error_spike",
  severity: "alert",
  windowMs: WINDOW_5_MIN,
  description: "Error rate exceeds 25% in a 5-min window",
  check(telemetry, _state) {
    const windowRecords = telemetry.getRecordsInWindow(WINDOW_5_MIN);
    if (windowRecords.length === 0) return null;
    const failed = windowRecords.filter((r) => r.status === "failed").length;
    const errorRate = failed / windowRecords.length;
    if (errorRate > 0.25) {
      return {
        id: anomalyId("error_spike"),
        type: "error_spike",
        severity: "alert",
        message: `Error spike detected: ${(errorRate * 100).toFixed(1)}% failure rate in last 5m (${failed}/${windowRecords.length} calls)`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: {
          error_rate: errorRate,
          failed_calls: failed,
          total_calls: windowRecords.length
        }
      };
    }
    return null;
  }
};
var tokenBurnRule = {
  type: "token_burn",
  severity: "warning",
  windowMs: WINDOW_5_MIN,
  description: "Token consumption rate >2x session average in a 5-min window",
  check(telemetry, state) {
    const windowRecords = telemetry.getRecordsInWindow(WINDOW_5_MIN);
    if (windowRecords.length === 0) return null;
    const windowTokens = windowRecords.reduce(
      (sum, r) => sum + (r.tokens_in ?? 0) + (r.tokens_out ?? 0),
      0
    );
    const earliest = Math.min(...windowRecords.map((r) => new Date(r.created_at).getTime()));
    const span = Math.max(Date.now() - earliest, 1);
    const windowRate = windowTokens / span;
    const sessionTotalTokens = state.metrics.tokens.total;
    const sessionUptimeMs = state.uptime_ms;
    if (sessionUptimeMs <= 0 || sessionTotalTokens <= 0) return null;
    const sessionRate = sessionTotalTokens / sessionUptimeMs;
    if (sessionRate <= 0) return null;
    const ratio = windowRate / sessionRate;
    if (ratio > 2) {
      return {
        id: anomalyId("token_burn"),
        type: "token_burn",
        severity: "warning",
        message: `Token burn rate is ${ratio.toFixed(1)}x session average (${Math.round(windowTokens).toLocaleString()} tokens in last 5m)`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: {
          window_tokens: windowTokens,
          window_rate_per_ms: windowRate,
          session_rate_per_ms: sessionRate,
          ratio
        }
      };
    }
    return null;
  }
};
var buildRegressionRule = {
  type: "build_regression",
  severity: "warning",
  windowMs: WINDOW_5_MIN,
  description: "Build/test duration >2x session average in a 5-min window",
  check(telemetry, _state) {
    const allRecords = telemetry.getRecords();
    const buildRecords = allRecords.filter(
      (r) => r.tool === "exec" && r.metadata !== void 0 && isBuildCommand(r.metadata)
    );
    if (buildRecords.length < 2) return null;
    const windowSince = Date.now() - WINDOW_5_MIN;
    const windowBuildRecords = buildRecords.filter(
      (r) => new Date(r.created_at).getTime() >= windowSince
    );
    if (windowBuildRecords.length === 0) return null;
    const sessionAvg = average(
      buildRecords.map((r) => r.duration_ms ?? 0).filter((d) => d > 0)
    );
    if (sessionAvg <= 0) return null;
    const windowAvg = average(
      windowBuildRecords.map((r) => r.duration_ms ?? 0).filter((d) => d > 0)
    );
    if (windowAvg <= 0) return null;
    const ratio = windowAvg / sessionAvg;
    if (ratio > 2) {
      return {
        id: anomalyId("build_regression"),
        type: "build_regression",
        severity: "warning",
        message: `Build regression: avg ${Math.round(windowAvg)}ms in last 5m vs ${Math.round(sessionAvg)}ms session avg (${ratio.toFixed(1)}x slower)`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: {
          window_avg_ms: windowAvg,
          session_avg_ms: sessionAvg,
          ratio,
          window_build_count: windowBuildRecords.length
        }
      };
    }
    return null;
  }
};
var conflictStormRule = {
  type: "conflict_storm",
  severity: "alert",
  windowMs: WINDOW_5_MIN,
  description: ">3 file conflicts detected in a 5-min window",
  check(telemetry, state) {
    if (state.metrics.files.conflicts === 0) return null;
    const windowRecords = telemetry.getRecordsInWindow(WINDOW_5_MIN);
    const conflictRecords = windowRecords.filter((r) => isConflictRecord(r));
    if (conflictRecords.length > 3) {
      return {
        id: anomalyId("conflict_storm"),
        type: "conflict_storm",
        severity: "alert",
        message: `Conflict storm: ${conflictRecords.length} file conflicts in last 5m`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: {
          conflict_count: conflictRecords.length,
          window_ms: WINDOW_5_MIN
        }
      };
    }
    return null;
  }
};
var agentStallRule = {
  type: "agent_stall",
  severity: "warning",
  windowMs: WINDOW_10_MIN,
  description: "Agent running >10min without tool call",
  check(_telemetry, state) {
    const now = Date.now();
    const stalledAgents = [];
    for (const profile of state.agent_profiles) {
      if (profile.status !== "active") continue;
      const agentActivity = state.recent_activity.filter(
        (a) => a.agent_id === profile.agent_id
      );
      let lastActivityTime;
      if (agentActivity.length > 0) {
        const latest = agentActivity.reduce(
          (a, b) => new Date(a.timestamp).getTime() > new Date(b.timestamp).getTime() ? a : b
        );
        lastActivityTime = new Date(latest.timestamp).getTime();
      } else {
        lastActivityTime = now - profile.duration_ms;
      }
      const idleMs = now - lastActivityTime;
      if (idleMs > WINDOW_10_MIN) {
        stalledAgents.push(profile.agent_id);
      }
    }
    if (stalledAgents.length > 0) {
      return {
        id: anomalyId("agent_stall"),
        type: "agent_stall",
        severity: "warning",
        message: `Agent stall: ${stalledAgents.length} agent(s) inactive >10min: ${stalledAgents.slice(0, 3).join(", ")}${stalledAgents.length > 3 ? "..." : ""}`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: {
          stalled_agents: stalledAgents,
          stall_threshold_ms: WINDOW_10_MIN
        }
      };
    }
    return null;
  }
};
function isBuildCommand(metadata) {
  try {
    const parsed = JSON.parse(metadata);
    const meta = typeof parsed === "object" && parsed !== null ? parsed : {};
    const cmd = typeof meta["cmd"] === "string" ? meta["cmd"] : "";
    return BUILD_CMD_RE.test(cmd);
  } catch {
    return BUILD_CMD_RE.test(metadata);
  }
}
__name(isBuildCommand, "isBuildCommand");
function isConflictRecord(record) {
  if (record.tool === "conflict") return true;
  if (!record.metadata) return false;
  try {
    const parsed = JSON.parse(record.metadata);
    const meta = typeof parsed === "object" && parsed !== null ? parsed : {};
    return meta["conflict"] === true || meta["type"] === "conflict" || typeof meta["conflict_file"] === "string";
  } catch {
    return false;
  }
}
__name(isConflictRecord, "isConflictRecord");
var BUILT_IN_RULES = [
  cacheDegradationRule,
  errorSpikeRule,
  tokenBurnRule,
  buildRegressionRule,
  conflictStormRule,
  agentStallRule
];
var AnomalyDetector = class {
  static {
    __name(this, "AnomalyDetector");
  }
  telemetry;
  config;
  rules;
  logger;
  /**
   * In-memory list of detected anomalies (newest last).
   * Pruned on demand via `pruneStale()`.
   */
  anomalies = [];
  /**
   * Deduplication map: windowKey(type, windowMs) → timestamp of last fire.
   * Prevents the same type from firing more than once per window bucket.
   */
  fired = /* @__PURE__ */ new Map();
  /**
   * @param telemetry - Initialized TelemetryReader (may be unavailable).
   * @param config    - Analytics configuration (detection can be disabled).
   * @param logger    - Optional structured logger; defaults to prefixed console.warn.
   */
  constructor(telemetry, config, logger = DEFAULT_LOGGER) {
    this.telemetry = telemetry;
    this.config = config;
    this.rules = BUILT_IN_RULES;
    this.logger = logger;
  }
  /**
   * Evaluate all rules against the current state and return any new anomalies.
   *
   * Rules that have already fired within their window are skipped (deduplicated).
   * Anomalies are also appended to the internal list returned by
   * `getActiveAnomalies()`.
   *
   * Returns an empty array if:
   *   - `config.anomaly_detection` is false, or
   *   - fewer than 10 total tool-call records exist (early-session protection), or
   *   - the telemetry reader is unavailable.
   *
   * @param state - Current aggregated dashboard state.
   * @returns Newly detected anomalies (may be empty).
   */
  detect(state) {
    if (!this.config.anomaly_detection) return [];
    if (!this.telemetry.isAvailable()) return [];
    const allRecords = this.telemetry.getRecords();
    if (allRecords.length < MIN_RECORDS_THRESHOLD) return [];
    this.pruneStale(30 * 60 * 1e3);
    const newAnomalies = [];
    const now = Date.now();
    for (const rule of this.rules) {
      const key = windowKey(rule.type, rule.windowMs, now);
      if (this.fired.has(key)) {
        continue;
      }
      let anomaly = null;
      try {
        anomaly = rule.check(this.telemetry, state);
      } catch (err) {
        this.logger.warn(`Rule '${rule.type}' threw an error: ${String(err)}`);
        continue;
      }
      if (anomaly !== null) {
        this.fired.set(key, now);
        this.anomalies.push(anomaly);
        newAnomalies.push(anomaly);
      }
    }
    return newAnomalies;
  }
  /**
   * Return all anomalies currently held in memory.
   *
   * The list includes all anomalies since the last `pruneStale()` call.
   * Ordered chronologically (oldest first).
   *
   * @returns Shallow copy of the active anomaly list.
   */
  getActiveAnomalies() {
    return [...this.anomalies];
  }
  /**
   * Remove anomalies older than `maxAgeMs` milliseconds from the in-memory
   * list, and clean up stale deduplication entries.
   *
   * Safe to call during or between `detect()` cycles. Keys to delete are
   * collected first to avoid mutating the Map during iteration.
   *
   * @param maxAgeMs - Maximum age in milliseconds. Anomalies older than this
   *                   are discarded.
   */
  pruneStale(maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    this.anomalies = this.anomalies.filter(
      (a) => new Date(a.timestamp).getTime() > cutoff
    );
    const toDelete = [];
    for (const [key, ts] of this.fired.entries()) {
      if (ts < cutoff) toDelete.push(key);
    }
    for (const key of toDelete) this.fired.delete(key);
  }
};

// src/daemon/budget-tracker.ts
var BudgetTracker = class {
  static {
    __name(this, "BudgetTracker");
  }
  /** Active budget configuration, or null if no budget is set. */
  budgetAmount = null;
  budgetUnit = null;
  /** Sorted ascending warn thresholds (fractions, e.g. [0.5, 0.8, 1.0]). */
  warnThresholds = [];
  /** Thresholds (as percentage fractions) that have already been reported. */
  crossedThresholds = /* @__PURE__ */ new Set();
  /** Most recently computed BudgetState. */
  currentState = null;
  /**
   * @param config - AnalyticsConfig to read initial budget and thresholds from.
   */
  constructor(config) {
    this.applyConfig(config);
  }
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  /**
   * Override or set a budget amount and unit.
   * Resets all crossed-threshold tracking when the budget changes.
   *
   * @param amount - Budget limit in the given unit.
   * @param unit   - Either 'dollars' or 'tokens'.
   */
  setBudget(amount, unit) {
    this.budgetAmount = amount;
    this.budgetUnit = unit;
    this.crossedThresholds.clear();
    this.currentState = null;
  }
  /**
   * Clear the active budget. All methods will return null after this call.
   */
  clearBudget() {
    this.budgetAmount = null;
    this.budgetUnit = null;
    this.crossedThresholds.clear();
    this.currentState = null;
  }
  /**
   * Recompute BudgetState from the provided metrics and config.
   *
   * @param metrics - Current session metrics snapshot.
   * @param config  - Current analytics configuration.
   * @returns The newly computed BudgetState, or null if no budget is configured.
   */
  update(metrics, config) {
    this.warnThresholds = [...config.budget_warn_thresholds].sort((a, b) => a - b);
    const amount = this.budgetAmount ?? config.budget?.amount ?? null;
    const unit = this.budgetUnit ?? config.budget?.unit ?? null;
    if (amount === null || unit === null) {
      this.currentState = null;
      return null;
    }
    const used = unit === "dollars" ? metrics.cost.total : metrics.tokens.total;
    const remaining = Math.max(0, amount - used);
    const percentage = amount > 0 ? used / amount : 0;
    const currentThreshold = this.resolveCurrentThreshold(percentage);
    this.currentState = {
      amount,
      unit,
      used,
      remaining,
      percentage,
      warn_thresholds: [...this.warnThresholds],
      current_threshold: currentThreshold
    };
    return this.currentState;
  }
  /**
   * Return the current BudgetState without recomputing.
   * Returns null if update() has not been called or no budget is configured.
   */
  getState() {
    return this.currentState;
  }
  /**
   * Check whether any new thresholds have been crossed since the last call.
   *
   * A threshold is "crossed" when the current usage percentage equals or
   * exceeds the threshold fraction. Each threshold is returned at most once
   * per session — subsequent calls return null for already-reported thresholds.
   *
   * @returns The lowest newly-crossed threshold or null if none.
   */
  checkThresholds() {
    if (this.currentState === null) return null;
    const { percentage } = this.currentState;
    for (const threshold of this.warnThresholds) {
      if (percentage >= threshold && !this.crossedThresholds.has(threshold)) {
        this.crossedThresholds.add(threshold);
        return { crossed: true, threshold };
      }
    }
    return null;
  }
  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------
  /**
   * Apply budget and threshold settings from a config object.
   */
  applyConfig(config) {
    if (config.budget) {
      this.budgetAmount = config.budget.amount;
      this.budgetUnit = config.budget.unit;
    }
    this.warnThresholds = [...config.budget_warn_thresholds].sort((a, b) => a - b);
  }
  /**
   * Find the highest threshold that the current percentage has reached.
   * Returns null if no threshold has been crossed.
   */
  resolveCurrentThreshold(percentage) {
    let highest = null;
    for (const threshold of this.warnThresholds) {
      if (percentage >= threshold) {
        highest = threshold;
      }
    }
    return highest;
  }
};

// src/daemon/memory-updater.ts
import { readFileSync as readFileSync5, writeFileSync as writeFileSync2, renameSync, mkdirSync, unlinkSync } from "node:fs";
import { join as join6 } from "node:path";
var HIGH_READ_COUNT = 5;
var SLOW_COMMAND_MS = 2e4;
var GOOD_CACHE_RATE = 0.7;
var HIGH_CONFLICT_COUNT = 5;
var MemoryUpdater = class {
  static {
    __name(this, "MemoryUpdater");
  }
  memoryDir;
  /**
   * @param memoryDir - Absolute path to the .goodvibes/memory/ directory.
   */
  constructor(memoryDir) {
    this.memoryDir = memoryDir;
  }
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  /**
   * Analyse a dashboard state snapshot and produce pattern/preference updates.
   *
   * Does NOT write anything to disk — call apply() to persist the results.
   *
   * @param state - Current DashboardState from the analytics daemon.
   * @returns Object with `patterns` and `preferences` arrays.
   */
  analyze(state) {
    const patterns = [];
    const preferences = [];
    const hotFiles = state.file_hotspots.filter((h) => h.reads >= HIGH_READ_COUNT);
    if (hotFiles.length > 0) {
      patterns.push({
        id: "pat_analytics_outline_mode",
        name: "FrequentlyReadFilesOutlineMode",
        description: `${hotFiles.length} file(s) were read ${HIGH_READ_COUNT}+ times this session. Use extract: outline or extract: symbols for repeated reads to save tokens.`,
        when_to_use: "When reading the same file more than 5 times in a session to understand its structure.",
        example_files: hotFiles.slice(0, 3).map((h) => h.path),
        keywords: ["outline", "symbols", "frequent-reads", "token-efficiency", "precision_read"]
      });
      preferences.push({
        key: "precision.default_extract_mode",
        value: "outline",
        reason: `${hotFiles.length} file(s) were read ${HIGH_READ_COUNT}+ times. Defaulting repeated reads to outline mode reduces token consumption.`
      });
    }
    const { commands } = state.metrics;
    if (commands.avg_duration_ms > SLOW_COMMAND_MS) {
      patterns.push({
        id: "pat_analytics_slow_commands",
        name: "SlowCommandOptimisation",
        description: `Commands averaged ${Math.round(commands.avg_duration_ms / 1e3)}s this session. Consider caching results, parallelising steps, or using incremental builds.`,
        when_to_use: "When command execution is a bottleneck in the development loop.",
        example_files: [],
        keywords: ["slow", "commands", "performance", "build", "optimisation"]
      });
    }
    const { cache } = state.metrics;
    if (cache.hit_rate >= GOOD_CACHE_RATE) {
      patterns.push({
        id: "pat_analytics_cache_efficiency",
        name: "HighCacheHitRate",
        description: `Cache hit rate was ${Math.round(cache.hit_rate * 100)}% this session. Current precision_read usage patterns are token-efficient \u2014 maintain them.`,
        when_to_use: "When deciding whether to change file-reading patterns; current approach is working well.",
        example_files: [],
        keywords: ["cache", "hit-rate", "efficiency", "precision_read", "positive"]
      });
      preferences.push({
        key: "cache.strategy",
        value: "with_content",
        reason: `High cache hit rate (${Math.round(cache.hit_rate * 100)}%) observed. Keep content caching enabled.`
      });
    }
    const { files } = state.metrics;
    if (files.conflicts >= HIGH_CONFLICT_COUNT) {
      patterns.push({
        id: "pat_analytics_conflict_coordination",
        name: "HighConflictCoordination",
        description: `${files.conflicts} file conflicts detected this session. Use agent scoping (per-feature subdirectories) to reduce concurrent write contention.`,
        when_to_use: "When multiple agents are writing to overlapping file paths in the same session.",
        example_files: [],
        keywords: ["conflicts", "coordination", "agent", "concurrency", "scoping"]
      });
    }
    return { patterns, preferences };
  }
  /**
   * Persist the provided updates to .goodvibes/memory/patterns.json and
   * .goodvibes/memory/preferences.json.
   *
   * Merge semantics:
   *   - Existing entries with the same id/key are replaced.
   *   - New entries are appended.
   *   - Entries absent from the update are preserved unchanged.
   *
   * Writes are atomic: content goes to a .tmp sibling first, then renamed.
   *
   * @param updates - Output from analyze().
   */
  apply(updates) {
    try {
      mkdirSync(this.memoryDir, { recursive: true });
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code !== "EEXIST") {
        throw err;
      }
    }
    if (updates.patterns.length > 0) {
      this.mergeAndWrite(
        join6(this.memoryDir, "patterns.json"),
        updates.patterns,
        "id"
      );
    }
    if (updates.preferences.length > 0) {
      this.mergeAndWrite(
        join6(this.memoryDir, "preferences.json"),
        updates.preferences,
        "key"
      );
    }
  }
  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------
  /**
   * Read an existing JSON array file, merge new entries by key, and atomically
   * write the result back.
   *
   * @param filePath  - Absolute path to the target .json file.
   * @param updates   - Array of items to merge in.
   * @param mergeKey  - Property name used as the unique identifier for merging.
   */
  mergeAndWrite(filePath, updates, mergeKey) {
    const existing = this.readJsonArray(filePath);
    const byKey = /* @__PURE__ */ new Map();
    for (const entry of existing) {
      byKey.set(entry[mergeKey], entry);
    }
    for (const update of updates) {
      byKey.set(update[mergeKey], { ...byKey.get(update[mergeKey]), ...update });
    }
    const merged = [];
    for (const entry of existing) {
      const key = entry[mergeKey];
      const updated = byKey.get(key);
      if (updated !== void 0) {
        merged.push(updated);
      }
    }
    const existingKeys = new Set(existing.map((e) => e[mergeKey]));
    for (const update of updates) {
      if (!existingKeys.has(update[mergeKey])) {
        merged.push(update);
      }
    }
    this.atomicWriteJson(filePath, merged);
  }
  /**
   * Read a JSON array file. Returns an empty array on any read/parse error.
   */
  readJsonArray(filePath) {
    try {
      const raw = readFileSync5(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch {
      return [];
    }
  }
  /**
   * Atomically write a JSON-serialisable value to filePath.
   *
   * Writes to filePath + '.tmp' within the same directory, then renames.
   * rename() on the same filesystem is atomic on POSIX systems.
   *
   * @throws If the write or rename fails.
   */
  atomicWriteJson(filePath, data) {
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    const content = JSON.stringify(data, null, 2) + "\n";
    try {
      writeFileSync2(tmpPath, content, { encoding: "utf-8" });
      renameSync(tmpPath, filePath);
    } catch (err) {
      try {
        unlinkSync(tmpPath);
      } catch {
      }
      throw err;
    }
  }
};

// src/daemon/watcher.ts
import { EventEmitter as EventEmitter2 } from "node:events";
import { watch as watch2, existsSync as existsSync5, statSync as statSync5 } from "node:fs";
import { join as join8, dirname as dirname2, basename as basename2 } from "node:path";

// src/data/jsonl-watcher.ts
import { EventEmitter } from "node:events";
import { watch, existsSync as existsSync4, statSync as statSync4 } from "node:fs";
import { join as join7 } from "node:path";
import { readdir as readdir2 } from "node:fs/promises";
var JSONLWatcher = class extends EventEmitter {
  static {
    __name(this, "JSONLWatcher");
  }
  projectDir;
  batchIntervalMs;
  pollIntervalMs;
  reader;
  /** Currently active session JSONL path. */
  activeSessionPath = null;
  /** Currently active session ID. */
  activeSessionId = null;
  /** All watched files (main session + subagents). */
  watchedFiles = /* @__PURE__ */ new Map();
  /** Pending records accumulated between batch flushes. */
  pendingRecords = [];
  /** Batch flush interval handle. */
  batchTimer = null;
  /** Active session rotation detection interval. */
  rotationTimer = null;
  /** Whether the watcher is running. */
  running = false;
  /** Watcher for the subagent directory (kept separate from watchedFiles). */
  subagentDirWatcher = null;
  /**
   * @param projectDir - Absolute path to the Claude project directory
   *                     (e.g. ~/.claude/projects/<project-hash>/).
   * @param options    - Optional configuration overrides.
   */
  constructor(projectDir, options) {
    super();
    this.projectDir = projectDir;
    this.batchIntervalMs = options?.batchIntervalMs ?? 1e3;
    this.pollIntervalMs = options?.pollIntervalMs ?? 2e3;
    this.reader = new JSONLReader(
      options?.costConfig ?? { cost_per_1k_input_tokens: 3e-3, cost_per_1k_output_tokens: 0.015 }
    );
  }
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  /**
   * Start watching the project directory for JSONL activity.
   *
   * Finds the active session JSONL, begins watching it, sets up subagent
   * watching, and starts the batch flush interval. Safe to call multiple
   * times — subsequent calls are no-ops if already running.
   */
  start() {
    if (this.running) return;
    this.running = true;
    this.initSessionWatch().catch((err) => {
      this.emitError(err instanceof Error ? err : new Error(String(err)));
    });
    this.batchTimer = setInterval(() => {
      this.flushPendingRecords();
    }, this.batchIntervalMs);
    this.rotationTimer = setInterval(() => {
      this.checkSessionRotation().catch((err) => {
        this.emitError(err instanceof Error ? err : new Error(String(err)));
      });
    }, 5e3);
  }
  /**
   * Stop all watchers, flush any pending records, and clean up timers.
   * Safe to call multiple times.
   */
  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.batchTimer !== null) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    if (this.rotationTimer !== null) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
    this.flushPendingRecords();
    for (const watched of this.watchedFiles.values()) {
      try {
        watched.handle.close();
      } catch {
      }
    }
    this.watchedFiles.clear();
    if (this.subagentDirWatcher !== null) {
      try {
        this.subagentDirWatcher.watcher.close();
      } catch {
      }
      this.subagentDirWatcher = null;
    }
    this.activeSessionPath = null;
    this.activeSessionId = null;
    this.pendingRecords = [];
  }
  /**
   * Returns the currently active session ID, or null if none has been detected.
   */
  getActiveSessionId() {
    return this.activeSessionId;
  }
  // -------------------------------------------------------------------------
  // Typed emit overrides
  // -------------------------------------------------------------------------
  /** Type-safe emit. */
  emit(event, ...args) {
    return super.emit(event, ...args);
  }
  /** Type-safe on. */
  on(event, listener) {
    return super.on(event, listener);
  }
  /** Type-safe once. */
  once(event, listener) {
    return super.once(event, listener);
  }
  /** Type-safe off. */
  off(event, listener) {
    return super.off(event, listener);
  }
  // -------------------------------------------------------------------------
  // Session initialisation
  // -------------------------------------------------------------------------
  /**
   * Detect the active session JSONL file and begin watching it.
   */
  async initSessionWatch() {
    const activePath = await findActiveJsonlFile(this.projectDir);
    if (activePath === null) {
      this.watchDirectoryForNewSession();
      return;
    }
    await this.switchToSession(activePath);
  }
  /**
   * Switch to watching a new session JSONL file.
   * Stops watching the previous session file and subagents.
   */
  async switchToSession(jsonlPath) {
    const newSessionId = sessionIdFromPath(jsonlPath);
    if (this.activeSessionPath !== null && this.activeSessionPath !== jsonlPath) {
      for (const [path6, watched] of this.watchedFiles.entries()) {
        try {
          watched.handle.close();
        } catch {
        }
        this.watchedFiles.delete(path6);
      }
      this.emit("session-change", newSessionId);
    }
    this.activeSessionPath = jsonlPath;
    this.activeSessionId = newSessionId;
    if (!this.watchedFiles.has(jsonlPath)) {
      this.attachFileWatcher(jsonlPath, false);
    }
    await this.watchSubagentFiles(newSessionId);
  }
  // -------------------------------------------------------------------------
  // File watching
  // -------------------------------------------------------------------------
  /**
   * Attach a watcher on a specific JSONL file.
   * Uses fs.watch with a polling fallback.
   *
   * @param filePath   - Absolute path to the JSONL file.
   * @param isSubagent - Whether this file belongs to a subagent.
   */
  attachFileWatcher(filePath, isSubagent) {
    if (this.watchedFiles.has(filePath)) return;
    const watched = {
      path: filePath,
      offset: 0,
      handle: { close() {
      } },
      // placeholder; replaced below
      isSubagent
    };
    const onFileChange = /* @__PURE__ */ __name(() => {
      this.readNewLines(watched).catch((err) => {
        this.emitError(err instanceof Error ? err : new Error(String(err)));
      });
    }, "onFileChange");
    try {
      const fsWatcher = watch(filePath, { persistent: false }, onFileChange);
      fsWatcher.on("error", (_err) => {
        try {
          fsWatcher.close();
        } catch {
        }
        if (this.watchedFiles.has(filePath)) {
          const w = this.watchedFiles.get(filePath);
          w.handle = this.createPollingHandle(filePath, onFileChange);
        }
      });
      watched.handle = fsWatcher;
    } catch {
      watched.handle = this.createPollingHandle(filePath, onFileChange);
    }
    this.watchedFiles.set(filePath, watched);
    this.readNewLines(watched).catch((err) => {
      this.emitError(err instanceof Error ? err : new Error(String(err)));
    });
  }
  /**
   * Create a polling handle for filesystems that do not support inotify.
   *
   * @param filePath - Path to poll.
   * @param onChange - Callback to invoke when mtime changes.
   * @returns A { close() } compatible handle.
   */
  createPollingHandle(filePath, onChange) {
    let lastMtime = 0;
    try {
      lastMtime = statSync4(filePath).mtimeMs;
    } catch {
    }
    const interval = setInterval(() => {
      if (!this.running) {
        clearInterval(interval);
        return;
      }
      try {
        const s = statSync4(filePath);
        if (s.mtimeMs !== lastMtime) {
          lastMtime = s.mtimeMs;
          onChange();
        }
      } catch {
      }
    }, this.pollIntervalMs);
    return { close: /* @__PURE__ */ __name(() => clearInterval(interval), "close") };
  }
  /**
   * Watch the project directory itself for new JSONL files (before any session starts).
   */
  watchDirectoryForNewSession() {
    const dirPath = this.projectDir;
    if (!existsSync4(dirPath)) return;
    let handle;
    const onDirChange = /* @__PURE__ */ __name((_eventType, filename) => {
      if (filename === null || !filename.endsWith(".jsonl")) return;
      const fullPath = join7(dirPath, filename);
      if (!existsSync4(fullPath)) return;
      this.switchToSession(fullPath).catch((err) => {
        this.emitError(err instanceof Error ? err : new Error(String(err)));
      });
      try {
        handle.close();
      } catch {
      }
    }, "onDirChange");
    try {
      handle = watch(dirPath, { persistent: false }, onDirChange);
    } catch {
      handle = { close() {
      } };
    }
  }
  // -------------------------------------------------------------------------
  // Subagent watching
  // -------------------------------------------------------------------------
  /**
   * Discover and watch subagent JSONL files for a session.
   *
   * Subagent files live at: <projectDir>/<sessionId>/subagents/agent-*.jsonl
   *
   * @param sessionId - The parent session ID.
   */
  async watchSubagentFiles(sessionId) {
    const subagentDir = join7(this.projectDir, sessionId, "subagents");
    if (!existsSync4(subagentDir)) return;
    let entries;
    try {
      entries = await readdir2(subagentDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.startsWith("agent-") || !entry.endsWith(".jsonl")) continue;
      const fullPath = join7(subagentDir, entry);
      if (!this.watchedFiles.has(fullPath)) {
        this.attachFileWatcher(fullPath, true);
      }
    }
    this.watchSubagentDirectory(subagentDir, sessionId);
  }
  /**
   * Watch a subagent directory for newly created agent JSONL files.
   *
   * @param subagentDir - Absolute path to the subagents/ directory.
   * @param sessionId   - Parent session ID (for validation).
   */
  watchSubagentDirectory(subagentDir, sessionId) {
    if (this.subagentDirWatcher !== null && this.subagentDirWatcher.path === subagentDir) return;
    const onDirChange = /* @__PURE__ */ __name((_eventType, filename) => {
      if (this.activeSessionId !== sessionId) return;
      if (filename === null) return;
      if (!filename.startsWith("agent-") || !filename.endsWith(".jsonl")) return;
      const fullPath = join7(subagentDir, filename);
      if (!existsSync4(fullPath)) return;
      if (!this.watchedFiles.has(fullPath)) {
        this.attachFileWatcher(fullPath, true);
      }
    }, "onDirChange");
    let handle;
    try {
      handle = watch(subagentDir, { persistent: false }, onDirChange);
    } catch {
      handle = { close() {
      } };
    }
    this.subagentDirWatcher = { watcher: handle, path: subagentDir };
  }
  // -------------------------------------------------------------------------
  // Incremental reading
  // -------------------------------------------------------------------------
  /**
   * Read new lines from a watched file starting at its current offset.
   * Parsed records are accumulated in pendingRecords for batch flush.
   *
   * @param watched - The watched file state to read from.
   */
  async readNewLines(watched) {
    if (!this.running) return;
    try {
      const result = await this.reader.parseFile(watched.path, watched.offset);
      watched.offset = result.newOffset;
      if (result.records.length > 0) {
        this.pendingRecords.push(...result.records);
      }
      for (const error of result.errors) {
        this.emitError(new Error(`[JSONLWatcher] ${error}`));
      }
    } catch (err) {
      this.emitError(err instanceof Error ? err : new Error(String(err)));
    }
  }
  // -------------------------------------------------------------------------
  // Batch flush
  // -------------------------------------------------------------------------
  /**
   * Emit and clear the accumulated pending records.
   * Called by the batch interval timer and on stop().
   */
  flushPendingRecords() {
    if (this.pendingRecords.length === 0) return;
    const batch = this.pendingRecords.splice(0);
    this.emit("records", batch);
  }
  // -------------------------------------------------------------------------
  // Session rotation detection
  // -------------------------------------------------------------------------
  /**
   * Check whether a newer JSONL file has appeared (new session started).
   * Called periodically by the rotation timer.
   */
  async checkSessionRotation() {
    if (!this.running) return;
    const activePath = await findActiveJsonlFile(this.projectDir);
    if (activePath === null) return;
    if (activePath === this.activeSessionPath) return;
    await this.switchToSession(activePath);
  }
  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  /**
   * Emit an error event. Per EventEmitter convention, error events must have
   * a listener or they throw. We guard against this by checking listeners.
   */
  emitError(err) {
    if (this.listenerCount("error") > 0) {
      this.emit("error", err);
    }
  }
};

// src/daemon/watcher.ts
var DEBOUNCE_MS = 100;
var DataWatcher = class extends EventEmitter2 {
  static {
    __name(this, "DataWatcher");
  }
  goodvibesDir;
  pollIntervalMs;
  /** Active FSWatcher handles, keyed by the logical target path. */
  watchers = /* @__PURE__ */ new Map();
  /** Debounce timer handles, keyed by no-arg event names (all except 'jsonl-records'). */
  debounceTimers = /* @__PURE__ */ new Map();
  /** Whether the watcher is currently running. */
  running = false;
  /**
   * Embedded JSONLWatcher for live JSONL tailing.
   * Created when jsonlProjectDir is provided in options.
   * Null if no JSONL project directory is configured.
   */
  jsonlWatcher = null;
  /**
   * @param goodvibesDir - Absolute path to the .goodvibes directory.
   * @param options      - Configuration options.
   */
  constructor(goodvibesDir, options) {
    super();
    this.goodvibesDir = goodvibesDir;
    this.pollIntervalMs = options?.pollIntervalMs ?? 1e3;
    if (options?.jsonlProjectDir !== void 0) {
      this.jsonlWatcher = new JSONLWatcher(options.jsonlProjectDir, {
        batchIntervalMs: options.jsonlBatchIntervalMs,
        pollIntervalMs: options.pollIntervalMs,
        costConfig: options.jsonlCostConfig
      });
      this.jsonlWatcher.on("records", (records) => {
        if (this.running) this.emit("jsonl-records", records);
      });
      this.jsonlWatcher.on("error", (err) => {
        console.warn(`[analytics:watcher] JSONL watcher error: ${err.message}`);
      });
    }
  }
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  /**
   * Start watching all tracked paths.
   * Safe to call multiple times — subsequent calls are no-ops if already running.
   */
  start() {
    if (this.running) return;
    this.running = true;
    this.attachWatchers();
    if (this.jsonlWatcher !== null) {
      this.jsonlWatcher.start();
    }
  }
  /**
   * Stop all active watchers and cancel pending debounce timers.
   * Safe to call multiple times — subsequent calls on a stopped watcher are no-ops.
   */
  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.jsonlWatcher !== null) {
      try {
        this.jsonlWatcher.stop();
      } catch {
      }
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    for (const watcher of this.watchers.values()) {
      try {
        watcher.close();
      } catch {
      }
    }
    this.watchers.clear();
  }
  /**
   * Returns true if the watcher is currently active.
   */
  isRunning() {
    return this.running;
  }
  // -------------------------------------------------------------------------
  // Typed emit overrides
  // -------------------------------------------------------------------------
  /** Type-safe emit. */
  emit(event, ...args) {
    return super.emit(event, ...args);
  }
  /** Type-safe on. */
  on(event, listener) {
    return super.on(event, listener);
  }
  /** Type-safe once. */
  once(event, listener) {
    return super.once(event, listener);
  }
  /** Type-safe off. */
  off(event, listener) {
    return super.off(event, listener);
  }
  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------
  /**
   * Attach FSWatcher instances for each tracked path.
   * Paths that do not yet exist are watched via their parent directory.
   */
  attachWatchers() {
    const entries = [
      {
        targetPath: join8(this.goodvibesDir, "telemetry", "telemetry.db"),
        event: "telemetry-change"
      },
      {
        targetPath: join8(this.goodvibesDir, "state"),
        event: "session-change"
      },
      {
        targetPath: join8(this.goodvibesDir, "project-index.json"),
        event: "index-change"
      },
      {
        targetPath: join8(this.goodvibesDir, "goodvibes.json"),
        event: "config-change"
      }
    ];
    for (const entry of entries) {
      this.watchPath(entry.targetPath, entry.event);
    }
  }
  /**
   * Attach a single FSWatcher for a path.
   *
   * If the target path does not yet exist, watches the parent directory instead
   * and fires the event when the target filename is created or changed.
   * For directory targets (e.g. state/), any change within the directory fires.
   *
   * Falls back to mtime polling when fs.watch throws (e.g. ENOSYS on some
   * container filesystems or network mounts).
   *
   * @param targetPath - Logical path we care about (file or directory).
   * @param event      - Watcher event name to emit on change.
   */
  watchPath(targetPath, event) {
    const targetBasename = basename2(targetPath);
    const isDir = this.pathIsDirectory(targetPath);
    const watchTarget = existsSync5(targetPath) ? targetPath : dirname2(targetPath);
    const handler = /* @__PURE__ */ __name((_eventType, filename) => {
      if (existsSync5(targetPath)) {
        if (!isDir && filename !== null && filename !== targetBasename) {
          return;
        }
      } else {
        if (filename !== targetBasename) return;
        if (existsSync5(targetPath)) {
          this.rewatchPath(targetPath, event);
          return;
        }
      }
      this.debounceEmit(event);
    }, "handler");
    try {
      const watcher = watch2(watchTarget, {
        persistent: false
        /* watcher won't keep the Node.js process alive */
      }, handler);
      watcher.on("error", (_err) => {
        try {
          watcher.close();
        } catch {
        }
        this.watchers.delete(targetPath);
        this.attachPollingFallback(targetPath, event);
      });
      this.watchers.set(targetPath, watcher);
    } catch {
      this.attachPollingFallback(targetPath, event);
    }
  }
  /**
   * Re-attach a direct watcher for a path that has just been created.
   * Replaces any existing parent-directory watcher and emits the event once.
   *
   * @param targetPath - The path that now exists.
   * @param event      - Event name to emit.
   */
  rewatchPath(targetPath, event) {
    const existing = this.watchers.get(targetPath);
    if (existing) {
      try {
        existing.close();
      } catch {
      }
      this.watchers.delete(targetPath);
    }
    this.debounceEmit(event);
    this.watchPath(targetPath, event);
  }
  /**
   * Polling-based fallback for filesystems that do not support inotify.
   * Uses setInterval to periodically check the target file's mtime.
   *
   * @param targetPath    - Path to poll.
   * @param event         - Event to emit on change.
   */
  attachPollingFallback(targetPath, event) {
    if (this.watchers.has(targetPath)) return;
    let lastMtime = 0;
    try {
      lastMtime = statSync5(targetPath).mtimeMs;
    } catch {
    }
    const interval = setInterval(() => {
      if (!this.running) {
        clearInterval(interval);
        return;
      }
      try {
        const stat2 = statSync5(targetPath);
        if (stat2.mtimeMs !== lastMtime) {
          lastMtime = stat2.mtimeMs;
          this.debounceEmit(event);
        }
      } catch {
      }
    }, this.pollIntervalMs);
    const closeableInterval = {
      close: /* @__PURE__ */ __name(() => {
        clearInterval(interval);
      }, "close")
    };
    this.watchers.set(targetPath, closeableInterval);
  }
  /**
   * Returns true if the given path is an existing directory.
   */
  pathIsDirectory(targetPath) {
    try {
      return statSync5(targetPath).isDirectory();
    } catch {
      return false;
    }
  }
  /**
   * Debounce-emit an event. Subsequent calls within DEBOUNCE_MS reset the timer.
   *
   * @param event - Event name to emit after the debounce delay.
   */
  debounceEmit(event) {
    const existing = this.debounceTimers.get(event);
    if (existing !== void 0) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.debounceTimers.delete(event);
      if (this.running) {
        this.emit(event);
      }
    }, DEBOUNCE_MS);
    this.debounceTimers.set(event, timer);
  }
};

// src/daemon/aggregator.ts
var DEFAULT_LOGGER2 = {
  warn: /* @__PURE__ */ __name((msg) => console.warn(`[analytics:aggregator] ${msg}`), "warn")
};
var RECENT_ACTIVITY_LIMIT = 50;
var MEMORY_UPDATER_INTERVAL = 5;
var MAX_HOTSPOTS = 20;
var MAX_ANOMALIES = 50;
var GLOBAL_DB_DEBOUNCE_MS = 1e4;
function emptySessionMetrics() {
  return {
    tokens: { input: 0, output: 0, total: 0, saved: 0, efficiency: 0, api_input: 0, api_output: 0, cache_read: 0, cache_write: 0 },
    cache: { hit_rate: 0, hits: 0, misses: 0, memory_peak_mb: 0, evictions: 0 },
    cost: { input: 0, output: 0, total: 0, saved: 0 },
    commands: { total: 0, success_rate: 1, avg_duration_ms: 0, total_duration_ms: 0, failures: 0, slowest: null },
    agents: { spawned: 0, max_concurrent: 0, total_tokens: 0, active: 0, completed: 0 },
    files: { unique_read: 0, modified: 0, created: 0, conflicts: 0 }
  };
}
__name(emptySessionMetrics, "emptySessionMetrics");
function emptyDashboardState(sessionId, startedAt) {
  return {
    session_id: sessionId,
    started_at: startedAt,
    uptime_ms: 0,
    metrics: emptySessionMetrics(),
    tools_breakdown: {},
    recent_activity: [],
    file_hotspots: [],
    agent_profiles: [],
    anomalies: [],
    budget: null,
    health_status: "healthy"
  };
}
__name(emptyDashboardState, "emptyDashboardState");
function computeHealthStatus(anomalies, metrics) {
  const errorRate = 1 - metrics.commands.success_rate;
  const hasAlert = anomalies.some((a) => a.severity === "alert");
  const hasWarning = anomalies.some((a) => a.severity === "warning");
  if (hasAlert || errorRate > 0.25) return "alert";
  if (hasWarning || errorRate > 0.1) return "warning";
  return "healthy";
}
__name(computeHealthStatus, "computeHealthStatus");
var TOOL_TO_ACTIVITY_TYPE = {
  read: "read",
  write: "write",
  edit: "edit",
  exec: "exec",
  grep: "grep",
  glob: "glob",
  discover: "discover",
  conflict: "conflict",
  agent_spawn: "agent_spawn",
  agent_complete: "agent_complete",
  fetch: "fetch",
  symbols: "symbols",
  notebook: "notebook"
};
function toolToActivityType(tool) {
  return TOOL_TO_ACTIVITY_TYPE[tool] ?? "exec";
}
__name(toolToActivityType, "toolToActivityType");
function resolveJsonlProjectDir(goodvibesDir, jsonlBasePath) {
  const expandedBase = jsonlBasePath.startsWith("~") ? join9(homedir2(), jsonlBasePath.slice(1)) : jsonlBasePath;
  if (!existsSync6(expandedBase)) return null;
  let entries;
  try {
    entries = readdirSync2(expandedBase);
  } catch {
    return null;
  }
  const projectParent = basename3(dirname3(goodvibesDir));
  for (const entry of entries) {
    if (entry === projectParent) {
      const candidate = join9(expandedBase, entry);
      if (existsSync6(candidate)) return candidate;
    }
  }
  let latestMtime = 0;
  let latestDir = null;
  for (const entry of entries) {
    const dirPath = join9(expandedBase, entry);
    try {
      const s = statSync6(dirPath);
      if (s.isDirectory() && s.mtimeMs > latestMtime) {
        const subEntries = readdirSync2(dirPath);
        if (subEntries.some((f) => f.endsWith(".jsonl"))) {
          latestMtime = s.mtimeMs;
          latestDir = dirPath;
        }
      }
    } catch {
    }
  }
  if (latestDir !== null) {
    console.warn(
      `[analytics:aggregator] JSONL project directory not found for primary match; falling back to most recent directory`
    );
  }
  return latestDir;
}
__name(resolveJsonlProjectDir, "resolveJsonlProjectDir");
function emptyJsonlTotals() {
  return {
    api_input: 0,
    api_output: 0,
    cache_read: 0,
    cache_write: 0,
    cost_usd: 0,
    api_calls: 0,
    model: "unknown",
    started_at: null,
    last_activity_at: null
  };
}
__name(emptyJsonlTotals, "emptyJsonlTotals");
var Aggregator = class _Aggregator {
  static {
    __name(this, "Aggregator");
  }
  goodvibesDir;
  config;
  logger;
  // Data readers
  telemetry;
  session;
  index;
  // JSONL reader — created in initialize() from config pricing.
  jsonlReader = null;
  // Accumulated JSONL records from the current file, merged in batches.
  jsonlRecords = [];
  // Resolved path to the active JSONL file (null if not found).
  activeJsonlPath = null;
  // Session ID resolved from the active JSONL filename.
  jsonlSessionId = null;
  // Aggregated totals from JSONL records (recomputed after each accumulation).
  jsonlTotals = emptyJsonlTotals();
  // GlobalDB instance — injected by AnalyticsEngine before initialize().
  globalDb = null;
  // Debounce timer for GlobalDB upserts.
  globalDbSaveTimer = null;
  // Daemon components
  anomalyDetector;
  budgetTracker;
  memoryUpdater;
  watcher;
  /** Cached current state. Updated on every refresh. */
  state = emptyDashboardState("", (/* @__PURE__ */ new Date()).toISOString());
  /** Timestamp when the aggregator was initialized. */
  startedAt = (/* @__PURE__ */ new Date()).toISOString();
  /** Registered state-change callbacks. */
  callbacks = [];
  /** Counter tracking how many refresh cycles have run. */
  refreshCount = 0;
  /** Whether initialize() has completed. */
  initialized = false;
  /** Mutex: true while a refresh() call is in progress. */
  refreshing = false;
  /** Whether another refresh was requested while one was already running. */
  refreshQueued = false;
  /**
   * @param goodvibesDir - Absolute path to the .goodvibes directory.
   * @param config       - Analytics configuration.
   * @param logger       - Optional structured logger; defaults to prefixed console.warn.
   */
  constructor(goodvibesDir, config, logger = DEFAULT_LOGGER2) {
    this.goodvibesDir = goodvibesDir;
    this.config = config;
    this.logger = logger;
  }
  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * Inject the GlobalDB instance from the owning AnalyticsEngine.
   *
   * Must be called before `initialize()` if GlobalDB write-back is desired.
   * Safe to call at any time — if called after initialize(), subsequent
   * GlobalDB upserts will use the new instance.
   *
   * @param db - Initialized GlobalDB instance, or null to disable write-back.
   */
  setGlobalDb(db) {
    this.globalDb = db;
  }
  /**
   * Reload configuration without restarting the aggregator.
   *
   * Updates the stored config (including token costs) and recreates the
   * JSONLReader with the new pricing rates. Safe to call at any time after
   * initialize().
   *
   * @param newConfig - Updated analytics configuration.
   */
  reloadConfig(newConfig) {
    this.config = newConfig;
    this.jsonlReader = new JSONLReader({
      cost_per_1k_input_tokens: newConfig.cost_per_1k_input_tokens,
      cost_per_1k_output_tokens: newConfig.cost_per_1k_output_tokens
    });
    this.recomputeJsonlTotals();
    void this.refresh();
  }
  /**
   * Initialize all readers and start watching for changes.
   *
   * Must be called before `getState()` returns meaningful data.
   * Subsequent calls are no-ops (idempotent).
   *
   * @returns Promise that resolves once initialization is complete.
   */
  async initialize() {
    if (this.initialized) return;
    this.startedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.telemetry = new TelemetryReader(this.goodvibesDir);
    this.session = new SessionReader(this.goodvibesDir);
    this.index = new IndexReader(this.goodvibesDir);
    await this.telemetry.initialize();
    this.jsonlReader = new JSONLReader({
      cost_per_1k_input_tokens: this.config.cost_per_1k_input_tokens,
      cost_per_1k_output_tokens: this.config.cost_per_1k_output_tokens
    });
    const jsonlProjectDir = resolveJsonlProjectDir(
      this.goodvibesDir,
      this.config.jsonl_base_path
    );
    if (jsonlProjectDir !== null) {
      await this.initJsonlFromFile(jsonlProjectDir);
    }
    this.anomalyDetector = new AnomalyDetector(this.telemetry, this.config, this.logger);
    this.budgetTracker = new BudgetTracker(this.config);
    this.memoryUpdater = new MemoryUpdater(join9(this.goodvibesDir, "memory"));
    this.watcher = new DataWatcher(this.goodvibesDir, {
      jsonlProjectDir: jsonlProjectDir ?? void 0,
      jsonlCostConfig: {
        cost_per_1k_input_tokens: this.config.cost_per_1k_input_tokens,
        cost_per_1k_output_tokens: this.config.cost_per_1k_output_tokens
      }
    });
    this.watcher.on("telemetry-change", () => {
      void this.refresh();
    });
    this.watcher.on("session-change", () => {
      void this.refresh();
    });
    this.watcher.on("index-change", () => {
      void this.refresh();
    });
    this.watcher.on("config-change", () => {
      void this.refresh();
    });
    this.watcher.on("jsonl-records", (records) => {
      this.accumulateJsonlRecords(records);
      void this.refresh();
    });
    this.watcher.start();
    await this.refresh();
    this.initialized = true;
  }
  /**
   * Get the current dashboard state.
   *
   * Returns the last computed snapshot. Call `refresh()` to force a new
   * computation, or rely on DataWatcher to trigger automatic updates.
   *
   * @returns The current aggregated DashboardState.
   */
  getState() {
    return this.state;
  }
  /**
   * Force a full refresh of all data sources and recompute the state.
   *
   * Triggers state-change callbacks if the state was updated.
   *
   * @returns Promise that resolves once the refresh is complete.
   */
  async refresh() {
    if (!this.initialized) {
      this.logger.warn("refresh() called before initialize()");
      return;
    }
    if (this.refreshing) {
      this.refreshQueued = true;
      return;
    }
    this.refreshing = true;
    try {
      const newState = this.aggregate();
      this.state = newState;
      this.refreshCount++;
      if (this.refreshCount % MEMORY_UPDATER_INTERVAL === 0) {
        try {
          const updates = this.memoryUpdater.analyze(this.state);
          if (updates.patterns.length > 0 || updates.preferences.length > 0) {
            this.memoryUpdater.apply(updates);
          }
        } catch (err) {
          this.logger.warn(`MemoryUpdater analysis failed: ${String(err)}`);
        }
      }
      this.scheduleGlobalDbSave();
      this.notifyCallbacks();
    } catch (err) {
      this.logger.warn(`Aggregation refresh failed: ${String(err)}`);
    } finally {
      this.refreshing = false;
      if (this.refreshQueued) {
        this.refreshQueued = false;
        void Promise.resolve().then(() => this.refresh());
      }
    }
  }
  /**
   * Register a callback to be invoked whenever the state changes.
   *
   * The callback is called synchronously after each refresh cycle with the
   * new DashboardState.
   *
   * @param callback - Function to call with the updated state.
   * @returns An unsubscribe function that removes the callback when called.
   */
  onStateChange(callback) {
    this.callbacks.push(callback);
    return () => {
      const idx = this.callbacks.indexOf(callback);
      if (idx >= 0) this.callbacks.splice(idx, 1);
    };
  }
  /**
   * Clean shutdown: stop the DataWatcher, close the TelemetryReader,
   * and flush any pending GlobalDB write.
   *
   * Safe to call multiple times — subsequent calls are no-ops.
   *
   * @returns Promise that resolves once shutdown is complete.
   */
  async shutdown() {
    if (this.globalDbSaveTimer !== null) {
      clearTimeout(this.globalDbSaveTimer);
      this.globalDbSaveTimer = null;
      this.writeGlobalDbSession();
    }
    if (this.watcher) {
      this.watcher.stop();
    }
    if (this.telemetry) {
      this.telemetry.close();
    }
  }
  /**
   * Set a budget constraint for the current session.
   *
   * Delegates to BudgetTracker and triggers a state refresh.
   *
   * @param amount - Budget amount.
   * @param unit   - Unit of measurement ('dollars' or 'tokens').
   */
  setBudget(amount, unit) {
    if (!this.initialized) {
      this.logger.warn("setBudget() called before initialize()");
      return;
    }
    this.budgetTracker.setBudget(amount, unit);
    void this.refresh();
  }
  /**
   * Clear the current budget constraint.
   *
   * Delegates to BudgetTracker and triggers a state refresh.
   */
  clearBudget() {
    if (!this.initialized) {
      this.logger.warn("clearBudget() called before initialize()");
      return;
    }
    this.budgetTracker.clearBudget();
    void this.refresh();
  }
  // ───────────────────────────────────────────────────────────────────────────
  // Private: JSONL integration
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * Load the initial JSONL records from the active file in the project dir.
   *
   * Parses the entire file from offset 0 on first load to populate
   * historical data from the current session.
   *
   * @param jsonlProjectDir - Absolute path to the JSONL project directory.
   */
  async initJsonlFromFile(jsonlProjectDir) {
    if (this.jsonlReader === null) return;
    try {
      const activeFile = await findActiveJsonlFile(jsonlProjectDir);
      if (activeFile === null) return;
      this.activeJsonlPath = activeFile;
      this.jsonlSessionId = sessionIdFromPath(activeFile);
      const result = await this.jsonlReader.parseFile(activeFile, 0);
      if (result.records.length > 0) {
        this.accumulateJsonlRecords(result.records);
      }
      if (result.errors.length > 0) {
        this.logger.warn(
          `JSONL initial load had ${result.errors.length} parse error(s) in "${activeFile}"`
        );
      }
    } catch (err) {
      this.logger.warn(`JSONL init failed: ${String(err)}`);
    }
  }
  /**
   * Accumulate a batch of new JSONL records.
   *
   * Appends to the in-memory record list and recomputes JSONL totals.
   * Called both on initial load (from parseFile) and on live watcher events.
   *
   * @param records - New records to append.
   */
  static MAX_JSONL_RECORDS = 1e4;
  accumulateJsonlRecords(records) {
    if (records.length === 0) return;
    this.jsonlRecords.push(...records);
    if (this.jsonlRecords.length > _Aggregator.MAX_JSONL_RECORDS) {
      this.jsonlRecords = this.jsonlRecords.slice(-_Aggregator.MAX_JSONL_RECORDS);
    }
    this.recomputeJsonlTotals();
  }
  /**
   * Recompute all JSONL-sourced totals from the accumulated record list.
   *
   * Scans all accumulated records to build aggregate token counts, cost,
   * and model/timing information. Runs after each batch accumulation.
   */
  recomputeJsonlTotals() {
    if (this.jsonlReader === null) return;
    const apiCalls = this.jsonlReader.extractApiCalls(this.jsonlRecords);
    const sessionInfo = this.jsonlReader.extractSessionInfo(this.jsonlRecords);
    const totals = emptyJsonlTotals();
    totals.api_calls = apiCalls.length;
    totals.model = sessionInfo.model;
    totals.started_at = sessionInfo.startedAt !== "" ? sessionInfo.startedAt : null;
    totals.last_activity_at = sessionInfo.lastActivityAt !== "" ? sessionInfo.lastActivityAt : null;
    for (const call of apiCalls) {
      totals.api_input += call.input_tokens;
      totals.api_output += call.output_tokens;
      totals.cache_read += call.cache_read_tokens;
      totals.cache_write += call.cache_write_tokens;
      totals.cost_usd += call.cost_usd;
    }
    this.jsonlTotals = totals;
  }
  // ───────────────────────────────────────────────────────────────────────────
  // Private: aggregation
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * Compute a fresh DashboardState from all data sources.
   *
   * Merges precision telemetry (cache stats, tool timing) with JSONL-sourced
   * data (API token counts, real cost, agent activity, file hotspots).
   *
   * All errors within individual data sources are caught and logged so that
   * a single reader failure does not crash the entire aggregation.
   */
  aggregate() {
    const now = Date.now();
    const startedAtMs = new Date(this.startedAt).getTime();
    const uptimeMs = now - startedAtMs;
    const sessionId = this.jsonlSessionId ?? this.safeCall(() => this.telemetry?.getCurrentSessionId(), null) ?? this.safeCall(() => this.session?.readCurrentSession()?.id, null) ?? "unknown";
    const telemetrySummary = this.safeCall(() => this.telemetry.getSessionSummary(), null);
    const tokenMetrics = this.safeCall(() => this.telemetry.getTokenMetrics(), null);
    const jsonl = this.jsonlTotals;
    const hasJsonlData = this.jsonlRecords.length > 0;
    const tokens = {
      // Precision telemetry fields (fall back to 0 if unavailable).
      input: tokenMetrics?.input ?? 0,
      output: tokenMetrics?.output ?? 0,
      total: tokenMetrics?.total ?? 0,
      saved: tokenMetrics?.saved ?? 0,
      efficiency: tokenMetrics?.efficiency ?? 0,
      // JSONL API fields: prefer JSONL if available, else precision telemetry.
      // Use presence check (hasJsonlData) rather than > 0 to distinguish
      // "no data" from "zero tokens" correctly.
      api_input: hasJsonlData ? jsonl.api_input : tokenMetrics?.api_input ?? 0,
      api_output: hasJsonlData ? jsonl.api_output : tokenMetrics?.api_output ?? 0,
      cache_read: hasJsonlData ? jsonl.cache_read : tokenMetrics?.cache_read ?? 0,
      cache_write: hasJsonlData ? jsonl.cache_write : tokenMetrics?.cache_write ?? 0
    };
    if (tokens.total === 0 && jsonl.api_input + jsonl.api_output > 0) {
      const jsonlSum = jsonl.api_input + jsonl.api_output + jsonl.cache_read + jsonl.cache_write;
      tokens.total = jsonlSum;
      tokens.input = jsonl.api_input + jsonl.cache_read;
      tokens.output = jsonl.api_output;
    }
    const cache = this.buildCacheMetrics(telemetrySummary);
    const cost = (() => {
      if (jsonl.cost_usd > 0) {
        const inputCost = jsonl.api_input / 1e3 * this.config.cost_per_1k_input_tokens;
        const outputCost = jsonl.api_output / 1e3 * this.config.cost_per_1k_output_tokens;
        const saved = tokens.saved / 1e3 * this.config.cost_per_1k_input_tokens;
        return {
          input: inputCost,
          output: outputCost,
          total: jsonl.cost_usd,
          saved
        };
      }
      return {
        input: tokens.input / 1e3 * this.config.cost_per_1k_input_tokens,
        output: tokens.output / 1e3 * this.config.cost_per_1k_output_tokens,
        total: tokens.input / 1e3 * this.config.cost_per_1k_input_tokens + tokens.output / 1e3 * this.config.cost_per_1k_output_tokens,
        saved: tokens.saved / 1e3 * this.config.cost_per_1k_input_tokens
      };
    })();
    const commands = (() => {
      const execBreakdown = telemetrySummary?.by_tool["exec"];
      if (!execBreakdown) {
        return { total: 0, success_rate: 1, avg_duration_ms: 0, total_duration_ms: 0, failures: 0, slowest: null };
      }
      const total = execBreakdown.calls;
      const failures = Math.round(total * (1 - execBreakdown.success_rate));
      return {
        total,
        success_rate: execBreakdown.success_rate,
        avg_duration_ms: execBreakdown.avg_ms,
        total_duration_ms: execBreakdown.avg_ms * total,
        failures,
        slowest: null
        // would require scanning individual records
      };
    })();
    const agentActivities = this.safeCall(
      () => this.jsonlReader !== null ? this.jsonlReader.extractAgentActivity(this.jsonlRecords) : [],
      []
    );
    const completedAgents = agentActivities.filter((a) => a.completed).length;
    const activeAgents = agentActivities.length - completedAgents;
    const sessionCounters = this.safeCall(() => this.session.getSessionCounters(), null);
    const agents = {
      spawned: agentActivities.length > 0 ? agentActivities.length : sessionCounters?.agents_spawned ?? 0,
      max_concurrent: 0,
      // Requires active session-state tracking
      total_tokens: 0,
      // Not derivable without per-agent JSONL correlation
      active: activeAgents,
      completed: completedAgents
    };
    const jsonlToolCalls = this.safeCall(
      () => this.jsonlReader !== null ? this.jsonlReader.extractToolCalls(this.jsonlRecords) : [],
      []
    );
    const uniqueReadFiles = /* @__PURE__ */ new Set();
    let createdFiles = 0;
    for (const tc of jsonlToolCalls) {
      const toolName = (tc.name ?? "").toLowerCase();
      const inputPath = typeof tc.input["path"] === "string" ? tc.input["path"] : null;
      if (inputPath !== null) {
        if (toolName === "read" || toolName === "precision_read") {
          uniqueReadFiles.add(inputPath);
        } else if (toolName === "write" || toolName === "precision_write") {
          createdFiles++;
        }
      }
    }
    const files = {
      unique_read: uniqueReadFiles.size,
      modified: sessionCounters?.files_modified.length ?? 0,
      created: createdFiles,
      conflicts: 0
    };
    const metrics = { tokens, cache, cost, commands, agents, files };
    const toolsBreakdown = telemetrySummary?.by_tool ?? {};
    const recentActivity = this.buildRecentActivity();
    const fileHotspots = this.buildFileHotspots(
      toolsBreakdown,
      jsonlToolCalls,
      sessionCounters
    );
    const agentProfiles = this.buildAgentProfiles(agentActivities);
    const partialState = {
      session_id: sessionId,
      started_at: this.startedAt,
      uptime_ms: uptimeMs,
      metrics,
      tools_breakdown: toolsBreakdown,
      recent_activity: recentActivity,
      file_hotspots: fileHotspots,
      agent_profiles: agentProfiles,
      anomalies: this.state.anomalies,
      // carry forward existing anomalies
      budget: this.state.budget,
      health_status: this.state.health_status
    };
    const newAnomalies = this.safeCall(
      () => this.anomalyDetector.detect(partialState),
      []
    );
    const allAnomalies = [
      ...this.anomalyDetector.getActiveAnomalies(),
      ...newAnomalies
    ].filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i).slice(-MAX_ANOMALIES);
    const budget = this.safeCall(
      () => this.budgetTracker.update(metrics, this.config),
      null
    );
    const healthStatus = computeHealthStatus(allAnomalies, metrics);
    return {
      session_id: sessionId,
      started_at: this.startedAt,
      uptime_ms: uptimeMs,
      metrics,
      tools_breakdown: toolsBreakdown,
      recent_activity: recentActivity,
      file_hotspots: fileHotspots,
      agent_profiles: agentProfiles,
      anomalies: allAnomalies,
      budget,
      health_status: healthStatus
    };
  }
  /**
   * Build the recent activity list from the most recent telemetry records.
   */
  buildRecentActivity() {
    const records = this.safeCall(
      () => this.telemetry.getRecentRecords(RECENT_ACTIVITY_LIMIT),
      []
    );
    return records.map((r) => ({
      timestamp: r.created_at,
      type: toolToActivityType(r.tool),
      tool: r.tool,
      description: r.error ?? (r.status === "success" ? "ok" : r.status),
      duration_ms: r.duration_ms,
      cache_hit: r.cache_hit,
      tokens: (r.tokens_in ?? 0) + (r.tokens_out ?? 0),
      details: {
        status: r.status,
        tokens_in: r.tokens_in,
        tokens_out: r.tokens_out,
        cache_bytes_saved: r.cache_bytes_saved
      }
    }));
  }
  /**
   * Build file hotspot data by merging JSONL tool call file access patterns
   * with session-reader modified-file data.
   *
   * JSONL tool_use blocks contain actual file paths for read/write/edit calls,
   * enabling per-file access counting. Session-reader provides modified files
   * as a fallback for files not captured in JSONL.
   *
   * @param _breakdown      - Tool breakdown from precision telemetry (reserved).
   * @param jsonlToolCalls  - Extracted tool calls from JSONL records.
   * @param sessionCounters - Session counters from the SessionReader.
   */
  buildFileHotspots(_breakdown, jsonlToolCalls, sessionCounters) {
    const fileStats = /* @__PURE__ */ new Map();
    for (const tc of jsonlToolCalls) {
      const toolName = (tc.name ?? "").toLowerCase();
      const timestamp = tc.timestamp ?? (/* @__PURE__ */ new Date()).toISOString();
      const filePaths = [];
      const singlePath = typeof tc.input["path"] === "string" ? tc.input["path"] : null;
      if (singlePath !== null) {
        filePaths.push(singlePath);
      }
      if (Array.isArray(tc.input["files"])) {
        for (const f of tc.input["files"]) {
          if (typeof f === "object" && f !== null && typeof f["path"] === "string") {
            filePaths.push(f["path"]);
          }
        }
      }
      if (Array.isArray(tc.input["edits"])) {
        for (const e of tc.input["edits"]) {
          if (typeof e === "object" && e !== null) {
            const editRec = e;
            const editPath = typeof editRec["path"] === "string" ? editRec["path"] : typeof editRec["file"] === "string" ? editRec["file"] : null;
            if (editPath !== null) filePaths.push(editPath);
          }
        }
      }
      for (const filePath of filePaths) {
        if (!fileStats.has(filePath)) {
          fileStats.set(filePath, { reads: 0, writes: 0, conflicts: 0, lastAccessed: timestamp });
        }
        const stat2 = fileStats.get(filePath);
        if (timestamp > stat2.lastAccessed) stat2.lastAccessed = timestamp;
        if (toolName === "read" || toolName === "precision_read" || toolName === "grep" || toolName === "precision_grep" || toolName === "glob" || toolName === "precision_glob" || toolName === "symbols" || toolName === "precision_symbols") {
          stat2.reads++;
        } else if (toolName === "write" || toolName === "precision_write" || toolName === "edit" || toolName === "precision_edit") {
          stat2.writes++;
        } else if (toolName === "conflict") {
          stat2.conflicts++;
        }
      }
    }
    if (sessionCounters) {
      for (const filePath of sessionCounters.files_modified) {
        if (!fileStats.has(filePath)) {
          fileStats.set(filePath, {
            reads: 0,
            writes: 1,
            conflicts: 0,
            lastAccessed: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      }
    }
    const hotspots = Array.from(fileStats.entries()).map(([path6, stat2]) => ({
      path: path6,
      reads: stat2.reads,
      writes: stat2.writes,
      conflicts: stat2.conflicts,
      tokens_saved: 0,
      // Not derivable without per-file cache tracking
      last_accessed: stat2.lastAccessed
    })).sort((a, b) => b.reads + b.writes - (a.reads + a.writes)).slice(0, MAX_HOTSPOTS);
    return hotspots;
  }
  /**
   * Build agent profile data from JSONL-extracted agent activity.
   *
   * Each `AgentActivityInfo` entry corresponds to a Task tool_use block
   * found in the JSONL records. Status is inferred from completion state.
   *
   * @param agentActivities - Agent activity records extracted from JSONL.
   */
  buildAgentProfiles(agentActivities) {
    return agentActivities.map((a) => ({
      agent_id: a.agentId,
      agent_type: "task",
      // All JSONL-derived agents are Task tool spawns
      tokens_in: 0,
      // Per-agent token counts require subagent JSONL correlation
      tokens_out: 0,
      tool_calls: 0,
      // Not derivable without subagent session correlation
      success_rate: 1,
      // Default; no per-agent failure data available
      duration_ms: 0,
      // Not available without completed_at timestamps
      status: a.completed ? a.exitStatus === "error" ? "failed" : "completed" : "active"
    }));
  }
  // ───────────────────────────────────────────────────────────────────────────
  // Private: GlobalDB write-back
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * Schedule a debounced GlobalDB session-summary upsert.
   *
   * Resets the timer on every call. The actual write fires after
   * GLOBAL_DB_DEBOUNCE_MS of inactivity. This prevents hammering the DB
   * on rapid-fire refresh cycles.
   */
  scheduleGlobalDbSave() {
    if (this.globalDb === null) return;
    if (this.globalDbSaveTimer !== null) {
      clearTimeout(this.globalDbSaveTimer);
    }
    this.globalDbSaveTimer = setTimeout(() => {
      this.globalDbSaveTimer = null;
      this.writeGlobalDbSession();
    }, GLOBAL_DB_DEBOUNCE_MS);
  }
  /**
   * Write the current session summary to GlobalDB.
   *
   * Constructs a `GlobalSession` record from the current aggregated state
   * and calls `upsertSession()`. Errors are logged but do not propagate.
   */
  writeGlobalDbSession() {
    if (this.globalDb === null) return;
    const sessionId = this.state.session_id;
    if (!sessionId || sessionId === "unknown") return;
    try {
      const metrics = this.state.metrics;
      const jsonl = this.jsonlTotals;
      const projectHash = basename3(dirname3(this.goodvibesDir));
      const jsonlToolCalls = this.jsonlReader !== null ? this.jsonlReader.extractToolCalls(this.jsonlRecords) : [];
      const precisionCalls = jsonlToolCalls.filter(
        (tc) => (tc.name ?? "").startsWith("mcp__plugin_goodvibes_precision")
      ).length;
      this.globalDb.upsertSession({
        session_id: sessionId,
        project_path: this.goodvibesDir,
        project_hash: projectHash,
        started_at: this.startedAt,
        model: jsonl.model !== "unknown" ? jsonl.model : void 0,
        total_input_tokens: metrics.tokens.api_input,
        total_output_tokens: metrics.tokens.api_output,
        total_cache_read_tokens: metrics.tokens.cache_read,
        total_cache_write_tokens: metrics.tokens.cache_write,
        total_cost_usd: metrics.cost.total,
        total_api_calls: jsonl.api_calls,
        total_tool_calls: Object.values(this.state.tools_breakdown).reduce(
          (sum, tb) => sum + tb.calls,
          0
        ),
        total_native_tool_calls: jsonlToolCalls.length - precisionCalls,
        total_precision_tool_calls: precisionCalls,
        total_agent_spawns: metrics.agents.spawned,
        status: "active"
      });
    } catch (err) {
      this.logger.warn(`GlobalDB session upsert failed: ${String(err)}`);
    }
  }
  // ───────────────────────────────────────────────────────────────────────────
  // Private: utilities
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * Build cache metrics from the telemetry summary.
   *
   * memory_peak_mb and evictions are not tracked in the telemetry DB;
   * they are reported as 0 until a richer data source is available.
   */
  buildCacheMetrics(telemetrySummary) {
    if (!telemetrySummary) {
      return { hit_rate: 0, hits: 0, misses: 0, memory_peak_mb: 0, evictions: 0 };
    }
    const hits = telemetrySummary.total_cache_hits;
    const total = telemetrySummary.total_calls;
    const misses = total - hits;
    const hitRate = total > 0 ? hits / total : 0;
    return {
      hit_rate: hitRate,
      hits,
      misses,
      memory_peak_mb: 0,
      // not tracked in telemetry DB
      evictions: 0
      // not tracked in telemetry DB
    };
  }
  /**
   * Execute a function and return its result, or a fallback value on error.
   *
   * Errors are logged at warn level but do not propagate — a single reader
   * failure must not abort the full aggregation cycle.
   *
   * @param fn       - Function to execute.
   * @param fallback - Value returned if fn throws.
   */
  safeCall(fn, fallback) {
    try {
      return fn();
    } catch (err) {
      this.logger.warn(`safeCall error: ${String(err)}`);
      return fallback;
    }
  }
  /**
   * Invoke all registered state-change callbacks with the current state.
   * Errors in callbacks are caught and logged to avoid cascade failures.
   */
  notifyCallbacks() {
    for (const cb of this.callbacks) {
      try {
        cb(this.state);
      } catch (err) {
        this.logger.warn(`State-change callback threw: ${String(err)}`);
      }
    }
  }
};

// src/index.ts
init_db_init();

// src/schemas/tools.ts
import { z } from "zod";
var AnalyticsDashboardInput = z.object({
  action: z.enum(["start", "stop", "status"]),
  target: z.enum(["mini", "full", "both"]).default("both"),
  options: z.object({
    pane_position: z.enum(["bottom", "top", "left", "right"]).optional(),
    pane_size: z.union([z.number(), z.string()]).optional()
  }).optional()
});
var AnalyticsQueryInput = z.object({
  scope: z.enum(["tokens", "cache", "commands", "agents", "files", "cost", "health", "project", "all"]),
  time_range: z.enum(["session", "last_5m", "last_30m", "last_1h"]).default("session"),
  group_by: z.enum(["tool", "agent", "file", "status"]).optional(),
  filters: z.object({
    tool: z.string().optional(),
    status: z.enum(["success", "failed", "partial"]).optional(),
    agent: z.string().optional()
  }).optional(),
  format: z.enum(["standard", "minimal", "verbose"]).default("standard")
});
var AnalyticsBudgetInput = z.object({
  action: z.enum(["set", "check", "clear"]),
  amount: z.number().positive().optional(),
  unit: z.enum(["dollars", "tokens"]).default("dollars"),
  warn_at: z.array(z.number().min(0).max(1)).optional()
}).refine(
  (data) => data.action !== "set" || data.amount !== void 0,
  { message: 'amount is required when action is "set"', path: ["amount"] }
);
var AnalyticsTagInput = z.object({
  action: z.enum(["add", "remove", "list", "auto"]),
  value: z.string().min(1).max(100).optional(),
  // Required for add/remove, optional for list/auto
  scope: z.enum(["session", "all"]).optional().default("session")
  // For list action
}).refine(
  (data) => !["add", "remove"].includes(data.action) || data.value !== void 0,
  { message: "value is required for add and remove actions", path: ["value"] }
);
var AnalyticsExportInput = z.object({
  format: z.enum(["json", "csv", "markdown"]),
  scope: z.string().regex(/^(current|historical|session:[a-f0-9]+)$/, 'Must be "current", "historical", or "session:<id>"').default("current"),
  sections: z.array(
    z.enum(["tokens", "cache", "commands", "agents", "files", "cost", "timeline"])
  ).optional(),
  output_path: z.string().optional()
});
var AnalyticsConfigInput = z.object({
  action: z.enum(["get", "set"]),
  key: z.string().optional(),
  value: z.unknown().optional()
});
var TOOL_DEFINITIONS = {
  analytics_dashboard: {
    name: "analytics_dashboard",
    description: "Launch, stop, or check status of the analytics TUI and mini dashboard. The mini dashboard is a 4-line always-on tmux pane showing session metrics. The full TUI is a 3-page interactive dashboard.",
    inputSchema: AnalyticsDashboardInput
  },
  analytics_query: {
    name: "analytics_query",
    description: "Ad-hoc queries against session data. Query tokens, cache, commands, agents, files, cost, health, or project metrics. Supports time ranges, grouping, and filtering.",
    inputSchema: AnalyticsQueryInput
  },
  analytics_budget: {
    name: "analytics_budget",
    description: "Set, check, or clear a session budget (in dollars or tokens). When set, the mini dashboard shows remaining budget with color-coded thresholds.",
    inputSchema: AnalyticsBudgetInput
  },
  analytics_tag: {
    name: "analytics_tag",
    description: "Add, remove, or list tags on the current session. Tags are persisted in the global SQLite DB and support multi-tag arrays. Use action=auto to get heuristic tag suggestions based on JSONL analysis.",
    inputSchema: AnalyticsTagInput
  },
  analytics_export: {
    name: "analytics_export",
    description: "Export session data in JSON, CSV, or markdown format. Can export current session, a specific historical session, or all historical data.",
    inputSchema: AnalyticsExportInput
  },
  analytics_config: {
    name: "analytics_config",
    description: "View or update analytics engine settings like refresh rates, cost rates, webhook URLs, and anomaly detection.",
    inputSchema: AnalyticsConfigInput
  }
};

// src/index.ts
var SCHEMA_MAP = {
  analytics_dashboard: AnalyticsDashboardInput,
  analytics_query: AnalyticsQueryInput,
  analytics_budget: AnalyticsBudgetInput,
  analytics_tag: AnalyticsTagInput,
  analytics_export: AnalyticsExportInput,
  analytics_config: AnalyticsConfigInput
};
function getToolDefinitions() {
  return Object.values(TOOL_DEFINITIONS).map((def) => ({
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema
  }));
}
__name(getToolDefinitions, "getToolDefinitions");
var AnalyticsEngine = class {
  static {
    __name(this, "AnalyticsEngine");
  }
  aggregator;
  config;
  goodvibesDir;
  initialized = false;
  globalDb = null;
  /**
   * @param goodvibesDir - Path to the .goodvibes directory (absolute or
   *   relative to process.cwd()). Analytics config is read from here.
   */
  constructor(goodvibesDir) {
    this.goodvibesDir = goodvibesDir;
    this.config = loadConfig(goodvibesDir);
    this.aggregator = new Aggregator(goodvibesDir, this.config);
  }
  /**
   * Initialize the aggregator and underlying data watchers.
   * Must be called before `handleToolCall()`.
   *
   * @throws If the aggregator fails to initialize.
   */
  async initialize() {
    this.globalDb = await initializeGlobalDb();
    this.aggregator.setGlobalDb(this.globalDb);
    await this.aggregator.initialize();
    this.initialized = true;
  }
  /**
   * Dispatch an MCP tool call by name.
   *
   * Validates the tool name and input schema before invoking the handler.
   * Returns a structured `ToolResponse` — never throws.
   *
   * @param name - MCP tool name (e.g. `"analytics_query"`).
   * @param args - Raw (unvalidated) arguments from the MCP client.
   * @returns Tool response with content and optional `isError` flag.
   */
  async handleToolCall(name, args) {
    if (!this.initialized) {
      return toolResponse("Analytics engine not initialized. Call initialize() first.", true);
    }
    if (!(name in SCHEMA_MAP)) {
      return toolResponse(`Unknown analytics tool: ${name}`, true);
    }
    const schema = SCHEMA_MAP[name];
    const parseResult = schema.safeParse(args);
    if (!parseResult.success) {
      const errors = (parseResult.error?.issues ?? []).map(
        (i) => `${i.path.join(".")}: ${i.message}`
      ).join("; ");
      return toolResponse(`Validation error: ${errors}`, true);
    }
    try {
      const { HANDLER_REGISTRY: HANDLER_REGISTRY2 } = await Promise.resolve().then(() => (init_handlers(), handlers_exports));
      const handler = HANDLER_REGISTRY2[name];
      if (!handler) {
        return toolResponse(`No handler registered for tool: ${name}`, true);
      }
      return await handler(this.aggregator, parseResult.data, this.goodvibesDir);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return toolResponse(`Handler error: ${message}`, true);
    }
  }
  /**
   * Gracefully shut down the aggregator and release all resources.
   * Safe to call multiple times.
   */
  async shutdown() {
    await this.aggregator.shutdown();
    this.globalDb?.close();
    this.globalDb = null;
    this.initialized = false;
  }
  /**
   * Expose the underlying Aggregator for direct state access by TUI renderers.
   * @returns The Aggregator instance.
   */
  getAggregator() {
    return this.aggregator;
  }
  /**
   * Return the global analytics database instance.
   *
   * @throws {Error} If the engine has not been initialized.
   */
  getGlobalDb() {
    if (!this.globalDb) {
      throw new Error("AnalyticsEngine: not initialized. Call initialize() first.");
    }
    return this.globalDb;
  }
  /**
   * Return the resolved analytics configuration (DEFAULT_CONFIG merged with
   * any values loaded from `analytics.json`).
   * @returns The active AnalyticsConfig.
   */
  getConfig() {
    return this.config;
  }
};
var index_default = AnalyticsEngine;
export {
  AnalyticsEngine,
  index_default as default,
  getToolDefinitions
};
//# sourceMappingURL=index.js.map
