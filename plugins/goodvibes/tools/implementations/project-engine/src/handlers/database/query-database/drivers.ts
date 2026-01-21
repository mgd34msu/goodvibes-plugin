/**
 * Database Driver Loading
 *
 * Handles dynamic loading of optional database drivers (pg, mysql2, better-sqlite3).
 * Drivers are loaded lazily and missing drivers are handled gracefully.
 */

// Driver types - we use 'unknown' to avoid requiring type declarations for optional deps
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModule = any;

/**
 * Mock driver storage for testing
 * @internal - Only used for unit testing
 */
const mockDrivers: Record<string, AnyModule | null> = {};

/**
 * Set a mock driver for testing purposes
 * @internal
 */
export function setMockDriver(moduleName: string, driver: AnyModule | null): void {
  mockDrivers[moduleName] = driver;
}

/**
 * Clear all mock drivers
 * @internal
 */
export function clearMockDrivers(): void {
  for (const key of Object.keys(mockDrivers)) {
    delete mockDrivers[key];
  }
}

/**
 * Dynamic import helper that avoids TypeScript checking the module path
 */
export async function dynamicImport(moduleName: string): Promise<AnyModule | null> {
  // Check for test mock first
  if (moduleName in mockDrivers) {
    return mockDrivers[moduleName];
  }

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
export async function getPostgresDriver(): Promise<AnyModule | null> {
  return dynamicImport('pg');
}

/**
 * Attempt to load the MySQL driver (mysql2/promise)
 */
export async function getMysqlDriver(): Promise<AnyModule | null> {
  return dynamicImport('mysql2/promise');
}

/**
 * Attempt to load the SQLite driver (better-sqlite3)
 */
export async function getSqliteDriver(): Promise<AnyModule | null> {
  return dynamicImport('better-sqlite3');
}
