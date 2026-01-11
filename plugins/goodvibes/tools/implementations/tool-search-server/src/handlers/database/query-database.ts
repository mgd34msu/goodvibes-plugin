/**
 * Database Query Tool Handler
 *
 * Executes SQL queries against PostgreSQL, MySQL, and SQLite databases.
 * Database drivers are optional dependencies - handles missing drivers gracefully.
 *
 * SQLite Features:
 * - Connection pooling for better performance
 * - Parameterized queries for SQL injection prevention
 * - Write operation support (INSERT, UPDATE, DELETE)
 * - In-memory database support (:memory:)
 * - Schema introspection
 */

import { ToolResponse } from '../../types.js';
import { withConnection, type SqliteConnectionOptions } from './sqlite-connection.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Supported database types
 */
export type DatabaseType = 'postgresql' | 'mysql' | 'sqlite' | 'unknown';

/**
 * Parsed database connection info
 */
interface DatabaseConnectionInfo {
  type: DatabaseType;
  host?: string;
  port?: number;
  database: string;
  user?: string;
  password?: string;
  filepath?: string; // For SQLite
}

/**
 * Column metadata from query results
 */
export interface ColumnInfo {
  name: string;
  type: string;
}

/**
 * Arguments for query_database tool
 */
export interface QueryDatabaseArgs {
  query: string;
  database_url?: string;
  readonly?: boolean;
  limit?: number;
  format?: 'json' | 'table';
  explain?: boolean;
  /** Parameters for parameterized queries (SQLite, PostgreSQL) */
  params?: unknown[];
}

/**
 * Result of database query execution
 */
export interface QueryDatabaseResult {
  success: boolean;
  database_type: DatabaseType;
  rows: unknown[];
  row_count: number;
  columns: ColumnInfo[];
  execution_time_ms: number;
  query_executed: string;
  explain_output?: string;
  truncated?: boolean;
  error?: string;
  /** Number of rows affected by INSERT/UPDATE/DELETE */
  changes?: number;
  /** Last inserted row ID (SQLite) */
  last_insert_rowid?: number | bigint;
}

// =============================================================================
// SQL Write Operation Detection
// =============================================================================

/**
 * Keywords that indicate a write operation
 */
const WRITE_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'CREATE',
  'ALTER',
  'TRUNCATE',
  'REPLACE',
  'UPSERT',
  'MERGE',
  'GRANT',
  'REVOKE',
  'VACUUM',
];

/**
 * Check if a query is a write operation
 */
