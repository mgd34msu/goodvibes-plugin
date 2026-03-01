/**
 * Database query extension
 *
 * High-level handler for the query_database MCP tool.
 * Executes SQL queries against PostgreSQL, MySQL, and SQLite databases.
 *
 * @module extensions/database/query
 */

import type { McpResponse } from '../../shared/types.js';
import { ok, fail } from '../../shared/response.js';
import type {
  QueryDatabaseArgs,
  QueryResult,
  ExecutionResult,
  DatabaseConnectionInfo,
} from '../../core/database/types.js';
import {
  parseConnectionUrl,
  isWriteOperation,
  hasLimitClause,
  addLimitClause,
  formatQueryResult,
  enhanceDatabaseError,
  executePostgres,
  executeMysql,
  executeSqlite,
} from '../../core/database/index.js';

// =============================================================================
// Query Executor
// =============================================================================

/**
 * Execute a SQL query against the detected database type.
 *
 * Dispatches to the correct executor (PostgreSQL, MySQL, SQLite)
 * based on the connection info type.
 *
 * @param connectionInfo - Parsed database connection details
 * @param sql - SQL query to execute
 * @param params - Optional query parameters
 * @param readonly - Whether to restrict to read-only operations
 * @returns Execution result with rows, columns, and write metadata
 * @throws Error if the driver is not installed or query fails
 */
export async function executeQuery(
  connectionInfo: DatabaseConnectionInfo,
  sql: string,
  params: unknown[] = [],
  readonly = true,
): Promise<ExecutionResult> {
  switch (connectionInfo.type) {
    case 'postgresql':
      return executePostgres(connectionInfo, sql, params);
    case 'mysql':
      return executeMysql(connectionInfo, sql, params);
    case 'sqlite':
      return executeSqlite(connectionInfo, sql, params, readonly);
    default:
      throw new Error(
        `Unsupported database type: ${connectionInfo.type}. Supported: postgresql, mysql, sqlite`
      );
  }
}

// =============================================================================
// Public Handler
// =============================================================================

/**
 * Execute a SQL query against a database and return the results.
 *
 * Features:
 * - Auto-detects database type from connection URL
 * - Enforces readonly mode by default (blocks write operations)
 * - Automatically adds LIMIT to SELECT queries without one
 * - Optional EXPLAIN output
 * - JSON or ASCII table output format
 * - Parameterized query support (SQLite, PostgreSQL)
 *
 * @param args - The query_database tool arguments
 * @returns MCP response with query results in the requested format
 *
 * @example
 * await queryDatabase({ query: 'SELECT * FROM users', limit: 10 })
 * // Returns JSON result with up to 10 rows
 *
 * @example
 * await queryDatabase({ query: 'SELECT * FROM users', format: 'table' })
 * // Returns ASCII table formatted output
 */
export async function queryDatabase(args: QueryDatabaseArgs): Promise<McpResponse> {
  const startTime = Date.now();

  const databaseUrl = args.database_url || process.env.DATABASE_URL;
  if (!databaseUrl) {
    return fail(
      'No database URL provided. Set DATABASE_URL environment variable or pass database_url parameter.'
    );
  }

  const connectionInfo = parseConnectionUrl(databaseUrl);
  if (connectionInfo.type === 'unknown') {
    return fail(
      `Unable to parse database URL. Supported formats:\n` +
      `  - PostgreSQL: postgresql://<USER>:<PASSWORD>@<HOST>:<PORT>/<DATABASE>\n` +
      `  - MySQL: mysql://<USER>:<PASSWORD>@<HOST>:<PORT>/<DATABASE>\n` +
      `  - SQLite: sqlite:///<PATH_TO_DB> or file:./<DB_FILE>`
    );
  }

  const readonly = args.readonly !== false;
  const limit = args.limit ?? 100;
  const format = args.format || 'json';
  const explain = args.explain || false;

  // Block writes in readonly mode
  if (readonly && isWriteOperation(args.query)) {
    return fail(
      'Write operations (INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE) are not allowed in readonly mode. ' +
      'Set readonly=false to enable write operations.'
    );
  }

  let queryToExecute = args.query.trim();

  // Auto-add LIMIT to SELECT/CTE queries without an existing LIMIT clause.
  // Skip if the query already has a LIMIT (checked case-insensitively, handles CTEs).
  let truncated = false;
  if (limit > 0 && !hasLimitClause(queryToExecute) && /^(SELECT|WITH)\b/i.test(queryToExecute)) {
    queryToExecute = addLimitClause(queryToExecute, limit);
    truncated = true;
  }

  // Optional EXPLAIN — only for read queries (EXPLAIN on writes is unsupported/dangerous)
  let explainOutput: string | undefined;
  if (explain && !isWriteOperation(queryToExecute)) {
    try {
      // SQLite's raw EXPLAIN returns VM opcodes (bytecode), not useful for query optimization.
      // Use EXPLAIN QUERY PLAN instead, which returns a human-readable execution plan.
      const explainPrefix = connectionInfo.type === 'sqlite' ? 'EXPLAIN QUERY PLAN' : 'EXPLAIN';
      const explainResult = await executeQuery(connectionInfo, `${explainPrefix} ${queryToExecute}`, args.params || []);
      explainOutput = JSON.stringify(explainResult.rows, null, 2);
    } catch (error) {
      explainOutput = `EXPLAIN failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  // Execute main query
  try {
    const executionResult = await executeQuery(
      connectionInfo,
      queryToExecute,
      args.params || [],
      readonly
    );
    const executionTime = Date.now() - startTime;

    const result: QueryResult = {
      success: true,
      database_type: connectionInfo.type,
      rows: executionResult.rows,
      row_count: executionResult.rows.length,
      columns: executionResult.columns,
      execution_time_ms: executionTime,
      query_executed: queryToExecute,
      truncated,
    };

    if (executionResult.changes !== undefined) result.changes = executionResult.changes;
    if (executionResult.lastInsertRowid !== undefined) result.last_insert_rowid = executionResult.lastInsertRowid;
    if (explainOutput) result.explain_output = explainOutput;

    if (format === 'table') {
      let outputText: string;
      if (executionResult.changes !== undefined) {
        outputText = `Query executed successfully (${executionTime}ms)\n\nRows affected: ${executionResult.changes}`;
        if (executionResult.lastInsertRowid !== undefined && executionResult.lastInsertRowid !== 0n) {
          outputText += `\nLast insert row ID: ${executionResult.lastInsertRowid}`;
        }
      } else {
        const tableOutput = formatQueryResult(executionResult.rows, executionResult.columns);
        outputText = `Query executed successfully (${executionTime}ms)\n\n${tableOutput}\n\n${executionResult.rows.length} row(s) returned`;
        if (truncated) outputText += ` (limited to ${limit})`;
      }
      if (explainOutput) outputText += `\n\nEXPLAIN:\n${explainOutput}`;

      return ok({ text: outputText });
    }

    return ok(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const enhancedError = enhanceDatabaseError(errorMessage, connectionInfo.type);
    return fail(enhancedError);
  }
}
