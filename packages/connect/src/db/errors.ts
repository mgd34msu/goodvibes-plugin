/**
 * Database error classes + message enhancement — ported from v1 project-engine
 * `core/database/errors.ts` (the "honest install hints"/actionable-message
 * behavior the plan praised). Schema-only helpers are dropped.
 */

import type { QueryResult, DatabaseDriver } from './types.js';

/** Base error for database operation failures. */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

/** Thrown when a connection cannot be established. */
export class ConnectionError extends DatabaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ConnectionError';
  }
}

/** Thrown when a query fails during execution. */
export class QueryError extends DatabaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'QueryError';
  }
}

/** Thrown when a database operation exceeds its time limit. */
export class TimeoutError extends DatabaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'TimeoutError';
  }
}

/**
 * Enhance a raw error message with an actionable hint for the driver in use.
 * @param message - the raw error message
 * @param dbType - the database type (only that dialect's hints apply)
 */
export function enhanceDatabaseError(message: string, dbType: DatabaseDriver): string {
  if (dbType === 'postgresql') {
    const pgEnhancements: Array<[RegExp, string]> = [
      [/duplicate key value/i, `${message}\n\nHint: A unique constraint was violated. A record with this value already exists.`],
      [/relation "[^"]+" does not exist/i, `${message}\n\nHint: The table or view does not exist.`],
      [/null value in column/i, `${message}\n\nHint: A NOT NULL constraint was violated. Provide a value for the required column.`],
      [/permission denied/i, `${message}\n\nHint: The database user lacks permission for this operation.`],
    ];
    for (const [pattern, enhanced] of pgEnhancements) {
      if (pattern.test(message)) return enhanced;
    }
    return message;
  }

  if (dbType === 'mysql') {
    const mysqlEnhancements: Array<[RegExp, string]> = [
      [/Duplicate entry/i, `${message}\n\nHint: A unique constraint was violated. A record with this value already exists.`],
      [/Table '[^']+' doesn't exist/i, `${message}\n\nHint: The table does not exist. Use 'SHOW TABLES' to list available tables.`],
      [/Access denied/i, `${message}\n\nHint: The database user lacks permission for this operation.`],
      [/Unknown column/i, `${message}\n\nHint: The column does not exist. Use 'DESCRIBE table_name' to see columns.`],
    ];
    for (const [pattern, enhanced] of mysqlEnhancements) {
      if (pattern.test(message)) return enhanced;
    }
    return message;
  }

  if (dbType !== 'sqlite') return message;

  const enhancements: Array<[RegExp, string]> = [
    [/SQLITE_READONLY/i, `${message}\n\nHint: The database is opened read-only. Enable writes explicitly to mutate.`],
    [/SQLITE_BUSY/i, `${message}\n\nHint: The database is locked by another connection. Wait and retry.`],
    [/SQLITE_CONSTRAINT/i, `${message}\n\nHint: A constraint was violated (foreign key, unique, not null, etc.).`],
    [/no such table/i, `${message}\n\nHint: The table does not exist. Use 'SELECT name FROM sqlite_master WHERE type="table"'.`],
    [/no such column/i, `${message}\n\nHint: The column does not exist. Use 'PRAGMA table_info(table_name)'.`],
    [/SQLITE_CORRUPT/i, `${message}\n\nHint: The database file appears corrupted. Restore from a backup.`],
    [/unable to open database/i, `${message}\n\nHint: Cannot open the database file. Check the path and permissions.`],
  ];

  for (const [pattern, enhanced] of enhancements) {
    if (pattern.test(message)) return enhanced;
  }

  return message;
}

/** Build a failed QueryResult for error responses. */
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
