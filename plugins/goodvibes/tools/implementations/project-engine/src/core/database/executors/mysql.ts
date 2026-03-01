/**
 * MySQL query executor
 *
 * Executes SQL queries against MySQL databases using the mysql2 driver.
 * Driver is loaded lazily and handled gracefully if not installed.
 *
 * @module core/database/executors/mysql
 */

import type { DatabaseConnectionInfo, ColumnInfo, ExecutionResult } from '../types.js';
import { loadMysqlDriver } from '../drivers.js';

/**
 * Map a MySQL type code to a human-readable type name.
 *
 * @param typeCode - MySQL type code from field metadata
 * @returns Type name string, or 'unknown' for unmapped codes
 */
export function getMysqlTypeName(typeCode: number): string {
  const typeMap: Record<number, string> = {
    0: 'decimal',
    1: 'tinyint',
    2: 'smallint',
    3: 'int',
    4: 'float',
    5: 'double',
    7: 'timestamp',
    8: 'bigint',
    9: 'mediumint',
    10: 'date',
    11: 'time',
    12: 'datetime',
    13: 'year',
    15: 'varchar',
    16: 'bit',
    245: 'json',
    246: 'decimal',
    252: 'blob',
    253: 'varchar',
    254: 'char',
  };
  return typeMap[typeCode] || 'unknown';
}

/**
 * Execute a SQL query against a MySQL database.
 *
 * Opens a single connection, executes the query, and closes the connection.
 *
 * @param connectionInfo - Parsed connection details
 * @param query - SQL query string to execute
 * @returns Execution result with rows and column metadata
 * @throws Error if the mysql2 driver is not installed or query fails
 */
export async function executeMysql(
  connectionInfo: DatabaseConnectionInfo,
  query: string,
): Promise<ExecutionResult> {
  const mysql = await loadMysqlDriver();
  if (!mysql) {
    throw new Error(
      'MySQL driver (mysql2) is not installed. Install with: npm install mysql2',
    );
  }

  const connection = await mysql.createConnection({
    host: connectionInfo.host,
    port: connectionInfo.port,
    database: connectionInfo.database,
    user: connectionInfo.user,
    password: connectionInfo.password,
    connectTimeout: 5000,
  });

  try {
    const [rows, fields] = await connection.execute(query);

    const columns: ColumnInfo[] = (fields as Array<{ name: string; type: number }>)?.map(
      (field) => ({ name: field.name, type: getMysqlTypeName(field.type) })
    ) || [];

    return { rows: Array.isArray(rows) ? rows : [], columns };
  } finally {
    await connection.end();
  }
}
