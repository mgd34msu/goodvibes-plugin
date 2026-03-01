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
import { logWarn } from '../../shared/logger.js';

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
    // sql.js doesn't ship ESM types that match its runtime shape, so the double
    // cast is necessary to access the .default initializer function.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // @ts-ignore -- sql.js is an optional peer dependency without bundled type declarations
    const initSqlJs = ((await import('sql.js')) as unknown as { default: (opts: { locateFile: (file: string) => string }) => Promise<SqlJsStatic> }).default;

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
  /** @internal Queue of waiters blocked on connection availability */
  private waiters: Array<(conn: PooledConnection) => void> = [];
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

    // Wait for a connection to become available using a deferred promise queue.
    // This avoids polling by resolving waiters directly when a connection is released.
    const timeout = options.timeout ?? 5000;
    const conns = poolConnections;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove this waiter from the queue on timeout
        const idx = this.waiters.indexOf(waiter);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new Error(`SQLite connection timeout after ${timeout}ms`));
      }, timeout);

      const waiter = (conn: PooledConnection) => {
        clearTimeout(timer);
        resolve(conn);
      };

      // Check one more time in case a connection freed between the pool-full check
      // and registering the waiter (avoids a race condition).
      const immediate = conns.find(c => !c.inUse && c.isOpen);
      if (immediate) {
        clearTimeout(timer);
        immediate.inUse = true;
        immediate.lastUsed = Date.now();
        resolve(immediate);
        return;
      }

      this.waiters.push(waiter);
    });
  }

  /**
   * Release a connection back to the pool.
   *
   * If there are waiters queued, the first waiter is immediately notified
   * with the released connection rather than leaving it idle.
   *
   * @param connection - The pooled connection to release
   */
  release(connection: PooledConnection): void {
    // Wake up the first waiting acquirer before marking the connection idle
    const waiter = this.waiters.shift();
    if (waiter) {
      connection.lastUsed = Date.now();
      waiter(connection);
      return;
    }
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
    } catch (err) {
      // Pragmas may fail on some SQLite configurations, continue anyway
      logWarn('SQLite PRAGMA setup failed', err);
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
          } catch (err) {
            logWarn('Failed to close idle SQLite connection', err);
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
          } catch (err) {
            logWarn('Failed to close SQLite connection during shutdown', err);
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
