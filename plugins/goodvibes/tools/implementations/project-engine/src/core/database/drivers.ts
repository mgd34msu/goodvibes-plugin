/**
 * Database driver loading utilities
 *
 * Handles dynamic lazy-loading of optional database drivers
 * (pg, mysql2, sql.js). Missing drivers are handled gracefully.
 *
 * @module core/database/drivers
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModule = any;

/** Mock driver storage for testing @internal */
const mockDrivers: Record<string, AnyModule | null> = {};

/**
 * Set a mock driver for testing purposes.
 * @internal
 */
export function setMockDriver(moduleName: string, driver: AnyModule | null): void {
  mockDrivers[moduleName] = driver;
}

/**
 * Clear all mock drivers.
 * @internal
 */
export function clearMockDrivers(): void {
  for (const key of Object.keys(mockDrivers)) {
    delete mockDrivers[key];
  }
}

/**
 * Dynamically import a module by name, returning null if unavailable.
 *
 * Uses indirect evaluation to avoid TypeScript module resolution.
 * Checks mock drivers first for test isolation.
 *
 * @param moduleName - npm package name to import
 * @returns The module default export, or null if not installed
 */
export async function dynamicImport(moduleName: string): Promise<AnyModule | null> {
  if (moduleName in mockDrivers) {
    return mockDrivers[moduleName];
  }

  try {
    const importFn = new Function('name', 'return import(name)');
    return await importFn(moduleName);
  } catch {
    return null;
  }
}

/**
 * Attempt to load the PostgreSQL driver (pg).
 *
 * @returns The pg module, or null if not installed
 */
export async function loadPostgresDriver(): Promise<AnyModule | null> {
  return dynamicImport('pg');
}

/**
 * Attempt to load the MySQL driver (mysql2/promise).
 *
 * @returns The mysql2 module, or null if not installed
 */
export async function loadMysqlDriver(): Promise<AnyModule | null> {
  return dynamicImport('mysql2/promise');
}

/**
 * Attempt to load the SQLite driver (sql.js).
 *
 * @returns The sql.js module, or null if not installed
 */
export async function loadSqliteDriver(): Promise<AnyModule | null> {
  return dynamicImport('sql.js');
}

/**
 * Detect the database driver type from a connection URL.
 *
 * @param url - Database connection URL
 * @returns Driver type string
 */
export function detectDriver(url: string): 'postgresql' | 'mysql' | 'sqlite' | 'unknown' {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgresql';
  if (url.startsWith('mysql://')) return 'mysql';
  if (url.startsWith('sqlite:') || url.startsWith('file:') || url.match(/\.(db|sqlite|sqlite3)$/i)) return 'sqlite';
  if (url === ':memory:') return 'sqlite';
  return 'unknown';
}
