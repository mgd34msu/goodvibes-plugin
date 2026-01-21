/**
 * SQLite Query Executor
 *
 * Handles query execution against SQLite databases using better-sqlite3.
 * Uses a connection pool for better performance.
 */

import type { DatabaseConnectionInfo, ColumnInfo, SqliteExecutionResult } from '../types.js';
import { withConnection, type SqliteConnectionOptions } from '../../sqlite-connection.js';
import { isSelectQuery } from '../query-analysis.js';

/**
 * Infer SQLite column type from a value
 */
export function inferSqliteType(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'real';
  }
  if (typeof value === 'string') return 'text';
  if (typeof value === 'boolean') return 'integer';
  if (Buffer.isBuffer(value)) return 'blob';
  return 'unknown';
}

/**
 * Execute a query against SQLite using the connection pool
 *
 * Supports:
 * - Parameterized queries (? placeholders)
 * - Both SELECT and write operations (INSERT, UPDATE, DELETE)
 * - In-memory databases (:memory:)
 * - File-based databases
 */
export async function executeSqliteQuery(
  connectionInfo: DatabaseConnectionInfo,
  query: string,
  params: unknown[] = [],
  readonly = true,
): Promise<SqliteExecutionResult> {
  // Handle special :memory: path
  const filepath = connectionInfo.filepath === ':memory:'
    ? ':memory:'
    : connectionInfo.filepath!;

  const connectionOptions: SqliteConnectionOptions = {
    filepath,
    readonly,
    foreignKeys: true,
    walMode: !readonly, // Enable WAL for write operations
  };

  return withConnection(connectionOptions, (db) => {
    const stmt = db.prepare(query);
    const isSelect = isSelectQuery(query);

    if (isSelect) {
      // Execute SELECT query
      const rows = params.length > 0
        ? stmt.all(...params) as Record<string, unknown>[]
        : stmt.all() as Record<string, unknown>[];

      // Get column info
      const columns: ColumnInfo[] = [];
      if (rows.length > 0) {
        for (const [key, value] of Object.entries(rows[0])) {
          columns.push({
            name: key,
            type: inferSqliteType(value),
          });
        }
      } else {
        // Try to get column info from prepared statement
        try {
          const columnsInfo = stmt.columns();
          for (const col of columnsInfo) {
            columns.push({
              name: col.name,
              type: col.type || 'unknown',
            });
          }
        } catch {
          // Some queries may not have column info
        }
      }

      return { rows, columns };
    } else {
      // Execute write operation (INSERT, UPDATE, DELETE, etc.)
      const result = params.length > 0
        ? stmt.run(...params)
        : stmt.run();

      return {
        rows: [],
        columns: [],
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid,
      };
    }
  });
}
