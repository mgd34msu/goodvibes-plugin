import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeadLetterQueue } from '../dead-letter.js';
import type { DeadLetterEntry } from '../dead-letter.js';
import type { RuntimeEvent } from '../../types.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockReadFileSync = vi.fn();
vi.mock('node:fs', () => ({ readFileSync: (...args: unknown[]) => mockReadFileSync(...args) }));

const mockWriteJsonSync = vi.fn();
vi.mock('../../state/file-io.js', () => ({
  writeJsonSync: (...args: unknown[]) => mockWriteJsonSync(...args),
}));

// ─── Factories ────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Omit<RuntimeEvent, 'source' | 'type' | 'payload'>> & { source?: unknown; type?: string; payload?: unknown } = {}): RuntimeEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 9)}`,
    source: { kind: 'external', origin: 'test' },
    type: 'session:started' as RuntimeEvent['type'],
    payload: {} as RuntimeEvent['payload'],
    timestamp: Date.now(),
    priority: 5,
    ...overrides,
  } as RuntimeEvent;
}

function makeEntry(overrides: Partial<DeadLetterEntry> = {}): DeadLetterEntry {
  return {
    event: makeEvent(),
    error: 'handler threw',
    dead_lettered_at: Date.now(),
    attempt_count: 3,
    trigger_id: 'trigger-1',
    ...overrides,
  };
}

