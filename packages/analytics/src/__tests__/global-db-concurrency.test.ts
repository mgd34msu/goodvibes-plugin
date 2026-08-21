/**
 * Cross-process write regression tests for the global analytics DB.
 *
 * The file at ~/.claude/.goodvibes/analytics/v2/analytics.db is shared by every
 * concurrent Claude Code session, and each session's MCP server holds its own
 * sql.js copy in memory. Two GlobalDB instances over one path stand in for two
 * sessions: before the write lock, whichever exported last reverted the other's
 * rows, because each exported a snapshot loaded before the other wrote.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, openSync, closeSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GlobalDB } from '../engine/data/global-db.js';
import { acquireFileLock, releaseFileLock } from '../engine/runtime.js';

let dir: string;
let dbPath: string;

function session(id: string): { session_id: string; project_hash: string; started_at: string } {
  return { session_id: id, project_hash: 'proj', started_at: new Date().toISOString() };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gv-globaldb-'));
  dbPath = join(dir, 'analytics.db');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('GlobalDB concurrent writers', () => {
  it('keeps rows written by another instance after its own write', async () => {
    const a = new GlobalDB(dbPath);
    await a.initialize();
    const b = new GlobalDB(dbPath);
    await b.initialize();

    a.upsertSession(session('from-a'));
    // b loaded before that row existed; its export must not revert it.
    b.upsertSession(session('from-b'));

    a.close();
    b.close();

    const reader = new GlobalDB(dbPath);
    await reader.initialize();
    expect(reader.getSession('from-a')).not.toBeNull();
    expect(reader.getSession('from-b')).not.toBeNull();
    reader.close();
  });

  it('keeps tags written by another instance', async () => {
    const seed = new GlobalDB(dbPath);
    await seed.initialize();
    seed.upsertSession(session('s1'));
    seed.close();

    const a = new GlobalDB(dbPath);
    await a.initialize();
    const b = new GlobalDB(dbPath);
    await b.initialize();

    a.addTag('s1', 'from-a');
    b.addTag('s1', 'from-b');

    a.close();
    b.close();

    const reader = new GlobalDB(dbPath);
    await reader.initialize();
    expect(reader.getTagsForSession('s1').map((t) => t.tag).sort()).toEqual(['from-a', 'from-b']);
    reader.close();
  });

  it('survives writers interleaving many times', async () => {
    const a = new GlobalDB(dbPath);
    await a.initialize();
    const b = new GlobalDB(dbPath);
    await b.initialize();

    for (let i = 0; i < 10; i++) {
      a.upsertSession(session(`a-${i}`));
      b.upsertSession(session(`b-${i}`));
    }
    a.close();
    b.close();

    const reader = new GlobalDB(dbPath);
    await reader.initialize();
    for (let i = 0; i < 10; i++) {
      expect(reader.getSession(`a-${i}`), `a-${i}`).not.toBeNull();
      expect(reader.getSession(`b-${i}`), `b-${i}`).not.toBeNull();
    }
    reader.close();
  });

  it('groups a transaction into one write and still reloads first', async () => {
    const a = new GlobalDB(dbPath);
    await a.initialize();
    const b = new GlobalDB(dbPath);
    await b.initialize();

    a.upsertSession(session('from-a'));
    b.transaction(() => {
      b.upsertSession(session('from-b1'));
      b.upsertSession(session('from-b2'));
    });

    a.close();
    b.close();

    const reader = new GlobalDB(dbPath);
    await reader.initialize();
    expect(reader.getSession('from-a')).not.toBeNull();
    expect(reader.getSession('from-b1')).not.toBeNull();
    expect(reader.getSession('from-b2')).not.toBeNull();
    reader.close();
  });

  it('leaves no lock file behind', async () => {
    const db = new GlobalDB(dbPath);
    await db.initialize();
    db.upsertSession(session('s1'));
    db.close();
    expect(existsSync(`${dbPath}.lock`)).toBe(false);
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});

describe('acquireFileLock', () => {
  it('is exclusive while held and reusable after release', () => {
    const target = join(dir, 'state.json');
    const fd = acquireFileLock(target);
    expect(existsSync(`${target}.lock`)).toBe(true);
    releaseFileLock(target, fd);
    expect(existsSync(`${target}.lock`)).toBe(false);

    const again = acquireFileLock(target);
    releaseFileLock(target, again);
  });

  it('takes over a lock left behind by a process that died', () => {
    const target = join(dir, 'state.json');
    const orphan = openSync(`${target}.lock`, 'wx');
    closeSync(orphan);
    const stale = new Date(Date.now() - 60_000);
    utimesSync(`${target}.lock`, stale, stale);

    const started = Date.now();
    const fd = acquireFileLock(target);
    expect(Date.now() - started).toBeLessThan(1000);
    releaseFileLock(target, fd);
  });

  it('breaks a lock that is still held past the wait budget', () => {
    const target = join(dir, 'state.json');
    const holder = acquireFileLock(target);

    const fd = acquireFileLock(target, 0);
    releaseFileLock(target, fd);
    releaseFileLock(target, holder);
  });
});
