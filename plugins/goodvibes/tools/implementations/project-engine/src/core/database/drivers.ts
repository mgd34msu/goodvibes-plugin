/**
 * Database driver loading utilities
 *
 * Handles dynamic lazy-loading of optional database drivers
 * (pg, mysql2, sql.js). Missing drivers are handled gracefully.
 *
 * @module core/database/drivers
 */

export type AnyModule = Record<string, unknown>;

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
 * Explicit driver import map.
 *
 * Maps known driver names to their import functions. Using explicit static
 * imports avoids the security risks of `new Function()` / indirect eval
 * and allows bundlers to perform proper tree-shaking.
 *
 * @internal
 */
const DRIVER_MAP: Record<string, () => Promise<AnyModule>> = {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- pg is an optional peer dependency; may not be installed
  'pg': () => import('pg') as Promise<AnyModule>,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- mysql2 is an optional peer dependency; may not be installed
  'mysql2/promise': () => import('mysql2/promise') as Promise<AnyModule>,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- sql.js is an optional peer dependency; may not be installed
  'sql.js': () => import('sql.js') as Promise<AnyModule>,
};

/**
 * Dynamically import a known database driver by name, returning null if unavailable.
 *
 * Checks mock drivers first for test isolation, then uses the explicit
 * driver map to avoid dynamic code evaluation.
 *
 * @param moduleName - npm package name to import (must be in DRIVER_MAP)
 * @returns The module, or null if not installed or not a known driver
 */
export async function dynamicImport(moduleName: string): Promise<AnyModule | null> {
  if (moduleName in mockDrivers) {
    return mockDrivers[moduleName];
  }

  const loader = DRIVER_MAP[moduleName];
  if (!loader) {
    return null;
  }

  try {
    return await loader();
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
