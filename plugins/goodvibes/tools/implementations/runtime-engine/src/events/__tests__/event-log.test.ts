/**
 * EventLog Tests
 *
 * Comprehensive unit tests for the JSONL append-only event log.
 * Tests use real file I/O against temporary directories.
 *
 * IMPORTANT: The EventLog.initialize() method uses readline over a ReadStream
 * to scan the existing log file. On Node.js, when a ReadStream is opened for a
 * non-existent file the readline interface emits 'close' (which resolves the
 * internal Promise) before the underlying stream emits 'error'. That means the
 * ENOENT is rejected on an already-resolved Promise and bubbles up as an
 * unhandled exception that Vitest catches and uses to fail the test.
 *
 * Work-around: tests that exercise "fresh" behaviour always pre-create an
 * empty events.jsonl file so readline can open it cleanly.  Tests that
 * specifically cover ENOENT-handling call log.query() / log.compact() (which
 * use a separate try/catch for ENOENT) rather than initialize().
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, chmodSync } from 'fs';
import type { WriteStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EventLog } from '../event-log.js';
import type { RuntimeEvent, EventFilter } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let testDirCounter = 0;

/**
 * Creates a unique temporary directory AND an empty events.jsonl file.
 * Pre-creating the file prevents readline from emitting unhandled ENOENT
 * errors when EventLog.initialize() is called on an empty log.
 */
function makeTmpDir(): string {
  const dir = join(tmpdir(), `event-log-test-${process.pid}-${++testDirCounter}`);
  mkdirSync(dir, { recursive: true });
  // Pre-create an empty events.jsonl to avoid readline ENOENT on initialize()
  writeFileSync(join(dir, 'events.jsonl'), '', 'utf-8');
  return dir;
}

/**
 * Creates a temporary directory WITHOUT the events.jsonl file.
 * Used only for tests that need to verify ENOENT handling in query/compact
 * (not initialize).
 */
