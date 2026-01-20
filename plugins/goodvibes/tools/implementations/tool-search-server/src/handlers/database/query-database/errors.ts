/**
 * Error Handling
 *
 * Functions for enhancing error messages and formatting error responses.
 */

import type { DatabaseType, QueryDatabaseResult, ToolResponse } from './types.js';

/**
 * Enhance SQLite error messages with more helpful context
 */
export function enhanceSqliteError(message: string, dbType: DatabaseType): string {
  if (dbType !== 'sqlite') {
    return message;
  }

  // Common SQLite errors and their solutions
  const enhancements: Array<[RegExp, string]> = [
    [
      /SQLITE_READONLY/i,
      `${message}\n\nHint: The database is opened in readonly mode. Set readonly=false to enable write operations.`,
    ],
    [
      /SQLITE_BUSY/i,
      `${message}\n\nHint: The database is locked by another connection. Wait and retry, or ensure other connections are closed.`,
    ],
    [
      /SQLITE_CONSTRAINT/i,
      `${message}\n\nHint: A constraint was violated (foreign key, unique, not null, etc.). Check your data against the table schema.`,
    ],
    [
      /no such table/i,
      `${message}\n\nHint: The table does not exist. Use 'SELECT name FROM sqlite_master WHERE type="table"' to list available tables.`,
    ],
    [
      /no such column/i,
      `${message}\n\nHint: The column does not exist. Use 'PRAGMA table_info(table_name)' to see column definitions.`,
    ],
    [
      /SQLITE_CORRUPT/i,
      `${message}\n\nHint: The database file appears to be corrupted. Consider restoring from a backup.`,
    ],
    [
      /unable to open database/i,
      `${message}\n\nHint: Cannot open the database file. Check that the path is correct and the file has proper permissions.`,
    ],
  ];

  for (const [pattern, enhanced] of enhancements) {
    if (pattern.test(message)) {
      return enhanced;
    }
  }

  return message;
}

/**
 * Format an error response
 */
export function formatErrorResponse(message: string): ToolResponse {
  const result: QueryDatabaseResult = {
    success: false,
    database_type: 'unknown',
    rows: [],
    row_count: 0,
    columns: [],
    execution_time_ms: 0,
    query_executed: '',
    error: message,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    isError: true,
  };
}
