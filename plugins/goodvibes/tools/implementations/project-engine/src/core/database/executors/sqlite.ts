/**
 * SQLite query executor
 *
 * Executes SQL queries against SQLite databases using sql.js via the
 * connection pool. Supports parameterized queries and write operations.
 *
 * @module core/database/executors/sqlite
 */

import type { DatabaseConnectionInfo, ColumnInfo, ExecutionResult, SqliteConnectionOptions } from '../types.js';
import { withConnection } from '../sqlite-pool.js';
import { isReadOnlyQuery } from '../query-analysis.js';

/**
 * Infer a SQLite column type from a JavaScript value.
 *
 * @param value - A value from a query result row
 * @returns SQLite type string
 */
export function inferSqliteType(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'real';
  if (typeof value === 'string') return 'text';
  if (typeof value === 'boolean') return 'integer';
  if (Buffer.isBuffer(value)) return 'blob';
  return 'unknown';
}

/**
 * Execute a SQL query against a SQLite database using the connection pool.
 *
 * Supports:
 * - Parameterized queries (? placeholders)
 * - SELECT and write operations (INSERT, UPDATE, DELETE)
 * - In-memory databases (:memory:)
 * - File-based databases
 *
 * @param connectionInfo - Parsed connection details
 * @param query - SQL query string to execute
 * @param params - Query parameters for parameterized queries
 * @param readonly - Whether to open the database in readonly mode (default: true)
 * @returns Execution result with rows, columns, and write metadata
 */
export async function executeSqlite(
  connectionInfo: DatabaseConnectionInfo,
  query: string,
  params: unknown[] = [],
  readonly = true,
): Promise<ExecutionResult> {
  if (!connectionInfo.filepath) {
    throw new Error(
      'SQLite connection requires a filepath. ' +
      'Provide a file path (e.g., sqlite:///path/to/db.sqlite) or use :memory: for an in-memory database.'
    );
  }

  const filepath = connectionInfo.filepath;

  const connectionOptions: SqliteConnectionOptions = {
    filepath,
    readonly,
    foreignKeys: true,
    walMode: !readonly,
  };

  return withConnection(connectionOptions, (db) => {
    const isSelect = isReadOnlyQuery(query);

    if (isSelect) {
      const stmt = db.prepare(query);
      if (params.length > 0) {
        stmt.bind(params);
      }

      const rows: Record<string, unknown>[] = [];
      const columnNames = stmt.getColumnNames();

      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();

      const columns: ColumnInfo[] = [];
      if (rows.length > 0) {
        for (const [key, value] of Object.entries(rows[0])) {
          columns.push({ name: key, type: inferSqliteType(value) });
        }
      } else if (columnNames.length > 0) {
        for (const name of columnNames) {
          columns.push({ name, type: 'unknown' });
        }
      }

      return { rows, columns };
    } else {
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
        lastInsertRowid: 0,
      };
    }
  });
}
