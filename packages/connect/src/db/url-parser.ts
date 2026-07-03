/**
 * Database connection URL parser — ported verbatim from v1 project-engine
 * `core/database/url-parser.ts` (PostgreSQL / MySQL / SQLite, in-memory and bare
 * file paths).
 */

import type { DatabaseConnectionInfo } from './types.js';

const MIN_PORT = 0;
const MAX_PORT = 65535;

function validatePort(port: number, context: string): void {
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(
      `Invalid port ${port} in ${context} URL. Port must be an integer between ${MIN_PORT} and ${MAX_PORT}.`,
    );
  }
}

function validateHostname(hostname: string, context: string): void {
  if (!hostname || hostname.trim() === '') {
    throw new Error(`Invalid or empty hostname in ${context} URL.`);
  }
}

/**
 * Parse a database connection URL into structured connection info.
 * @param url - a connection URL or a bare SQLite file path
 * @returns parsed info, or `{ type: 'unknown' }` when unrecognised
 */
export function parseConnectionUrl(url: string): DatabaseConnectionInfo {
  if (url === ':memory:' || url === 'sqlite::memory:' || url === 'sqlite://:memory:') {
    return { type: 'sqlite', database: ':memory:', filepath: ':memory:' };
  }

  if (url.startsWith('sqlite:') || url.startsWith('file:')) {
    let filepath = url.replace(/^sqlite:(\/\/)?/, '').replace(/^file:/, '');

    if (filepath === ':memory:' || filepath === '/:memory:') {
      return { type: 'sqlite', database: ':memory:', filepath: ':memory:' };
    }

    if (!filepath.startsWith('/') && !filepath.startsWith('./') && !filepath.match(/^[A-Za-z]:[/\\]/)) {
      filepath = './' + filepath;
    }

    return { type: 'sqlite', database: filepath, filepath };
  }

  if (url.match(/\.(db|sqlite|sqlite3)$/i)) {
    let filepath = url;
    if (!filepath.startsWith('/') && !filepath.startsWith('./') && !filepath.match(/^[A-Za-z]:[/\\]/)) {
      filepath = './' + filepath;
    }
    return { type: 'sqlite', database: filepath, filepath };
  }

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
      if (err instanceof Error && err.message.startsWith('Invalid')) {throw err;}
      return { type: 'unknown', database: '' };
    }
  }

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
      if (err instanceof Error && err.message.startsWith('Invalid')) {throw err;}
      return { type: 'unknown', database: '' };
    }
  }

  return { type: 'unknown', database: '' };
}