function makeQueue(options: ConstructorParameters<typeof DeadLetterQueue>[0] = {}): DeadLetterQueue {
  // Default: ENOENT so load() is a no-op
  mockReadFileSync.mockImplementationOnce(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
  return new DeadLetterQueue({ file_path: '/tmp/test-dlq.json', ...options });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DeadLetterQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Construction ─────────────────────────────────────────────────────────

  describe('construction', () => {
    it('starts empty when file does not exist (ENOENT)', () => {
      const dlq = makeQueue();
      expect(dlq.size()).toBe(0);
    });

    it('loads valid entries from disk on construction', () => {
      const entry = makeEntry({ event: makeEvent({ id: 'loaded-1' }) });
      mockReadFileSync.mockReturnValueOnce(JSON.stringify([entry]));
      const dlq = new DeadLetterQueue({ file_path: '/tmp/test-dlq.json' });
      expect(dlq.size()).toBe(1);
      expect(dlq.getById('loaded-1')).toEqual(entry);
    });

    it('skips entries missing required fields during load', () => {
      const validEntry = makeEntry({ event: makeEvent({ id: 'valid-1' }) });
      const invalidEntry = { event: { id: 'bad' } }; // missing required fields
      mockReadFileSync.mockReturnValueOnce(JSON.stringify([validEntry, invalidEntry]));
      const dlq = new DeadLetterQueue({ file_path: '/tmp/test-dlq.json' });
      expect(dlq.size()).toBe(1);
      expect(dlq.getById('valid-1')).toBeDefined();
    });

    it('starts empty when file contains a non-array', () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify({ not: 'array' }));
      const dlq = new DeadLetterQueue({ file_path: '/tmp/test-dlq.json' });
      expect(dlq.size()).toBe(0);
    });

    it('starts empty on unexpected read error (non-ENOENT)', () => {
      mockReadFileSync.mockImplementationOnce(() => {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      });
      const dlq = new DeadLetterQueue({ file_path: '/tmp/test-dlq.json' });
      expect(dlq.size()).toBe(0);
    });

    it('does not load from disk when persist is false', () => {
      // If persist=false, load() is never called, so readFileSync is never called
      const dlq = new DeadLetterQueue({ file_path: '/tmp/test-dlq.json', persist: false });
      expect(mockReadFileSync).not.toHaveBeenCalled();
      expect(dlq.size()).toBe(0);
    });

    it('resolves a relative file_path against cwd', () => {
      mockReadFileSync.mockImplementationOnce(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      expect(() => new DeadLetterQueue({ file_path: 'relative/dlq.json' })).not.toThrow();
    });

    it('uses default file path when file_path is not provided', () => {
      mockReadFileSync.mockImplementationOnce(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      const dlq = new DeadLetterQueue();
      expect(dlq.size()).toBe(0);
    });
  });

  // ─── add ──────────────────────────────────────────────────────────────────

  describe('add', () => {
    it('adds an entry and increments size', () => {
      const dlq = makeQueue();
      dlq.add(makeEntry());
      expect(dlq.size()).toBe(1);
    });

    it('persists to disk after add (when persist=true)', () => {
      const dlq = makeQueue();
      dlq.add(makeEntry());
      expect(mockWriteJsonSync).toHaveBeenCalledOnce();
    });

    it('does not persist to disk when persist is false', () => {
      const dlq = makeQueue({ persist: false });
      dlq.add(makeEntry());
      expect(mockWriteJsonSync).not.toHaveBeenCalled();
    });

    it('evicts oldest entry when max_size is exceeded', () => {
      const dlq = makeQueue({ max_size: 3 });
      const e1 = makeEntry({ event: makeEvent({ id: 'e1' }) });
      const e2 = makeEntry({ event: makeEvent({ id: 'e2' }) });
      const e3 = makeEntry({ event: makeEvent({ id: 'e3' }) });
      const e4 = makeEntry({ event: makeEvent({ id: 'e4' }) });
      dlq.add(e1);
      dlq.add(e2);
      dlq.add(e3);
      dlq.add(e4); // should evict e1
      expect(dlq.size()).toBe(3);
      expect(dlq.getById('e1')).toBeUndefined();
      expect(dlq.getById('e4')).toBeDefined();
    });

    it('keeps exactly max_size entries when adding many', () => {
      const dlq = makeQueue({ max_size: 5 });
      for (let i = 0; i < 10; i++) {
        dlq.add(makeEntry({ event: makeEvent({ id: `evt-${i}` }) }));
      }
      expect(dlq.size()).toBe(5);
    });
  });

  // ─── getById ──────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns the entry with the matching event ID', () => {
      const dlq = makeQueue();
      const entry = makeEntry({ event: makeEvent({ id: 'find-me' }) });
      dlq.add(entry);
      const found = dlq.getById('find-me');
      expect(found).toBeDefined();
      expect(found?.event.id).toBe('find-me');
    });

    it('returns undefined when no entry matches', () => {
      const dlq = makeQueue();
      dlq.add(makeEntry());
      expect(dlq.getById('not-present')).toBeUndefined();
    });

    it('returns undefined on empty queue', () => {
      const dlq = makeQueue();
      expect(dlq.getById('any')).toBeUndefined();
    });
  });

  // ─── getByType ────────────────────────────────────────────────────────────

  describe('getByType', () => {
    it('returns all entries with the matching event type', () => {
      const dlq = makeQueue();
      dlq.add(makeEntry({ event: makeEvent({ type: 'auth:failed' }) }));
      dlq.add(makeEntry({ event: makeEvent({ type: 'auth:failed' }) }));
      dlq.add(makeEntry({ event: makeEvent({ type: 'other:event' }) }));
      const results = dlq.getByType('auth:failed');
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.event.type as string === 'auth:failed')).toBe(true);
    });

    it('returns empty array when no entries match the type', () => {
      const dlq = makeQueue();
      dlq.add(makeEntry({ event: makeEvent({ type: 'some:event' }) }));
      expect(dlq.getByType('missing:type')).toEqual([]);
    });

    it('returns empty array when queue is empty', () => {
      const dlq = makeQueue();
      expect(dlq.getByType('any:type')).toEqual([]);
    });
  });

  // ─── getAll ───────────────────────────────────────────────────────────────

  describe('getAll', () => {
    it('returns a copy of all entries', () => {
      const dlq = makeQueue();
      const e1 = makeEntry({ event: makeEvent({ id: 'a' }) });
      const e2 = makeEntry({ event: makeEvent({ id: 'b' }) });
      dlq.add(e1);
      dlq.add(e2);
      const all = dlq.getAll();
      expect(all).toHaveLength(2);
    });

    it('returned array is a shallow copy (push does not affect queue)', () => {
      const dlq = makeQueue();
      dlq.add(makeEntry());
      const all = dlq.getAll();
      all.push(makeEntry());
      expect(dlq.size()).toBe(1);
    });

    it('returns empty array when queue is empty', () => {
      const dlq = makeQueue();
      expect(dlq.getAll()).toEqual([]);
    });
  });

  // ─── size ─────────────────────────────────────────────────────────────────

  describe('size', () => {
    it('returns 0 on empty queue', () => {
      const dlq = makeQueue();
      expect(dlq.size()).toBe(0);
    });

    it('increments with each add', () => {
      const dlq = makeQueue();
      dlq.add(makeEntry());
      dlq.add(makeEntry());
      expect(dlq.size()).toBe(2);
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('removes the entry by event ID and returns true', () => {
      const dlq = makeQueue();
      const entry = makeEntry({ event: makeEvent({ id: 'remove-me' }) });
      dlq.add(entry);
      expect(dlq.remove('remove-me')).toBe(true);
      expect(dlq.size()).toBe(0);
      expect(dlq.getById('remove-me')).toBeUndefined();
    });

    it('returns false when event ID is not found', () => {
      const dlq = makeQueue();
      expect(dlq.remove('ghost-id')).toBe(false);
    });

    it('persists after successful remove (when persist=true)', () => {
      const dlq = makeQueue();
      const entry = makeEntry({ event: makeEvent({ id: 'rm-persist' }) });
      dlq.add(entry);
      mockWriteJsonSync.mockClear();
      dlq.remove('rm-persist');
      expect(mockWriteJsonSync).toHaveBeenCalledOnce();
    });

    it('does not persist when remove returns false (not found)', () => {
      const dlq = makeQueue();
      mockWriteJsonSync.mockClear();
      dlq.remove('ghost-id');
      expect(mockWriteJsonSync).not.toHaveBeenCalled();
    });

    it('removes only the matching entry when multiple entries exist', () => {
      const dlq = makeQueue();
      dlq.add(makeEntry({ event: makeEvent({ id: 'keep-1' }) }));
      dlq.add(makeEntry({ event: makeEvent({ id: 'remove-me' }) }));
      dlq.add(makeEntry({ event: makeEvent({ id: 'keep-2' }) }));
      dlq.remove('remove-me');
      expect(dlq.size()).toBe(2);
      expect(dlq.getById('keep-1')).toBeDefined();
      expect(dlq.getById('keep-2')).toBeDefined();
    });
  });

  // ─── clear ────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all entries', () => {
      const dlq = makeQueue();
      dlq.add(makeEntry());
      dlq.add(makeEntry());
      dlq.clear();
      expect(dlq.size()).toBe(0);
      expect(dlq.getAll()).toEqual([]);
    });

    it('persists after clear (when persist=true)', () => {
      const dlq = makeQueue();
      dlq.add(makeEntry());
      mockWriteJsonSync.mockClear();
      dlq.clear();
      expect(mockWriteJsonSync).toHaveBeenCalledOnce();
    });

    it('is a no-op on empty queue without throwing', () => {
      const dlq = makeQueue();
      expect(() => dlq.clear()).not.toThrow();
    });
  });

  // ─── replay ───────────────────────────────────────────────────────────────

  describe('replay', () => {
    it('returns null when event ID is not found', async () => {
      const dlq = makeQueue();
      const result = await dlq.replay('ghost-id', vi.fn());
      expect(result).toBeNull();
    });

    it('calls reenqueue with the event and removes entry on success', async () => {
      const dlq = makeQueue();
      const entry = makeEntry({ event: makeEvent({ id: 'replay-1' }) });
      dlq.add(entry);
      const reenqueue = vi.fn().mockResolvedValue(undefined);
      const result = await dlq.replay('replay-1', reenqueue);
      expect(reenqueue).toHaveBeenCalledWith(entry.event);
      expect(result).toEqual(entry.event);
      expect(dlq.getById('replay-1')).toBeUndefined();
    });

    it('keeps entry in DLQ when reenqueue callback throws', async () => {
      const dlq = makeQueue();
      const entry = makeEntry({ event: makeEvent({ id: 'replay-fail' }) });
      dlq.add(entry);
      const reenqueue = vi.fn().mockRejectedValue(new Error('requeue error'));
      const result = await dlq.replay('replay-fail', reenqueue);
      expect(result).toBeNull();
      expect(dlq.getById('replay-fail')).toBeDefined();
    });

    it('supports synchronous reenqueue callbacks', async () => {
      const dlq = makeQueue();
      const entry = makeEntry({ event: makeEvent({ id: 'sync-replay' }) });
      dlq.add(entry);
      const reenqueue = vi.fn(); // returns undefined (sync)
      const result = await dlq.replay('sync-replay', reenqueue);
      expect(result).toEqual(entry.event);
      expect(dlq.getById('sync-replay')).toBeUndefined();
    });

    it('does not call reenqueue when event is not found', async () => {
      const dlq = makeQueue();
      const reenqueue = vi.fn();
      await dlq.replay('no-such-event', reenqueue);
      expect(reenqueue).not.toHaveBeenCalled();
    });
  });

  // ─── persist failure ──────────────────────────────────────────────────────

  describe('persist failure', () => {
    it('logs error but does not throw when writeJsonSync fails on add', () => {
      const dlq = makeQueue();
      mockWriteJsonSync.mockImplementationOnce(() => { throw new Error('disk full'); });
      expect(() => dlq.add(makeEntry())).not.toThrow();
    });
  });
});
