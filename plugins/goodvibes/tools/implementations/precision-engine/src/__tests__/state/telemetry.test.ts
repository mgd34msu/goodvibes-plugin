/**
 * Tests for Telemetry singleton — precision_id generation, SQLite persistence,
 * getSummary aggregation, query filters, and resetInstance cleanup.
 *
 * Uses a real sql.js in-memory/file database in a temporary directory (no mocks
 * for DB layer) so that we validate actual SQL behaviour.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import initSqlJs from 'sql.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { Telemetry } from '../../state/telemetry.js';
import type { TelemetryRecord } from '../../state/telemetry.js';

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

let tmpDir: string;
let dbPath: string;

/** Create a fresh temp dir for each test. */
function makeTempDb(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-test-'));
  return path.join(tmpDir, 'telemetry.db');
}

/** Remove the temp dir after each test. */
function cleanupTempDir() {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors in CI
  }
}

/** Minimal helper to record a call. */
function recordCall(
  tel: Telemetry,
  tool: string,
  status: TelemetryRecord['status'] = 'success',
  overrides: Partial<Omit<TelemetryRecord, 'id' | 'session_id' | 'created_at' | 'tool' | 'status'>> = {},
) {
  const id = tel.generateId(tool);
  tel.record({ id, tool, status, ...overrides });
  return id;
}

// ───────────────────────────────────────────────────────────────────────────
// Setup / teardown
// ───────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  Telemetry.resetInstance();
  dbPath = makeTempDb();
  await Telemetry.initialize(dbPath);
});

afterEach(() => {
  Telemetry.resetInstance();
  cleanupTempDir();
});

// ───────────────────────────────────────────────────────────────────────────
// ID generation
// ───────────────────────────────────────────────────────────────────────────