function isWriteOperation(query: string): boolean {
  const normalizedQuery = query.trim().toUpperCase();

  // Skip comments at the beginning
  const withoutComments = normalizedQuery
    .replace(/^--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  // Check if query starts with any write keyword
  for (const keyword of WRITE_KEYWORDS) {
    if (withoutComments.startsWith(keyword)) {
      return true;
    }
  }

  // Check for WITH...INSERT/UPDATE/DELETE (CTE with write)
  if (withoutComments.startsWith('WITH')) {
    for (const keyword of WRITE_KEYWORDS) {
      // Look for write keyword after the CTE definition
      const cteEndPattern = new RegExp(`\\)\\s*${keyword}\\b`, 'i');
      if (cteEndPattern.test(withoutComments)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if query already has a LIMIT clause
 */
function hasLimitClause(query: string): boolean {
  const normalizedQuery = query.trim().toUpperCase();
  // Match LIMIT keyword followed by number or parameter
  return /\bLIMIT\s+\d+/i.test(normalizedQuery) ||
         /\bLIMIT\s+\$\d+/i.test(normalizedQuery) ||
         /\bLIMIT\s+\?/i.test(normalizedQuery);
}

/**
 * Add LIMIT clause to a SELECT query
 */
function addLimitClause(query: string, limit: number): string {
  const trimmedQuery = query.trim();

  // Don't add limit to non-SELECT queries
  if (!/^(SELECT|WITH)/i.test(trimmedQuery)) {
    return trimmedQuery;
  }

  // Don't add if already has LIMIT
  if (hasLimitClause(trimmedQuery)) {
    return trimmedQuery;
  }

  // Remove trailing semicolon, add LIMIT, then re-add semicolon
  const withoutSemicolon = trimmedQuery.replace(/;\s*$/, '');
  return `${withoutSemicolon} LIMIT ${limit}`;
}

// =============================================================================
// Database URL Parsing
// =============================================================================

/**
 * Parse a database connection URL into its components
 */
function parseDatabaseUrl(url: string): DatabaseConnectionInfo {
  // Special case: in-memory SQLite database
  if (url === ':memory:' || url === 'sqlite::memory:' || url === 'sqlite://:memory:') {
    return {
      type: 'sqlite',
      database: ':memory:',
      filepath: ':memory:',
    };
  }

  // SQLite patterns
  if (url.startsWith('sqlite:') || url.startsWith('file:')) {
    let filepath = url
      .replace(/^sqlite:(\/\/)?/, '')
      .replace(/^file:/, '');

    // Handle relative paths
    if (filepath.startsWith('./') || filepath.startsWith('../')) {
      // Keep relative path as-is
    } else if (!filepath.startsWith('/') && !filepath.match(/^[A-Za-z]:\\/)) {
      // Add ./ for relative paths that don't start with / or drive letter
      filepath = './' + filepath;
    }

    // Handle special :memory: case within URL
    if (filepath === ':memory:' || filepath === '/:memory:') {
      return {
        type: 'sqlite',
        database: ':memory:',
        filepath: ':memory:',
      };
    }

    return {
      type: 'sqlite',
      database: filepath,
      filepath,
    };
  }

  // Check if it's a bare file path to a .db, .sqlite, or .sqlite3 file
  if (url.match(/\.(db|sqlite|sqlite3)$/i)) {
    let filepath = url;
    if (!filepath.startsWith('/') && !filepath.startsWith('./') && !filepath.match(/^[A-Za-z]:\\/)) {
      filepath = './' + filepath;
    }

    return {
      type: 'sqlite',
      database: filepath,
      filepath,
    };
  }

  // PostgreSQL pattern: postgresql://user:pass@host:port/database
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    try {
      const parsed = new URL(url);
      return {
        type: 'postgresql',
        host: parsed.hostname || 'localhost',
        port: parsed.port ? parseInt(parsed.port, 10) : 5432,
        database: parsed.pathname.replace(/^\//, '') || 'postgres',
        user: parsed.username || undefined,
        password: parsed.password || undefined,
      };
    } catch {
      return { type: 'unknown', database: '' };
    }
  }

  // MySQL pattern: mysql://user:pass@host:port/database
  if (url.startsWith('mysql://')) {
    try {
      const parsed = new URL(url);
      return {
        type: 'mysql',
        host: parsed.hostname || 'localhost',
        port: parsed.port ? parseInt(parsed.port, 10) : 3306,
        database: parsed.pathname.replace(/^\//, '') || 'mysql',
        user: parsed.username || undefined,
        password: parsed.password || undefined,
      };
    } catch {
      return { type: 'unknown', database: '' };
    }
  }

  return { type: 'unknown', database: '' };
}

// =============================================================================
// Driver Loading (Optional Dependencies)
// =============================================================================

// Driver types - we use 'unknown' to avoid requiring type declarations for optional deps
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModule = any;

/**
 * Dynamic import helper that avoids TypeScript checking the module path
 */
async function dynamicImport(moduleName: string): Promise<AnyModule | null> {
  try {
    // Use indirect eval to avoid TypeScript module resolution
    const importFn = new Function('name', 'return import(name)');
    return await importFn(moduleName);
  } catch {
    return null;
  }
}

/**
 * Attempt to load the PostgreSQL driver (pg)
 */
async function getPostgresDriver(): Promise<AnyModule | null> {
  return dynamicImport('pg');
}

/**
 * Attempt to load the MySQL driver (mysql2/promise)
 */
async function getMysqlDriver(): Promise<AnyModule | null> {
  return dynamicImport('mysql2/promise');
}

/**
 * Attempt to load the SQLite driver (better-sqlite3)
 */
async function getSqliteDriver(): Promise<AnyModule | null> {
  return dynamicImport('better-sqlite3');
}

// =============================================================================
// Query Execution
// =============================================================================

/**
 * Execute a query against PostgreSQL
 */
async function executePostgresQuery(
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

/**
 * Map PostgreSQL OID to type name
 */
function getPostgresTypeName(oid: number): string {
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
 * Execute a query against MySQL
 */
async function executeMysqlQuery(
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

/**
 * Map MySQL type codes to names
 */
function getMysqlTypeName(typeCode: number): string {
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
 * SQLite query execution result with additional metadata
 */
interface SqliteExecutionResult {
  rows: unknown[];
  columns: ColumnInfo[];
  changes?: number;
  lastInsertRowid?: number | bigint;
}

/**
 * Execute a query against SQLite using the connection pool
 *
 * Supports:
 * - Parameterized queries (? placeholders)
 * - Both SELECT and write operations (INSERT, UPDATE, DELETE)
 * - In-memory databases (:memory:)
 * - File-based databases
 */
async function executeSqliteQuery(
  connectionInfo: DatabaseConnectionInfo,
  query: string,
  params: unknown[] = [],
  readonly = true,
): Promise<SqliteExecutionResult> {
  // Handle special :memory: path
  const filepath = connectionInfo.filepath === ':memory:'
    ? ':memory:'
    : connectionInfo.filepath!;

  const connectionOptions: SqliteConnectionOptions = {
    filepath,
    readonly,
    foreignKeys: true,
    walMode: !readonly, // Enable WAL for write operations
  };

  return withConnection(connectionOptions, (db) => {
    const stmt = db.prepare(query);
    const isSelect = isSelectQuery(query);

    if (isSelect) {
      // Execute SELECT query
      const rows = params.length > 0
        ? stmt.all(...params) as Record<string, unknown>[]
        : stmt.all() as Record<string, unknown>[];

      // Get column info
      const columns: ColumnInfo[] = [];
      if (rows.length > 0) {
        for (const [key, value] of Object.entries(rows[0])) {
          columns.push({
            name: key,
            type: inferSqliteType(value),
          });
        }
      } else {
        // Try to get column info from prepared statement
        try {
          const columnsInfo = stmt.columns();
          for (const col of columnsInfo) {
            columns.push({
              name: col.name,
              type: col.type || 'unknown',
            });
          }
        } catch {
          // Some queries may not have column info
        }
      }

      return { rows, columns };
    } else {
      // Execute write operation (INSERT, UPDATE, DELETE, etc.)
      const result = params.length > 0
        ? stmt.run(...params)
        : stmt.run();

      return {
        rows: [],
        columns: [],
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid,
      };
    }
  });
}

/**
 * Check if a query is a SELECT statement
 */
function isSelectQuery(query: string): boolean {
  const normalizedQuery = query.trim().toUpperCase();

  // Skip comments at the beginning
  const withoutComments = normalizedQuery
    .replace(/^--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  // Check if it starts with SELECT or WITH (CTEs)
  if (withoutComments.startsWith('SELECT')) {
    return true;
  }

  // WITH clause that ends in SELECT is a read query
  if (withoutComments.startsWith('WITH')) {
    // Check if the CTE ends with SELECT
    return !WRITE_KEYWORDS.some(keyword => {
      const pattern = new RegExp(`\\)\\s*${keyword}\\b`, 'i');
      return pattern.test(withoutComments);
    });
  }

  // PRAGMA statements are also read queries
  if (withoutComments.startsWith('PRAGMA')) {
    // Unless it's a PRAGMA that modifies something
    return !withoutComments.includes('=');
  }

  return false;
}

/**
 * Infer SQLite column type from a value
 */
function inferSqliteType(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'real';
  }
  if (typeof value === 'string') return 'text';
  if (typeof value === 'boolean') return 'integer';
  if (Buffer.isBuffer(value)) return 'blob';
  return 'unknown';
}

// =============================================================================
// Table Formatting
// =============================================================================

/**
 * Format rows as an ASCII table
 */
function formatAsTable(rows: unknown[], columns: ColumnInfo[]): string {
  if (rows.length === 0) {
    return '(no rows)';
  }

  // Get column widths
  const colWidths: Record<string, number> = {};
  for (const col of columns) {
    colWidths[col.name] = col.name.length;
  }

  // Check row values for max width
  for (const row of rows) {
    const rowObj = row as Record<string, unknown>;
    for (const col of columns) {
      const value = formatCellValue(rowObj[col.name]);
      colWidths[col.name] = Math.max(colWidths[col.name], value.length);
    }
  }

  // Cap column widths at 50 chars
  for (const col of columns) {
    colWidths[col.name] = Math.min(colWidths[col.name], 50);
  }

  // Build header
  const headerCells = columns.map(col =>
    col.name.padEnd(colWidths[col.name]),
  );
  const headerLine = '| ' + headerCells.join(' | ') + ' |';

  // Build separator
  const separatorCells = columns.map(col =>
    '-'.repeat(colWidths[col.name]),
  );
  const separatorLine = '|-' + separatorCells.join('-|-') + '-|';

  // Build rows
  const rowLines = rows.map(row => {
    const rowObj = row as Record<string, unknown>;
    const cells = columns.map(col => {
      const value = formatCellValue(rowObj[col.name]);
      return value.slice(0, colWidths[col.name]).padEnd(colWidths[col.name]);
    });
    return '| ' + cells.join(' | ') + ' |';
  });

  return [headerLine, separatorLine, ...rowLines].join('\n');
}

/**
 * Format a cell value for table display
 */
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// =============================================================================
// Main Handler
// =============================================================================

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
      `  - PostgreSQL: postgresql://user:pass@host:port/database\n` +
      `  - MySQL: mysql://user:pass@host:port/database\n` +
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

/**
 * Enhance SQLite error messages with more helpful context
 */
function enhanceSqliteError(message: string, dbType: DatabaseType): string {
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
 * Extended execution result type
 */
interface ExecutionResult {
  rows: unknown[];
  columns: ColumnInfo[];
  changes?: number;
  lastInsertRowid?: number | bigint;
}

/**
 * Execution options
 */
interface ExecutionOptions {
  params?: unknown[];
  readonly?: boolean;
}

/**
 * Execute query against the appropriate database
 */
async function executeQuery(
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

/**
 * Format an error response
 */
function formatErrorResponse(message: string): ToolResponse {
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
