/**
 * dead-letter.test.ts
 * Tests for DeadLetterQueue — Layer 1.
 * All tests disable persistence (persist: false) to avoid disk I/O.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeadLetterQueue } from '../dead-letter.js';
import type { DeadLetterEntry, RuntimeEvent } from '../types.js';

// Mock node:fs at the module level (vi.mock is hoisted by Vitest)
// Tests that use persist:false are unaffected since fs is never called.
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); }),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}));

import * as fsMod from 'node:fs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _evtCounter = 0;
function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: overrides.id ?? `evt-${++_evtCounter}`,
    source: 'internal',
    type: overrides.type ?? 'test:event',
    payload: {},
    timestamp: Date.now(),
    priority: 0,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<DeadLetterEntry> = {}): DeadLetterEntry {
  return {
    event: overrides.event ?? makeEvent(),
    error: overrides.error ?? 'Something went wrong',
    dead_lettered_at: overrides.dead_lettered_at ?? Date.now(),
    attempt_count: overrides.attempt_count ?? 3,
    trigger_id: overrides.trigger_id ?? 'trigger-1',
    ...overrides,
  };
}

function makeDLQ(maxSize?: number): DeadLetterQueue {
  return new DeadLetterQueue({ persist: false, max_size: maxSize });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DeadLetterQueue', () => {
  let dlq: DeadLetterQueue;

  beforeEach(() => {
    dlq = makeDLQ();
  });

  // ── Initial state ──────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts empty', () => {
      expect(dlq.size()).toBe(0);
    });

    it('getAll returns empty array', () => {
      expect(dlq.getAll()).toEqual([]);
    });
  });

  // ── add ────────────────────────────────────────────────────────────────────

  describe('add', () => {
    it('adds an entry and increments size', () => {
      dlq.add(makeEntry());
      expect(dlq.size()).toBe(1);
    });

    it('adds multiple entries', () => {
      dlq.add(makeEntry());
      dlq.add(makeEntry());
      dlq.add(makeEntry());
      expect(dlq.size()).toBe(3);
    });

    it('stores the entry correctly', () => {
      const event = makeEvent({ id: 'specific-id', type: 'user:fail' });
      const entry = makeEntry({ event, error: 'handler threw', attempt_count: 2, trigger_id: 'my-trigger' });
      dlq.add(entry);
      const found = dlq.getById('specific-id');
      expect(found).toBeDefined();
      expect(found!.error).toBe('handler threw');
      expect(found!.attempt_count).toBe(2);
      expect(found!.trigger_id).toBe('my-trigger');
    });
  });

  // ── getById ────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns entry when found', () => {
      const event = makeEvent({ id: 'find-me' });
      dlq.add(makeEntry({ event }));
      expect(dlq.getById('find-me')).toBeDefined();
    });

    it('returns undefined when not found', () => {
      expect(dlq.getById('nonexistent')).toBeUndefined();
    });

    it('finds correct entry among multiple', () => {
      const evt1 = makeEvent({ id: 'a' });
      const evt2 = makeEvent({ id: 'b' });
      const evt3 = makeEvent({ id: 'c' });
      dlq.add(makeEntry({ event: evt1, error: 'error-a' }));
      dlq.add(makeEntry({ event: evt2, error: 'error-b' }));
      dlq.add(makeEntry({ event: evt3, error: 'error-c' }));
      expect(dlq.getById('b')!.error).toBe('error-b');
    });
  });

  // ── getByType ──────────────────────────────────────────────────────────────

  describe('getByType', () => {
    it('returns all entries of the given type', () => {
      dlq.add(makeEntry({ event: makeEvent({ type: 'user:fail' }) }));
      dlq.add(makeEntry({ event: makeEvent({ type: 'user:fail' }) }));
      dlq.add(makeEntry({ event: makeEvent({ type: 'other:event' }) }));
      const results = dlq.getByType('user:fail');
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.event.type === 'user:fail')).toBe(true);
    });

    it('returns empty array when no entries match type', () => {
      dlq.add(makeEntry({ event: makeEvent({ type: 'other:event' }) }));
      expect(dlq.getByType('user:fail')).toEqual([]);
    });
  });

  // ── getAll ─────────────────────────────────────────────────────────────────

  describe('getAll', () => {
    it('returns all entries', () => {
      dlq.add(makeEntry({ event: makeEvent({ id: 'x1' }) }));
      dlq.add(makeEntry({ event: makeEvent({ id: 'x2' }) }));
      expect(dlq.getAll()).toHaveLength(2);
    });

    it('returns a shallow copy so mutations do not affect internal state', () => {
      dlq.add(makeEntry({ event: makeEvent({ id: 'original' }) }));
      const all = dlq.getAll();
      all.pop();
      expect(dlq.size()).toBe(1);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('removes entry by event ID and returns true', () => {
      const event = makeEvent({ id: 'to-remove' });
      dlq.add(makeEntry({ event }));
      expect(dlq.remove('to-remove')).toBe(true);
      expect(dlq.size()).toBe(0);
    });

    it('returns false when event ID not found', () => {
      expect(dlq.remove('nonexistent')).toBe(false);
    });

    it('removes only the targeted entry', () => {
      const evt1 = makeEvent({ id: 'keep' });
      const evt2 = makeEvent({ id: 'delete' });
      dlq.add(makeEntry({ event: evt1 }));
      dlq.add(makeEntry({ event: evt2 }));
      dlq.remove('delete');
      expect(dlq.size()).toBe(1);
      expect(dlq.getById('keep')).toBeDefined();
    });
  });

  // ── clear ──────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all entries', () => {
      dlq.add(makeEntry());
      dlq.add(makeEntry());
      dlq.clear();
      expect(dlq.size()).toBe(0);
      expect(dlq.getAll()).toEqual([]);
    });

    it('is a no-op on empty queue', () => {
      dlq.clear();
      expect(dlq.size()).toBe(0);
    });
  });

  // ── replay ─────────────────────────────────────────────────────────────────

  describe('replay', () => {
    it('returns the event and removes it from the queue', async () => {
      const event = makeEvent({ id: 'replay-me', type: 'agent:action' });
      dlq.add(makeEntry({ event }));
      const returned = await dlq.replay('replay-me', async () => {});
      expect(returned).toBeDefined();
      expect(returned!.id).toBe('replay-me');
      expect(returned!.type).toBe('agent:action');
      expect(dlq.size()).toBe(0);
    });

    it('returns null when event ID not found', async () => {
      expect(await dlq.replay('nonexistent', async () => {})).toBeNull();
    });

    it('leaves other entries intact after replay', async () => {
      const evt1 = makeEvent({ id: 'stay' });
      const evt2 = makeEvent({ id: 'go' });
      dlq.add(makeEntry({ event: evt1 }));
      dlq.add(makeEntry({ event: evt2 }));
      await dlq.replay('go', async () => {});
      expect(dlq.size()).toBe(1);
      expect(dlq.getById('stay')).toBeDefined();
    });

    it('keeps entry in DLQ when re-enqueue callback throws', async () => {
      const event = makeEvent({ id: 'keep-me', type: 'agent:action' });
      dlq.add(makeEntry({ event }));
      const returned = await dlq.replay('keep-me', async () => {
        throw new Error('re-enqueue failed');
      });
      expect(returned).toBeNull();
      expect(dlq.size()).toBe(1);
      expect(dlq.getById('keep-me')).toBeDefined();
    });
  });

  // ── max size eviction ──────────────────────────────────────────────────────

  describe('max_size eviction (oldest-first)', () => {
    it('evicts oldest entry when max_size is exceeded', () => {
      const dlqSmall = makeDLQ(3);
      const evt1 = makeEvent({ id: 'oldest' });
      const evt2 = makeEvent({ id: 'second' });
      const evt3 = makeEvent({ id: 'third' });
      const evt4 = makeEvent({ id: 'newest' });
      dlqSmall.add(makeEntry({ event: evt1 }));
      dlqSmall.add(makeEntry({ event: evt2 }));
      dlqSmall.add(makeEntry({ event: evt3 }));
      dlqSmall.add(makeEntry({ event: evt4 })); // triggers eviction
      expect(dlqSmall.size()).toBe(3);
      expect(dlqSmall.getById('oldest')).toBeUndefined();
      expect(dlqSmall.getById('newest')).toBeDefined();
    });

    it('evicts multiple oldest when adding several beyond max', () => {
      const dlqSmall = makeDLQ(2);
      ['a', 'b', 'c', 'd'].forEach((id) => {
        dlqSmall.add(makeEntry({ event: makeEvent({ id }) }));
      });
      expect(dlqSmall.size()).toBe(2);
      // Only 'c' and 'd' remain
      expect(dlqSmall.getById('a')).toBeUndefined();
      expect(dlqSmall.getById('b')).toBeUndefined();
      expect(dlqSmall.getById('c')).toBeDefined();
      expect(dlqSmall.getById('d')).toBeDefined();
    });

    it('enforces max_size of 1', () => {
      const dlqOne = makeDLQ(1);
      dlqOne.add(makeEntry({ event: makeEvent({ id: 'first' }) }));
      dlqOne.add(makeEntry({ event: makeEvent({ id: 'second' }) }));
      expect(dlqOne.size()).toBe(1);
      expect(dlqOne.getById('first')).toBeUndefined();
      expect(dlqOne.getById('second')).toBeDefined();
    });
  });

  // ── size tracking ──────────────────────────────────────────────────────────

  describe('size tracking', () => {
    it('tracks size correctly through add/remove/clear cycle', () => {
      expect(dlq.size()).toBe(0);
      dlq.add(makeEntry({ event: makeEvent({ id: '1' }) }));
      expect(dlq.size()).toBe(1);
      dlq.add(makeEntry({ event: makeEvent({ id: '2' }) }));
      expect(dlq.size()).toBe(2);
      dlq.remove('1');
      expect(dlq.size()).toBe(1);
      dlq.clear();
      expect(dlq.size()).toBe(0);
    });
  });

  // ── persistence disabled ───────────────────────────────────────────────────

  describe('persistence (disabled)', () => {
    it('constructs successfully with persist: false', () => {
      expect(() => new DeadLetterQueue({ persist: false })).not.toThrow();
    });

    it('does not attempt to load from disk when persist is false', () => {
      // Since no file exists, load would fail if persist=true with a bad path.
      // With persist:false this should simply succeed.
      const q = new DeadLetterQueue({ persist: false, file_path: '/nonexistent/path/dlq.json' });
      expect(q.size()).toBe(0);
    });
  });

  describe('persistence (enabled) load/persist round-trip', () => {
    beforeEach(() => {
      vi.mocked(fsMod.writeFileSync).mockReset();
      vi.mocked(fsMod.mkdirSync).mockReset();
      vi.mocked(fsMod.renameSync).mockReset();
      // Default: readFileSync throws ENOENT (no file on disk)
      vi.mocked(fsMod.readFileSync).mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
    });

    it('calls writeFileSync when adding an entry with persist: true', () => {
      const q = new DeadLetterQueue({ persist: true, file_path: '/tmp/dlq-test.json' });
      q.add(makeEntry({ event: makeEvent({ id: 'persist-test' }) }));
      expect(vi.mocked(fsMod.writeFileSync)).toHaveBeenCalled();
    });

    it('loads entries from disk when file exists on construction with persist: true', () => {
      const event = makeEvent({ id: 'loaded-event' });
      const entry = makeEntry({ event });
      vi.mocked(fsMod.readFileSync).mockReturnValue(JSON.stringify([entry]));

      const q = new DeadLetterQueue({ persist: true, file_path: '/tmp/dlq-test.json' });
      expect(q.size()).toBe(1);
      expect(q.getById('loaded-event')).toBeDefined();
    });
  });
});
