import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventLog } from '../event-log.js';
import type { RuntimeEvent } from '../../../shared/events.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

// Suppress logger output
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

let tmpDirCounter = 0;

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `event-log-test-${process.pid}-${++tmpDirCounter}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeEvent(
  type: string,
  overrides: Partial<RuntimeEvent> = {},
): RuntimeEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    type: type as RuntimeEvent['type'],
    source: { kind: 'system' },
    payload: { type: type as never, data: {} as never },
    priority: 0,
    metadata: {
      session_id: 'test-session',
      sequence: 1,
      version: 1,
    },
    ...overrides,
  };
}

function makeSequencedEvent(seq: number, type = 'session:started', tsOverride?: number): RuntimeEvent {
  return makeEvent(type, {
    timestamp: tsOverride ?? (Date.now() + seq * 1000),
    metadata: { session_id: 'test-session', sequence: seq, version: 1 },
  });
}

// ─── Default config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  event_log_max_size_mb: 10,
  compact_after_hours: 24,
};

// ─── EventLog ─────────────────────────────────────────────────────────────────

describe('EventLog', () => {
  let tmpDir: string;
  let log: EventLog;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    log = new EventLog(tmpDir, DEFAULT_CONFIG);
  });

  afterEach(async () => {
    await log.close().catch(() => { /* already closed */ });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── initialize ───────────────────────────────────────────────────────────

  describe('initialize', () => {
    it('starts fresh when log file does not exist', async () => {
      await expect(log.initialize()).resolves.toBeUndefined();
      const stats = log.getStats();
      expect(stats.total_events).toBe(0);
      expect(stats.oldest_event).toBeUndefined();
      expect(stats.newest_event).toBeUndefined();
    });

    it('recovers event count and sequence from existing JSONL file', async () => {
      // Pre-populate the log file
      const logPath = path.join(tmpDir, 'events.jsonl');
      const events = [
        makeSequencedEvent(5, 'session:started'),
        makeSequencedEvent(10, 'hook:pre_tool_use'),
        makeSequencedEvent(7, 'session:ending'),
      ];
      fs.writeFileSync(logPath, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

      await log.initialize();
      const stats = log.getStats();
      expect(stats.total_events).toBe(3);
      // Latest seq from the events above is 10
      expect(log.getLatestSequence()).toBe(10);
    });

    it('recovers per-type event counts', async () => {
      const logPath = path.join(tmpDir, 'events.jsonl');
      const events = [
        makeSequencedEvent(1, 'session:started'),
        makeSequencedEvent(2, 'session:started'),
        makeSequencedEvent(3, 'hook:pre_tool_use'),
      ];
      fs.writeFileSync(logPath, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

      await log.initialize();
      const stats = log.getStats();
      expect(stats.events_per_type['session:started']).toBe(2);
      expect(stats.events_per_type['hook:pre_tool_use']).toBe(1);
    });

    it('recovers oldest and newest timestamps', async () => {
      const logPath = path.join(tmpDir, 'events.jsonl');
      const ts1 = new Date('2024-01-01T00:00:00.000Z').getTime();
      const ts2 = new Date('2024-06-15T12:00:00.000Z').getTime();
      const events = [
        makeSequencedEvent(1, 'session:started', ts1),
        makeSequencedEvent(2, 'session:ending', ts2),
      ];
      fs.writeFileSync(logPath, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

      await log.initialize();
      const stats = log.getStats();
      expect(stats.oldest_event).toBe(ts1);
      expect(stats.newest_event).toBe(ts2);
    });

    it('skips malformed lines without throwing', async () => {
      const logPath = path.join(tmpDir, 'events.jsonl');
      const goodEvent = makeSequencedEvent(1, 'session:started');
      const malformedLine = 'not valid json {{{{';
      fs.writeFileSync(logPath, [JSON.stringify(goodEvent), malformedLine].join('\n') + '\n');

      await expect(log.initialize()).resolves.toBeUndefined();
      const stats = log.getStats();
      expect(stats.total_events).toBe(1);
    });

    it('handles empty lines in the file gracefully', async () => {
      const logPath = path.join(tmpDir, 'events.jsonl');
      const goodEvent = makeSequencedEvent(1, 'session:started');
      // Include blank lines
      fs.writeFileSync(logPath, `\n${JSON.stringify(goodEvent)}\n\n`);

      await expect(log.initialize()).resolves.toBeUndefined();
      expect(log.getStats().total_events).toBe(1);
    });
  });

  // ─── append ─────────────────────────────────────────────────────────────────

  describe('append', () => {
    it('updates total_events count', async () => {
      await log.initialize();
      log.append(makeSequencedEvent(1));
      log.append(makeSequencedEvent(2));
      expect(log.getStats().total_events).toBe(2);
    });

    it('updates per-type event counts', async () => {
      await log.initialize();
      log.append(makeSequencedEvent(1, 'session:started'));
      log.append(makeSequencedEvent(2, 'session:started'));
      log.append(makeSequencedEvent(3, 'hook:pre_tool_use'));
      const stats = log.getStats();
      expect(stats.events_per_type['session:started']).toBe(2);
      expect(stats.events_per_type['hook:pre_tool_use']).toBe(1);
    });

    it('updates oldest and newest event timestamps', async () => {
      await log.initialize();
      const ts1 = new Date('2024-03-01T00:00:00.000Z').getTime();
      const ts2 = new Date('2024-03-02T00:00:00.000Z').getTime();
      log.append(makeSequencedEvent(1, 'session:started', ts1));
      log.append(makeSequencedEvent(2, 'session:started', ts2));
      const stats = log.getStats();
      expect(stats.oldest_event).toBe(ts1);
      expect(stats.newest_event).toBe(ts2);
    });

    it('updates latestSeq when new sequence is higher', async () => {
      await log.initialize();
      log.append(makeSequencedEvent(3));
      log.append(makeSequencedEvent(10));
      log.append(makeSequencedEvent(7)); // lower — should not update latestSeq
      expect(log.getLatestSequence()).toBe(10);
    });

    it('is a no-op when closed', async () => {
      await log.initialize();
      await log.close();
      // Should not throw
      expect(() => log.append(makeSequencedEvent(1))).not.toThrow();
      // Count stays 0 since closed before any appends
      expect(log.getStats().total_events).toBe(0);
    });

    it('persists events to the JSONL file after flush', async () => {
      await log.initialize();
      const event = makeSequencedEvent(1, 'session:started');
      log.append(event);
      await log.flush();

      const logPath = path.join(tmpDir, 'events.jsonl');
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.trim().split('\n').filter((l) => l.trim());
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0] as string) as RuntimeEvent;
      expect(parsed.type).toBe('session:started');
    });

    it('multiple appends produce multiple JSONL lines', async () => {
      await log.initialize();
      log.append(makeSequencedEvent(1, 'session:started'));
      log.append(makeSequencedEvent(2, 'hook:pre_tool_use'));
      log.append(makeSequencedEvent(3, 'session:ended'));
      await log.flush();

      const logPath = path.join(tmpDir, 'events.jsonl');
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.trim().split('\n').filter((l) => l.trim());
      expect(lines).toHaveLength(3);
      // Each line is valid JSON
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });
  });

  // ─── flush ─────────────────────────────────────────────────────────────────

  describe('flush', () => {
    it('resolves immediately when buffer is empty', async () => {
      await log.initialize();
      await expect(log.flush()).resolves.toBeUndefined();
    });

    it('resolves after flushing buffered events to disk', async () => {
      await log.initialize();
      log.append(makeSequencedEvent(1));
      await expect(log.flush()).resolves.toBeUndefined();

      const logPath = path.join(tmpDir, 'events.jsonl');
      expect(fs.existsSync(logPath)).toBe(true);
    });
  });

  // ─── getStats ──────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns zero stats on a fresh log', async () => {
      await log.initialize();
      const stats = log.getStats();
      expect(stats.total_events).toBe(0);
      expect(stats.events_per_type).toEqual({});
      expect(stats.oldest_event).toBeUndefined();
      expect(stats.newest_event).toBeUndefined();
    });

    it('includes buffered-but-not-yet-flushed bytes in file_size_bytes', async () => {
      await log.initialize();
      const statsBefore = log.getStats();
      log.append(makeSequencedEvent(1));
      const statsAfter = log.getStats();
      // Buffered bytes increase the reported size
      expect(statsAfter.file_size_bytes).toBeGreaterThan(statsBefore.file_size_bytes);
    });

    it('returns file_size_bytes of 0 when log file does not exist', async () => {
      // Not calling initialize, file doesn't exist
      const stats = log.getStats();
      expect(stats.file_size_bytes).toBe(0);
    });
  });

  // ─── query ─────────────────────────────────────────────────────────────────

  describe('query', () => {
    it('returns empty array when log file does not exist', async () => {
      await log.initialize();
      const results = await log.query();
      expect(results).toEqual([]);
    });

    it('returns all events with no filter', async () => {
      await log.initialize();
      log.append(makeSequencedEvent(1, 'session:started'));
      log.append(makeSequencedEvent(2, 'hook:pre_tool_use'));
      await log.flush();

      const results = await log.query();
      expect(results).toHaveLength(2);
    });

    it('filters by event types', async () => {
      await log.initialize();
      log.append(makeSequencedEvent(1, 'session:started'));
      log.append(makeSequencedEvent(2, 'hook:pre_tool_use'));
      log.append(makeSequencedEvent(3, 'session:ended'));
      await log.flush();

      const results = await log.query({ types: ['hook:pre_tool_use'] });
      expect(results).toHaveLength(1);
      expect(results[0]?.type).toBe('hook:pre_tool_use');
    });

    it('filters by since timestamp', async () => {
      await log.initialize();
      const ts1 = new Date('2024-01-01T00:00:00.000Z').getTime();
      const ts2 = new Date('2024-06-01T00:00:00.000Z').getTime();
      log.append(makeSequencedEvent(1, 'session:started', ts1));
      log.append(makeSequencedEvent(2, 'session:started', ts2));
      await log.flush();

      const results = await log.query({ since: new Date('2024-03-01T00:00:00.000Z').getTime() });
      expect(results).toHaveLength(1);
      expect(results[0]?.timestamp).toBe(ts2);
    });

    it('filters by until timestamp', async () => {
      await log.initialize();
      const ts1 = new Date('2024-01-01T00:00:00.000Z').getTime();
      const ts2 = new Date('2024-06-01T00:00:00.000Z').getTime();
      log.append(makeSequencedEvent(1, 'session:started', ts1));
      log.append(makeSequencedEvent(2, 'session:started', ts2));
      await log.flush();

      const results = await log.query({ until: new Date('2024-03-01T00:00:00.000Z').getTime() });
      expect(results).toHaveLength(1);
      expect(results[0]?.timestamp).toBe(ts1);
    });

    it('filters by since_sequence', async () => {
      await log.initialize();
      log.append(makeSequencedEvent(1));
      log.append(makeSequencedEvent(5));
      log.append(makeSequencedEvent(10));
      await log.flush();

      const results = await log.query({ since_sequence: 5 });
      expect(results).toHaveLength(1);
      expect(results[0]?.metadata.sequence).toBe(10);
    });

    it('filters by correlation_id', async () => {
      await log.initialize();
      const e1 = makeEvent('session:started', {
        metadata: { session_id: 'test', sequence: 1, version: 1, correlation_id: 'corr-A' },
      });
      const e2 = makeEvent('session:ending', {
        metadata: { session_id: 'test', sequence: 2, version: 1, correlation_id: 'corr-B' },
      });
      log.append(e1);
      log.append(e2);
      await log.flush();

      const results = await log.query({ correlation_id: 'corr-A' });
      expect(results).toHaveLength(1);
      expect(results[0]?.metadata.correlation_id).toBe('corr-A');
    });

    it('respects limit for early termination', async () => {
      await log.initialize();
      for (let i = 1; i <= 10; i++) {
        log.append(makeSequencedEvent(i));
      }
      await log.flush();

      const results = await log.query({ limit: 3 });
      expect(results).toHaveLength(3);
    });

    it('skips malformed lines during query', async () => {
      await log.initialize();
      await log.flush();

      // Manually write a malformed line to the log file
      const logPath = path.join(tmpDir, 'events.jsonl');
      const goodEvent = makeSequencedEvent(1, 'session:started');
      fs.writeFileSync(logPath, `${JSON.stringify(goodEvent)}\nnot-valid-json\n`);

      // Re-create log to point at existing file, don't re-initialize
      const log2 = new EventLog(tmpDir, DEFAULT_CONFIG);
      await log2.initialize();
      const results = await log2.query();
      expect(results).toHaveLength(1);
      await log2.close();
    });

    it('filters by source kind', async () => {
      await log.initialize();
      const hookEvent = makeEvent('hook:pre_tool_use', {
        source: { kind: 'internal', hook_name: 'test' },
        metadata: { session_id: 'test', sequence: 1, version: 1 },
      });
      const systemEvent = makeEvent('session:started', {
        source: { kind: 'system' },
        metadata: { session_id: 'test', sequence: 2, version: 1 },
      });
      log.append(hookEvent);
      log.append(systemEvent);
      await log.flush();

      const results = await log.query({ source: { kind: 'internal' } });
      expect(results).toHaveLength(1);
      expect(results[0]?.source.kind).toBe('internal');
    });
  });

  // ─── since ─────────────────────────────────────────────────────────────────

  describe('since', () => {
    it('returns events after the given sequence number', async () => {
      await log.initialize();
      log.append(makeSequencedEvent(1));
      log.append(makeSequencedEvent(2));
      log.append(makeSequencedEvent(3));
      await log.flush();

      const results = await log.since(1);
      expect(results).toHaveLength(2);
      expect(results.map((e) => e.metadata.sequence)).toEqual([2, 3]);
    });

    it('respects limit parameter', async () => {
      await log.initialize();
      for (let i = 1; i <= 5; i++) {
        log.append(makeSequencedEvent(i));
      }
      await log.flush();

      const results = await log.since(0, 2);
      expect(results).toHaveLength(2);
    });
  });

  // ─── getLatestSequence ─────────────────────────────────────────────────────

  describe('getLatestSequence', () => {
    it('returns 0 on a fresh log', async () => {
      await log.initialize();
      expect(log.getLatestSequence()).toBe(0);
    });

    it('returns the highest sequence seen', async () => {
      await log.initialize();
      log.append(makeSequencedEvent(5));
      log.append(makeSequencedEvent(3)); // lower — should not change latestSeq
      log.append(makeSequencedEvent(8));
      expect(log.getLatestSequence()).toBe(8);
    });
  });

  // ─── compact ──────────────────────────────────────────────────────────────

  describe('compact', () => {
    it('returns 0 archived and 0 remaining when file does not exist', async () => {
      await log.initialize();
      // Don't append anything, so file doesn't exist
      const result = await log.compact(new Date('2024-01-01T00:00:00.000Z').getTime());
      expect(result).toEqual({ archived: 0, remaining: 0 });
    });

    it('archives events older than the cutoff timestamp', async () => {
      await log.initialize();

      const oldTs = new Date('2024-01-01T00:00:00.000Z').getTime();
      const newTs = new Date('2025-01-01T00:00:00.000Z').getTime();
      log.append(makeSequencedEvent(1, 'session:started', oldTs));
      log.append(makeSequencedEvent(2, 'session:started', newTs));
      await log.flush();

      const result = await log.compact(new Date('2024-06-01T00:00:00.000Z').getTime());
      expect(result.archived).toBe(1);
      expect(result.remaining).toBe(1);
    });

    it('creates an archive JSONL file in the archive directory', async () => {
      await log.initialize();

      const oldTs = new Date('2024-01-01T00:00:00.000Z').getTime();
      log.append(makeSequencedEvent(1, 'session:started', oldTs));
      await log.flush();

      await log.compact(new Date('2024-06-01T00:00:00.000Z').getTime());

      const archiveDir = path.join(tmpDir, 'event-archives');
      expect(fs.existsSync(archiveDir)).toBe(true);
      const archiveFiles = fs.readdirSync(archiveDir);
      expect(archiveFiles.length).toBeGreaterThan(0);
    });

    it('atomically replaces the main log with only retained events', async () => {
      await log.initialize();

      const oldTs = new Date('2024-01-01T00:00:00.000Z').getTime();
      const newTs = new Date('2025-01-01T00:00:00.000Z').getTime();
      log.append(makeSequencedEvent(1, 'session:started', oldTs));
      log.append(makeSequencedEvent(2, 'hook:pre_tool_use', newTs));
      await log.flush();

      await log.compact(new Date('2024-06-01T00:00:00.000Z').getTime());

      const logPath = path.join(tmpDir, 'events.jsonl');
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.trim().split('\n').filter((l) => l.trim());
      expect(lines).toHaveLength(1);
      const kept = JSON.parse(lines[0] as string) as RuntimeEvent;
      expect(kept.timestamp).toBe(newTs);
    });

    it('returns 0 archived and remaining count when no events are older than cutoff', async () => {
      await log.initialize();

      const newTs = new Date('2025-06-01T00:00:00.000Z').getTime();
      log.append(makeSequencedEvent(1, 'session:started', newTs));
      await log.flush();

      const result = await log.compact(new Date('2020-01-01T00:00:00.000Z').getTime());
      expect(result.archived).toBe(0);
      expect(result.remaining).toBe(1);
    });
  });

  // ─── close ─────────────────────────────────────────────────────────────────

  describe('close', () => {
    it('resolves without error on a fresh log', async () => {
      await log.initialize();
      await expect(log.close()).resolves.toBeUndefined();
    });

    it('flushes pending buffer on close', async () => {
      await log.initialize();
      log.append(makeSequencedEvent(1));
      // Do not manually flush before close
      await log.close();

      const logPath = path.join(tmpDir, 'events.jsonl');
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.trim().split('\n').filter((l) => l.trim());
      expect(lines).toHaveLength(1);
    });

    it('prevents further appends after close', async () => {
      await log.initialize();
      await log.close();
      log.append(makeSequencedEvent(1));
      // Count should still be 0 (no events before close)
      expect(log.getStats().total_events).toBe(0);
    });
  });

  // ─── JSONL serialisation ────────────────────────────────────────────────────

  describe('JSONL serialisation', () => {
    it('each event is written as one line of valid JSON', async () => {
      await log.initialize();
      const event = makeSequencedEvent(1, 'session:started');
      log.append(event);
      await log.flush();

      const logPath = path.join(tmpDir, 'events.jsonl');
      const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0] as string) as RuntimeEvent;
      expect(parsed.id).toBe(event.id);
      expect(parsed.type).toBe(event.type);
      expect(parsed.metadata.sequence).toBe(1);
    });

    it('round-trips an event with all metadata fields', async () => {
      await log.initialize();
      const event = makeEvent('workflow:created', {
        metadata: {
          session_id: 'sess-abc',
          correlation_id: 'corr-xyz',
          causation_id: 'cause-123',
          sequence: 42,
          version: 1,
        },
      });
      log.append(event);
      await log.flush();

      const results = await log.query();
      expect(results).toHaveLength(1);
      expect(results[0]?.metadata.correlation_id).toBe('corr-xyz');
      expect(results[0]?.metadata.causation_id).toBe('cause-123');
      expect(results[0]?.metadata.sequence).toBe(42);
    });
  });
});
