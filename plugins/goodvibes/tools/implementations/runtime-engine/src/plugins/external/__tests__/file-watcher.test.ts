/**
 * FileWatcher Tests
 *
 * Tests scan() behavior: directory creation on ENOENT, error propagation,
 * JSON filtering, max_files_per_scan cap, successful ingestion, deduplication,
 * error file handling, and move failure fallback paths.
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { FileWatcher, DEFAULT_FILE_WATCHER_CONFIG } from '../file-watcher.js';
import type { FileWatcherConfig } from '../file-watcher.js';
import type { EventQueueInterface } from '../../../core/types.js';
import { NormalizerRegistry } from '../normalizers/index.js';

// ─── Mock node:fs/promises ────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<FileWatcherConfig> = {}): FileWatcherConfig {
  return {
    ...DEFAULT_FILE_WATCHER_CONFIG,
    incoming_dir: '/incoming',
    processed_dir: '/processed',
    error_dir: '/errors',
    ...overrides,
  };
}

function makeQueue(): EventQueueInterface {
  return {
    enqueue: vi.fn(),
    dequeue: vi.fn(),
    peek: vi.fn(),
    size: vi.fn().mockReturnValue(0),
    getStats: vi.fn().mockReturnValue({ pending: 0 }),
    isEmpty: vi.fn().mockReturnValue(true),
    clear: vi.fn(),
    drain: vi.fn().mockReturnValue([]),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as EventQueueInterface;
}

function makeNormalizers(): NormalizerRegistry {
  const reg = new NormalizerRegistry();
  // Register a simple passthrough normalizer
  reg.register('test', (rawPayload) => ({
    id: 'evt-1',
    timestamp: Date.now(),
    type: 'external:test',
    source: { kind: 'external', source_name: 'test' },
    payload: { type: 'external:test', data: rawPayload },
  }) as unknown as ReturnType<NormalizerRegistry['normalize']>);
  return reg;
}

function makeWatcher(
  overrides: Partial<FileWatcherConfig> = {},
  queue?: EventQueueInterface,
  normalizers?: NormalizerRegistry,
): FileWatcher {
  return new FileWatcher(
    queue ?? makeQueue(),
    normalizers ?? makeNormalizers(),
    makeConfig(overrides),
  );
}

/** Build a valid DropFilePayload JSON string */
function validPayload(source = 'test', payload: unknown = { data: 'value' }): string {
  return JSON.stringify({ source, payload });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FileWatcher', () => {
  const readdirMock = vi.mocked(fs.readdir);
  const readFileMock = vi.mocked(fs.readFile);
  const renameMock = vi.mocked(fs.rename);
  const unlinkMock = vi.mocked(fs.unlink);
  const mkdirMock = vi.mocked(fs.mkdir);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── DEFAULT_FILE_WATCHER_CONFIG ──────────────────────────────────────────

  describe('DEFAULT_FILE_WATCHER_CONFIG', () => {
    it('exports sensible defaults', () => {
      expect(DEFAULT_FILE_WATCHER_CONFIG.incoming_dir).toBe('.goodvibes/events/incoming');
      expect(DEFAULT_FILE_WATCHER_CONFIG.processed_dir).toBe('.goodvibes/events/processed');
      expect(DEFAULT_FILE_WATCHER_CONFIG.error_dir).toBe('.goodvibes/events/errors');
      expect(DEFAULT_FILE_WATCHER_CONFIG.max_files_per_scan).toBe(50);
    });
  });

  // ── ensureDirs() ──────────────────────────────────────────────────────────

  describe('ensureDirs()', () => {
    it('creates all three directories recursively', async () => {
      const watcher = makeWatcher();
      await watcher.ensureDirs();
      expect(mkdirMock).toHaveBeenCalledWith('/incoming', { recursive: true });
      expect(mkdirMock).toHaveBeenCalledWith('/processed', { recursive: true });
      expect(mkdirMock).toHaveBeenCalledWith('/errors', { recursive: true });
      expect(mkdirMock).toHaveBeenCalledTimes(3);
    });
  });

  // ── scan() — directory errors ─────────────────────────────────────────────

  describe('scan() — directory errors', () => {
    it('returns 0 and calls ensureDirs when incoming dir does not exist (ENOENT)', async () => {
      const enoentErr = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      readdirMock.mockRejectedValueOnce(enoentErr);

      const watcher = makeWatcher();
      const result = await watcher.scan();

      expect(result).toEqual({ events_ingested: 0 });
      expect(mkdirMock).toHaveBeenCalledTimes(3);
    });

    it('rethrows non-ENOENT readdir errors', async () => {
      const permErr = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
      readdirMock.mockRejectedValueOnce(permErr);

      const watcher = makeWatcher();
      await expect(watcher.scan()).rejects.toThrow('Permission denied');
    });
  });

  // ── scan() — file filtering ───────────────────────────────────────────────

  describe('scan() — file filtering', () => {
    it('ignores non-JSON files', async () => {
      readdirMock.mockResolvedValueOnce(
        ['event.json', 'readme.txt', 'data.xml', 'valid.json'] as unknown as never[],
      );
      readFileMock.mockResolvedValue(validPayload() as unknown as string);

      const queue = makeQueue();
      const watcher = makeWatcher({}, queue);
      const result = await watcher.scan();

      // Only 2 JSON files processed
      expect(result.events_ingested).toBe(2);
      expect(vi.mocked(queue.enqueue)).toHaveBeenCalledTimes(2);
    });

    it('returns 0 events_ingested when directory is empty', async () => {
      readdirMock.mockResolvedValueOnce([] as unknown as never[]);
      const watcher = makeWatcher();
      const result = await watcher.scan();
      expect(result).toEqual({ events_ingested: 0 });
    });
  });

  // ── scan() — max_files_per_scan cap ───────────────────────────────────────

  describe('scan() — max_files_per_scan cap', () => {
    it('processes at most max_files_per_scan files', async () => {
      const files = Array.from({ length: 10 }, (_, i) => `event${i}.json`);
      readdirMock.mockResolvedValueOnce(files as unknown as never[]);
      readFileMock.mockResolvedValue(validPayload() as unknown as string);

      const queue = makeQueue();
      const watcher = makeWatcher({ max_files_per_scan: 3 }, queue);
      const result = await watcher.scan();

      expect(result.events_ingested).toBe(3);
      expect(vi.mocked(queue.enqueue)).toHaveBeenCalledTimes(3);
    });
  });

  // ── scan() — successful ingestion ─────────────────────────────────────────

  describe('scan() — successful ingestion', () => {
    it('reads, normalizes, enqueues, and moves file to processed dir', async () => {
      readdirMock.mockResolvedValueOnce(['event.json'] as unknown as never[]);
      readFileMock.mockResolvedValue(validPayload('test', { x: 1 }) as unknown as string);

      const queue = makeQueue();
      const watcher = makeWatcher({}, queue);
      const result = await watcher.scan();

      expect(result.events_ingested).toBe(1);
      expect(vi.mocked(queue.enqueue)).toHaveBeenCalledOnce();

      // File should be moved to processed dir (with UUID prefix)
      expect(renameMock).toHaveBeenCalledOnce();
      const [from, to] = renameMock.mock.calls[0] as [string, string];
      expect(from).toBe('/incoming/event.json');
      expect(to).toMatch(/^\/processed\//u);
      expect(to).toContain('event.json');
    });

    it('enqueues events from multiple files in a single scan', async () => {
      readdirMock.mockResolvedValueOnce(
        ['a.json', 'b.json', 'c.json'] as unknown as never[],
      );
      readFileMock.mockResolvedValue(validPayload() as unknown as string);

      const queue = makeQueue();
      const watcher = makeWatcher({}, queue);
      const result = await watcher.scan();

      expect(result.events_ingested).toBe(3);
      expect(vi.mocked(queue.enqueue)).toHaveBeenCalledTimes(3);
    });
  });

  // ── scan() — deduplication ────────────────────────────────────────────────

  describe('scan() — deduplication', () => {
    it('skips file already in enqueuedFiles set (rename failure leaves file in incoming)', async () => {
      // First scan: file processed but move fails — file stays in incoming
      readdirMock.mockResolvedValueOnce(['event.json'] as unknown as never[]);
      readFileMock.mockResolvedValue(validPayload() as unknown as string);
      // Simulate rename failure so file stays in incoming but enqueuedFiles is NOT cleared
      renameMock.mockRejectedValueOnce(new Error('rename failed'));

      const queue = makeQueue();
      const watcher = makeWatcher({}, queue);
      await watcher.scan();
      expect(vi.mocked(queue.enqueue)).toHaveBeenCalledTimes(1);

      // Second scan: same file still in incoming — should be skipped
      readdirMock.mockResolvedValueOnce(['event.json'] as unknown as never[]);
      readFileMock.mockResolvedValue(validPayload() as unknown as string);
      renameMock.mockResolvedValue(undefined);

      const result2 = await watcher.scan();
      expect(result2.events_ingested).toBe(0);
      // enqueue should NOT have been called again
      expect(vi.mocked(queue.enqueue)).toHaveBeenCalledTimes(1);
    });

    it('allows re-ingestion of file after successful move (cleared from enqueuedFiles)', async () => {
      // First scan: success, file moved
      readdirMock.mockResolvedValueOnce(['event.json'] as unknown as never[]);
      readFileMock.mockResolvedValue(validPayload() as unknown as string);

      const queue = makeQueue();
      const watcher = makeWatcher({}, queue);
      await watcher.scan();
      expect(vi.mocked(queue.enqueue)).toHaveBeenCalledTimes(1);

      // Second scan: same filename again (simulating a new file with same name)
      readdirMock.mockResolvedValueOnce(['event.json'] as unknown as never[]);
      readFileMock.mockResolvedValue(validPayload() as unknown as string);

      const result2 = await watcher.scan();
      expect(result2.events_ingested).toBe(1);
      expect(vi.mocked(queue.enqueue)).toHaveBeenCalledTimes(2);
    });
  });

  // ── scan() — error handling ───────────────────────────────────────────────

  describe('scan() — error handling', () => {
    it('moves file to errors dir when JSON parse fails', async () => {
      readdirMock.mockResolvedValueOnce(['bad.json'] as unknown as never[]);
      readFileMock.mockResolvedValue('not-valid-json' as unknown as string);

      const queue = makeQueue();
      const watcher = makeWatcher({}, queue);
      const result = await watcher.scan();

      expect(result.events_ingested).toBe(0);
      expect(vi.mocked(queue.enqueue)).not.toHaveBeenCalled();
      // File should be moved to errors dir
      expect(renameMock).toHaveBeenCalledOnce();
      const [from, to] = renameMock.mock.calls[0] as [string, string];
      expect(from).toBe('/incoming/bad.json');
      expect(to).toBe('/errors/bad.json');
    });

    it('moves file to errors dir when payload structure is invalid (missing source)', async () => {
      readdirMock.mockResolvedValueOnce(['bad.json'] as unknown as never[]);
      // Missing 'source' field
      readFileMock.mockResolvedValue(
        JSON.stringify({ payload: { data: 'x' } }) as unknown as string,
      );

      const watcher = makeWatcher();
      const result = await watcher.scan();

      expect(result.events_ingested).toBe(0);
      const [, to] = renameMock.mock.calls[0] as [string, string];
      expect(to).toBe('/errors/bad.json');
    });

    it('moves file to errors dir when payload structure is invalid (empty source)', async () => {
      readdirMock.mockResolvedValueOnce(['bad.json'] as unknown as never[]);
      readFileMock.mockResolvedValue(
        JSON.stringify({ source: '', payload: {} }) as unknown as string,
      );

      const watcher = makeWatcher();
      const result = await watcher.scan();

      expect(result.events_ingested).toBe(0);
    });

    it('moves file to errors dir when payload structure is invalid (missing payload field)', async () => {
      readdirMock.mockResolvedValueOnce(['bad.json'] as unknown as never[]);
      readFileMock.mockResolvedValue(
        JSON.stringify({ source: 'test' }) as unknown as string,
      );

      const watcher = makeWatcher();
      const result = await watcher.scan();

      expect(result.events_ingested).toBe(0);
    });

    it('unlinks error file when move to errors dir fails', async () => {
      readdirMock.mockResolvedValueOnce(['bad.json'] as unknown as never[]);
      readFileMock.mockResolvedValue('invalid-json' as unknown as string);
      // Rename to errors fails
      renameMock.mockRejectedValueOnce(new Error('cross-device link'));

      const watcher = makeWatcher();
      await watcher.scan();

      // Should fall back to unlink
      expect(unlinkMock).toHaveBeenCalledWith('/incoming/bad.json');
    });

    it('survives when both move to errors and unlink fail (logs debug)', async () => {
      readdirMock.mockResolvedValueOnce(['stubborn.json'] as unknown as never[]);
      readFileMock.mockResolvedValue('invalid-json' as unknown as string);
      renameMock.mockRejectedValueOnce(new Error('cross-device link'));
      unlinkMock.mockRejectedValueOnce(new Error('permission denied'));

      const watcher = makeWatcher();
      // Should not throw
      const result = await watcher.scan();
      expect(result.events_ingested).toBe(0);
    });

    it('isolates errors per file — subsequent files still processed', async () => {
      readdirMock.mockResolvedValueOnce(
        ['bad.json', 'good.json'] as unknown as never[],
      );
      readFileMock
        .mockResolvedValueOnce('invalid-json' as unknown as string)
        .mockResolvedValueOnce(validPayload() as unknown as string);

      const queue = makeQueue();
      const watcher = makeWatcher({}, queue);
      const result = await watcher.scan();

      // bad.json fails, good.json succeeds
      expect(result.events_ingested).toBe(1);
      expect(vi.mocked(queue.enqueue)).toHaveBeenCalledTimes(1);
    });
  });

  // ── scan() — move failure on success path ─────────────────────────────────

  describe('scan() — move failure on success path', () => {
    it('logs error but does not throw when rename to processed fails', async () => {
      readdirMock.mockResolvedValueOnce(['event.json'] as unknown as never[]);
      readFileMock.mockResolvedValue(validPayload() as unknown as string);
      // Rename fails (to processed dir)
      renameMock.mockRejectedValueOnce(new Error('rename failed'));

      const queue = makeQueue();
      const watcher = makeWatcher({}, queue);
      // Should not throw — move failure is non-fatal
      const result = await watcher.scan();

      expect(result.events_ingested).toBe(1);
      expect(vi.mocked(queue.enqueue)).toHaveBeenCalledTimes(1);
    });
  });

  // ── scan() — normalizer fallback ──────────────────────────────────────────

  describe('scan() — normalizer fallback', () => {
    it('uses generic normalizer for unknown source via NormalizerRegistry.normalize fallback', async () => {
      readdirMock.mockResolvedValueOnce(['event.json'] as unknown as never[]);
      readFileMock.mockResolvedValue(
        JSON.stringify({ source: 'unknown-source', payload: { x: 1 } }) as unknown as string,
      );

      // Use a default registry that has no 'unknown-source' normalizer
      const { NormalizerRegistry: Reg, normalizeGeneric } = await import('../normalizers/index.js');
      const reg = new Reg();
      // normalizeGeneric will be used as fallback internally
      const queue = makeQueue();
      const watcher = new FileWatcher(queue, reg, makeConfig());
      const result = await watcher.scan();

      expect(result.events_ingested).toBe(1);
      expect(vi.mocked(queue.enqueue)).toHaveBeenCalledOnce();
    });
  });
});
