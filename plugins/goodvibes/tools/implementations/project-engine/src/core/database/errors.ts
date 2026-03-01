/**
 * Database error types and formatting utilities
 *
 * Custom error classes for database operations and helpers for
 * enhancing error messages with actionable context.
 *
 * @module core/database/errors
 */

import type { QueryResult, DatabaseDriver } from './types.js';

// =============================================================================
// Custom Error Classes
// =============================================================================

/**
 * Base error class for database operation failures.
 */
export class DatabaseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'DatabaseError';
  }
}

/**
 * Thrown when a database connection cannot be established.
 */
export class ConnectionError extends DatabaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ConnectionError';
  }
}

/**
 * Thrown when a SQL query fails during execution.
 */
export class QueryError extends DatabaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'QueryError';
  }
}

/**
 * Thrown when a database operation exceeds its time limit.
 */
export class TimeoutError extends DatabaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'TimeoutError';
  }
}

// =============================================================================
// Error Enhancement
// =============================================================================

/**
 * Enhance SQLite error messages with helpful context and hints.
 *
 * Maps common SQLite error codes to human-readable explanations
 * with actionable suggestions for the user.
 *
 * @param message - The raw error message from SQLite
 * @param dbType - The database type (only enhances SQLite messages)
 * @returns Enhanced message with hint appended, or original message unchanged
 *
 * @example
 * enhanceDatabaseError('SQLITE_READONLY: attempt to write a readonly database', 'sqlite')
 * // Returns message + '\n\nHint: The database is opened in readonly mode...'
 */
export function enhanceDatabaseError(message: string, dbType: DatabaseDriver): string {
  if (dbType !== 'sqlite') {
    return message;
  }

  // Note: error hint messages are currently English-only.
  // For i18n support, these strings should be moved to a locale resource file.
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

// =============================================================================
// Error Response Builder
// =============================================================================

/**
 * Build a failed QueryResult object for error responses.
 *
 * @param message - The error message to include
 * @returns A QueryResult indicating failure
 */
export function buildErrorResult(message: string): QueryResult {
  return {
    success: false,
    database_type: 'unknown',
    rows: [],
    row_count: 0,
    columns: [],
    execution_time_ms: 0,
    query_executed: '',
    error: message,
  };
}
