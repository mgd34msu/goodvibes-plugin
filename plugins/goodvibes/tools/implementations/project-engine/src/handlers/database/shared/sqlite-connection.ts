/**
 * SQLite Connection Manager (sql.js - pure JS/WASM)
 *
 * Provides connection pooling and lifecycle management for SQLite databases.
 * Uses sql.js for cross-platform compatibility (no native binaries).
 * Supports both file-based and in-memory databases with proper resource cleanup.
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

// =============================================================================
// Types
// =============================================================================

/**
 * sql.js Database instance interface
 */
export interface SqliteDatabase {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string): QueryExecResult[];
  prepare(sql: string): SqliteStatement;
  close(): void;
  export(): Uint8Array;
  getRowsModified(): number;
}

/**
 * sql.js query result
 */
interface QueryExecResult {
  columns: string[];
  values: unknown[][];
}

/**
 * SQLite prepared statement interface (sql.js compatible)
 */
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

/**
 * Result of a write operation
 */
export interface SqliteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/**
 * Column metadata from prepared statements
 */
export interface SqliteColumnInfo {
  name: string;
  column: string | null;
  table: string | null;
  database: string | null;
  type: string | null;
}

/**
 * sql.js module interface
 */
interface SqlJsStatic {
  Database: new (data?: ArrayLike<number> | Buffer | null) => SqliteDatabase;
}

/**
 * Connection options
 */
export interface SqliteConnectionOptions {
  /** Path to SQLite database file, or ':memory:' for in-memory */
  filepath: string;
  /** Open in readonly mode (default: true for safety) */
  readonly?: boolean;
  /** Timeout for acquiring busy connections in milliseconds */
  timeout?: number;
  /** Enable foreign key enforcement */
  foreignKeys?: boolean;
  /** Enable WAL mode for better concurrent access (not supported in sql.js) */
  walMode?: boolean;
}

/**
 * Pooled connection wrapper
 */
interface PooledConnection {
  database: SqliteDatabase;
  filepath: string;
  readonly: boolean;
  lastUsed: number;
  inUse: boolean;
  isOpen: boolean;
}

// =============================================================================
// sql.js Loader
// =============================================================================

