/**
 * PostgreSQL query executor
 *
 * Executes SQL queries against PostgreSQL databases using the pg driver.
 * Driver is loaded lazily and handled gracefully if not installed.
 *
 * @module core/database/executors/postgres
 */

import type { DatabaseConnectionInfo, ColumnInfo, ExecutionResult } from '../types.js';
import { loadPostgresDriver } from '../drivers.js';
import { ConnectionError, QueryError } from '../errors.js';

/**
 * Map a PostgreSQL OID to a human-readable type name.
 *
 * @param oid - PostgreSQL data type OID from field metadata
 * @returns Type name string, or 'unknown' for unmapped OIDs
 */
export function getPostgresTypeName(oid: number): string {
  const typeMap: Record<number, string> = {
    16: 'boolean',
    20: 'bigint',
    21: 'smallint',
    23: 'integer',
    25: 'text',
    114: 'json',
    700: 'real',
    701: 'double precision',
    1043: 'varchar',
    1082: 'date',
    1083: 'time',
    1114: 'timestamp',
    1184: 'timestamptz',
    1700: 'numeric',
    1186: 'interval',
    2950: 'uuid',
    3802: 'jsonb',
    2277: 'anyarray',
  };
  return typeMap[oid] || 'unknown';
}

/**
 * Execute a SQL query against a PostgreSQL database.
 *
 * Uses a single-connection pool for query isolation. The pool is
 * closed automatically after the query completes.
 *
 * @param connectionInfo - Parsed connection details
 * @param query - SQL query string to execute
 * @param params - Optional query parameters for parameterized queries (prevents SQL injection)
 * @returns Execution result with rows and column metadata
 * @throws Error if the pg driver is not installed or query fails
 */
export async function executePostgres(
  connectionInfo: DatabaseConnectionInfo,
  query: string,
  params: unknown[] = [],
): Promise<ExecutionResult> {
  const pg = await loadPostgresDriver();
  if (!pg) {
    throw new Error(
      'PostgreSQL driver (pg) is not installed. Install with: npm install pg',
    );
  }

  // Use a single Client (not Pool) for isolated single-query tool usage.
  // This avoids pool overhead for infrequent, isolated queries typical in tool context.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Client } = pg as any;
  const client = new Client({
    host: connectionInfo.host,
    port: connectionInfo.port,
    database: connectionInfo.database,
    user: connectionInfo.user,
    password: connectionInfo.password,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
  });

  try {
    await client.connect();
  } catch (cause) {
    throw new ConnectionError(
      `Failed to connect to PostgreSQL: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause
    );
  }

  try {
    const result = await client.query(query, params);

    const columns: ColumnInfo[] = result.fields?.map(
      (field: { name: string; dataTypeID: number }) => ({
        name: field.name,
        type: getPostgresTypeName(field.dataTypeID),
      })
    ) || [];

    return { rows: result.rows, columns };
  } catch (cause) {
    throw new QueryError(
      `PostgreSQL query failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause
    );
  } finally {
    await client.end();
  }
}
