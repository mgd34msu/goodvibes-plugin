/**
 * SQLite Query Executor
 *
 * Handles query execution against SQLite databases using sql.js.
 * Uses a connection pool for better performance.
 */

import type { DatabaseConnectionInfo, ColumnInfo, SqliteExecutionResult } from '../types.js';
import { withConnection, type SqliteConnectionOptions } from '../../shared/sqlite-connection.js';
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
    const isSelect = isSelectQuery(query);

    if (isSelect) {
      // Execute SELECT query using sql.js
      // Bind parameters if provided
      const stmt = db.prepare(query);
      if (params.length > 0) {
        stmt.bind(params);
      }

      // Iterate through results
      const rows: Record<string, unknown>[] = [];
      const columnNames = stmt.getColumnNames();
      
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();

      // Get column info
      const columns: ColumnInfo[] = [];
      if (rows.length > 0) {
        for (const [key, value] of Object.entries(rows[0])) {
          columns.push({
            name: key,
            type: inferSqliteType(value),
          });
        }
      } else if (columnNames.length > 0) {
        // Use column names from statement if no rows
        for (const name of columnNames) {
          columns.push({
            name,
            type: 'unknown',
          });
        }
      }

      return { rows, columns };
    } else {
      // Execute write operation (INSERT, UPDATE, DELETE, etc.)
      // sql.js uses run() for write operations
      if (params.length > 0) {
        db.run(query, params);
      } else {
        db.run(query);
      }

      const changes = db.getRowsModified();

      return {
        rows: [],
        columns: [],
        changes,
        lastInsertRowid: 0, // sql.js doesn't easily provide this, would need SELECT last_insert_rowid()
      };
    }
  });
}