let sqlJsInstance: SqlJsStatic | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (sqlJsInstance) {
    return sqlJsInstance;
  }

  try {
    // Dynamic import of sql.js
    const initSqlJs = (await import('sql.js')).default;
    sqlJsInstance = await initSqlJs({
      locateFile: (file: string) => {
        // WASM file is in same directory as the bundle
        const path = require("path");
        return path.join(__dirname, file);
      }
    });
    return sqlJsInstance;
  } catch (error) {
    throw new Error(
      `SQLite driver (sql.js) failed to initialize: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// =============================================================================
// Connection Pool
// =============================================================================

/**
 * Simple connection pool for SQLite databases
 *
 * Since SQLite supports only one writer at a time, we manage connections
 * to prevent locking issues and provide connection reuse for performance.
 */
class SqliteConnectionPool {
  private connections: Map<string, PooledConnection[]> = new Map();
  private maxConnectionsPerDb = 5;
  private idleTimeoutMs = 60_000; // 1 minute
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic cleanup of idle connections
    this.cleanupInterval = setInterval(() => this.cleanupIdleConnections(), 30_000);
  }

  /**
   * Get a connection key for the pool
   */
  private getPoolKey(filepath: string, readonly: boolean): string {
    return `${filepath}:${readonly ? 'ro' : 'rw'}`;
  }

  /**
   * Acquire a connection from the pool or create a new one
   */
  async acquire(options: SqliteConnectionOptions): Promise<PooledConnection> {
    const key = this.getPoolKey(options.filepath, options.readonly ?? true);
    let poolConnections = this.connections.get(key);

    if (!poolConnections) {
      poolConnections = [];
      this.connections.set(key, poolConnections);
    }

    // Try to find an available connection
    const available = poolConnections.find(c => !c.inUse && c.isOpen);
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      return available;
    }

    // Create new connection if under limit
    if (poolConnections.length < this.maxConnectionsPerDb) {
      const db = await this.createConnection(options);
      const pooled: PooledConnection = {
        database: db,
        filepath: options.filepath,
        readonly: options.readonly ?? true,
        lastUsed: Date.now(),
        inUse: true,
        isOpen: true,
      };
      poolConnections.push(pooled);
      return pooled;
    }

    // Wait for a connection to become available
    return new Promise((resolve, reject) => {
      const timeout = options.timeout ?? 5000;
      const startTime = Date.now();

      const checkInterval = setInterval(() => {
        const available = poolConnections!.find(c => !c.inUse && c.isOpen);
        if (available) {
          clearInterval(checkInterval);
          available.inUse = true;
          available.lastUsed = Date.now();
          resolve(available);
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error(`SQLite connection timeout after ${timeout}ms`));
        }
      }, 50);
    });
  }

  /**
   * Release a connection back to the pool
   */
  release(connection: PooledConnection): void {
    connection.inUse = false;
    connection.lastUsed = Date.now();
  }

  /**
   * Save database to file (for write operations)
   */
  async saveToFile(connection: PooledConnection): Promise<void> {
    if (connection.filepath === ':memory:' || connection.readonly) {
      return;
    }
    const data = connection.database.export();
    await writeFile(connection.filepath, Buffer.from(data));
  }

  /**
   * Create a new SQLite database connection
   */
  private async createConnection(options: SqliteConnectionOptions): Promise<SqliteDatabase> {
    const SQL = await getSqlJs();

    let db: SqliteDatabase;

    if (options.filepath === ':memory:') {
      // In-memory database
      db = new SQL.Database();
    } else if (existsSync(options.filepath)) {
      // Load existing file
      const fileBuffer = await readFile(options.filepath);
      db = new SQL.Database(fileBuffer);
    } else {
      // Create new database
      db = new SQL.Database();
      if (!options.readonly) {
        // Save empty database to create the file
        const data = db.export();
        await writeFile(options.filepath, Buffer.from(data));
      }
    }

    // Configure pragmas for better performance and safety
    try {
      if (options.foreignKeys !== false) {
        db.run('PRAGMA foreign_keys = ON');
      }
      db.run('PRAGMA busy_timeout = 5000');
    } catch {
      // Pragmas may fail on some SQLite configurations, continue anyway
    }

    return db;
  }

  /**
   * Clean up idle connections
   */
  private cleanupIdleConnections(): void {
    const now = Date.now();

    for (const [key, connections] of this.connections.entries()) {
      // Filter out idle connections past the timeout
      const active = connections.filter(c => {
        const isIdle = !c.inUse && (now - c.lastUsed > this.idleTimeoutMs);
        if (isIdle && c.isOpen) {
          try {
            c.database.close();
            c.isOpen = false;
          } catch {
            // Ignore close errors
          }
        }
        return !isIdle;
      });

      if (active.length === 0) {
        this.connections.delete(key);
      } else {
        this.connections.set(key, active);
      }
    }
  }

  /**
   * Close all connections and stop the cleanup interval
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const connections of this.connections.values()) {
      for (const conn of connections) {
        if (conn.isOpen) {
          try {
            conn.database.close();
            conn.isOpen = false;
          } catch {
            // Ignore close errors
          }
        }
      }
    }

    this.connections.clear();
  }
}

// =============================================================================
// Singleton Pool Instance
// =============================================================================

let poolInstance: SqliteConnectionPool | null = null;

/**
 * Get the global connection pool instance
 */
export function getConnectionPool(): SqliteConnectionPool {
  if (!poolInstance) {
    poolInstance = new SqliteConnectionPool();
  }
  return poolInstance;
}

/**
 * Shutdown the connection pool (for cleanup)
 */
export function shutdownConnectionPool(): void {
  if (poolInstance) {
    poolInstance.shutdown();
    poolInstance = null;
  }
}

// =============================================================================
// Connection Helper
// =============================================================================

/**
 * Execute a callback with a pooled SQLite connection
 *
 * Automatically acquires and releases the connection, ensuring proper cleanup.
 * For write operations, saves changes back to file after the callback.
 *
 * @example
 * const result = await withConnection({ filepath: './data.db' }, async (db) => {
 *   const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
 *   stmt.bind([userId]);
 *   const rows = [];
 *   while (stmt.step()) rows.push(stmt.getAsObject());
 *   stmt.free();
 *   return rows;
 * });
 */
export async function withConnection<T>(
  options: SqliteConnectionOptions,
  callback: (db: SqliteDatabase) => T | Promise<T>
): Promise<T> {
  const pool = getConnectionPool();
  const connection = await pool.acquire(options);

  try {
    const result = await callback(connection.database);
    // Save to file if this was a write operation
    if (!options.readonly) {
      await pool.saveToFile(connection);
    }
    return result;
  } finally {
    pool.release(connection);
  }
}
