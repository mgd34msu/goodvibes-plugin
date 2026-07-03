/**
 * Telemetry writer roundtrip + atomic persistence.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { Telemetry, KVState } from '../telemetry/index.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-tel-'));
  Telemetry.resetInstance();
});

afterEach(() => {
  Telemetry.resetInstance();
  KVState.resetInstance();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('Telemetry', () => {
  it('records and queries calls, and persists the DB file atomically', async () => {
    const dbPath = path.join(tmpDir, 'telemetry.db');
    await Telemetry.initialize(dbPath);
    const t = Telemetry.getInstance();

    const id = t.generateId('code_read');
    expect(id).toMatch(/^code_read_[0-9a-f]{8}_[0-9a-f]{8}$/);

    t.record({ id, tool: 'code_read', status: 'success', tokens_in: 10, tokens_out: 20, duration_ms: 5 });
    t.persist();

    expect(fs.existsSync(dbPath)).toBe(true);
    const rows = t.query({ tool: 'code_read' });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokens_in).toBe(10);
    expect(rows[0].tokens_out).toBe(20);

    const summary = t.getSummary();
    expect(summary.total_calls).toBe(1);
    expect(summary.total_tokens).toBe(30);
    // No leftover temp files from the atomic write.
    expect(fs.readdirSync(tmpDir).some((f) => f.endsWith('.tmp'))).toBe(false);
  });
});

describe('KVState', () => {
  it('round-trips values through an atomic session file', async () => {
    const priorCwd = process.cwd();
    process.chdir(tmpDir); // KVState writes under cwd/.goodvibes/state
    try {
      const kv = KVState.initWithSessionId('deadbeef');
      await kv.set({ 'session.task': 'scaffold-core' });
      const got = await kv.get(['session.task']);
      expect(got['session.task']).toBe('scaffold-core');
      expect(kv.getSessionId()).toBe('deadbeef');
      expect(fs.existsSync(path.join(tmpDir, '.goodvibes', 'state', 'session_deadbeef.json'))).toBe(true);
    } finally {
      process.chdir(priorCwd);
    }
  });
});
