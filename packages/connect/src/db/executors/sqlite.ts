/**
 * SQLite query executor — ported from v1 project-engine
 * `core/database/executors/sqlite.ts` (parameterized SELECT + write paths via
 * the pool). This is the tested db_query path (sql.js is connect's own dep).
 */

import type { DatabaseConnectionInfo, ColumnInfo, ExecutionResult, SqliteConnectionOptions } from '../types.js';
import { withConnection } from '../sqlite-pool.js';
import { isReadOnlyQuery } from '../query-analysis.js';
import { ConnectionError, QueryError } from '../errors.js';

/** Infer a SQLite column type from a JS value. */
export function inferSqliteType(value: unknown): string {
  if (value === null) {return 'null';}
  if (typeof value === 'number') {return Number.isInteger(value) ? 'integer' : 'real';}
  if (typeof value === 'string') {return 'text';}
  if (typeof value === 'boolean') {return 'integer';}
  if (Buffer.isBuffer(value)) {return 'blob';}
  return 'unknown';
}

/**
 * Execute a SQL query against a SQLite database via the connection pool.
 * @param connectionInfo - parsed connection details (needs `filepath`)
 * @param query - SQL to execute
 * @param params - parameters for `?` placeholders
 * @param readonly - open read-only (default true)
 */
export async function executeSqlite(
  connectionInfo: DatabaseConnectionInfo,
  query: string,
  params: unknown[] = [],
  readonly = true,
): Promise<ExecutionResult> {
  if (!connectionInfo.filepath) {
    throw new Error(
      'SQLite connection requires a filepath. Provide a file path (sqlite:///path/to/db.sqlite) or :memory:.',
    );
  }

  const filepath = connectionInfo.filepath;
  const connectionOptions: SqliteConnectionOptions = {
    filepath,
    readonly,
    foreignKeys: true,
    walMode: !readonly,
  };

  try {
    return await withConnection(connectionOptions, (db) => {
      const isSelect = isReadOnlyQuery(query);

      if (isSelect) {
        const stmt = db.prepare(query);
        if (params.length > 0) {stmt.bind(params);}

        const rows: Record<string, unknown>[] = [];
        const columnNames = stmt.getColumnNames();

        while (stmt.step()) {rows.push(stmt.getAsObject());}
        stmt.free();

        const columns: ColumnInfo[] = [];
        if (rows.length > 0) {
          for (const [key, value] of Object.entries(rows[0])) {
            columns.push({ name: key, type: inferSqliteType(value) });
          }
        } else if (columnNames.length > 0) {
          for (const name of columnNames) {columns.push({ name, type: 'unknown' });}
        }

        return { rows, columns };
      }

      if (params.length > 0) {
        db.run(query, params);
      } else {
        db.run(query);
      }

      const changes = db.getRowsModified();
      const rowidResult = db.exec('SELECT last_insert_rowid()');
      const lastInsertRowid: number | bigint =
        rowidResult.length > 0 && rowidResult[0].values.length > 0
          ? (rowidResult[0].values[0][0] as number)
          : 0;
      return { rows: [], columns: [], changes, lastInsertRowid };
    });
  } catch (cause) {
    if (cause instanceof ConnectionError || cause instanceof QueryError) {throw cause;}
    throw new QueryError(
      `SQLite query failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    );
  }
}
