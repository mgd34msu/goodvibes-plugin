/**
 * SQLite connection pool for connect `db_query`.
 *
 * Ported from v1 project-engine `core/database/sqlite-pool.ts` (deferred-promise
 * waiter queue, idle cleanup with an `unref`ed timer, write-back to file). v2
 * changes: the WASM is located the same way `core/telemetry` does it (candidates
 * beside the bundle, falling back to sql.js's node_modules default in tests), and
 * the v1 `logWarn` shared logger is replaced by a local `console.warn` so the
 * pool has no cross-tree import.
 */

import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import * as nodePath from 'node:path';
import { atomicWriteFile, withFileLock } from '@goodvibes/core/fsx';

import type { SqliteDatabase, SqliteConnectionOptions } from './types.js';

function logWarn(message: string, err?: unknown): void {
  console.warn(`[connect:db] ${message}${err ? `: ${String(err)}` : ''}`);
}

/** @internal sql.js module interface (kept local, no @types/sql.js needed). */
interface SqlJsStatic {
  Database: new (data?: ArrayLike<number> | Buffer | null) => SqliteDatabase;
}

let sqlJsInstance: SqlJsStatic | null = null;

/**
 * Resolve the sql.js `locateFile` config. When the WASM sits beside the bundle
 * (`server/` or `server/wasm/`) point sql.js there; otherwise let sql.js find it
 * in node_modules (the Vitest / source path).
 */
function sqlConfig(): { locateFile?: (file: string) => string } {
  // `__dirname` is defined in the CJS bundle and under Vitest; guard anyway so a
  // stray ESM context falls back to sql.js's node_modules default instead of throwing.
  const dir = typeof __dirname === 'string' ? __dirname : '';
  if (!dir) {return {};}
  const candidates = [
    nodePath.join(dir, 'sql-wasm.wasm'),
    nodePath.join(dir, 'wasm', 'sql-wasm.wasm'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      const dir = nodePath.dirname(c);
      return { locateFile: (file: string) => nodePath.join(dir, file) };
    }
  }
  return {};
}

