/**
 * SQLite Connection Pool
 *
 * Provides connection pooling and lifecycle management for SQLite databases
 * using sql.js (pure JS/WASM, no native binaries). Supports both file-based
 * and in-memory databases with proper resource cleanup.
 *
 * @module core/database/sqlite-pool
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { SqliteDatabase, SqliteConnectionOptions } from './types.js';

// =============================================================================
// sql.js Loader
// =============================================================================

/** @internal sql.js module interface */
interface SqlJsStatic {
  Database: new (data?: ArrayLike<number> | Buffer | null) => SqliteDatabase;
}

let sqlJsInstance: SqlJsStatic | null = null;

/**
 * Load or return the cached sql.js module.
 * @internal
 */
async function getSqlJs(): Promise<SqlJsStatic> {
  if (sqlJsInstance) return sqlJsInstance;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const initSqlJs = ((await import('sql.js' as any)) as any).default as
      (opts: { locateFile: (file: string) => string }) => Promise<SqlJsStatic>;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodePath = require('node:path') as typeof import('node:path');
    sqlJsInstance = await initSqlJs({
      locateFile: (file: string) => nodePath.join(__dirname, file),
    });
    return sqlJsInstance!;
  } catch (error) {
    throw new Error(
      `SQLite driver (sql.js) failed to initialize: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// =============================================================================
// Connection Pool
// =============================================================================

/** @internal Pooled connection wrapper */
interface PooledConnection {
  database: SqliteDatabase;
  filepath: string;
  readonly: boolean;
  lastUsed: number;
  inUse: boolean;
  isOpen: boolean;
}

/**
 * Simple connection pool for SQLite databases.
 *
 * Manages connections to prevent locking issues and provides connection
 * reuse for performance. Automatically cleans up idle connections.
 */
class SqliteConnectionPool {
  private connections: Map<string, PooledConnection[]> = new Map();
  private readonly maxConnectionsPerDb = 5;
  private readonly idleTimeoutMs = 60_000;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanupIdleConnections(), 30_000);
  }

  /** @internal Get pool key */
  private getPoolKey(filepath: string, readonly: boolean): string {
    return `${filepath}:${readonly ? 'ro' : 'rw'}`;
  }

  /**
   * Acquire a connection from the pool or create a new one.
   *
   * @param options - Connection options
   * @returns A pooled connection (must be released after use)
   */
  async acquire(options: SqliteConnectionOptions): Promise<PooledConnection> {
    const key = this.getPoolKey(options.filepath, options.readonly ?? true);
    let poolConnections = this.connections.get(key);

    if (!poolConnections) {
      poolConnections = [];
      this.connections.set(key, poolConnections);
    }

    const available = poolConnections.find(c => !c.inUse && c.isOpen);
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      return available;
    }

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
        const conn = poolConnections!.find(c => !c.inUse && c.isOpen);
        if (conn) {
          clearInterval(checkInterval);
          conn.inUse = true;
          conn.lastUsed = Date.now();
          resolve(conn);
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error(`SQLite connection timeout after ${timeout}ms`));
        }
      }, 50);
    });
  }

  /**
   * Release a connection back to the pool.
   *
   * @param connection - The pooled connection to release
   */
  release(connection: PooledConnection): void {
    connection.inUse = false;
    connection.lastUsed = Date.now();
  }

  /**
   * Save database to file after write operations.
   *
   * @param connection - The connection to persist
   */
  async saveToFile(connection: PooledConnection): Promise<void> {
    if (connection.filepath === ':memory:' || connection.readonly) return;
    const data = connection.database.export();
    await writeFile(connection.filepath, Buffer.from(data));
  }

  /** @internal Create a new SQLite database connection */
  private async createConnection(options: SqliteConnectionOptions): Promise<SqliteDatabase> {
    const SQL = await getSqlJs();
    let db: SqliteDatabase;

    if (options.filepath === ':memory:') {
      db = new SQL.Database();
    } else if (existsSync(options.filepath)) {
      const fileBuffer = await readFile(options.filepath);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
      if (!options.readonly) {
        const data = db.export();
        await writeFile(options.filepath, Buffer.from(data));
      }
    }

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

  /** @internal Clean up idle connections */
  private cleanupIdleConnections(): void {
    const now = Date.now();

    for (const [key, connections] of this.connections.entries()) {
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
   * Shut down the pool, closing all connections.
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
// Singleton & Public API
// =============================================================================

let poolInstance: SqliteConnectionPool | null = null;

/**
 * Get the global SQLite connection pool instance.
 *
 * Creates the pool on first call; returns cached instance thereafter.
 *
 * @returns The singleton connection pool
 */
export function getConnectionPool(): SqliteConnectionPool {
  if (!poolInstance) {
    poolInstance = new SqliteConnectionPool();
  }
  return poolInstance;
}

/**
 * Shut down the global connection pool.
 *
 * Closes all open connections and resets the singleton.
 * Call on application shutdown or test teardown.
 */
export function shutdownConnectionPool(): void {
  if (poolInstance) {
    poolInstance.shutdown();
    poolInstance = null;
  }
}

/**
 * Execute a callback with a pooled SQLite connection.
 *
 * Automatically acquires and releases the connection, ensuring cleanup.
 * For write operations, saves changes back to the file.
 *
 * @param options - SQLite connection options
 * @param callback - Async function receiving the database instance
 * @returns The return value of the callback
 *
 * @example
 * const rows = await withConnection({ filepath: './data.db' }, async (db) => {
 *   const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
 *   stmt.bind([userId]);
 *   const results: unknown[] = [];
 *   while (stmt.step()) results.push(stmt.getAsObject());
 *   stmt.free();
 *   return results;
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
    if (!options.readonly) {
      await pool.saveToFile(connection);
    }
    return result;
  } finally {
    pool.release(connection);
  }
}
