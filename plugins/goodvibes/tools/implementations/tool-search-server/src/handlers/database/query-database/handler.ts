/**
 * Database Query Tool Handler
 *
 * Main handler for the query_database MCP tool.
 * Executes SQL queries against PostgreSQL, MySQL, and SQLite databases.
 */

import type { QueryDatabaseArgs, QueryDatabaseResult, ToolResponse } from './types.js';
import { parseDatabaseUrl } from './url-parser.js';
import { isWriteOperation, hasLimitClause, addLimitClause } from './query-analysis.js';
import { executeQuery } from './executors/index.js';
import { formatAsTable } from './formatters.js';
import { enhanceSqliteError, formatErrorResponse } from './errors.js';

/**
 * Handle query_database tool call
 */
export async function handleQueryDatabase(args: QueryDatabaseArgs): Promise<ToolResponse> {
  const startTime = Date.now();

  // Get database URL from args or environment
  const databaseUrl = args.database_url || process.env.DATABASE_URL;
  if (!databaseUrl) {
    return formatErrorResponse(
      'No database URL provided. Set DATABASE_URL environment variable or pass database_url parameter.',
    );
  }

  // Parse the connection URL
  const connectionInfo = parseDatabaseUrl(databaseUrl);
  if (connectionInfo.type === 'unknown') {
    return formatErrorResponse(
      `Unable to parse database URL. Supported formats:\n` +
      `  - PostgreSQL: postgresql://<user>:<pass>@host:port/database\n` +
      `  - MySQL: mysql://<user>:<pass>@host:port/database\n` +
      `  - SQLite: sqlite:///path/to/db.sqlite or file:./db.sqlite`,
    );
  }

  // Default options
  const readonly = args.readonly !== false; // Default true
  const limit = args.limit ?? 100;
  const format = args.format || 'json';
  const explain = args.explain || false;

  // Check for write operations in readonly mode
  if (readonly && isWriteOperation(args.query)) {
    return formatErrorResponse(
      'Write operations (INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE) are not allowed in readonly mode. ' +
      'Set readonly=false to enable write operations.',
    );
  }

  // Prepare the query
  let queryToExecute = args.query.trim();

  // Add LIMIT if not present and it's a SELECT
  let truncated = false;
  if (limit > 0 && !hasLimitClause(queryToExecute) && /^(SELECT|WITH)/i.test(queryToExecute)) {
    queryToExecute = addLimitClause(queryToExecute, limit);
    truncated = true;
  }

  // Add EXPLAIN if requested
  let explainOutput: string | undefined;
  if (explain) {
    const explainQuery = `EXPLAIN ${queryToExecute}`;
    try {
      const explainResult = await executeQuery(connectionInfo, explainQuery);
      explainOutput = JSON.stringify(explainResult.rows, null, 2);
    } catch (error) {
      // EXPLAIN failed, continue with main query
      explainOutput = `EXPLAIN failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  // Execute the query
  try {
    const executionResult = await executeQuery(connectionInfo, queryToExecute, {
      params: args.params || [],
      readonly,
    });
    const executionTime = Date.now() - startTime;

    const result: QueryDatabaseResult = {
      success: true,
      database_type: connectionInfo.type,
      rows: executionResult.rows,
      row_count: executionResult.rows.length,
      columns: executionResult.columns,
      execution_time_ms: executionTime,
      query_executed: queryToExecute,
      truncated,
    };

    // Include write operation metadata if present
    if (executionResult.changes !== undefined) {
      result.changes = executionResult.changes;
    }
    if (executionResult.lastInsertRowid !== undefined) {
      result.last_insert_rowid = executionResult.lastInsertRowid;
    }

    if (explainOutput) {
      result.explain_output = explainOutput;
    }

    // Format output based on requested format
    let outputText: string;
    if (format === 'table') {
      if (executionResult.changes !== undefined) {
        // Write operation result
        outputText = `Query executed successfully (${executionTime}ms)\n\n`;
        outputText += `Rows affected: ${executionResult.changes}`;
        if (executionResult.lastInsertRowid !== undefined && executionResult.lastInsertRowid !== 0n) {
          outputText += `\nLast insert row ID: ${executionResult.lastInsertRowid}`;
        }
      } else {
        // SELECT result
        const tableOutput = formatAsTable(executionResult.rows, executionResult.columns);
        outputText = `Query executed successfully (${executionTime}ms)\n\n${tableOutput}\n\n${executionResult.rows.length} row(s) returned`;
        if (truncated) {
          outputText += ` (limited to ${limit})`;
        }
      }
      if (explainOutput) {
        outputText += `\n\nEXPLAIN:\n${explainOutput}`;
      }
    } else {
      outputText = JSON.stringify(result, null, 2);
    }

    return {
      content: [{ type: 'text', text: outputText }],
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Provide more helpful error messages for common SQLite errors
    const enhancedError = enhanceSqliteError(errorMessage, connectionInfo.type);

    const result: QueryDatabaseResult = {
      success: false,
      database_type: connectionInfo.type,
      rows: [],
      row_count: 0,
      columns: [],
      execution_time_ms: executionTime,
      query_executed: queryToExecute,
      error: enhancedError,
    };

    if (explainOutput) {
      result.explain_output = explainOutput;
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      isError: true,
    };
  }
}
