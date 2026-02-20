/**
 * db-init.ts — Global analytics directory setup and database initialization.
 *
 * Provides helpers for ensuring the global analytics directory exists,
 * resolving the database path, and running full initialization (schema +
 * migrations) on a new or existing GlobalDB instance.
 */

import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { GlobalDB } from './global-db.js';

// ─────────────────────────────────────────────────────────────────────────────
// Path constants
// ─────────────────────────────────────────────────────────────────────────────

/** Root goodvibes directory inside ~/.claude. */
const GOODVIBES_BASE = join(homedir(), '.claude', '.goodvibes');

/** Global analytics directory (shared across all projects). */
const ANALYTICS_DIR = join(GOODVIBES_BASE, 'analytics');

/** Filename of the global analytics SQLite database. */
const DB_FILENAME = 'analytics.db';

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the global analytics directory exists.
 *
 * Creates `~/.claude/.goodvibes/analytics/` (and all parent directories)
 * if the path does not already exist. This is safe to call multiple times.
 *
 * @returns Absolute path to the analytics directory.
 * @throws {Error} If the directory cannot be created.
 */
export function ensureGlobalAnalyticsDir(): string {
  if (!existsSync(ANALYTICS_DIR)) {
    mkdirSync(ANALYTICS_DIR, { recursive: true });
  }
  return ANALYTICS_DIR;
}

/**
 * Return the absolute path to the global analytics SQLite database file.
 *
 * The file may not yet exist; call `initializeGlobalDb()` to create it.
 *
 * @returns Absolute path to `~/.claude/.goodvibes/analytics/analytics.db`.
 */
export function getGlobalDbPath(): string {
  return resolve(join(ANALYTICS_DIR, DB_FILENAME));
}

/**
 * Fully initialize the global analytics database.
 *
 * Steps:
 * 1. Ensures the analytics directory exists.
 * 2. Opens or creates the SQLite database at `dbPath`.
 * 3. Applies the base schema and any pending migrations.
 * 4. Returns an initialized `GlobalDB` instance ready for use.
 *
 * @param dbPath - Optional override for the database file path.
 *                 Defaults to `getGlobalDbPath()`.
 * @returns A fully initialized GlobalDB instance.
 * @throws {Error} If directory creation or database initialization fails.
 *
 * @example
 * ```ts
 * const db = await initializeGlobalDb();
 * db.upsertSession({ session_id: 'abc123', project_hash: 'xyz', started_at: new Date().toISOString() });
 * db.close();
 * ```
 */
export async function initializeGlobalDb(dbPath?: string): Promise<GlobalDB> {
  ensureGlobalAnalyticsDir();
  const resolvedPath = dbPath ?? getGlobalDbPath();
  const db = new GlobalDB(resolvedPath);
  await db.initialize();
  return db;
}

/**
 * Run a SQLite integrity check on the database.
 *
 * Executes `PRAGMA integrity_check` and returns whether the database is
 * intact. On a healthy database, the check returns a single row `'ok'`.
 *
 * @param db - An initialized GlobalDB instance.
 * @returns Object with `ok: boolean` and an array of `errors` (empty when ok).
 */
export function checkDbIntegrity(db: GlobalDB): { ok: boolean; errors: string[] } {
  try {
    const rawDb = db.getDb();
    const result = rawDb.exec('PRAGMA integrity_check');
    const rows = result[0]?.values ?? [];
    const messages = rows
      .map((row) => String(row[0] ?? ''))
      .filter(Boolean);

    if (messages.length === 1 && messages[0] === 'ok') {
      return { ok: true, errors: [] };
    }
    return { ok: false, errors: messages };
  } catch (err) {
    return {
      ok: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}
