/**
 * Database URL Parser
 *
 * Parses database connection URLs into structured connection info.
 * Supports PostgreSQL, MySQL, and SQLite URLs.
 */

import type { DatabaseConnectionInfo } from './types.js';

/**
 * Parse a database connection URL into its components
 */
export function parseDatabaseUrl(url: string): DatabaseConnectionInfo {
  // Special case: in-memory SQLite database
  if (url === ':memory:' || url === 'sqlite::memory:' || url === 'sqlite://:memory:') {
    return {
      type: 'sqlite',
      database: ':memory:',
      filepath: ':memory:',
    };
  }

  // SQLite patterns
  if (url.startsWith('sqlite:') || url.startsWith('file:')) {
    let filepath = url
      .replace(/^sqlite:(\/\/)?/, '')
      .replace(/^file:/, '');

    // Handle relative paths
    if (filepath.startsWith('./') || filepath.startsWith('../')) {
      // Keep relative path as-is
    } else if (!filepath.startsWith('/') && !filepath.match(/^[A-Za-z]:\\/)) {
      // Add ./ for relative paths that don't start with / or drive letter
      filepath = './' + filepath;
    }

    // Handle special :memory: case within URL
    if (filepath === ':memory:' || filepath === '/:memory:') {
      return {
        type: 'sqlite',
        database: ':memory:',
        filepath: ':memory:',
      };
    }

    return {
      type: 'sqlite',
      database: filepath,
      filepath,
    };
  }

  // Check if it's a bare file path to a .db, .sqlite, or .sqlite3 file
  if (url.match(/\.(db|sqlite|sqlite3)$/i)) {
    let filepath = url;
    if (!filepath.startsWith('/') && !filepath.startsWith('./') && !filepath.match(/^[A-Za-z]:\\/)) {
      filepath = './' + filepath;
    }

    return {
      type: 'sqlite',
      database: filepath,
      filepath,
    };
  }

  // PostgreSQL pattern: postgresql://<user>:<pass>@host:port/database
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    try {
      const parsed = new URL(url);
      return {
        type: 'postgresql',
        host: parsed.hostname || 'localhost',
        port: parsed.port ? parseInt(parsed.port, 10) : 5432,
        database: parsed.pathname.replace(/^\//, '') || 'postgres',
        user: parsed.username || undefined,
        password: parsed.password || undefined,
      };
    } catch {
      return { type: 'unknown', database: '' };
    }
  }

  // MySQL pattern: mysql://<user>:<pass>@host:port/database
  if (url.startsWith('mysql://')) {
    try {
      const parsed = new URL(url);
      return {
        type: 'mysql',
        host: parsed.hostname || 'localhost',
        port: parsed.port ? parseInt(parsed.port, 10) : 3306,
        database: parsed.pathname.replace(/^\//, '') || 'mysql',
        user: parsed.username || undefined,
        password: parsed.password || undefined,
      };
    } catch {
      return { type: 'unknown', database: '' };
    }
  }

  return { type: 'unknown', database: '' };
}
