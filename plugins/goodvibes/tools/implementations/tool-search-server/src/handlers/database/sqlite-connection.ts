/**
 * SQLite Connection Manager
 *
 * Provides connection pooling and lifecycle management for SQLite databases.
 * Supports both file-based and in-memory databases with proper resource cleanup.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * SQLite database instance (better-sqlite3 compatible interface)
 */
export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  pragma(pragma: string, simplify?: boolean): unknown;
  close(): void;
  readonly open: boolean;
  readonly inTransaction: boolean;
  readonly name: string;
  readonly memory: boolean;
  readonly readonly: boolean;
}

/**
 * SQLite prepared statement interface
 */
export interface SqliteStatement {
  run(...params: unknown[]): SqliteRunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  columns(): SqliteColumnInfo[];
  bind(...params: unknown[]): SqliteStatement;
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
  /** Enable WAL mode for better concurrent access */
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
    const available = poolConnections.find(c => !c.inUse && c.database.open);
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
      };
      poolConnections.push(pooled);
      return pooled;
    }

    // Wait for a connection to become available
    return new Promise((resolve, reject) => {
      const timeout = options.timeout ?? 5000;
      const startTime = Date.now();

      const checkInterval = setInterval(() => {
        const available = poolConnections!.find(c => !c.inUse && c.database.open);
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
   * Create a new SQLite database connection
   */
  private async createConnection(options: SqliteConnectionOptions): Promise<SqliteDatabase> {
    const sqliteModule = await this.loadDriver();

    // Handle special :memory: path
    const filepath = options.filepath === ':memory:'
      ? ':memory:'
      : options.filepath;

    // Create the database connection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Database = (sqliteModule as any).default || sqliteModule;
    const db = new Database(filepath, {
      readonly: options.readonly ?? true,
      timeout: options.timeout ?? 5000,
    }) as SqliteDatabase;

    // Configure pragmas for better performance and safety
    try {
      if (options.foreignKeys !== false) {
        db.pragma('foreign_keys = ON');
      }

      if (options.walMode && !options.readonly) {
        db.pragma('journal_mode = WAL');
      }

      // Set reasonable defaults
      db.pragma('busy_timeout = 5000');

      if (!options.readonly) {
        // Enable synchronous mode for data safety on writes
        db.pragma('synchronous = NORMAL');
      }
    } catch {
      // Pragmas may fail on some SQLite configurations, continue anyway
    }

    return db;
  }

  /**
   * Load the SQLite driver dynamically
   */
  private async loadDriver(): Promise<unknown> {
    try {
      // Use indirect eval to avoid TypeScript module resolution
      const importFn = new Function('name', 'return import(name)');
      return await importFn('better-sqlite3');
    } catch {
      throw new Error(
        'SQLite driver (better-sqlite3) is not installed. Install with: npm install better-sqlite3'
      );
    }
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
        if (isIdle && c.database.open) {
          try {
            c.database.close();
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
        if (conn.database.open) {
          try {
            conn.database.close();
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
 *
 * @example
 * const result = await withConnection({ filepath: './data.db' }, async (db) => {
 *   return db.prepare('SELECT * FROM users WHERE id = ?').all(userId);
 * });
 */
export async function withConnection<T>(
  options: SqliteConnectionOptions,
  callback: (db: SqliteDatabase) => T | Promise<T>
): Promise<T> {
  const pool = getConnectionPool();
  const connection = await pool.acquire(options);

  try {
    return await callback(connection.database);
  } finally {
    pool.release(connection);
  }
}
