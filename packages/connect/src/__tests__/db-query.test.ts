/**
 * `db_query` tool tests — a real SQLite fixture (seeded via the ported executor)
 * plus driver-resolution unit tests and the connect trust rules (registered
 * connection only, read-only default, write opt-in, open-mode bare url).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { handleDbQuery } from '../tools/db-query.js';
import * as registry from '../fetch/service-registry.js';
import { parseConnectionUrl } from '../db/url-parser.js';
import { executeSqlite } from '../db/executors/sqlite.js';
import { shutdownConnectionPool } from '../db/sqlite-pool.js';
import { detectDriver, dynamicImport, setMockDriver, clearMockDrivers, loadPostgresDriver } from '../db/drivers.js';
import { resetConfigCache } from '@goodvibes/core/config';

const V2 = ['.goodvibes', 'v2'];

interface ParsedEnvelope {
  success: boolean;
  error?: string;
  data?: {
    database_type: string;
    rows: Array<Record<string, unknown>>;
    row_count: number;
    changes?: number;
    truncated?: boolean;
  };
  meta: { mode?: string; truncated?: boolean };
}

async function call(args: unknown): Promise<ParsedEnvelope> {
  const res = await handleDbQuery(args);
  const block = (res.content as { type: string; text: string }[])[0];
  return JSON.parse(block.text) as ParsedEnvelope;
}

describe('db_query', () => {
  let tmpDir: string;
  let fixture: string;

  async function setMode(mode: 'restricted' | 'open'): Promise<void> {
    await fs.promises.writeFile(path.join(tmpDir, ...V2, 'config.json'), JSON.stringify({ mode }), 'utf-8');
    resetConfigCache();
  }

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'db-query-test-'));
    await fs.promises.mkdir(path.join(tmpDir, ...V2), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    await setMode('restricted');

    // Seed a SQLite fixture on disk via the ported executor (write mode).
    fixture = path.join(tmpDir, 'fixture.db');
    const info = parseConnectionUrl(fixture);
    await executeSqlite(info, 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)', [], false);
    await executeSqlite(info, "INSERT INTO users (name) VALUES ('Alice'), ('Bob')", [], false);
  });

  afterEach(async () => {
    shutdownConnectionPool();
    clearMockDrivers();
    resetConfigCache();
    vi.restoreAllMocks();
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('runs a SELECT against a registered connection and stamps mode', async () => {
    await registry.addConnection('testdb', { url: fixture });
    const env = await call({ connection: 'testdb', query: 'SELECT name FROM users ORDER BY id' });

    expect(env.success).toBe(true);
    expect(env.meta.mode).toBe('restricted');
    expect(env.data!.database_type).toBe('sqlite');
    expect(env.data!.row_count).toBe(2);
    expect(env.data!.rows.map((r) => r.name)).toEqual(['Alice', 'Bob']);
  });

  it('requires a registered connection in restricted mode', async () => {
    const env = await call({ database_url: `sqlite://${fixture}`, query: 'SELECT 1' });
    expect(env.success).toBe(false);
    expect(env.error).toContain('open mode');
  });

  it('errors on an unregistered connection name', async () => {
    const env = await call({ connection: 'nope', query: 'SELECT 1' });
    expect(env.success).toBe(false);
    expect(env.error).toContain('not registered');
  });

  it('blocks a write by default (read-only)', async () => {
    await registry.addConnection('testdb', { url: fixture, allow_writes: true });
    const env = await call({ connection: 'testdb', query: "INSERT INTO users (name) VALUES ('Carol')" });
    expect(env.success).toBe(false);
    expect(env.error).toContain('read-only by default');
  });

  it('blocks a write when the connection did not opt in, even with write:true', async () => {
    await registry.addConnection('testdb', { url: fixture, allow_writes: false });
    const env = await call({
      connection: 'testdb',
      query: "INSERT INTO users (name) VALUES ('Carol')",
      write: true,
    });
    expect(env.success).toBe(false);
    expect(env.error).toContain('not permitted');
  });

  it('allows a write when opted in via allow_writes + write:true', async () => {
    await registry.addConnection('testdb', { url: fixture, allow_writes: true });
    const wrote = await call({
      connection: 'testdb',
      query: "INSERT INTO users (name) VALUES ('Carol')",
      write: true,
    });
    expect(wrote.success).toBe(true);
    expect(wrote.data!.changes).toBe(1);

    const readBack = await call({ connection: 'testdb', query: 'SELECT COUNT(*) AS n FROM users' });
    expect(readBack.data!.rows[0].n).toBe(3);
  });

  it('allows a bare database_url in open mode', async () => {
    await setMode('open');
    const env = await call({ database_url: fixture, query: 'SELECT name FROM users LIMIT 1' });
    expect(env.success).toBe(true);
    expect(env.meta.mode).toBe('open');
    expect(env.data!.row_count).toBe(1);
  });

  describe('driver resolution', () => {
    it('classifies connection URLs by driver', () => {
      expect(detectDriver('postgres://u@h/db')).toBe('postgresql');
      expect(detectDriver('postgresql://u@h/db')).toBe('postgresql');
      expect(detectDriver('mysql://u@h/db')).toBe('mysql');
      expect(detectDriver('sqlite:///x.db')).toBe('sqlite');
      expect(detectDriver('./local.sqlite')).toBe('sqlite');
      expect(detectDriver(':memory:')).toBe('sqlite');
      expect(detectDriver('weird://x')).toBe('unknown');
    });

    it('returns null for a driver not installed in the target project', async () => {
      // pg is not a dependency of this repo, so target resolution fails cleanly.
      expect(await loadPostgresDriver()).toBeNull();
    });

    it('honors a mock driver for tests', async () => {
      const fake = { Client: class {} };
      setMockDriver('pg', fake);
      expect(await dynamicImport('pg')).toBe(fake);
      clearMockDrivers();
    });
  });
});
