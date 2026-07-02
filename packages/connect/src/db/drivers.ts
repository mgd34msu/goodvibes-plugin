/**
 * Database driver loading for connect `db_query`.
 *
 * Kept from v1 (the praised behavior): drivers resolve from the TARGET project,
 * not from connect's own bundle, and a missing driver yields an honest install
 * hint instead of a crash. The v2 change is HOW they resolve: rather than a
 * static `import('pg')` (which esbuild would try to bundle), the module name is
 * resolved through a `require` rooted at the target project's cwd and then
 * dynamically imported. sql.js — connect's own dependency — resolves from
 * connect. The mock-driver hooks are retained for tests.
 */

import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import * as path from 'path';

export type AnyModule = Record<string, unknown>;

const mockDrivers: Record<string, AnyModule | null> = {};

/** Set a mock driver for testing. @internal */
export function setMockDriver(moduleName: string, driver: AnyModule | null): void {
  mockDrivers[moduleName] = driver;
}

/** Clear all mock drivers. @internal */
export function clearMockDrivers(): void {
  for (const key of Object.keys(mockDrivers)) delete mockDrivers[key];
}

/** Resolve a module name from the target project's node_modules. @internal */
function resolveFromTarget(moduleName: string): string | null {
  try {
    const req = createRequire(path.join(process.cwd(), 'noop.js'));
    return req.resolve(moduleName);
  } catch {
    return null;
  }
}

/**
 * Dynamically import a database driver, resolving it from the target project.
 * @param moduleName - the npm package name (e.g. "pg")
 * @returns the module, or null when not installed in the target project
 */
export async function dynamicImport(moduleName: string): Promise<AnyModule | null> {
  if (moduleName in mockDrivers) return mockDrivers[moduleName];

  const resolved = resolveFromTarget(moduleName);
  if (!resolved) return null;

  try {
    return (await import(pathToFileURL(resolved).href)) as AnyModule;
  } catch {
    return null;
  }
}

/** Load the PostgreSQL driver (pg) from the target project. */
export async function loadPostgresDriver(): Promise<AnyModule | null> {
  return dynamicImport('pg');
}

/** Load the MySQL driver (mysql2/promise) from the target project. */
export async function loadMysqlDriver(): Promise<AnyModule | null> {
  return dynamicImport('mysql2/promise');
}

/** Detect the driver type from a connection URL. */
export function detectDriver(url: string): 'postgresql' | 'mysql' | 'sqlite' | 'unknown' {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgresql';
  if (url.startsWith('mysql://')) return 'mysql';
  if (url.startsWith('sqlite:') || url.startsWith('file:') || url.match(/\.(db|sqlite|sqlite3)$/i)) {
    return 'sqlite';
  }
  if (url === ':memory:') return 'sqlite';
  return 'unknown';
}
