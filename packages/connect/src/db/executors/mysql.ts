/**
 * MySQL query executor, ported from v1 project-engine
 * `core/database/executors/mysql.ts`. The `mysql2` driver loads lazily from the
 * target project (honest install hint when absent).
 */

import type { DatabaseConnectionInfo, ColumnInfo, ExecutionResult } from '../types.js';
import { loadMysqlDriver } from '../drivers.js';
import { ConnectionError, QueryError } from '../errors.js';

/** Map a MySQL type code to a human-readable type name. */
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
 * Execute a SQL query against MySQL using a single isolated connection.
 * @param connectionInfo - parsed connection details
 * @param query - SQL to execute
 * @param params - parameters for `?` placeholders
 * @param readonly - run inside `START TRANSACTION READ ONLY` so the server
 * itself rejects a mutation the text classifier failed to recognise
 */
export async function executeMysql(
  connectionInfo: DatabaseConnectionInfo,
  query: string,
  params: unknown[] = [],
  readonly = true,
): Promise<ExecutionResult> {
  const mysql = await loadMysqlDriver();
  if (!mysql) {
    throw new Error('MySQL driver (mysql2) is not installed in this project. Install with: npm install mysql2');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mysqlDriver = mysql as any;
  let connection;
  try {
    connection = await mysqlDriver.createConnection({
      host: connectionInfo.host,
      port: connectionInfo.port,
      database: connectionInfo.database,
      user: connectionInfo.user,
      password: connectionInfo.password,
      connectTimeout: 5000,
    });
  } catch (cause) {
    throw new ConnectionError(
      `Failed to connect to MySQL: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    );
  }

  try {
    if (readonly) {await connection.query('START TRANSACTION READ ONLY');}
    const [rows, fields] = await connection.execute({ sql: query, timeout: 30000 }, params);
    const columns: ColumnInfo[] =
      (fields as Array<{ name: string; type: number }>)?.map((field) => ({
        name: field.name,
        type: getMysqlTypeName(field.type),
      })) || [];
    return { rows: Array.isArray(rows) ? rows : [], columns };
  } catch (cause) {
    throw new QueryError(
      `MySQL query failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    );
  } finally {
    if (readonly) {
      await connection.query('ROLLBACK').catch(() => undefined);
    }
    await connection.end();
  }
}
