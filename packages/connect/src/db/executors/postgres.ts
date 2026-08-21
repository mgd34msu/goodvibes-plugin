/**
 * PostgreSQL query executor, ported from v1 project-engine
 * `core/database/executors/postgres.ts`. The `pg` driver loads lazily from the
 * target project (honest install hint when absent).
 */

import type { DatabaseConnectionInfo, ColumnInfo, ExecutionResult } from '../types.js';
import { loadPostgresDriver } from '../drivers.js';
import { ConnectionError, QueryError } from '../errors.js';

/** Map a PostgreSQL type OID to a human-readable type name. */
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
 * Execute a SQL query against PostgreSQL using a single isolated client.
 * @param connectionInfo - parsed connection details
 * @param query - SQL to execute
 * @param params - parameters for `$n` placeholders
 * @param readonly - run inside a `BEGIN READ ONLY` transaction so the server
 * itself rejects a mutation the text classifier failed to recognise
 */
export async function executePostgres(
  connectionInfo: DatabaseConnectionInfo,
  query: string,
  params: unknown[] = [],
  readonly = true,
): Promise<ExecutionResult> {
  const pg = await loadPostgresDriver();
  if (!pg) {
    throw new Error('PostgreSQL driver (pg) is not installed in this project. Install with: npm install pg');
  }

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
      cause,
    );
  }

  try {
    if (readonly) {await client.query('BEGIN READ ONLY');}
    const result = await client.query(query, params);
    const columns: ColumnInfo[] =
      result.fields?.map((field: { name: string; dataTypeID: number }) => ({
        name: field.name,
        type: getPostgresTypeName(field.dataTypeID),
      })) || [];
    return { rows: result.rows, columns };
  } catch (cause) {
    throw new QueryError(
      `PostgreSQL query failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    );
  } finally {
    if (readonly) {
      await client.query('ROLLBACK').catch(() => undefined);
    }
    await client.end();
  }
}
