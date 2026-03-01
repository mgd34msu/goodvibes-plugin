import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventScheduler } from '../scheduler.js';
import type { SchedulerConfig } from '../scheduler.js';

// Mock logger to suppress output
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock event factories to return predictable objects
vi.mock('../../../extensions/events/factories.js', () => ({
  createTimeEvent: vi.fn((params) => ({ ...params, id: 'mock-event-id' })),
}));

const DEFAULT_CONFIG: SchedulerConfig = {
  max_scheduled_items: 100,
  persist_schedules: false,
};

function makeScheduler(config: Partial<SchedulerConfig> = {}): EventScheduler {
  return new EventScheduler({ ...DEFAULT_CONFIG, ...config });
}

describe('EventScheduler', () => {
  let scheduler: EventScheduler;

  beforeEach(() => {
    vi.useRealTimers();
    scheduler = makeScheduler();
  });

  // ─── scheduleHeartbeat ──────────────────────────────────────────────────────

  describe('scheduleHeartbeat', () => {
    it('schedules a heartbeat item and returns it', () => {
      const item = scheduler.scheduleHeartbeat({
        id: 'hb-1',
        event_type: 'tick:test',
        interval_ms: 1000,
      });
      expect(item.id).toBe('hb-1');
      expect(item.time_type).toBe('heartbeat');
      expect(item.event_type).toBe('tick:test');
      expect(item.interval_ms).toBe(1000);
    });

    it('sets next_fire_at approximately now + interval_ms', () => {
      const before = Date.now();
      const item = scheduler.scheduleHeartbeat({
        id: 'hb-2',
        event_type: 'tick:test',
        interval_ms: 5000,
      });
      const after = Date.now();
      expect(item.next_fire_at).toBeGreaterThanOrEqual(before + 5000);
      expect(item.next_fire_at).toBeLessThanOrEqual(after + 5000);
    });

    it('stores TTL fields when ttl is provided', () => {
      const item = scheduler.scheduleHeartbeat({
        id: 'hb-3',
        event_type: 'tick:test',
        interval_ms: 1000,
        ttl: 3,
      });
      expect(item.ttl).toBe(3);
      expect(item.fires_remaining).toBe(3);
      expect(item.max_fires).toBe(3);
    });

    it('throws RangeError when interval_ms <= 0', () => {
      expect(() =>
        scheduler.scheduleHeartbeat({ id: 'bad', event_type: 'x', interval_ms: 0 })
      ).toThrow(RangeError);
      expect(() =>
        scheduler.scheduleHeartbeat({ id: 'bad2', event_type: 'x', interval_ms: -1 })
      ).toThrow(RangeError);
    });

    it('throws when an item with the same id already exists', () => {
      scheduler.scheduleHeartbeat({ id: 'dup', event_type: 'x', interval_ms: 1000 });
      expect(() =>
        scheduler.scheduleHeartbeat({ id: 'dup', event_type: 'x', interval_ms: 1000 })
      ).toThrow(/already exists/);
    });

    it('stores optional payload, ref, and priority', () => {
      const item = scheduler.scheduleHeartbeat({
        id: 'hb-full',
        event_type: 'tick:test',
        interval_ms: 1000,
        payload: { key: 'val' },
        ref: 'my-ref',
        priority: 5,
      });
      expect(item.payload).toEqual({ key: 'val' });
      expect(item.ref).toBe('my-ref');
      expect(item.priority).toBe(5);
    });
  });

  // ─── scheduleOneShot ────────────────────────────────────────────────────────

  describe('scheduleOneShot', () => {
    it('schedules a one-shot item with ttl=1', () => {
      const item = scheduler.scheduleOneShot({
        id: 'os-1',
        event_type: 'tick:oneshot',
        delay_ms: 2000,
      });
      expect(item.time_type).toBe('one_shot');
      expect(item.ttl).toBe(1);
      expect(item.fires_remaining).toBe(1);
      expect(item.max_fires).toBe(1);
    });

    it('throws RangeError when delay_ms <= 0', () => {
      expect(() =>
        scheduler.scheduleOneShot({ id: 'bad', event_type: 'x', delay_ms: 0 })
      ).toThrow(RangeError);
    });

    it('throws when duplicate id', () => {
      scheduler.scheduleOneShot({ id: 'os-dup', event_type: 'x', delay_ms: 1000 });
      expect(() =>
        scheduler.scheduleOneShot({ id: 'os-dup', event_type: 'x', delay_ms: 1000 })
      ).toThrow(/already exists/);
    });
  });

  // ─── scheduleCron ───────────────────────────────────────────────────────────

  describe('scheduleCron', () => {
    it('schedules a cron item', () => {
      const item = scheduler.scheduleCron({
        id: 'cron-1',
        event_type: 'tick:cron',
        interval_ms: 60_000,
      });
      expect(item.time_type).toBe('cron');
      expect(item.interval_ms).toBe(60_000);
    });

    it('stores active_hours when provided', () => {
      const item = scheduler.scheduleCron({
        id: 'cron-ah',
        event_type: 'tick:cron',
        interval_ms: 60_000,
        active_hours: { start: 9, end: 17 },
      });
      expect(item.active_hours).toEqual({ start: 9, end: 17 });
    });

    it('throws RangeError when interval_ms <= 0', () => {
      expect(() =>
        scheduler.scheduleCron({ id: 'bad', event_type: 'x', interval_ms: 0 })
      ).toThrow(RangeError);
    });

    it('throws when duplicate id', () => {
      scheduler.scheduleCron({ id: 'cron-dup', event_type: 'x', interval_ms: 1000 });
      expect(() =>
        scheduler.scheduleCron({ id: 'cron-dup', event_type: 'x', interval_ms: 1000 })
      ).toThrow(/already exists/);
    });
  });

  // ─── tick ───────────────────────────────────────────────────────────────────

  describe('tick', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('returns empty array when no items are due', () => {
      scheduler.scheduleHeartbeat({ id: 'hb', event_type: 'x', interval_ms: 10_000 });
      expect(scheduler.tick()).toHaveLength(0);
    });

    it('fires a heartbeat item when its next_fire_at has elapsed', () => {
      scheduler.scheduleHeartbeat({ id: 'hb', event_type: 'tick:hb', interval_ms: 1000 });
      vi.advanceTimersByTime(1001);
      const events = scheduler.tick();
      expect(events).toHaveLength(1);
    });

    it('advances next_fire_at for recurring items after firing', () => {
      scheduler.scheduleHeartbeat({ id: 'hb', event_type: 'tick:hb', interval_ms: 1000 });
      vi.advanceTimersByTime(1001);
      scheduler.tick();
      const item = scheduler.getItem('hb');
      expect(item).toBeDefined();
      // next_fire_at should be in the future now
      expect(item!.next_fire_at).toBeGreaterThan(Date.now());
    });

    it('decrements fires_remaining on each fire', () => {
      scheduler.scheduleHeartbeat({
        id: 'hb-ttl',
        event_type: 'tick:hb',
        interval_ms: 1000,
        ttl: 3,
      });
      vi.advanceTimersByTime(1001);
      scheduler.tick();
      const item = scheduler.getItem('hb-ttl');
      expect(item!.fires_remaining).toBe(2);
    });

    it('removes a one-shot item after it fires', () => {
      scheduler.scheduleOneShot({ id: 'os', event_type: 'tick:os', delay_ms: 500 });
      vi.advanceTimersByTime(501);
      const events = scheduler.tick();
      expect(events).toHaveLength(1);
      expect(scheduler.getItem('os')).toBeUndefined();
    });

    it('removes heartbeat item when fires_remaining reaches 0', () => {
      scheduler.scheduleHeartbeat({
        id: 'hb-limited',
        event_type: 'tick:hb',
        interval_ms: 100,
        ttl: 1,
      });
      vi.advanceTimersByTime(101);
      scheduler.tick();
      expect(scheduler.getItem('hb-limited')).toBeUndefined();
    });

    it('marks the scheduler dirty after items fire', () => {
      scheduler.scheduleHeartbeat({ id: 'hb', event_type: 'tick:hb', interval_ms: 100 });
      expect(scheduler.isDirty()).toBe(false);
      vi.advanceTimersByTime(101);
      scheduler.tick();
      expect(scheduler.isDirty()).toBe(true);
    });

    it('skips cron items outside the active_hours window', () => {
      // Force the clock to a specific UTC hour
      // Set time to Jan 1 2024 14:00:00 UTC (14 = 2pm UTC)
      vi.setSystemTime(new Date('2024-01-01T14:00:00.000Z'));
      scheduler.scheduleCron({
        id: 'cron-ah',
        event_type: 'tick:cron',
        interval_ms: 100,
        // active only from 09 to 12 UTC
        active_hours: { start: 9, end: 12, timezone_offset_hours: 0 },
      });
      vi.advanceTimersByTime(101);
      const events = scheduler.tick();
      expect(events).toHaveLength(0);
    });

    it('fires cron items inside the active_hours window', () => {
      // Set time to Jan 1 2024 10:00:00 UTC (10 = 10am UTC, within 9-17)
      vi.setSystemTime(new Date('2024-01-01T10:00:00.000Z'));
      scheduler.scheduleCron({
        id: 'cron-ok',
        event_type: 'tick:cron',
        interval_ms: 100,
        active_hours: { start: 9, end: 17, timezone_offset_hours: 0 },
      });
      vi.advanceTimersByTime(101);
      const events = scheduler.tick();
      expect(events).toHaveLength(1);
    });

    it('treats start === end as all-hours active', () => {
      vi.setSystemTime(new Date('2024-01-01T03:00:00.000Z'));
      scheduler.scheduleCron({
        id: 'cron-always',
        event_type: 'tick:cron',
        interval_ms: 100,
        active_hours: { start: 12, end: 12, timezone_offset_hours: 0 },
      });
      vi.advanceTimersByTime(101);
      const events = scheduler.tick();
      expect(events).toHaveLength(1);
    });
  });

  // ─── cancel / cancelByRef ───────────────────────────────────────────────────

  describe('cancel', () => {
    it('returns true when an existing item is cancelled', () => {
      scheduler.scheduleHeartbeat({ id: 'hb', event_type: 'x', interval_ms: 1000 });
      expect(scheduler.cancel('hb')).toBe(true);
      expect(scheduler.getItem('hb')).toBeUndefined();
    });

    it('returns false when the item does not exist', () => {
      expect(scheduler.cancel('nonexistent')).toBe(false);
    });
  });

  describe('cancelByRef', () => {
    it('cancels all items sharing the same ref and returns count', () => {
      scheduler.scheduleHeartbeat({ id: 'a', event_type: 'x', interval_ms: 1000, ref: 'group-1' });
      scheduler.scheduleHeartbeat({ id: 'b', event_type: 'x', interval_ms: 1000, ref: 'group-1' });
      scheduler.scheduleHeartbeat({ id: 'c', event_type: 'x', interval_ms: 1000, ref: 'group-2' });
      const removed = scheduler.cancelByRef('group-1');
      expect(removed).toBe(2);
      expect(scheduler.getItem('a')).toBeUndefined();
      expect(scheduler.getItem('b')).toBeUndefined();
      expect(scheduler.getItem('c')).toBeDefined();
    });

    it('returns 0 when no items match the ref', () => {
      expect(scheduler.cancelByRef('no-such-ref')).toBe(0);
    });
  });

  // ─── Accessors ──────────────────────────────────────────────────────────────

  describe('getItem / getAllItems / size', () => {
    it('getItem returns the item for an existing id', () => {
      scheduler.scheduleHeartbeat({ id: 'hb', event_type: 'x', interval_ms: 1000 });
      const item = scheduler.getItem('hb');
      expect(item).toBeDefined();
      expect(item!.id).toBe('hb');
    });

    it('getItem returns undefined for unknown id', () => {
      expect(scheduler.getItem('ghost')).toBeUndefined();
    });

    it('getAllItems returns all scheduled items', () => {
      scheduler.scheduleHeartbeat({ id: 'a', event_type: 'x', interval_ms: 1000 });
      scheduler.scheduleHeartbeat({ id: 'b', event_type: 'x', interval_ms: 1000 });
      const all = scheduler.getAllItems();
      expect(all).toHaveLength(2);
    });

    it('size returns the current item count', () => {
      expect(scheduler.size()).toBe(0);
      scheduler.scheduleHeartbeat({ id: 'x', event_type: 'x', interval_ms: 1000 });
      expect(scheduler.size()).toBe(1);
    });
  });

  // ─── Capacity ───────────────────────────────────────────────────────────────

  describe('capacity enforcement', () => {
    it('throws when max_scheduled_items is reached', () => {
      const small = makeScheduler({ max_scheduled_items: 2 });
      small.scheduleHeartbeat({ id: 'a', event_type: 'x', interval_ms: 1000 });
      small.scheduleHeartbeat({ id: 'b', event_type: 'x', interval_ms: 1000 });
      expect(() =>
        small.scheduleHeartbeat({ id: 'c', event_type: 'x', interval_ms: 1000 })
      ).toThrow(/capacity exceeded/);
    });
  });

  // ─── Persistence ────────────────────────────────────────────────────────────

  describe('persist and restore', () => {
    it('persist is a no-op when persist_schedules is false', () => {
      const store = { get: vi.fn(), set: vi.fn() };
      // Cast store: EventScheduler accepts StateStoreInterface
      const s = new EventScheduler({ max_scheduled_items: 100, persist_schedules: false }, store as any);
      s.scheduleHeartbeat({ id: 'hb', event_type: 'x', interval_ms: 1000 });
      s.persist();
      expect(store.set).not.toHaveBeenCalled();
    });

    it('persist saves all items to the store when enabled', () => {
      const store = { get: vi.fn(), set: vi.fn() };
      const s = new EventScheduler({ max_scheduled_items: 100, persist_schedules: true }, store as any);
      s.scheduleHeartbeat({ id: 'hb', event_type: 'x', interval_ms: 1000 });
      s.persist();
      expect(store.set).toHaveBeenCalledOnce();
      const [key, items] = store.set.mock.calls[0];
      expect(key).toBe('time_plugin.schedules');
      expect(Array.isArray(items)).toBe(true);
      expect(items).toHaveLength(1);
    });

    it('restore is a no-op when persist_schedules is false', () => {
      const store = { get: vi.fn(() => []), set: vi.fn() };
      const s = new EventScheduler({ max_scheduled_items: 100, persist_schedules: false }, store as any);
      s.restore();
      expect(store.get).not.toHaveBeenCalled();
    });

    it('restore loads items from the store', () => {
      const snapshot = [
        {
          id: 'restored',
          time_type: 'heartbeat',
          event_type: 'tick:x',
          interval_ms: 1000,
          next_fire_at: Date.now() + 5000,
          created_at: Date.now(),
        },
      ];
      const store = { get: vi.fn(() => snapshot), set: vi.fn() };
      const s = new EventScheduler({ max_scheduled_items: 100, persist_schedules: true }, store as any);
      s.restore();
      expect(s.getItem('restored')).toBeDefined();
    });

    it('restore re-schedules stale items to fire immediately', () => {
      const staleTime = Date.now() - 60_000;
      const snapshot = [
        {
          id: 'stale',
          time_type: 'heartbeat',
          event_type: 'tick:x',
          interval_ms: 1000,
          next_fire_at: staleTime,
          created_at: staleTime,
        },
      ];
      const store = { get: vi.fn(() => snapshot), set: vi.fn() };
      const s = new EventScheduler({ max_scheduled_items: 100, persist_schedules: true }, store as any);
      s.restore();
      const item = s.getItem('stale');
      expect(item).toBeDefined();
      // next_fire_at should have been bumped to now
      expect(item!.next_fire_at).toBeGreaterThanOrEqual(staleTime + 60_000);
    });

    it('restore does not overwrite existing items with restored ones', () => {
      const store = {
        get: vi.fn(() => [
          {
            id: 'hb',
            time_type: 'heartbeat',
            event_type: 'tick:restored',
            interval_ms: 9999,
            next_fire_at: Date.now() + 9999,
            created_at: Date.now(),
          },
        ]),
        set: vi.fn(),
      };
      const s = new EventScheduler({ max_scheduled_items: 100, persist_schedules: true }, store as any);
      s.scheduleHeartbeat({ id: 'hb', event_type: 'tick:original', interval_ms: 1000 });
      s.restore();
      // The in-memory item should win
      expect(s.getItem('hb')!.event_type).toBe('tick:original');
    });

    it('restore ignores non-array store values', () => {
      const store = { get: vi.fn(() => null), set: vi.fn() };
      const s = new EventScheduler({ max_scheduled_items: 100, persist_schedules: true }, store as any);
      s.restore(); // should not throw
      expect(s.size()).toBe(0);
    });
  });

  // ─── Dirty flag ─────────────────────────────────────────────────────────────

  describe('isDirty / clearDirty', () => {
    it('starts not dirty', () => {
      expect(scheduler.isDirty()).toBe(false);
    });

    it('clearDirty resets the flag', () => {
      vi.useFakeTimers();
      scheduler.scheduleHeartbeat({ id: 'hb', event_type: 'x', interval_ms: 100 });
      vi.advanceTimersByTime(101);
      scheduler.tick();
      expect(scheduler.isDirty()).toBe(true);
      scheduler.clearDirty();
      expect(scheduler.isDirty()).toBe(false);
      vi.useRealTimers();
    });
  });

  // ─── clear / destroy ────────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all items without destroying the scheduler', () => {
      scheduler.scheduleHeartbeat({ id: 'a', event_type: 'x', interval_ms: 1000 });
      scheduler.scheduleHeartbeat({ id: 'b', event_type: 'x', interval_ms: 1000 });
      scheduler.clear();
      expect(scheduler.size()).toBe(0);
      // Scheduler is still usable
      const item = scheduler.scheduleHeartbeat({ id: 'c', event_type: 'x', interval_ms: 1000 });
      expect(item.id).toBe('c');
    });
  });

  describe('destroy', () => {
    it('removes all items and prevents further scheduling', () => {
      scheduler.scheduleHeartbeat({ id: 'a', event_type: 'x', interval_ms: 1000 });
      scheduler.destroy();
      expect(scheduler.size()).toBe(0);
      expect(() =>
        scheduler.scheduleHeartbeat({ id: 'b', event_type: 'x', interval_ms: 1000 })
      ).toThrow(/destroyed/);
    });
  });
});
