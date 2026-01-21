/**
 * MySQL Query Executor
 *
 * Handles query execution against MySQL databases using the mysql2 driver.
 */

import type { DatabaseConnectionInfo, ColumnInfo } from '../types.js';
import { getMysqlDriver } from '../drivers.js';

/**
 * Map MySQL type codes to names
 */
export function getMysqlTypeName(typeCode: number): string {
  // MySQL type codes (from mysql2)
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
 * Execute a query against MySQL
 */
export async function executeMysqlQuery(
  connectionInfo: DatabaseConnectionInfo,
  query: string,
): Promise<{ rows: unknown[]; columns: ColumnInfo[] }> {
  const mysql = await getMysqlDriver();
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

    // Extract column info from field metadata
    const columns: ColumnInfo[] = (fields as Array<{ name: string; type: number }>)?.map((field) => ({
      name: field.name,
      type: getMysqlTypeName(field.type),
    })) || [];

    return {
      rows: Array.isArray(rows) ? rows : [],
      columns,
    };
  } finally {
    await connection.end();
  }
}
