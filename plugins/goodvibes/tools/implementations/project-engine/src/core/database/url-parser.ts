/**
 * Database connection URL parser
 *
 * Parses database connection URLs into structured connection info
 * for PostgreSQL, MySQL, and SQLite.
 *
 * @module core/database/url-parser
 */

import type { DatabaseConnectionInfo } from './types.js';

/** Valid TCP port range. */
const MIN_PORT = 0;
const MAX_PORT = 65535;

/**
 * Validate a parsed TCP port number.
 * @throws {Error} if the port is outside the valid range
 * @internal
 */
function validatePort(port: number, context: string): void {
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(
      `Invalid port ${port} in ${context} URL. Port must be an integer between ${MIN_PORT} and ${MAX_PORT}.`
    );
  }
}

/**
 * Validate a parsed hostname is non-empty.
 * @throws {Error} if the hostname is empty
 * @internal
 */
function validateHostname(hostname: string, context: string): void {
  if (!hostname || hostname.trim() === '') {
    throw new Error(`Invalid or empty hostname in ${context} URL.`);
  }
}

/**
 * Parse a database connection URL into structured connection info.
 *
 * Supported URL formats:
 * - PostgreSQL: `postgresql://user:pass@host:5432/db`
 * - MySQL: `mysql://user:pass@host:3306/db`
 * - SQLite: `sqlite:///path/to/db.sqlite` or `file:./db.sqlite`
 * - SQLite bare path: `./path/to/db.sqlite` (auto-detected by extension)
 * - SQLite in-memory: `:memory:` or `sqlite::memory:`
 *
 * @param url - Database connection URL or file path
 * @returns Parsed connection info, or `{ type: 'unknown' }` on failure
 *
 * @example
 * parseConnectionUrl('postgresql://user:pass@localhost:5432/mydb')
 * // Returns { type: 'postgresql', host: 'localhost', port: 5432, ... }
 */
export function parseConnectionUrl(url: string): DatabaseConnectionInfo {
  // In-memory SQLite
  if (url === ':memory:' || url === 'sqlite::memory:' || url === 'sqlite://:memory:') {
    return { type: 'sqlite', database: ':memory:', filepath: ':memory:' };
  }

  // SQLite URL
  if (url.startsWith('sqlite:') || url.startsWith('file:')) {
    let filepath = url
      .replace(/^sqlite:(\/\/)?/, '')
      .replace(/^file:/, '');

    if (filepath === ':memory:' || filepath === '/:memory:') {
      return { type: 'sqlite', database: ':memory:', filepath: ':memory:' };
    }

    if (!filepath.startsWith('/') && !filepath.startsWith('./') && !filepath.match(/^[A-Za-z]:\\/)) {
      filepath = './' + filepath;
    }

    return { type: 'sqlite', database: filepath, filepath };
  }

  // Bare SQLite file path
  if (url.match(/\.(db|sqlite|sqlite3)$/i)) {
    let filepath = url;
    if (!filepath.startsWith('/') && !filepath.startsWith('./') && !filepath.match(/^[A-Za-z]:\\/)) {
      filepath = './' + filepath;
    }
    return { type: 'sqlite', database: filepath, filepath };
  }

  // PostgreSQL
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname || 'localhost';
      const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
      validateHostname(host, 'PostgreSQL');
      validatePort(port, 'PostgreSQL');
      return {
        type: 'postgresql',
        host,
        port,
        database: parsed.pathname.replace(/^\//, '') || 'postgres',
        user: parsed.username || undefined,
        password: parsed.password || undefined,
      };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Invalid')) throw err;
      return { type: 'unknown', database: '' };
    }
  }

  // MySQL
  if (url.startsWith('mysql://')) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname || 'localhost';
      const port = parsed.port ? parseInt(parsed.port, 10) : 3306;
      validateHostname(host, 'MySQL');
      validatePort(port, 'MySQL');
      return {
        type: 'mysql',
        host,
        port,
        database: parsed.pathname.replace(/^\//, '') || 'mysql',
        user: parsed.username || undefined,
        password: parsed.password || undefined,
      };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Invalid')) throw err;
      return { type: 'unknown', database: '' };
    }
  }

  return { type: 'unknown', database: '' };
}
