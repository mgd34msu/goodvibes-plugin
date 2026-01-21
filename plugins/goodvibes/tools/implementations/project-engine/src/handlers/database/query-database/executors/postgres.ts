/**
 * PostgreSQL Query Executor
 *
 * Handles query execution against PostgreSQL databases using the pg driver.
 */

import type { DatabaseConnectionInfo, ColumnInfo } from '../types.js';
import { getPostgresDriver } from '../drivers.js';

/**
 * Map PostgreSQL OID to type name
 */
export function getPostgresTypeName(oid: number): string {
  // Common PostgreSQL type OIDs
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
    2950: 'uuid',
    3802: 'jsonb',
  };
  return typeMap[oid] || 'unknown';
}

/**
 * Execute a query against PostgreSQL
 */
export async function executePostgresQuery(
  connectionInfo: DatabaseConnectionInfo,
  query: string,
): Promise<{ rows: unknown[]; columns: ColumnInfo[] }> {
  const pg = await getPostgresDriver();
  if (!pg) {
    throw new Error(
      'PostgreSQL driver (pg) is not installed. Install with: npm install pg',
    );
  }

  const { Pool } = pg;
  const pool = new Pool({
    host: connectionInfo.host,
    port: connectionInfo.port,
    database: connectionInfo.database,
    user: connectionInfo.user,
    password: connectionInfo.password,
    // Connection pool settings for single query
    max: 1,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 5000,
  });

  try {
    const result = await pool.query(query);

    // Extract column info from field metadata
    const columns: ColumnInfo[] = result.fields?.map((field: { name: string; dataTypeID: number }) => ({
      name: field.name,
      type: getPostgresTypeName(field.dataTypeID),
    })) || [];

    return {
      rows: result.rows,
      columns,
    };
  } finally {
    await pool.end();
  }
}
