/**
 * db-schema.ts — Global analytics SQLite schema definitions and migration logic.
 *
 * Defines the canonical schema SQL, migration registry, and schema version
 * management helpers used by GlobalDB during initialization.
 */

import type { Database } from 'sql.js';

// ─────────────────────────────────────────────────────────────────────────────
// Schema Version
// ─────────────────────────────────────────────────────────────────────────────

/** Current schema version. Increment when applying breaking DDL changes. */
export const SCHEMA_VERSION = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Schema SQL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full schema SQL for version 1.
 *
 * All tables use `CREATE TABLE IF NOT EXISTS` so the schema is idempotent
 * and safe to re-apply on an existing database.
 */
export const SCHEMA_SQL = `
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

-- Tags: many-to-many session ↔ tag relationship
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

// ─────────────────────────────────────────────────────────────────────────────
// Migration Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Migration registry: maps schema version → SQL to upgrade from the prior
 * version. Version 1 has no migration (it is the baseline).
 *
 * When adding a new schema version:
 *   1. Increment SCHEMA_VERSION.
 *   2. Add an entry: MIGRATIONS.set(newVersion, 'ALTER TABLE ...').
 *   3. Do NOT modify SCHEMA_SQL retroactively — it represents the current
 *      canonical state for fresh installs.
 *
 * @example
 * // Upgrading from v1 to v2:
 * MIGRATIONS.set(2, 'ALTER TABLE sessions ADD COLUMN workspace TEXT;');
 */
export const MIGRATIONS: Map<number, string> = new Map();
// No migrations yet — version 1 is the baseline schema.

// ─────────────────────────────────────────────────────────────────────────────
// Schema Version Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the current schema version from the database.
 *
 * Returns 0 if the schema_version table is empty (fresh database that has
 * just had the base schema applied but version not yet recorded).
 *
 * @param db - An initialized sql.js Database instance.
 * @returns The highest applied schema version, or 0 if none.
 */
export function getSchemaVersion(db: Database): number {
  try {
    const result = db.exec(
      'SELECT MAX(version) AS v FROM schema_version',
    );
    const row = result[0]?.values[0];
    if (!row || row[0] === null || row[0] === undefined) {return 0;}
    const v = Number(row[0]);
    return isNaN(v) ? 0 : v;
  } catch {
    // Table may not exist on a brand-new database
    return 0;
  }
}

/**
 * Apply any pending migrations from `fromVersion` up to `SCHEMA_VERSION`.
 *
 * Each migration SQL is executed inside a savepoint transaction so that a
 * failed migration does not leave the database in a partially upgraded state.
 * After each successful migration the version record is inserted.
 *
 * @param db          - An initialized sql.js Database instance.
 * @param fromVersion - The version the database is currently at.
 * @throws {Error} If a migration SQL statement fails.
 */
export function applyMigrations(db: Database, fromVersion: number): void {
  for (let v = fromVersion + 1; v <= SCHEMA_VERSION; v++) {
    const sql = MIGRATIONS.get(v);
    if (!sql) {
      // No migration SQL registered: just record the version bump.
      db.run(
        `INSERT OR IGNORE INTO schema_version (version, description) VALUES (?, 'baseline')`,
        [v],
      );
      continue;
    }

    // Execute migration inside a savepoint for atomicity
    db.run(`SAVEPOINT migration_v${v}`);
    try {
      db.run(sql);
      db.run(
        'INSERT OR IGNORE INTO schema_version (version, description) VALUES (?, ?)',
        [v, `migration from v${v - 1} to v${v}`],
      );
      db.run(`RELEASE SAVEPOINT migration_v${v}`);
    } catch (err) {
      db.run(`ROLLBACK TO SAVEPOINT migration_v${v}`);
      throw new Error(
        `Schema migration to v${v} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