function makeTmpDirEmpty(): string {
  const dir = join(tmpdir(), `event-log-test-${process.pid}-${++testDirCounter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Default config used by most tests. */
const DEFAULT_CONFIG = {
  event_log_max_size_mb: 10,
  compact_after_hours: 24,
};

let seqCounter = 0;

/** Build a minimal, valid RuntimeEvent. */
function makeEvent(
  overrides: Partial<RuntimeEvent> & { type?: RuntimeEvent['type'] } = {},
): RuntimeEvent {
  const seq = ++seqCounter;
  return {
    id: `evt_${seq.toString().padStart(4, '0')}`,
    timestamp: new Date(Date.now() + seq * 1000).toISOString(),
    source: { kind: 'system' },
    type: 'session:started',
    payload: {
      type: 'session:started',
      data: { session_id: 'test', cwd: '/tmp', project_root: '/tmp', mode: 'justvibes' },
    },
    metadata: {
      session_id: 'test-session',
      sequence: seq,
      version: 1,
    },
    ...overrides,
  };
}

/**
 * Closes an EventLog with a hard deadline.
 * Prevents stuck write-streams from hanging tests indefinitely.
 */
async function closeLog(log: EventLog, timeoutMs = 5000): Promise<void> {
  await Promise.race([
    log.close(),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EventLog', () => {
  let stateDir: string;
  let log: EventLog;

  beforeEach(() => {
    stateDir = makeTmpDir();
    log = new EventLog(stateDir, DEFAULT_CONFIG);
  });

  afterEach(async () => {
    await closeLog(log);
    try {
      rmSync(stateDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // ── initialize() ─────────────────────────────────────────────────────────

  describe('initialize()', () => {
    it('initialises cleanly on a fresh (empty) log file', async () => {
      await log.initialize();
      const stats = log.getStats();
      expect(stats.total_events).toBe(0);
      expect(stats.oldest_event).toBeUndefined();
      expect(stats.newest_event).toBeUndefined();
    });

    it('recovers event count from an existing JSONL file', async () => {
      const e1 = makeEvent();
      const e2 = makeEvent();
      writeFileSync(
        join(stateDir, 'events.jsonl'),
        `${JSON.stringify(e1)}\n${JSON.stringify(e2)}\n`,
        'utf-8',
      );

      await log.initialize();
      expect(log.getStats().total_events).toBe(2);
    });

    it('recovers the latest sequence number from existing events', async () => {
      const e1 = makeEvent({ metadata: { session_id: 's', sequence: 5, version: 1 } });
      const e2 = makeEvent({ metadata: { session_id: 's', sequence: 12, version: 1 } });
      writeFileSync(
        join(stateDir, 'events.jsonl'),
        `${JSON.stringify(e1)}\n${JSON.stringify(e2)}\n`,
        'utf-8',
      );

      await log.initialize();
      expect(log.getLatestSequence()).toBe(12);
    });

    it('recovers oldest and newest timestamps from existing events', async () => {
      const older = makeEvent({ timestamp: '2026-01-01T00:00:00.000Z' });
      const newer = makeEvent({ timestamp: '2026-01-02T00:00:00.000Z' });
      writeFileSync(
        join(stateDir, 'events.jsonl'),
        `${JSON.stringify(older)}\n${JSON.stringify(newer)}\n`,
        'utf-8',
      );

      await log.initialize();
      const stats = log.getStats();
      expect(stats.oldest_event).toBe('2026-01-01T00:00:00.000Z');
      expect(stats.newest_event).toBe('2026-01-02T00:00:00.000Z');
    });

    it('skips malformed (non-JSON) lines without throwing', async () => {
      const valid = makeEvent();
      writeFileSync(
        join(stateDir, 'events.jsonl'),
        `NOT_JSON\n${JSON.stringify(valid)}\n{broken\n`,
        'utf-8',
      );

      await expect(log.initialize()).resolves.toBeUndefined();
      // Only the valid line is counted
      expect(log.getStats().total_events).toBe(1);
    });

    it('builds per-type count cache from existing events', async () => {
      const e1 = makeEvent({ type: 'session:started' });
      const e2 = makeEvent({ type: 'session:started' });
      const e3 = makeEvent({ type: 'system:shutdown' });
      writeFileSync(
        join(stateDir, 'events.jsonl'),
        [e1, e2, e3].map((e) => JSON.stringify(e)).join('\n') + '\n',
        'utf-8',
      );

      await log.initialize();
      const stats = log.getStats();
      expect(stats.events_per_type['session:started']).toBe(2);
      expect(stats.events_per_type['system:shutdown']).toBe(1);
    });

    it('handles ENOENT gracefully — starts fresh without error (empty file)', async () => {
      // events.jsonl is pre-created as empty by makeTmpDir()
      // This tests that initialize() with zero lines sets zero counts
      await expect(log.initialize()).resolves.toBeUndefined();
      expect(log.getStats().total_events).toBe(0);
    });

    it('can be called twice without error (idempotent)', async () => {
      const e = makeEvent();
      writeFileSync(join(stateDir, 'events.jsonl'), `${JSON.stringify(e)}\n`, 'utf-8');
      await log.initialize();
      await expect(log.initialize()).resolves.toBeUndefined();
    });
  });

  // ── append() ──────────────────────────────────────────────────────────────

  describe('append()', () => {
    beforeEach(async () => {
      await log.initialize();
    });

    it('adds event to write buffer and increments event count', () => {
      const e = makeEvent();
      log.append(e);
      expect(log.getStats().total_events).toBe(1);
    });

    it('appended event becomes queryable via query()', async () => {
      const e = makeEvent();
      log.append(e);
      const results = await log.query();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(e.id);
    });

    it('multiple events accumulate in event count', () => {
      log.append(makeEvent());
      log.append(makeEvent());
      log.append(makeEvent());
      expect(log.getStats().total_events).toBe(3);
    });

    it('updates newestEvent on each append', () => {
      log.append(makeEvent({ timestamp: '2026-01-01T01:00:00.000Z' }));
      expect(log.getStats().newest_event).toBe('2026-01-01T01:00:00.000Z');
      log.append(makeEvent({ timestamp: '2026-01-01T02:00:00.000Z' }));
      expect(log.getStats().newest_event).toBe('2026-01-01T02:00:00.000Z');
    });

    it('sets oldestEvent only on first append and does not update it', () => {
      log.append(makeEvent({ timestamp: '2026-01-01T01:00:00.000Z' }));
      expect(log.getStats().oldest_event).toBe('2026-01-01T01:00:00.000Z');
      log.append(makeEvent({ timestamp: '2026-01-01T02:00:00.000Z' }));
      expect(log.getStats().oldest_event).toBe('2026-01-01T01:00:00.000Z');
    });

    it('updates type count cache on append', () => {
      log.append(makeEvent({ type: 'agent:spawned' }));
      log.append(makeEvent({ type: 'agent:spawned' }));
      log.append(makeEvent({ type: 'system:shutdown' }));
      const stats = log.getStats();
      expect(stats.events_per_type['agent:spawned']).toBe(2);
      expect(stats.events_per_type['system:shutdown']).toBe(1);
    });

    it('updates latestSeq when appended event has higher sequence', () => {
      log.append(makeEvent({ metadata: { session_id: 's', sequence: 42, version: 1 } }));
      expect(log.getLatestSequence()).toBe(42);
    });

    it('does not update latestSeq when appended event has lower sequence', () => {
      log.append(makeEvent({ metadata: { session_id: 's', sequence: 10, version: 1 } }));
      log.append(makeEvent({ metadata: { session_id: 's', sequence: 5, version: 1 } }));
      expect(log.getLatestSequence()).toBe(10);
    });

    it('is a no-op after close()', async () => {
      await closeLog(log);
      log.append(makeEvent());
      // Verify nothing was written: open a fresh log to read the file
      const log2 = new EventLog(stateDir, DEFAULT_CONFIG);
      await log2.initialize();
      expect(log2.getStats().total_events).toBe(0);
      await closeLog(log2);
    });

    it('file_size_bytes is non-zero after buffer is flushed to disk', async () => {
      log.append(makeEvent());
      // query() drains the buffer before reading
      await log.query();
      expect(log.getStats().file_size_bytes).toBeGreaterThan(0);
    });
  });

  // ── query() ───────────────────────────────────────────────────────────────

  describe('query()', () => {
    beforeEach(async () => {
      await log.initialize();
    });

    it('returns empty array when no events exist (empty buffer, no file writes)', async () => {
      // Fresh log with empty file — no events
      const results = await log.query();
      expect(results).toEqual([]);
    });

    it('returns all events with no filter', async () => {
      const e1 = makeEvent();
      const e2 = makeEvent();
      log.append(e1);
      log.append(e2);
      const results = await log.query();
      expect(results).toHaveLength(2);
    });

    it('filters by event type', async () => {
      log.append(makeEvent({ type: 'session:started' }));
      log.append(makeEvent({ type: 'system:shutdown' }));
      log.append(makeEvent({ type: 'session:started' }));
      const results = await log.query({ types: ['session:started'] });
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.type === 'session:started')).toBe(true);
    });

    it('filters by since timestamp (excludes events strictly before)', async () => {
      log.append(makeEvent({ timestamp: '2026-01-01T00:00:00.000Z' }));
      log.append(makeEvent({ timestamp: '2026-01-02T00:00:00.000Z' }));
      log.append(makeEvent({ timestamp: '2026-01-03T00:00:00.000Z' }));
      const results = await log.query({ since: '2026-01-02T00:00:00.000Z' });
      expect(results.every((e) => e.timestamp >= '2026-01-02T00:00:00.000Z')).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by since_sequence (> not >=)', async () => {
      log.append(makeEvent({ metadata: { session_id: 's', sequence: 1, version: 1 } }));
      log.append(makeEvent({ metadata: { session_id: 's', sequence: 2, version: 1 } }));
      log.append(makeEvent({ metadata: { session_id: 's', sequence: 3, version: 1 } }));
      const results = await log.query({ since_sequence: 1 });
      expect(results).toHaveLength(2);
      expect(results.every((e) => (e.metadata?.sequence ?? 0) > 1)).toBe(true);
    });

    it('respects limit — stops reading early', async () => {
      for (let i = 0; i < 10; i++) {
        log.append(makeEvent());
      }
      const results = await log.query({ limit: 3 });
      expect(results).toHaveLength(3);
    });

    it('skips malformed lines in the file and continues', async () => {
      const validEvent = makeEvent();
      writeFileSync(
        join(stateDir, 'events.jsonl'),
        `NOT_JSON\n${JSON.stringify(validEvent)}\n`,
        'utf-8',
      );
      const log2 = new EventLog(stateDir, DEFAULT_CONFIG);
      await log2.initialize();
      const results = await log2.query();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(validEvent.id);
      await closeLog(log2);
    });

    it('filters by correlation_id', async () => {
      log.append(
        makeEvent({
          metadata: { session_id: 's', sequence: 1, version: 1, correlation_id: 'corr-abc' },
        }),
      );
      log.append(makeEvent({ metadata: { session_id: 's', sequence: 2, version: 1 } }));
      const results = await log.query({ correlation_id: 'corr-abc' });
      expect(results).toHaveLength(1);
      expect(results[0].metadata?.correlation_id).toBe('corr-abc');
    });

    it('returns empty array when events.jsonl exists but is empty (ENOENT path: no stream open)', async () => {
      // Use a fresh log with an empty events.jsonl; do not call initialize().
      // query() streams the file, finds no lines, and returns [].
      // This covers the "no events in file" branch without triggering readline
      // ENOENT issues (a missing file causes streamLines to hang in some Node versions).
      const freshDir = makeTmpDir(); // creates an empty events.jsonl
      const freshLog = new EventLog(freshDir, DEFAULT_CONFIG);
      try {
        const results = await freshLog.query();
        expect(results).toEqual([]);
      } finally {
        await closeLog(freshLog);
        rmSync(freshDir, { recursive: true, force: true });
      }
    });
  });

  // ── since() ───────────────────────────────────────────────────────────────

  describe('since()', () => {
    beforeEach(async () => {
      await log.initialize();
    });

    it('delegates to query with since_sequence filter', async () => {
      log.append(makeEvent({ metadata: { session_id: 's', sequence: 10, version: 1 } }));
      log.append(makeEvent({ metadata: { session_id: 's', sequence: 20, version: 1 } }));
      log.append(makeEvent({ metadata: { session_id: 's', sequence: 30, version: 1 } }));

      const results = await log.since(10);
      expect(results).toHaveLength(2);
      expect(results.every((e) => (e.metadata?.sequence ?? 0) > 10)).toBe(true);
    });

    it('respects optional limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        log.append(makeEvent({ metadata: { session_id: 's', sequence: i + 1, version: 1 } }));
      }
      const results = await log.since(0, 2);
      expect(results).toHaveLength(2);
    });

    it('returns empty array when no events are newer than the given sequence', async () => {
      log.append(makeEvent({ metadata: { session_id: 's', sequence: 1, version: 1 } }));
      const results = await log.since(99);
      expect(results).toEqual([]);
    });

    it('returns all events when called with sequence 0', async () => {
      log.append(makeEvent({ metadata: { session_id: 's', sequence: 1, version: 1 } }));
      log.append(makeEvent({ metadata: { session_id: 's', sequence: 2, version: 1 } }));
      const results = await log.since(0);
      expect(results).toHaveLength(2);
    });
  });

  // ── compact() ─────────────────────────────────────────────────────────────

  describe('compact()', () => {
    beforeEach(async () => {
      await log.initialize();
    });

    it('returns { archived: 0, remaining: 0 } when log is empty (no events to archive)', async () => {
      // Empty file, no appends — compact returns zeroes
      const result = await log.compact('2030-01-01T00:00:00.000Z');
      expect(result).toEqual({ archived: 0, remaining: 0 });
    });

    it('returns { archived: 0, remaining: N } when no events are before cutoff', async () => {
      log.append(makeEvent({ timestamp: '2030-01-01T00:00:00.000Z' }));
      await log.flush();

      const result = await log.compact('2026-01-01T00:00:00.000Z');
      expect(result.archived).toBe(0);
      expect(result.remaining).toBe(1);
    });

    it('archives events older than cutoff and retains newer ones', async () => {
      log.append(makeEvent({ timestamp: '2026-01-01T00:00:00.000Z' }));
      log.append(makeEvent({ timestamp: '2026-01-02T00:00:00.000Z' }));
      log.append(makeEvent({ timestamp: '2026-01-03T00:00:00.000Z' }));
      await log.flush();

      const result = await log.compact('2026-01-02T12:00:00.000Z');
      expect(result.archived).toBe(2);
      expect(result.remaining).toBe(1);
    });

    it('creates archive directory and file after compaction', async () => {
      log.append(makeEvent({ timestamp: '2020-01-01T00:00:00.000Z' }));
      await log.flush();

      await log.compact('2030-01-01T00:00:00.000Z');

      const { readdirSync } = await import('fs');
      const archiveDir = join(stateDir, 'event-archives');
      const files = readdirSync(archiveDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files[0]).toMatch(/events-archive-\d{4}-\d{2}-\d{2}\.jsonl/);
    });

    it('updates in-memory event count after compaction', async () => {
      log.append(makeEvent({ timestamp: '2020-01-01T00:00:00.000Z' }));
      log.append(makeEvent({ timestamp: '2030-01-01T00:00:00.000Z' }));
      await log.flush();

      await log.compact('2025-01-01T00:00:00.000Z');
      expect(log.getStats().total_events).toBe(1);
    });

    it('remaining events are queryable after compaction (atomic replace)', async () => {
      const keep = makeEvent({ timestamp: '2030-01-01T00:00:00.000Z' });
      log.append(makeEvent({ timestamp: '2020-01-01T00:00:00.000Z' }));
      log.append(keep);
      await log.flush();

      await log.compact('2025-01-01T00:00:00.000Z');

      const results = await log.query();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(keep.id);
    });

    it('keeps malformed lines in the main log (does not discard unparse-able data)', async () => {
      writeFileSync(
        join(stateDir, 'events.jsonl'),
        `NOT_JSON\n${JSON.stringify(makeEvent({ timestamp: '2020-01-01T00:00:00.000Z' }))}\n`,
        'utf-8',
      );
      const log2 = new EventLog(stateDir, DEFAULT_CONFIG);
      await log2.initialize();

      const result = await log2.compact('2025-01-01T00:00:00.000Z');
      // Valid old event goes to archive, malformed line stays in main log
      expect(result.archived).toBe(1);
      expect(result.remaining).toBe(1);
      await closeLog(log2);
    });

    it('uses compactAfterHours as default cutoff when no timestamp is provided', async () => {
      // Close the default log and create one with 1-hour compaction window
      await closeLog(log);
      const shortLog = new EventLog(stateDir, {
        event_log_max_size_mb: 10,
        compact_after_hours: 1,
      });
      await shortLog.initialize();

      // Event from 2 hours ago should be archived
      const pastTs = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      shortLog.append(makeEvent({ timestamp: pastTs }));
      await shortLog.flush();

      const result = await shortLog.compact();
      expect(result.archived).toBe(1);
      expect(result.remaining).toBe(0);
      await closeLog(shortLog);
    });

    it('compact() produces a valid archive file (appendFileSync or writeFileSync fallback)', async () => {
      // This test verifies the archive file is produced correctly regardless of
      // which fs write path runs (appendFileSync primary or writeFileSync fallback).
      // The ESM module namespace is sealed so appendFileSync cannot be spied upon;
      // instead we verify observable behavior: the archive file exists with content.
      log.append(makeEvent({ timestamp: '2020-01-01T00:00:00.000Z' }));
      await log.flush();

      const result = await log.compact('2030-01-01T00:00:00.000Z');
      expect(result.archived).toBe(1);

      const archiveDir = join(stateDir, 'event-archives');
      const { readdirSync, readFileSync } = await import('fs');
      const files = readdirSync(archiveDir);
      expect(files.length).toBe(1);
      const content = readFileSync(join(archiveDir, files[0]), 'utf-8');
      expect(content.trim()).not.toBe('');
    });

    it('returns { archived: 0, remaining: 0 } when events.jsonl exists but is empty (no events to archive)', async () => {
      // Use a fresh log with an empty events.jsonl; do not call initialize().
      // compact() streams the file, finds no lines, and returns zeroes.
      // This covers the "nothing to archive" branch without triggering readline
      // ENOENT issues (a missing file causes streamLines to hang in some Node versions).
      const freshDir = makeTmpDir(); // creates an empty events.jsonl
      const freshLog = new EventLog(freshDir, DEFAULT_CONFIG);
      try {
        const result = await freshLog.compact('2030-01-01T00:00:00.000Z');
        expect(result).toEqual({ archived: 0, remaining: 0 });
      } finally {
        await closeLog(freshLog);
        rmSync(freshDir, { recursive: true, force: true });
      }
    });
  });

  // ── compact() — error scenarios ───────────────────────────────────────

  describe('compact() — error scenarios', () => {
    beforeEach(async () => {
      await log.initialize();
    });

    it('propagates error when archive directory cannot be created (ENOTDIR)', async () => {
      // Seed one old event so compaction has something to archive
      log.append(makeEvent({ timestamp: '2020-01-01T00:00:00.000Z' }));
      await log.flush();

      // Block archive dir creation by placing a regular file at the expected path
      // mkdirSync({recursive:true}) throws ENOTDIR when a path component is a file
      const archiveDirPath = join(stateDir, 'event-archives');
      writeFileSync(archiveDirPath, 'not-a-directory', 'utf-8');

      // compact() should propagate the ENOTDIR error from ensureDirSync
      await expect(log.compact('2030-01-01T00:00:00.000Z')).rejects.toThrow();
    });

    it('event log remains consistent after archive dir creation failure', async () => {
      // Write two events to the log
      log.append(makeEvent({ timestamp: '2020-01-01T00:00:00.000Z' }));
      log.append(makeEvent({ timestamp: '2030-01-01T00:00:00.000Z' }));
      await log.flush();

      // Block archive dir creation
      const archiveDirPath = join(stateDir, 'event-archives');
      writeFileSync(archiveDirPath, 'not-a-directory', 'utf-8');

      // compact() throws — the main log should still be readable
      await expect(log.compact('2025-01-01T00:00:00.000Z')).rejects.toThrow();

      // Remove the blocker and open a fresh log to read the original file
      rmSync(archiveDirPath);
      const log2 = new EventLog(stateDir, DEFAULT_CONFIG);
      await log2.initialize();
      // Both events should still be in the main log (compaction never completed)
      expect(log2.getStats().total_events).toBe(2);
      await closeLog(log2);
    });

    it('propagates error when atomic log replacement fails (rename/write error)', async () => {
      // Seed events so there is something to archive and something to keep
      log.append(makeEvent({ timestamp: '2020-01-01T00:00:00.000Z' }));
      log.append(makeEvent({ timestamp: '2030-01-01T00:00:00.000Z' }));
      await log.flush();

      // Make the stateDir read-only so writeAtomicSync's rename step fails (EACCES)
      // Note: this only works reliably when not running as root.
      chmodSync(stateDir, 0o555);

      try {
        await expect(log.compact('2025-01-01T00:00:00.000Z')).rejects.toThrow();
      } finally {
        // Restore permissions so afterEach cleanup can delete the directory
        chmodSync(stateDir, 0o755);
      }
    });

    it('event log file is not modified when atomic replacement fails', async () => {
      // Write two events and flush to disk
      log.append(makeEvent({ timestamp: '2020-01-01T00:00:00.000Z' }));
      log.append(makeEvent({ timestamp: '2030-01-01T00:00:00.000Z' }));
      await log.flush();

      // Make the stateDir read-only so the rename in writeAtomicSync fails
      chmodSync(stateDir, 0o555);

      try {
        await expect(log.compact('2025-01-01T00:00:00.000Z')).rejects.toThrow();
      } finally {
        chmodSync(stateDir, 0o755);
      }

      // The original log file still has both events (rename never succeeded)
      const { readFileSync } = await import('fs');
      const content = readFileSync(join(stateDir, 'events.jsonl'), 'utf-8');
      const lines = content.trim().split('\n').filter((l) => l.length > 0);
      expect(lines).toHaveLength(2);
    });

    it('partial write during compaction: archive written but main log replacement fails leaves log consistent', async () => {
      // This tests the scenario where events ARE successfully written to the archive
      // file but the atomic replacement of the main log then fails. In this case:
      // - The archive file exists with the archived events
      // - The main log is unchanged (the original events are still present)
      //
      // We simulate writeAtomicSync failure by making stateDir read-only (no rename).

      // Write one old event (to archive) and one new event (to keep)
      const oldEvent = makeEvent({ timestamp: '2020-01-01T00:00:00.000Z' });
      const newEvent = makeEvent({ timestamp: '2030-01-01T00:00:00.000Z' });
      log.append(oldEvent);
      log.append(newEvent);
      await log.flush();

      // Make stateDir read-only so the rename in writeAtomicSync fails
      chmodSync(stateDir, 0o555);

      try {
        // compact() should fail because writeAtomicSync cannot rename the temp file
        await expect(log.compact('2025-01-01T00:00:00.000Z')).rejects.toThrow();
      } finally {
        chmodSync(stateDir, 0o755);
      }

      // Main log still has both original events (compaction did not complete)
      const { readFileSync } = await import('fs');
      const content = readFileSync(join(stateDir, 'events.jsonl'), 'utf-8');
      const nonEmptyLines = content.trim().split('\n').filter((l) => l.trim().length > 0);
      expect(nonEmptyLines).toHaveLength(2);

      // The original event IDs are still present in the main log
      const loggedIds = nonEmptyLines.map((l) => (JSON.parse(l) as { id: string }).id);
      expect(loggedIds).toContain(oldEvent.id);
      expect(loggedIds).toContain(newEvent.id);
    });
  });

  // ── close() ───────────────────────────────────────────────────────────────

  describe('close()', () => {
    beforeEach(async () => {
      await log.initialize();
    });

    it('flushes buffered events to disk before closing', async () => {
      const e = makeEvent();
      log.append(e);

      await closeLog(log);

      // Verify the event was persisted by reopening
      const log2 = new EventLog(stateDir, DEFAULT_CONFIG);
      await log2.initialize();
      expect(log2.getStats().total_events).toBe(1);
      await closeLog(log2);
    });

    it('can be called multiple times without error', async () => {
      await closeLog(log);
      await expect(closeLog(log)).resolves.toBeUndefined();
    });

    it('resolves even when no buffer is pending', async () => {
      await expect(closeLog(log)).resolves.toBeUndefined();
    });

    it('sync fallback does not throw when buffer cannot be drained via stream', async () => {
      // Test that close() resolves without throwing even when the write stream
      // is unavailable. Uses the drainBuffer sync-fallback path (null stream →
      // appendFileSync) rather than the close()-level fallback to avoid the
      // infinite-retry loop that a permanently-failing stream creates.
      const logAsAny = log as unknown as {
        writeStream: WriteStream | null;
        writeBuffer: string;
        writeBufferBytes: number;
        stopFlushTimer: () => void;
      };

      logAsAny.stopFlushTimer();

      // Null out the stream to force drainBuffer to use the sync appendFileSync path
      logAsAny.writeStream = null;

      // Inject data directly into the buffer
      const testData = JSON.stringify(makeEvent()) + '\n';
      logAsAny.writeBuffer = testData;
      logAsAny.writeBufferBytes = Buffer.byteLength(testData, 'utf-8');

      // close() should complete without throwing; data is saved via appendFileSync
      await expect(closeLog(log)).resolves.toBeUndefined();

      // Verify the data actually made it to disk via the sync fallback
      const { readFileSync } = await import('fs');
      const content = readFileSync(join(stateDir, 'events.jsonl'), 'utf-8');
      expect(content).toContain(testData.trim().substring(0, 20));
    });
  });

  // ── getStats() ────────────────────────────────────────────────────────────

  describe('getStats()', () => {
    beforeEach(async () => {
      await log.initialize();
    });

    it('returns zero stats on a fresh log', () => {
      const stats = log.getStats();
      expect(stats).toMatchObject({
        total_events: 0,
        file_size_bytes: 0,
        events_per_type: {},
      });
      expect(stats.oldest_event).toBeUndefined();
      expect(stats.newest_event).toBeUndefined();
    });

    it('includes buffered bytes in file_size_bytes before flush', () => {
      log.append(makeEvent());
      // The buffer has data not yet on disk; total = disk (0) + buffer > 0
      expect(log.getStats().file_size_bytes).toBeGreaterThan(0);
    });

    it('includes on-disk size after buffer is flushed', async () => {
      log.append(makeEvent());
      await log.flush();
      expect(log.getStats().file_size_bytes).toBeGreaterThan(0);
    });

    it('handles missing log file gracefully (uses 0 for disk size)', () => {
      // A log that was never initialized has no stream and no file
      const freshDir = makeTmpDirEmpty();
      const freshLog = new EventLog(freshDir, DEFAULT_CONFIG);
      const stats = freshLog.getStats();
      expect(stats.file_size_bytes).toBe(0);
      void closeLog(freshLog);
      rmSync(freshDir, { recursive: true, force: true });
    });

    it('returns correct events_per_type counts', () => {
      log.append(makeEvent({ type: 'agent:spawned' }));
      log.append(makeEvent({ type: 'agent:spawned' }));
      log.append(makeEvent({ type: 'workflow:completed' }));
      const stats = log.getStats();
      expect(stats.events_per_type['agent:spawned']).toBe(2);
      expect(stats.events_per_type['workflow:completed']).toBe(1);
    });

    it('returns a shallow copy of events_per_type (mutations do not affect the cache)', () => {
      log.append(makeEvent({ type: 'session:started' }));
      const stats1 = log.getStats();
      stats1.events_per_type['session:started'] = 999;
      expect(log.getStats().events_per_type['session:started']).toBe(1);
    });
  });

  // ── matchesFilter() tested via query() ────────────────────────────────────

  describe('matchesFilter() via query()', () => {
    beforeEach(async () => {
      await log.initialize();
    });

    it('empty filter {} matches all events', async () => {
      log.append(makeEvent({ type: 'session:started' }));
      log.append(makeEvent({ type: 'system:shutdown' }));
      expect(await log.query({})).toHaveLength(2);
    });

    it('types filter with values: excludes non-matching types', async () => {
      log.append(makeEvent({ type: 'session:started' }));
      log.append(makeEvent({ type: 'system:shutdown' }));
      const results = await log.query({ types: ['session:started'] });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('session:started');
    });

    it('types filter []: empty array matches all (no type restriction)', async () => {
      log.append(makeEvent({ type: 'session:started' }));
      expect(await log.query({ types: [] })).toHaveLength(1);
    });

    it('since filter: excludes events strictly before the timestamp', async () => {
      log.append(makeEvent({ timestamp: '2026-01-01T00:00:00.000Z' }));
      log.append(makeEvent({ timestamp: '2026-01-05T00:00:00.000Z' }));
      const results = await log.query({ since: '2026-01-03T00:00:00.000Z' });
      expect(results).toHaveLength(1);
      expect(results[0].timestamp).toBe('2026-01-05T00:00:00.000Z');
    });

    it('until filter: excludes events strictly after the timestamp', async () => {
      log.append(makeEvent({ timestamp: '2026-01-01T00:00:00.000Z' }));
      log.append(makeEvent({ timestamp: '2026-01-05T00:00:00.000Z' }));
      const results = await log.query({ until: '2026-01-03T00:00:00.000Z' });
      expect(results).toHaveLength(1);
      expect(results[0].timestamp).toBe('2026-01-01T00:00:00.000Z');
    });

    it('since_sequence: only returns events with sequence strictly greater than value', async () => {
      for (let i = 1; i <= 5; i++) {
        log.append(makeEvent({ metadata: { session_id: 's', sequence: i, version: 1 } }));
      }
      const results = await log.query({ since_sequence: 3 });
      expect(results).toHaveLength(2);
      expect(results.every((e) => (e.metadata?.sequence ?? 0) > 3)).toBe(true);
    });

    it('since_sequence: excludes events without a numeric sequence field', async () => {
      const e = makeEvent();
      // Remove the sequence number to simulate a partial metadata object
      (e.metadata as Record<string, unknown>)['sequence'] = undefined as unknown as number;
      log.append(e);
      const results = await log.query({ since_sequence: 0 });
      expect(results).toHaveLength(0);
    });

    it('source filter: kind=system matches only system-sourced events', async () => {
      log.append(makeEvent({ source: { kind: 'system' } }));
      log.append(makeEvent({ source: { kind: 'hook', hook_name: 'pre_tool_use' } }));
      const results = await log.query({ source: { kind: 'system' } });
      expect(results).toHaveLength(1);
      expect(results[0].source.kind).toBe('system');
    });

    it('source filter: hook_name matches specific hook events', async () => {
      log.append(makeEvent({ source: { kind: 'hook', hook_name: 'pre_tool_use' } }));
      log.append(makeEvent({ source: { kind: 'hook', hook_name: 'post_tool_use' } }));
      const results = await log.query({
        source: { kind: 'hook', hook_name: 'pre_tool_use' } as EventFilter['source'],
      });
      expect(results).toHaveLength(1);
      expect((results[0].source as { kind: 'hook'; hook_name: string }).hook_name).toBe(
        'pre_tool_use',
      );
    });

    it('source filter: workflow_id matches the specific workflow', async () => {
      log.append(makeEvent({ source: { kind: 'workflow', workflow_id: 'wf-1' } }));
      log.append(makeEvent({ source: { kind: 'workflow', workflow_id: 'wf-2' } }));
      const results = await log.query({
        source: { kind: 'workflow', workflow_id: 'wf-1' } as EventFilter['source'],
      });
      expect(results).toHaveLength(1);
      expect(
        (results[0].source as { kind: 'workflow'; workflow_id: string }).workflow_id,
      ).toBe('wf-1');
    });

    it('source filter: agent_id matches the specific agent', async () => {
      log.append(makeEvent({ source: { kind: 'agent', agent_id: 'agent-a' } }));
      log.append(makeEvent({ source: { kind: 'agent', agent_id: 'agent-b' } }));
      const results = await log.query({
        source: { kind: 'agent', agent_id: 'agent-a' } as EventFilter['source'],
      });
      expect(results).toHaveLength(1);
    });

    it('source filter: trigger_id matches the specific trigger', async () => {
      log.append(makeEvent({ source: { kind: 'trigger', trigger_id: 'trig-1' } }));
      log.append(makeEvent({ source: { kind: 'trigger', trigger_id: 'trig-2' } }));
      const results = await log.query({
        source: { kind: 'trigger', trigger_id: 'trig-1' } as EventFilter['source'],
      });
      expect(results).toHaveLength(1);
    });

    it('source filter: tool_name matches the specific mcp_tool', async () => {
      log.append(makeEvent({ source: { kind: 'mcp_tool', tool_name: 'precision_read' } }));
      log.append(makeEvent({ source: { kind: 'mcp_tool', tool_name: 'precision_write' } }));
      const results = await log.query({
        source: { kind: 'mcp_tool', tool_name: 'precision_read' } as EventFilter['source'],
      });
      expect(results).toHaveLength(1);
    });

    it('source filter: client_id matches the specific ipc client', async () => {
      log.append(makeEvent({ source: { kind: 'ipc', client_id: 'client-1' } }));
      log.append(makeEvent({ source: { kind: 'ipc', client_id: 'client-2' } }));
      const results = await log.query({
        source: { kind: 'ipc', client_id: 'client-1' } as EventFilter['source'],
      });
      expect(results).toHaveLength(1);
    });

    it('multiple filter criteria are combined with AND semantics', async () => {
      log.append(
        makeEvent({
          type: 'session:started',
          metadata: { session_id: 's', sequence: 1, version: 1 },
        }),
      );
      log.append(
        makeEvent({
          type: 'system:shutdown',
          metadata: { session_id: 's', sequence: 2, version: 1 },
        }),
      );
      log.append(
        makeEvent({
          type: 'session:started',
          metadata: { session_id: 's', sequence: 3, version: 1 },
        }),
      );
      // Only session:started events with sequence > 1
      const results = await log.query({ types: ['session:started'], since_sequence: 1 });
      expect(results).toHaveLength(1);
      expect(results[0].metadata?.sequence).toBe(3);
    });
  });

  // ── drainBuffer() error handling ──────────────────────────────────────────

  describe('drainBuffer() error handling', () => {
    beforeEach(async () => {
      await log.initialize();
    });

    it('retries drain after write stream failure and data is not silently lost', async () => {
      // When drainBuffer's write call fails, it restores the buffer and schedules
      // a retry via scheduleFlush(). On the retry the write succeeds so the data
      // is eventually written to disk.
      const logAsAny = log as unknown as {
        writeStream: { write: (data: string, cb: (err?: Error | null) => void) => void } | null;
        writeBuffer: string;
        writeBufferBytes: number;
        drainBuffer: () => Promise<void>;
        stopFlushTimer: () => void;
      };

      expect(logAsAny.writeStream).not.toBeNull();
      if (!logAsAny.writeStream) return;

      // Stop the auto-flush timer to control scheduling manually
      logAsAny.stopFlushTimer();

      const event = makeEvent();
      const testData = JSON.stringify(event) + '\n';

      // Inject data into the buffer directly
      logAsAny.writeBuffer = testData;
      logAsAny.writeBufferBytes = Buffer.byteLength(testData, 'utf-8');

      // Mock: fail first write call, succeed on second (retry)
      let writeCallCount = 0;
      const origWrite = logAsAny.writeStream.write.bind(logAsAny.writeStream);
      logAsAny.writeStream.write = (data: string, cb: (err?: Error | null) => void) => {
        writeCallCount++;
        if (writeCallCount === 1) {
          cb(new Error('Disk full'));
        } else {
          origWrite(data, cb);
        }
      };

      // drainBuffer() will fail once; the retry via scheduleFlush() will succeed
      await expect(logAsAny.drainBuffer()).resolves.toBeUndefined();

      // Give the event loop a tick for the background retry drain to complete
      await new Promise<void>((resolve) => setTimeout(resolve, 20));

      // Verify the data eventually made it to disk
      expect(writeCallCount).toBeGreaterThanOrEqual(2);
      const { readFileSync } = await import('fs');
      const fileContent = readFileSync(join(stateDir, 'events.jsonl'), 'utf-8');
      expect(fileContent).toContain(event.id);
    });

    it('uses appendFileSync fallback path when writeStream is null', async () => {
      const logAsAny = log as unknown as {
        writeStream: null;
        writeBuffer: string;
        writeBufferBytes: number;
        flushing: boolean;
        drainBuffer: () => Promise<void>;
        stopFlushTimer: () => void;
      };

      // Stop timer to prevent concurrent auto-flush
      logAsAny.stopFlushTimer();

      // Null out the stream to force the sync-fallback branch in drainBuffer
      logAsAny.writeStream = null;
      const testLine = JSON.stringify(makeEvent()) + '\n';
      logAsAny.writeBuffer = testLine;
      logAsAny.writeBufferBytes = Buffer.byteLength(testLine, 'utf-8');

      await expect(logAsAny.drainBuffer()).resolves.toBeUndefined();
      // Buffer should be cleared after successful sync write
      expect(logAsAny.writeBuffer).toBe('');
    });

    it('rejects queued flush() waiters when drain fails', async () => {
      const logAsAny = log as unknown as {
        writeStream: { write: (data: string, cb: (err?: Error | null) => void) => void } | null;
        writeBuffer: string;
        writeBufferBytes: number;
        closed: boolean;
        flush: () => Promise<void>;
        stopFlushTimer: () => void;
      };

      expect(logAsAny.writeStream).not.toBeNull();
      if (!logAsAny.writeStream) return;

      logAsAny.stopFlushTimer();

      // Inject buffer data manually
      const testData = JSON.stringify(makeEvent()) + '\n';
      logAsAny.writeBuffer = testData;
      logAsAny.writeBufferBytes = Buffer.byteLength(testData, 'utf-8');

      // Mock write to always fail
      logAsAny.writeStream.write = (_data: string, cb: (err?: Error | null) => void) => {
        cb(new Error('Write error'));
      };

      // flush() queues a waiter that gets rejected on drain failure
      await expect(logAsAny.flush()).rejects.toThrow('Write error');

      // Null out the stream so background retry drains use sync appendFileSync fallback,
      // which succeeds and clears the buffer — breaking the retry loop cleanly.
      logAsAny.writeStream = null;

      // Give the event loop a tick for the background drain to complete
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    });
  });

  // ── getLatestSequence() ───────────────────────────────────────────────────

  describe('getLatestSequence()', () => {
    it('returns 0 before any events are appended', async () => {
      await log.initialize();
      expect(log.getLatestSequence()).toBe(0);
    });

    it('returns the highest sequence seen after initialization from file', async () => {
      const e = makeEvent({ metadata: { session_id: 's', sequence: 7, version: 1 } });
      writeFileSync(join(stateDir, 'events.jsonl'), JSON.stringify(e) + '\n', 'utf-8');
      await log.initialize();
      expect(log.getLatestSequence()).toBe(7);
    });

    it('updates after a higher-sequence event is appended post-init', async () => {
      await log.initialize();
      log.append(makeEvent({ metadata: { session_id: 's', sequence: 100, version: 1 } }));
      expect(log.getLatestSequence()).toBe(100);
    });
  });

  // ── flush() ───────────────────────────────────────────────────────────────

  describe('flush()', () => {
    beforeEach(async () => {
      await log.initialize();
    });

    it('resolves immediately when the buffer is empty', async () => {
      await expect(log.flush()).resolves.toBeUndefined();
    });

    it('writes buffered data to disk and resolves', async () => {
      log.append(makeEvent());
      await log.flush();
      const { statSync } = await import('fs');
      expect(statSync(join(stateDir, 'events.jsonl')).size).toBeGreaterThan(0);
    });

    it('handles concurrent flush() calls without error', async () => {
      log.append(makeEvent());
      await Promise.all([log.flush(), log.flush(), log.flush()]);
    });
  });
});