/** Load or return the cached sql.js module. @internal */
async function getSqlJs(): Promise<SqlJsStatic> {
  if (sqlJsInstance) {return sqlJsInstance;}

  try {
    const initSqlJs = (
      (await import('sql.js')) as unknown as {
        default: (opts: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;
      }
    ).default;

    sqlJsInstance = await initSqlJs(sqlConfig());
    return sqlJsInstance;
  } catch (error) {
    throw new Error(
      `SQLite driver (sql.js) failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

interface PooledConnection {
  database: SqliteDatabase;
  filepath: string;
  readonly: boolean;
  lastUsed: number;
  inUse: boolean;
  isOpen: boolean;
  /** Identity of the file when this connection's copy was loaded from it. */
  fingerprint: string | null;
}

/**
 * Identity of a database file. sql.js loads the whole file into memory, so a
 * pooled connection's copy goes stale the moment anything rewrites the file;
 * every save renames a fresh temp file into place, so the inode alone already
 * distinguishes one save from the next.
 */
function fileFingerprint(filepath: string): string | null {
  if (filepath === ':memory:') {return null;}
  try {
    const s = statSync(filepath);
    return `${s.ino}:${s.size}:${s.mtimeMs}`;
  } catch {
    return null;
  }
}

/** Simple SQLite connection pool. */
class SqliteConnectionPool {
  private connections: Map<string, PooledConnection[]> = new Map();
  private waiters: Map<string, Array<(conn: PooledConnection) => void>> = new Map();
  /**
   * Read-write pools hold ONE connection per file. Each connection is an
   * independent in-memory copy that is written back whole, so two of them
   * against one file would each export their own copy and the second save
   * would drop the first's rows.
   */
  private readonly maxReadConnectionsPerDb = 5;
  private readonly maxWriteConnectionsPerDb = 1;
  private readonly idleTimeoutMs = 60_000;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanupIdleConnections(), 30_000);
    this.cleanupInterval.unref?.();
  }

  private getPoolKey(filepath: string, readonly: boolean): string {
    return `${filepath}:${readonly ? 'ro' : 'rw'}`;
  }

  /**
   * Check a connection out of the pool and make sure its in-memory copy still
   * matches the file. Reloading here is what stops a read from serving rows
   * that a write (in this process or another) has already replaced.
   */
  async acquire(options: SqliteConnectionOptions): Promise<PooledConnection> {
    const connection = await this.checkout(options);
    await this.refreshIfStale(connection, options);
    return connection;
  }

  private async refreshIfStale(
    connection: PooledConnection,
    options: SqliteConnectionOptions,
  ): Promise<void> {
    if (options.filepath === ':memory:') {return;}
    const current = fileFingerprint(options.filepath);
    if (current === connection.fingerprint) {return;}

    try {
      connection.database.close();
    } catch (err) {
      logWarn('Failed to close a stale SQLite connection', err);
    }
    connection.database = await this.createConnection(options);
    connection.isOpen = true;
    connection.fingerprint = fileFingerprint(options.filepath);
  }

  private async checkout(options: SqliteConnectionOptions): Promise<PooledConnection> {
    const key = this.getPoolKey(options.filepath, options.readonly ?? true);
    const maxConnections = (options.readonly ?? true)
      ? this.maxReadConnectionsPerDb
      : this.maxWriteConnectionsPerDb;
    let poolConnections = this.connections.get(key);

    if (!poolConnections) {
      poolConnections = [];
      this.connections.set(key, poolConnections);
    }

    const available = poolConnections.find((c) => !c.inUse && c.isOpen);
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      return available;
    }

    if (poolConnections.length < maxConnections) {
      const db = await this.createConnection(options);
      const pooled: PooledConnection = {
        database: db,
        filepath: options.filepath,
        readonly: options.readonly ?? true,
        lastUsed: Date.now(),
        inUse: true,
        isOpen: true,
        fingerprint: fileFingerprint(options.filepath),
      };
      poolConnections.push(pooled);
      return pooled;
    }

    const timeout = options.timeout ?? 5000;
    const conns = poolConnections;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const keyWaiters = this.waiters.get(key);
        if (keyWaiters) {
          const idx = keyWaiters.indexOf(waiter);
          if (idx !== -1) {keyWaiters.splice(idx, 1);}
        }
        reject(new Error(`SQLite connection timeout after ${timeout}ms`));
      }, timeout);
      timer.unref?.();

      const waiter = (conn: PooledConnection): void => {
        clearTimeout(timer);
        resolve(conn);
      };

      const immediate = conns.find((c) => !c.inUse && c.isOpen);
      if (immediate) {
        clearTimeout(timer);
        immediate.inUse = true;
        immediate.lastUsed = Date.now();
        resolve(immediate);
        return;
      }

      if (!this.waiters.has(key)) {this.waiters.set(key, []);}
      this.waiters.get(key)!.push(waiter);
    });
  }

  release(connection: PooledConnection): void {
    const key = this.getPoolKey(connection.filepath, connection.readonly);
    const keyWaiters = this.waiters.get(key);
    if (keyWaiters && keyWaiters.length > 0) {
      const waiter = keyWaiters.shift()!;
      connection.lastUsed = Date.now();
      waiter(connection);
      return;
    }
    connection.inUse = false;
    connection.lastUsed = Date.now();
  }

  async saveToFile(connection: PooledConnection): Promise<void> {
    if (connection.filepath === ':memory:' || connection.readonly) {return;}
    const data = connection.database.export();
    // Temp-then-rename: a crash mid-export would otherwise leave a truncated,
    // unopenable database where the caller's data used to be.
    await atomicWriteFile(connection.filepath, Buffer.from(data));
    connection.fingerprint = fileFingerprint(connection.filepath);
  }

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
        await atomicWriteFile(options.filepath, Buffer.from(data));
      }
    }

    try {
      if (options.foreignKeys !== false) {db.run('PRAGMA foreign_keys = ON');}
      db.run('PRAGMA busy_timeout = 5000');
    } catch (err) {
      logWarn('SQLite PRAGMA setup failed', err);
    }

    return db;
  }

  private cleanupIdleConnections(): void {
    const now = Date.now();
    for (const [key, connections] of this.connections.entries()) {
      const active = connections.filter((c) => {
        const isIdle = !c.inUse && now - c.lastUsed > this.idleTimeoutMs;
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

let poolInstance: SqliteConnectionPool | null = null;

/** Get the global SQLite connection pool (created on first use). */
export function getConnectionPool(): SqliteConnectionPool {
  if (!poolInstance) {poolInstance = new SqliteConnectionPool();}
  return poolInstance;
}

/** Shut down the global pool (test teardown / graceful shutdown). */
export function shutdownConnectionPool(): void {
  if (poolInstance) {
    poolInstance.shutdown();
    poolInstance = null;
  }
}

/**
 * Run a callback with a pooled SQLite connection, releasing it afterwards and
 * writing changes back for read-write connections.
 * @param options - SQLite connection options
 * @param callback - receives the database instance
 */
export async function withConnection<T>(
  options: SqliteConnectionOptions,
  callback: (db: SqliteDatabase) => T | Promise<T>,
): Promise<T> {
  const run = async (): Promise<T> => {
    const pool = getConnectionPool();
    const connection = await pool.acquire(options);
    try {
      const result = await callback(connection.database);
      if (!options.readonly) {await pool.saveToFile(connection);}
      return result;
    } finally {
      pool.release(connection);
    }
  };

  // A write is load-file, mutate-in-memory, rewrite-file. Two processes doing
  // that at once would each rewrite the file from their own copy and the second
  // would drop the first's rows, so writes serialize on a lock file and reload
  // inside it.
  if (options.readonly === false && options.filepath !== ':memory:') {
    return withFileLock(options.filepath, run);
  }
  return run();
}