describe('generateId()', () => {
  it('returns id in {tool}_{session}_{unique} format', () => {
    const tel = Telemetry.getInstance();
    const id = tel.generateId('precision_read');
    // Format: read_{8hex}_{8hex}
    expect(id).toMatch(/^read_[0-9a-f]{8}_[0-9a-f]{8}$/);
  });

  it('uses mapped short name for known tools', () => {
    const tel = Telemetry.getInstance();
    const cases: Array<[string, string]> = [
      ['precision_read', 'read'],
      ['precision_write', 'write'],
      ['precision_edit', 'edit'],
      ['precision_exec', 'exec'],
      ['precision_grep', 'grep'],
      ['precision_glob', 'glob'],
      ['precision_fetch', 'fetch'],
      ['precision_symbols', 'symbols'],
      ['precision_config', 'config'],
      ['precision_notebook', 'notebook'],
      ['discover', 'discover'],
      ['agent', 'agent'],
      ['apply', 'apply'],
    ];
    for (const [full, short] of cases) {
      const id = tel.generateId(full);
      expect(id.startsWith(`${short}_`), `${full} should map to ${short}`).toBe(true);
    }
  });

  it('falls back gracefully for unknown tool names', () => {
    const tel = Telemetry.getInstance();
    const id = tel.generateId('some_unknown_tool');
    // Should be sanitized to at most 12 chars of the tool name, plus session + unique
    expect(id).toMatch(/^[a-z0-9_]{1,12}_[0-9a-f]{8}_[0-9a-f]{8}$/);
  });

  it('generates unique IDs on every call', () => {
    const tel = Telemetry.getInstance();
    const ids = new Set(Array.from({ length: 100 }, () => tel.generateId('precision_read')));
    // All 100 IDs should be unique (collision probability ~2^-64)
    expect(ids.size).toBe(100);
  });

  it('embeds the session ID in every generated ID', () => {
    const tel = Telemetry.getInstance();
    const sessionId = tel.getSessionId();
    const id = tel.generateId('precision_write');
    expect(id).toContain(sessionId);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Session ID
// ───────────────────────────────────────────────────────────────────────────

describe('getSessionId()', () => {
  it('returns an 8-character hex string', () => {
    const tel = Telemetry.getInstance();
    const id = tel.getSessionId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('returns the same session ID on repeated calls', () => {
    const tel = Telemetry.getInstance();
    expect(tel.getSessionId()).toBe(tel.getSessionId());
  });

  it('generates a different session ID after resetInstance', async () => {
    const tel1 = Telemetry.getInstance();
    const id1 = tel1.getSessionId();

    Telemetry.resetInstance();
    const dbPath2 = path.join(tmpDir, 'telemetry2.db');
    await Telemetry.initialize(dbPath2);
    const tel2 = Telemetry.getInstance();
    const id2 = tel2.getSessionId();

    // Statistically impossible to collide (2^32 space)
    expect(id1).not.toBe(id2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// database creation
// ───────────────────────────────────────────────────────────────────────────

describe('database creation', () => {
  it('creates the database file at the given path', () => {
    // File is created by initialize() in beforeEach
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('creates parent directories if they do not exist', async () => {
    Telemetry.resetInstance();
    const nestedPath = path.join(tmpDir, 'a', 'b', 'c', 'telemetry.db');
    await Telemetry.initialize(nestedPath);
    expect(fs.existsSync(nestedPath)).toBe(true);
  });

  it('creates the calls table on first open', () => {
    const tel = Telemetry.getInstance();
    // Recording should not throw if the table was created correctly
    expect(() => recordCall(tel, 'precision_read')).not.toThrow();
  });

  it('persists data to the database file', () => {
    const tel = Telemetry.getInstance();
    recordCall(tel, 'precision_read');
    // After record(), persist() is called automatically — file should be non-empty
    expect(fs.existsSync(dbPath)).toBe(true);
    expect(fs.statSync(dbPath).size).toBeGreaterThan(0);
    // DB is readable
    expect(tel.query()).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// record() + query() round-trip
// ───────────────────────────────────────────────────────────────────────────

describe('record() + query() round-trip', () => {
  it('persists a minimal record and retrieves it', () => {
    const tel = Telemetry.getInstance();
    const id = recordCall(tel, 'precision_read');

    const records = tel.query();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(id);
    expect(records[0].tool).toBe('precision_read');
    expect(records[0].status).toBe('success');
    expect(records[0].session_id).toMatch(/^[0-9a-f]{8}$/);
    expect(records[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('persists all optional fields correctly', () => {
    const tel = Telemetry.getInstance();
    const id = tel.generateId('precision_grep');
    tel.record({
      id,
      tool: 'precision_grep',
      status: 'success',
      tokens_in: 120,
      tokens_out: 450,
      cache_hit: true,
      cache_bytes_saved: 8192,
      duration_ms: 35,
      error: undefined,
      metadata: { pattern: 'foo', files_searched: 42 },
    });

    const records = tel.query();
    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.tokens_in).toBe(120);
    expect(r.tokens_out).toBe(450);
    expect(r.cache_hit).toBe(true);
    expect(r.cache_bytes_saved).toBe(8192);
    expect(r.duration_ms).toBe(35);
    expect(r.metadata).toEqual({ pattern: 'foo', files_searched: 42 });
  });

  it('persists cache_hit=false as false (not null)', () => {
    const tel = Telemetry.getInstance();
    const id = tel.generateId('precision_read');
    tel.record({ id, tool: 'precision_read', status: 'success', cache_hit: false });

    const r = tel.query()[0];
    expect(r.cache_hit).toBe(false);
  });

  it('persists error records correctly', () => {
    const tel = Telemetry.getInstance();
    const id = tel.generateId('precision_write');
    tel.record({
      id,
      tool: 'precision_write',
      status: 'failed',
      error: 'ENOENT: no such file or directory',
    });

    const r = tel.query()[0];
    expect(r.status).toBe('failed');
    expect(r.error).toBe('ENOENT: no such file or directory');
  });

  it('records do not conflict for concurrent insertions', () => {
    const tel = Telemetry.getInstance();
    // Insert 50 records in rapid succession
    for (let i = 0; i < 50; i++) {
      const id = tel.generateId('precision_read');
      tel.record({ id, tool: 'precision_read', status: 'success', tokens_in: i, duration_ms: i * 2 });
    }

    const records = tel.query();
    expect(records).toHaveLength(50);
    // All IDs should be unique
    const ids = new Set(records.map((r) => r.id));
    expect(ids.size).toBe(50);
  });

  it('query() with no filter returns all records', () => {
    const tel = Telemetry.getInstance();
    recordCall(tel, 'precision_read');
    recordCall(tel, 'precision_write');
    recordCall(tel, 'precision_edit');

    expect(tel.query()).toHaveLength(3);
  });

  it('returns records in ascending chronological order', () => {
    const tel = Telemetry.getInstance();
    recordCall(tel, 'precision_read');
    recordCall(tel, 'precision_write');
    recordCall(tel, 'precision_edit');

    const records = tel.query();
    for (let i = 1; i < records.length; i++) {
      expect(records[i].created_at >= records[i - 1].created_at).toBe(true);
    }
  });

  it('duplicate IDs are ignored (INSERT OR IGNORE)', () => {
    const tel = Telemetry.getInstance();
    const id = tel.generateId('precision_read');
    tel.record({ id, tool: 'precision_read', status: 'success', tokens_in: 10 });
    // Try to insert same ID again — should be silently ignored
    tel.record({ id, tool: 'precision_read', status: 'failed', tokens_in: 999 });

    const records = tel.query();
    expect(records).toHaveLength(1);
    // First write wins
    expect(records[0].tokens_in).toBe(10);
    expect(records[0].status).toBe('success');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// query() filters
// ───────────────────────────────────────────────────────────────────────────

describe('query() filters', () => {
  let tel: Telemetry;

  beforeEach(() => {
    tel = Telemetry.getInstance();
    recordCall(tel, 'precision_read', 'success', { tokens_in: 100, duration_ms: 10 });
    recordCall(tel, 'precision_read', 'success', { tokens_in: 200, duration_ms: 20 });
    recordCall(tel, 'precision_write', 'failed', { error: 'disk full' });
    recordCall(tel, 'precision_edit', 'partial', { tokens_out: 50 });
  });

  it('filters by tool name', () => {
    const results = tel.query({ tool: 'precision_read' });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.tool === 'precision_read')).toBe(true);
  });

  it('filters by status', () => {
    const failed = tel.query({ status: 'failed' });
    expect(failed).toHaveLength(1);
    expect(failed[0].tool).toBe('precision_write');

    const partial = tel.query({ status: 'partial' });
    expect(partial).toHaveLength(1);
    expect(partial[0].tool).toBe('precision_edit');
  });

  it('filters by session_id', () => {
    const sessionId = tel.getSessionId();
    const results = tel.query({ session_id: sessionId });
    expect(results).toHaveLength(4);

    // Non-existent session should return nothing
    const empty = tel.query({ session_id: 'deadbeef' });
    expect(empty).toHaveLength(0);
  });

  it('filters by since (ISO timestamp)', () => {
    // Set since to a far-future date
    const far_future = new Date(Date.now() + 86400000).toISOString();
    const results = tel.query({ since: far_future });
    expect(results).toHaveLength(0);

    // Set since to the past (before test records were created)
    const past = new Date(Date.now() - 86400000).toISOString();
    const all = tel.query({ since: past });
    expect(all).toHaveLength(4);
  });

  it('limits results via the limit filter', () => {
    const results = tel.query({ limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('combines multiple filters', () => {
    const results = tel.query({ tool: 'precision_read', status: 'success' });
    expect(results).toHaveLength(2);
  });

  it('returns empty array for no matches', () => {
    const results = tel.query({ tool: 'nonexistent_tool' });
    expect(results).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// getSummary()
// ───────────────────────────────────────────────────────────────────────────

describe('getSummary()', () => {
  it('returns correct counts with no records', () => {
    const tel = Telemetry.getInstance();
    const summary = tel.getSummary();

    expect(summary.total_calls).toBe(0);
    expect(summary.by_tool).toEqual({});
    expect(summary.total_tokens).toBe(0);
    expect(summary.total_cache_hits).toBe(0);
    expect(summary.total_duration_ms).toBe(0);
    expect(summary.success_rate).toBe(1);
  });

  it('reports correct session_id in summary', () => {
    const tel = Telemetry.getInstance();
    const summary = tel.getSummary();
    expect(summary.session_id).toBe(tel.getSessionId());
  });

  it('aggregates calls by tool correctly', () => {
    const tel = Telemetry.getInstance();
    recordCall(tel, 'precision_read', 'success', { tokens_in: 100, tokens_out: 50, duration_ms: 10 });
    recordCall(tel, 'precision_read', 'success', { tokens_in: 200, tokens_out: 100, duration_ms: 30 });
    recordCall(tel, 'precision_write', 'success', { tokens_in: 50, tokens_out: 10, duration_ms: 5 });

    const summary = tel.getSummary();
    expect(summary.total_calls).toBe(3);

    const readStats = summary.by_tool['precision_read'];
    expect(readStats).toBeDefined();
    expect(readStats.calls).toBe(2);
    expect(readStats.tokens).toBe(450);  // (100+50) + (200+100)
    expect(readStats.avg_ms).toBe(20);   // (10+30)/2

    const writeStats = summary.by_tool['precision_write'];
    expect(writeStats).toBeDefined();
    expect(writeStats.calls).toBe(1);
    expect(writeStats.tokens).toBe(60);  // 50+10
    expect(writeStats.avg_ms).toBe(5);
  });

  it('counts cache hits correctly', () => {
    const tel = Telemetry.getInstance();
    recordCall(tel, 'precision_read', 'success', { cache_hit: true });
    recordCall(tel, 'precision_read', 'success', { cache_hit: true });
    recordCall(tel, 'precision_read', 'success', { cache_hit: false });
    recordCall(tel, 'precision_write', 'success', {});

    const summary = tel.getSummary();
    expect(summary.total_cache_hits).toBe(2);
    expect(summary.by_tool['precision_read'].cache_hits).toBe(2);
    expect(summary.by_tool['precision_write'].cache_hits).toBe(0);
  });

  it('computes success_rate correctly', () => {
    const tel = Telemetry.getInstance();
    recordCall(tel, 'precision_read', 'success');
    recordCall(tel, 'precision_read', 'success');
    recordCall(tel, 'precision_read', 'success');
    recordCall(tel, 'precision_write', 'failed');

    const summary = tel.getSummary();
    expect(summary.success_rate).toBeCloseTo(0.75, 5);
  });

  it('accumulates total_duration_ms across all calls', () => {
    const tel = Telemetry.getInstance();
    recordCall(tel, 'precision_read', 'success', { duration_ms: 10 });
    recordCall(tel, 'precision_write', 'success', { duration_ms: 20 });
    recordCall(tel, 'precision_edit', 'success', { duration_ms: 30 });

    const summary = tel.getSummary();
    expect(summary.total_duration_ms).toBe(60);
  });

  it('only includes current session\'s records in summary', async () => {
    const tel = Telemetry.getInstance();
    recordCall(tel, 'precision_read', 'success');

    // Persist current state so the foreign session record lands in the same file
    tel.persist();

    // Reset the Telemetry instance BEFORE writing foreign data to disk,
    // so that resetInstance()'s close()+persist() does not overwrite our foreign data.
    Telemetry.resetInstance();

    // Insert a record with a foreign session_id using a separate sql.js connection
    const SQL = await initSqlJs();
    const fileBuffer = fs.readFileSync(dbPath);
    const foreignDb = new SQL.Database(fileBuffer);
    foreignDb.run(
      `INSERT OR IGNORE INTO calls
        (id, session_id, tool, status, tokens_in, tokens_out,
         cache_hit, cache_bytes_saved, duration_ms, error, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'read_deadbeef_cafebabe',
        'deadbeef',
        'precision_read',
        'success',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        new Date().toISOString(),
      ],
    );
    // Write the 2-record db (original + foreign) to disk
    const exportedData = foreignDb.export();
    fs.writeFileSync(dbPath, Buffer.from(exportedData));
    foreignDb.close();

    // Reload the Telemetry instance from the updated 2-record file
    await Telemetry.initialize(dbPath);
    const tel2 = Telemetry.getInstance();

    // query() without session filter returns all records (including the foreign one)
    // Note: new instance has fresh session_id, so the original record also appears as "foreign"
    const allRecords = tel2.query();
    expect(allRecords).toHaveLength(2);

    const foreignRecord = allRecords.find((r) => r.session_id === 'deadbeef');
    expect(foreignRecord).toBeDefined();

    // getSummary() must only aggregate the new session's records (0, since we reloaded)
    const summary = tel2.getSummary();
    expect(summary.total_calls).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// estimateTokens()
// ───────────────────────────────────────────────────────────────────────────

describe('estimateTokens()', () => {
  it('uses Math.ceil(length/4) heuristic', () => {
    // JSON.stringify({}) = '{}' = 2 chars => ceil(2/4) = 1
    expect(Telemetry.estimateTokens({})).toBe(1);
  });

  it('estimates string input', () => {
    // JSON.stringify("hello") = '"hello"' = 7 chars => ceil(7/4) = 2
    expect(Telemetry.estimateTokens('hello')).toBe(2);
  });

  it('estimates number input', () => {
    // JSON.stringify(1234) = '1234' = 4 chars => ceil(4/4) = 1
    expect(Telemetry.estimateTokens(1234)).toBe(1);
  });

  it('estimates array input', () => {
    const arr = [1, 2, 3];
    const len = JSON.stringify(arr).length; // '[1,2,3]' = 7
    expect(Telemetry.estimateTokens(arr)).toBe(Math.ceil(len / 4));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// resetInstance()
// ───────────────────────────────────────────────────────────────────────────

describe('resetInstance()', () => {
  it('closes the database on reset', () => {
    const tel = Telemetry.getInstance();
    recordCall(tel, 'precision_read');

    // Reset should close the DB without error
    expect(() => Telemetry.resetInstance()).not.toThrow();
  });

  it('allows creating a new instance after reset', async () => {
    Telemetry.resetInstance();

    const dbPath2 = path.join(tmpDir, 'telemetry2.db');
    await Telemetry.initialize(dbPath2);
    const tel2 = Telemetry.getInstance();
    expect(tel2).toBeDefined();
    expect(fs.existsSync(dbPath2)).toBe(true);
  });

  it('new instance after reset gets a fresh session ID', async () => {
    const tel1 = Telemetry.getInstance();
    const sid1 = tel1.getSessionId();
    Telemetry.resetInstance();

    const dbPath2 = path.join(tmpDir, 'tel2.db');
    await Telemetry.initialize(dbPath2);
    const tel2 = Telemetry.getInstance();
    const sid2 = tel2.getSessionId();

    expect(sid1).not.toBe(sid2);
  });

  it('is idempotent when called with no instance', () => {
    // Reset in afterEach, call again — should not throw
    Telemetry.resetInstance();
    expect(() => Telemetry.resetInstance()).not.toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Singleton identity
// ───────────────────────────────────────────────────────────────────────────

describe('singleton identity', () => {
  it('returns the same instance on repeated calls', () => {
    const tel1 = Telemetry.getInstance();
    const tel2 = Telemetry.getInstance();
    expect(tel1).toBe(tel2);
  });

  it('ignores dbPath argument if already initialized', () => {
    const tel1 = Telemetry.getInstance();
    const tel2 = Telemetry.getInstance('/some/other/path.db');
    // Same instance — second call's path is ignored (with a console.warn)
    expect(tel1).toBe(tel2);
    expect(tel2.getSessionId()).toBe(tel1.getSessionId());
  });
});
