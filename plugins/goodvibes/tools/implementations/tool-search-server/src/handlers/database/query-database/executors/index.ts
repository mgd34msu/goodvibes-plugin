/**
 * Query Executors
 *
 * Unified query execution across different database types.
 * Routes queries to the appropriate executor based on database type.
 */

import type { DatabaseConnectionInfo, ExecutionResult, ExecutionOptions } from '../types.js';
import { executePostgresQuery, getPostgresTypeName } from './postgres.js';
import { executeMysqlQuery, getMysqlTypeName } from './mysql.js';
import { executeSqliteQuery, inferSqliteType } from './sqlite.js';

/**
 * Execute query against the appropriate database
 */
export async function executeQuery(
  connectionInfo: DatabaseConnectionInfo,
  query: string,
  options: ExecutionOptions = {},
): Promise<ExecutionResult> {
  const { params = [], readonly = true } = options;

  switch (connectionInfo.type) {
    case 'postgresql':
      return executePostgresQuery(connectionInfo, query);
    case 'mysql':
      return executeMysqlQuery(connectionInfo, query);
    case 'sqlite':
      return executeSqliteQuery(connectionInfo, query, params, readonly);
    default:
      throw new Error(`Unsupported database type: ${connectionInfo.type}`);
  }
}

// Re-export individual executors and type mappers for testing
export {
  executePostgresQuery,
  executeMysqlQuery,
  executeSqliteQuery,
  getPostgresTypeName,
  getMysqlTypeName,
  inferSqliteType,
};
