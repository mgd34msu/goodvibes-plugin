/**
 * Database domain types for connect `db_query`.
 *
 * Trimmed port of v1 project-engine `core/database/types.ts` — only the query
 * execution surface (connect does not do schema extraction; that stays in
 * intel's `db_schema`). The v1 `McpResponse` coupling is dropped; `db_query`
 * returns the shared `core/envelope` instead.
 */

/** Supported database driver types. */
export type DatabaseDriver = 'postgresql' | 'mysql' | 'sqlite' | 'unknown';

/** Column metadata from query results. */
export interface ColumnInfo {
  name: string;
  type: string;
}

/** Extended execution result from query executors. */
export interface ExecutionResult {
  rows: unknown[];
  columns: ColumnInfo[];
  changes?: number;
  lastInsertRowid?: number | bigint;
}

/** Parsed database connection info. */
export interface DatabaseConnectionInfo {
  type: DatabaseDriver;
  host?: string;
  port?: number;
  database: string;
  user?: string;
  password?: string;
  /** For SQLite. */
  filepath?: string;
}

/** Structured query result (used by the error builder). */
export interface QueryResult {
  success: boolean;
  database_type: DatabaseDriver;
  rows: unknown[];
  row_count: number;
  columns: ColumnInfo[];
  execution_time_ms: number;
  query_executed: string;
  explain_output?: string;
  truncated?: boolean;
  error?: string;
  changes?: number;
  last_insert_rowid?: number | bigint;
}

// ── SQLite (sql.js) runtime shapes ───────────────────────────────────────────

/** sql.js Database instance interface. */
export interface SqliteDatabase {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string): QueryExecResult[];
  prepare(sql: string): SqliteStatement;
  close(): void;
  export(): Uint8Array;
  getRowsModified(): number;
}

/** sql.js query result. */
export interface QueryExecResult {
  columns: string[];
  values: unknown[][];
}

/** sql.js prepared statement interface. */
export interface SqliteStatement {
  run(params?: unknown[]): void;
  get(params?: unknown[]): unknown[];
  getAsObject(params?: unknown[]): Record<string, unknown>;
  step(): boolean;
  reset(): void;
  free(): void;
  bind(params?: unknown[]): boolean;
  getColumnNames(): string[];
}

/** Connection options for the SQLite pool. */
export interface SqliteConnectionOptions {
  /** Path to the SQLite file, or ':memory:'. */
  filepath: string;
  /** Open read-only (default true for safety). */
  readonly?: boolean;
  /** Timeout for acquiring a busy connection (ms). */
  timeout?: number;
  /** Enable foreign-key enforcement. */
  foreignKeys?: boolean;
  /** Enable WAL mode. */
  walMode?: boolean;
}
