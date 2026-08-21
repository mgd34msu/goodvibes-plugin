/**
 * SQLite pool durability tests.
 *
 * sql.js loads the whole database into memory and writes the whole file back,
 * so a pooled connection is a private copy. Two defects followed from that and
 * are pinned here: a cached read-only connection kept serving rows a write had
 * already replaced, and two read-write connections to one file each exported
 * their own copy, so the second save silently dropped the first's rows.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseConnectionUrl } from '../db/url-parser.js';
import { executeSqlite } from '../db/executors/sqlite.js';
import { shutdownConnectionPool } from '../db/sqlite-pool.js';
import type { DatabaseConnectionInfo } from '../db/types.js';

describe('sqlite pool', () => {
  let dir: string;
  let fixture: string;
  let info: DatabaseConnectionInfo;

  const names = async (): Promise<string[]> => {
    const result = await executeSqlite(info, 'SELECT name FROM t ORDER BY name', [], true);
    return result.rows.map((r) => (r as { name: string }).name);
  };

  beforeEach(async () => {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sqlite-pool-test-'));
    fixture = path.join(dir, 'fixture.db');
    info = parseConnectionUrl(fixture);
    await executeSqlite(info, 'CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)', [], false);
    await executeSqlite(info, "INSERT INTO t (name) VALUES ('a')", [], false);
    shutdownConnectionPool();
  });

  afterEach(async () => {
    shutdownConnectionPool();
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('serves a read from after a write, not the copy loaded before it', async () => {
    expect(await names()).toEqual(['a']);
    await executeSqlite(info, "INSERT INTO t (name) VALUES ('b')", [], false);
    expect(await names()).toEqual(['a', 'b']);
  });

  it('reloads when the file is replaced by something outside the pool', async () => {
    expect(await names()).toEqual(['a']);

    // Stand in for another process writing the same database file.
    const other = await executeSqlite(info, "INSERT INTO t (name) VALUES ('outside')", [], false);
    expect(other.changes).toBe(1);
    shutdownConnectionPool();

    expect(await names()).toEqual(['a', 'outside']);
  });

  it('keeps both rows when two writes run concurrently', async () => {
    await Promise.all([
      executeSqlite(info, "INSERT INTO t (name) VALUES ('x')", [], false),
      executeSqlite(info, "INSERT INTO t (name) VALUES ('y')", [], false),
    ]);
    shutdownConnectionPool();
    expect(await names()).toEqual(['a', 'x', 'y']);
  });

  it('keeps every row when many writes run concurrently', async () => {
    const expected = Array.from({ length: 8 }, (_, i) => `c${i}`);
    await Promise.all(
      expected.map((name) => executeSqlite(info, 'INSERT INTO t (name) VALUES (?)', [name], false)),
    );
    shutdownConnectionPool();
    expect(await names()).toEqual(['a', ...expected].sort());
  });

  it('leaves no lock or temp residue beside the database file', async () => {
    await executeSqlite(info, "INSERT INTO t (name) VALUES ('z')", [], false);
    const entries = await fs.promises.readdir(dir);
    expect(entries.filter((e) => e.endsWith('.lock') || e.includes('.tmp'))).toEqual([]);
  });
});
