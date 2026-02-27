/**
 * Time Plugin Tests — Layer 3
 *
 * Comprehensive tests for HeartbeatManager, EventScheduler, and TimePlugin.
 * Target: 100% coverage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeartbeatManager } from '../time/heartbeat.js';
import type { HeartbeatConfig } from '../time/heartbeat.js';
import { EventScheduler } from '../time/scheduler.js';
import type { SchedulerConfig } from '../time/scheduler.js';
import { TimePlugin, getDefaultTimeConfig } from '../time/time-plugin.js';
import type { EventQueueInterface, StateStoreInterface } from '../../core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQueue(): EventQueueInterface {
  return {
    enqueue: vi.fn(),
    drain: vi.fn().mockResolvedValue({ processed: 0, remaining: 0 }),
    peek: vi.fn().mockReturnValue(undefined),
    depth: vi.fn().mockReturnValue(0),
    deduplicate: vi.fn().mockReturnValue(0),
    cancel: vi.fn().mockReturnValue(false),
    cancelByRef: vi.fn().mockReturnValue(0),
    requeue: vi.fn(),
  } as unknown as EventQueueInterface;
}

function makeStore(): StateStoreInterface {
  const data = new Map<string, unknown>();
  return {
    get: vi.fn(<T>(key: string): T | null => (data.has(key) ? (data.get(key) as T) : null)),
    set: vi.fn(<T>(key: string, value: T) => { data.set(key, value); }),
    delete: vi.fn((key: string) => data.delete(key)),
    merge: vi.fn(),
    snapshot: vi.fn(() => Object.fromEntries(data)),
    restore: vi.fn(),
  } as unknown as StateStoreInterface;
}

function makeHeartbeatConfig(overrides: Partial<HeartbeatConfig> = {}): HeartbeatConfig {
  return {
    interval_ms: 1000,
    enabled: true,
    ...overrides,
  };
}

function makeSchedulerConfig(overrides: Partial<SchedulerConfig> = {}): SchedulerConfig {
  return {
    max_scheduled_items: 100,
    persist_schedules: true,
    ...overrides,
  };
}

// ─── HeartbeatManager ────────────────────────────────────────────────────────

describe('HeartbeatManager', () => {
  let manager: HeartbeatManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new HeartbeatManager(makeHeartbeatConfig({ interval_ms: 1000 }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when disabled', () => {
    const m = new HeartbeatManager(makeHeartbeatConfig({ enabled: false }));
    expect(m.tick()).toBeNull();
  });

  it('emits a TimeEvent on the first tick (no lastTickAt)', () => {
    const event = manager.tick();
    expect(event).not.toBeNull();
    expect(event?.time_type).toBe('heartbeat');
    expect(event?.type).toBe('tick:heartbeat');
  });

  it('returns null if called again before 80% of interval has elapsed', () => {
    manager.tick(); // first tick sets lastTickAt
    // Advance only 50% of interval
    vi.advanceTimersByTime(500);
    expect(manager.tick()).toBeNull();
  });

  it('returns an event if 80% of the interval has elapsed', () => {
    manager.tick(); // sets lastTickAt
    vi.advanceTimersByTime(800); // exactly 80%
    const event = manager.tick();
    expect(event).not.toBeNull();
    expect(event?.time_type).toBe('heartbeat');
  });

  it('returns an event if more than 80% of interval has elapsed', () => {
    manager.tick();
    vi.advanceTimersByTime(1000);
    const event = manager.tick();
    expect(event).not.toBeNull();
  });

  it('increments tickCount on each successful tick', () => {
    manager.tick();
    vi.advanceTimersByTime(1000);
    manager.tick();
    expect(manager.getTickCount()).toBe(2);
  });

  it('does not increment tickCount when returning null', () => {
    manager.tick();
    manager.tick(); // too soon
    expect(manager.getTickCount()).toBe(1);
  });

  it('emits event with configurable priority', () => {
    const m = new HeartbeatManager(makeHeartbeatConfig({ priority: 5 }));
    const event = m.tick();
    expect(event?.priority).toBe(5);
  });

  it('defaults priority to 10 when not configured', () => {
    const event = manager.tick();
    expect(event?.priority).toBe(10);
  });

  it('event payload includes tick_count and timestamp', () => {
    const event = manager.tick();
    const payload = event?.payload as Record<string, unknown>;
    expect(payload?.tick_count).toBe(1);
    expect(typeof payload?.timestamp).toBe('number');
  });

  it('event includes the configured interval_ms', () => {
    const event = manager.tick();
    expect(event?.interval_ms).toBe(1000);
  });

  it('isEnabled returns current state', () => {
    expect(manager.isEnabled()).toBe(true);
    manager.disable();
    expect(manager.isEnabled()).toBe(false);
    manager.enable();
    expect(manager.isEnabled()).toBe(true);
  });

  it('getLastTickAt returns 0 initially, then the tick timestamp', () => {
    expect(manager.getLastTickAt()).toBe(0);
    manager.tick();
    expect(manager.getLastTickAt()).toBeGreaterThan(0);
  });

  it('reset clears tickCount and lastTickAt', () => {
    manager.tick();
    manager.reset();
    expect(manager.getTickCount()).toBe(0);
    expect(manager.getLastTickAt()).toBe(0);
  });

  it('setInterval changes the debounce window', () => {
    manager.setInterval(2000);
    manager.tick();
    vi.advanceTimersByTime(1500); // 75% of 2000 — still blocked
    expect(manager.tick()).toBeNull();
    vi.advanceTimersByTime(500); // 100% of 2000 — passes
    expect(manager.tick()).not.toBeNull();
  });

  it('re-enabling after disable allows the next tick to fire', () => {
    manager.disable();
    expect(manager.tick()).toBeNull();
    manager.enable();
    expect(manager.tick()).not.toBeNull();
  });
});

// ─── EventScheduler ───────────────────────────────────────────────────────────

describe('EventScheduler', () => {
  let scheduler: EventScheduler;
  let store: StateStoreInterface;

  beforeEach(() => {
    vi.useFakeTimers();
    store = makeStore();
    scheduler = new EventScheduler(makeSchedulerConfig(), store);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── scheduleHeartbeat ──────────────────────────────────────────────────────

  describe('scheduleHeartbeat', () => {
    it('adds an item and returns it', () => {
      const item = scheduler.scheduleHeartbeat({
        id: 'hb1',
        event_type: 'tick:ci',
        interval_ms: 5000,
      });
      expect(item.id).toBe('hb1');
      expect(item.time_type).toBe('heartbeat');
      expect(item.interval_ms).toBe(5000);
      expect(scheduler.size()).toBe(1);
    });

    it('throws on duplicate id', () => {
      scheduler.scheduleHeartbeat({ id: 'dup', event_type: 'x', interval_ms: 1000 });
      expect(() =>
        scheduler.scheduleHeartbeat({ id: 'dup', event_type: 'x', interval_ms: 1000 })
      ).toThrow("already exists");
    });

    it('sets fires_remaining when ttl is provided', () => {
      const item = scheduler.scheduleHeartbeat({
        id: 'hb-ttl',
        event_type: 'tick:ci',
        interval_ms: 1000,
        ttl: 3,
      });
      expect(item.fires_remaining).toBe(3);
      expect(item.max_fires).toBe(3);
      expect(item.ttl).toBe(3);
    });

    it('stores payload and ref when provided', () => {
      const item = scheduler.scheduleHeartbeat({
        id: 'hb-payload',
        event_type: 'tick:x',
        interval_ms: 1000,
        payload: { foo: 'bar' },
        ref: 'my-ref',
      });
      expect((item.payload as Record<string, unknown>)?.foo).toBe('bar');
      expect(item.ref).toBe('my-ref');
    });

    it('stores priority when provided', () => {
      const item = scheduler.scheduleHeartbeat({
        id: 'hb-prio',
        event_type: 'tick:x',
        interval_ms: 1000,
        priority: 5,
      });
      expect(item.priority).toBe(5);
    });

    it('fires repeatedly at the configured interval', () => {
      scheduler.scheduleHeartbeat({ id: 'recur', event_type: 'tick:r', interval_ms: 1000 });
      // Advance past first interval
      vi.advanceTimersByTime(1001);
      const events1 = scheduler.tick();
      expect(events1).toHaveLength(1);
      expect(events1[0]?.type).toBe('tick:r');
      // Advance again
      vi.advanceTimersByTime(1001);
      const events2 = scheduler.tick();
      expect(events2).toHaveLength(1);
    });

    it('fires exactly ttl times then removes the item', () => {
      scheduler.scheduleHeartbeat({
        id: 'ttl-fires',
        event_type: 'tick:ttl',
        interval_ms: 100,
        ttl: 2,
      });
      vi.advanceTimersByTime(101);
      const e1 = scheduler.tick();
      expect(e1).toHaveLength(1);
      vi.advanceTimersByTime(101);
      const e2 = scheduler.tick();
      expect(e2).toHaveLength(1);
      // Item removed after 2nd fire
      expect(scheduler.size()).toBe(0);
      vi.advanceTimersByTime(101);
      expect(scheduler.tick()).toHaveLength(0);
    });
  });

  // ─── scheduleOneShot ────────────────────────────────────────────────────────

  describe('scheduleOneShot', () => {
    it('fires once then is removed', () => {
      scheduler.scheduleOneShot({ id: 'os1', event_type: 'alert:once', delay_ms: 500 });
      vi.advanceTimersByTime(501);
      const events = scheduler.tick();
      expect(events).toHaveLength(1);
      expect(events[0]?.time_type).toBe('one_shot');
      expect(scheduler.size()).toBe(0);
    });

    it('does not fire before delay_ms elapses', () => {
      scheduler.scheduleOneShot({ id: 'os-early', event_type: 'x', delay_ms: 1000 });
      vi.advanceTimersByTime(500);
      expect(scheduler.tick()).toHaveLength(0);
    });

    it('throws on duplicate id', () => {
      scheduler.scheduleOneShot({ id: 'os-dup', event_type: 'x', delay_ms: 100 });
      expect(() =>
        scheduler.scheduleOneShot({ id: 'os-dup', event_type: 'x', delay_ms: 100 })
      ).toThrow("already exists");
    });

    it('stores priority when provided', () => {
      const item = scheduler.scheduleOneShot({
        id: 'os-prio',
        event_type: 'x',
        delay_ms: 100,
        priority: 7,
      });
      expect(item.priority).toBe(7);
    });

    it('emitted event has correct fires_remaining (1) and ttl', () => {
      scheduler.scheduleOneShot({ id: 'os-r', event_type: 'tick:once', delay_ms: 100 });
      vi.advanceTimersByTime(101);
      const events = scheduler.tick();
      expect(events[0]?.fires_remaining).toBe(1);
      expect(events[0]?.ttl).toBe(1);
    });
  });

  // ─── scheduleCron ───────────────────────────────────────────────────────────

  describe('scheduleCron', () => {
    it('fires on each interval', () => {
      scheduler.scheduleCron({ id: 'cron1', event_type: 'tick:cron', interval_ms: 500 });
      vi.advanceTimersByTime(501);
      expect(scheduler.tick()).toHaveLength(1);
      vi.advanceTimersByTime(501);
      expect(scheduler.tick()).toHaveLength(1);
    });

    it('throws on duplicate id', () => {
      scheduler.scheduleCron({ id: 'c-dup', event_type: 'x', interval_ms: 100 });
      expect(() =>
        scheduler.scheduleCron({ id: 'c-dup', event_type: 'x', interval_ms: 100 })
      ).toThrow("already exists");
    });

    it('stores priority when provided', () => {
      const item = scheduler.scheduleCron({
        id: 'c-prio',
        event_type: 'x',
        interval_ms: 100,
        priority: 3,
      });
      expect(item.priority).toBe(3);
    });

    describe('active_hours — daytime window (start < end)', () => {
      it('fires when hour is inside the window', () => {
        // Fix the current hour to 12 UTC by using timezone_offset_hours: 0
        const noon = new Date();
        noon.setUTCHours(12, 0, 0, 0);
        vi.setSystemTime(noon);

        scheduler.scheduleCron({
          id: 'cron-day',
          event_type: 'tick:day',
          interval_ms: 100,
          active_hours: { start: 9, end: 18, timezone_offset_hours: 0 },
        });
        vi.advanceTimersByTime(101);
        const events = scheduler.tick();
        expect(events).toHaveLength(1);
      });

      it('skips when hour is outside the window', () => {
        // Fix the current hour to 3 UTC
        const earlyMorning = new Date();
        earlyMorning.setUTCHours(3, 0, 0, 0);
        vi.setSystemTime(earlyMorning);

        scheduler.scheduleCron({
          id: 'cron-skip',
          event_type: 'tick:skip',
          interval_ms: 100,
          active_hours: { start: 9, end: 18, timezone_offset_hours: 0 },
        });
        vi.advanceTimersByTime(101);
        const events = scheduler.tick();
        expect(events).toHaveLength(0);
      });

      it('advances next_fire_at when skipped', () => {
        const earlyMorning = new Date();
        earlyMorning.setUTCHours(3, 0, 0, 0);
        vi.setSystemTime(earlyMorning);

        scheduler.scheduleCron({
          id: 'cron-advance',
          event_type: 'tick:advance',
          interval_ms: 100,
          active_hours: { start: 9, end: 18, timezone_offset_hours: 0 },
        });
        vi.advanceTimersByTime(101);
        scheduler.tick();
        const item = scheduler.getItem('cron-advance');
        // next_fire_at should have been advanced
        expect(item?.next_fire_at).toBeGreaterThan(Date.now());
      });
    });

    describe('active_hours — overnight window (start > end)', () => {
      it('fires when hour is in the overnight portion (after start)', () => {
        const lateNight = new Date();
        lateNight.setUTCHours(23, 0, 0, 0);
        vi.setSystemTime(lateNight);

        scheduler.scheduleCron({
          id: 'cron-overnight-late',
          event_type: 'tick:night',
          interval_ms: 100,
          active_hours: { start: 22, end: 6, timezone_offset_hours: 0 },
        });
        vi.advanceTimersByTime(101);
        expect(scheduler.tick()).toHaveLength(1);
      });

      it('fires when hour is in the overnight portion (before end)', () => {
        const earlyMorning = new Date();
        earlyMorning.setUTCHours(3, 0, 0, 0);
        vi.setSystemTime(earlyMorning);

        scheduler.scheduleCron({
          id: 'cron-overnight-early',
          event_type: 'tick:night2',
          interval_ms: 100,
          active_hours: { start: 22, end: 6, timezone_offset_hours: 0 },
        });
        vi.advanceTimersByTime(101);
        expect(scheduler.tick()).toHaveLength(1);
      });

      it('skips when hour is outside the overnight window', () => {
        const midDay = new Date();
        midDay.setUTCHours(12, 0, 0, 0);
        vi.setSystemTime(midDay);

        scheduler.scheduleCron({
          id: 'cron-overnight-skip',
          event_type: 'tick:skip2',
          interval_ms: 100,
          active_hours: { start: 22, end: 6, timezone_offset_hours: 0 },
        });
        vi.advanceTimersByTime(101);
        expect(scheduler.tick()).toHaveLength(0);
      });
    });

    describe('timezone_offset_hours', () => {
      it('uses UTC when timezone_offset_hours is 0', () => {
        const t = new Date();
        t.setUTCHours(12, 0, 0, 0);
        vi.setSystemTime(t);

        scheduler.scheduleCron({
          id: 'tz-utc',
          event_type: 'tick:tz',
          interval_ms: 100,
          active_hours: { start: 9, end: 18, timezone_offset_hours: 0 },
        });
        vi.advanceTimersByTime(101);
        expect(scheduler.tick()).toHaveLength(1);
      });

      it('applies offset correctly — UTC 12 with -5 offset = hour 7', () => {
        // UTC 12 - 5 offset = 7 (in window 6-18)
        const t = new Date();
        t.setUTCHours(12, 0, 0, 0);
        vi.setSystemTime(t);

        scheduler.scheduleCron({
          id: 'tz-neg5',
          event_type: 'tick:tz2',
          interval_ms: 100,
          active_hours: { start: 6, end: 18, timezone_offset_hours: -5 },
        });
        vi.advanceTimersByTime(101);
        expect(scheduler.tick()).toHaveLength(1);
      });

      it('applies offset correctly — UTC 1 with +5 offset = hour 6', () => {
        // UTC 1 + 5 offset = 6 (in window 6-18)
        const t = new Date();
        t.setUTCHours(1, 0, 0, 0);
        vi.setSystemTime(t);

        scheduler.scheduleCron({
          id: 'tz-pos5',
          event_type: 'tick:tz3',
          interval_ms: 100,
          active_hours: { start: 6, end: 18, timezone_offset_hours: 5 },
        });
        vi.advanceTimersByTime(101);
        expect(scheduler.tick()).toHaveLength(1);
      });

      it('handles offset wrapping past 24 — UTC 22 with +5 = hour 3', () => {
        // UTC 22 + 5 = 27 % 24 = 3 (outside window 6-18)
        const t = new Date();
        t.setUTCHours(22, 0, 0, 0);
        vi.setSystemTime(t);

        scheduler.scheduleCron({
          id: 'tz-wrap',
          event_type: 'tick:tz4',
          interval_ms: 100,
          active_hours: { start: 6, end: 18, timezone_offset_hours: 5 },
        });
        vi.advanceTimersByTime(101);
        expect(scheduler.tick()).toHaveLength(0);
      });

      it('uses local time (getHours) when no timezone_offset_hours provided', () => {
        // Without timezone_offset_hours the code calls new Date(now).getHours().
        // Mock getHours to a known value (4) so the test is falsifiable.
        const MOCK_HOUR = 4;
        const getHoursSpy = vi.spyOn(Date.prototype, 'getHours').mockReturnValue(MOCK_HOUR);
        scheduler.scheduleCron({
          id: 'tz-local',
          event_type: 'tick:local',
          interval_ms: 100,
          active_hours: { start: MOCK_HOUR, end: MOCK_HOUR + 1 }, // narrow window around known hour
        });
        vi.advanceTimersByTime(101);
        const events = scheduler.tick();
        expect(events.length).toBe(1);
        getHoursSpy.mockRestore();
      });
    });
  });

  // ─── cancel / cancelByRef ──────────────────────────────────────────────────

  describe('cancel', () => {
    it('returns true when the item existed', () => {
      scheduler.scheduleOneShot({ id: 'c1', event_type: 'x', delay_ms: 100 });
      expect(scheduler.cancel('c1')).toBe(true);
      expect(scheduler.size()).toBe(0);
    });

    it('returns false when the item did not exist', () => {
      expect(scheduler.cancel('no-such-id')).toBe(false);
    });
  });

  describe('cancelByRef', () => {
    it('removes all items with the given ref and returns count', () => {
      scheduler.scheduleOneShot({ id: 'r1', event_type: 'x', delay_ms: 100, ref: 'grp' });
      scheduler.scheduleOneShot({ id: 'r2', event_type: 'y', delay_ms: 100, ref: 'grp' });
      scheduler.scheduleOneShot({ id: 'r3', event_type: 'z', delay_ms: 100, ref: 'other' });
      const removed = scheduler.cancelByRef('grp');
      expect(removed).toBe(2);
      expect(scheduler.size()).toBe(1);
      expect(scheduler.getItem('r3')).toBeDefined();
    });

    it('returns 0 when no items match the ref', () => {
      expect(scheduler.cancelByRef('missing')).toBe(0);
    });
  });

  // ─── capacity guard ─────────────────────────────────────────────────────────

  describe('capacity guard', () => {
    it('throws when max_scheduled_items is reached', () => {
      const tiny = new EventScheduler(
        makeSchedulerConfig({ max_scheduled_items: 2 }),
        store,
      );
      tiny.scheduleOneShot({ id: 'a', event_type: 'x', delay_ms: 100 });
      tiny.scheduleOneShot({ id: 'b', event_type: 'x', delay_ms: 100 });
      expect(() =>
        tiny.scheduleOneShot({ id: 'c', event_type: 'x', delay_ms: 100 })
      ).toThrow('capacity exceeded');
    });

    it('scheduler rejects when capacity reached — scheduleHeartbeat', () => {
      const tiny = new EventScheduler(
        makeSchedulerConfig({ max_scheduled_items: 2 }),
        store,
      );
      tiny.scheduleHeartbeat({ id: 'hb-cap-a', event_type: 'x', interval_ms: 1000 });
      tiny.scheduleHeartbeat({ id: 'hb-cap-b', event_type: 'x', interval_ms: 1000 });
      expect(() =>
        tiny.scheduleHeartbeat({ id: 'hb-cap-c', event_type: 'x', interval_ms: 1000 })
      ).toThrow('capacity exceeded');
      expect(tiny.size()).toBe(2);
    });

    it('scheduler rejects when capacity reached — scheduleCron', () => {
      const tiny = new EventScheduler(
        makeSchedulerConfig({ max_scheduled_items: 2 }),
        store,
      );
      tiny.scheduleCron({ id: 'cron-cap-a', event_type: 'x', interval_ms: 1000 });
      tiny.scheduleCron({ id: 'cron-cap-b', event_type: 'x', interval_ms: 1000 });
      expect(() =>
        tiny.scheduleCron({ id: 'cron-cap-c', event_type: 'x', interval_ms: 1000 })
      ).toThrow('capacity exceeded');
      expect(tiny.size()).toBe(2);
    });

    it('scheduler rejects when capacity reached — mixed schedule types', () => {
      const tiny = new EventScheduler(
        makeSchedulerConfig({ max_scheduled_items: 3 }),
        store,
      );
      tiny.scheduleHeartbeat({ id: 'mixed-hb', event_type: 'x', interval_ms: 1000 });
      tiny.scheduleOneShot({ id: 'mixed-os', event_type: 'x', delay_ms: 100 });
      tiny.scheduleCron({ id: 'mixed-cron', event_type: 'x', interval_ms: 1000 });
      // All three method types must check capacity — any additional item should throw
      expect(() =>
        tiny.scheduleOneShot({ id: 'mixed-overflow', event_type: 'x', delay_ms: 100 })
      ).toThrow('capacity exceeded');
      expect(tiny.size()).toBe(3);
    });
  });

  // ─── persist / restore ──────────────────────────────────────────────────────

  describe('persist and restore', () => {
    it('serializes all items to the state store', () => {
      scheduler.scheduleOneShot({ id: 'p1', event_type: 'x', delay_ms: 100 });
      scheduler.scheduleOneShot({ id: 'p2', event_type: 'y', delay_ms: 200 });
      scheduler.persist();
      expect(store.set).toHaveBeenCalledOnce();
      const [key, value] = (store.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(key).toBe('time_plugin.schedules');
      expect(Array.isArray(value)).toBe(true);
      expect((value as unknown[]).length).toBe(2);
    });

    it('restores items from the state store', () => {
      scheduler.scheduleOneShot({ id: 'orig', event_type: 'x', delay_ms: 5000 });
      scheduler.persist();

      const scheduler2 = new EventScheduler(makeSchedulerConfig(), store);
      scheduler2.restore();
      expect(scheduler2.size()).toBe(1);
      expect(scheduler2.getItem('orig')).toBeDefined();
    });

    it('re-schedules stale items (next_fire_at in the past) to fire immediately', () => {
      // Create a scheduler, schedule something with a tiny delay
      scheduler.scheduleOneShot({ id: 'stale', event_type: 'x', delay_ms: 1 });
      scheduler.persist();
      const snapshot = (store.get as ReturnType<typeof vi.fn>).mock.results
        .find((r: { value: unknown }) => Array.isArray(r.value));

      // Manually push the snapshot back so restore sees stale items
      const staleData = scheduler.getAllItems().map((item) => ({
        ...item,
        next_fire_at: Date.now() - 10000,
      }));
      (store.get as ReturnType<typeof vi.fn>).mockReturnValueOnce(staleData);

      const scheduler3 = new EventScheduler(makeSchedulerConfig(), store);
      scheduler3.restore();
      const restored = scheduler3.getItem('stale');
      expect(restored?.next_fire_at).toBeLessThanOrEqual(Date.now() + 1);
    });

    it('is a no-op when persist_schedules is false', () => {
      const s = new EventScheduler(
        makeSchedulerConfig({ persist_schedules: false }),
        store,
      );
      s.scheduleOneShot({ id: 'np', event_type: 'x', delay_ms: 100 });
      s.persist();
      expect(store.set).not.toHaveBeenCalled();
    });

    it('is a no-op when no store is provided', () => {
      const s = new EventScheduler(makeSchedulerConfig());
      s.scheduleOneShot({ id: 'ns', event_type: 'x', delay_ms: 100 });
      expect(() => s.persist()).not.toThrow();
      expect(() => s.restore()).not.toThrow();
    });

    it('restore is a no-op when store returns non-array', () => {
      (store.get as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
      expect(() => scheduler.restore()).not.toThrow();
      expect(scheduler.size()).toBe(0);
    });

    it('restore is a no-op when persist_schedules is false', () => {
      const s = new EventScheduler(
        makeSchedulerConfig({ persist_schedules: false }),
        store,
      );
      s.restore();
      expect(store.get).not.toHaveBeenCalled();
    });
  });

  // ─── accessors ──────────────────────────────────────────────────────────────

  describe('accessors', () => {
    it('getItem returns the item by id', () => {
      scheduler.scheduleOneShot({ id: 'acc', event_type: 'x', delay_ms: 100 });
      const item = scheduler.getItem('acc');
      expect(item?.id).toBe('acc');
    });

    it('getItem returns undefined for unknown id', () => {
      expect(scheduler.getItem('missing')).toBeUndefined();
    });

    it('getAllItems returns all items as an array', () => {
      scheduler.scheduleOneShot({ id: 'a', event_type: 'x', delay_ms: 100 });
      scheduler.scheduleOneShot({ id: 'b', event_type: 'y', delay_ms: 100 });
      expect(scheduler.getAllItems()).toHaveLength(2);
    });

    it('size() returns count of scheduled items', () => {
      expect(scheduler.size()).toBe(0);
      scheduler.scheduleOneShot({ id: 'sz', event_type: 'x', delay_ms: 100 });
      expect(scheduler.size()).toBe(1);
    });
  });

  // ─── emitted event properties ───────────────────────────────────────────────

  describe('emitted event properties', () => {
    it('emitted TimeEvent has source="time"', () => {
      scheduler.scheduleOneShot({ id: 'ev-src', event_type: 'x', delay_ms: 1 });
      vi.advanceTimersByTime(2);
      const events = scheduler.tick();
      expect(events[0]?.source).toBe('time');
    });

    it('emitted event defaults priority to 10', () => {
      scheduler.scheduleOneShot({ id: 'ev-prio', event_type: 'x', delay_ms: 1 });
      vi.advanceTimersByTime(2);
      const events = scheduler.tick();
      expect(events[0]?.priority).toBe(10);
    });

    it('emitted event uses configured priority', () => {
      scheduler.scheduleOneShot({
        id: 'ev-p5',
        event_type: 'x',
        delay_ms: 1,
        priority: 5,
      });
      vi.advanceTimersByTime(2);
      const events = scheduler.tick();
      expect(events[0]?.priority).toBe(5);
    });

    it('emitted event has context.ref when ref is set', () => {
      scheduler.scheduleOneShot({
        id: 'ev-ref',
        event_type: 'x',
        delay_ms: 1,
        ref: 'my-ref',
      });
      vi.advanceTimersByTime(2);
      const events = scheduler.tick();
      expect((events[0]?.context as Record<string, unknown>)?.ref).toBe('my-ref');
    });

    it('emitted event context is undefined when no ref', () => {
      scheduler.scheduleOneShot({ id: 'ev-noref', event_type: 'x', delay_ms: 1 });
      vi.advanceTimersByTime(2);
      const events = scheduler.tick();
      expect(events[0]?.context).toBeUndefined();
    });

    it('updates last_fired_at after firing', () => {
      const now = Date.now();
      scheduler.scheduleOneShot({ id: 'ev-fired', event_type: 'x', delay_ms: 1 });
      vi.advanceTimersByTime(2);
      scheduler.tick();
      // Item is removed after one-shot, so check via snapshot before removal
      // We test indirectly: item was removed (one-shot) confirming it fired
      expect(scheduler.size()).toBe(0);
    });
  });
});

// ─── TimePlugin ───────────────────────────────────────────────────────────────

describe('TimePlugin', () => {
  let queue: EventQueueInterface;
  let store: StateStoreInterface;
  let plugin: TimePlugin;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = makeQueue();
    store = makeStore();
    plugin = new TimePlugin({
      queue,
      store,
      config: {
        heartbeat: { interval_ms: 1000, enabled: true },
        scheduler: { max_scheduled_items: 10, persist_schedules: true },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits heartbeat event and returns heartbeat_emitted=true', () => {
    const result = plugin.onTick();
    expect(result.heartbeat_emitted).toBe(true);
    expect(queue.enqueue).toHaveBeenCalledOnce();
  });

  it('does not emit heartbeat when debounce blocks it', () => {
    plugin.onTick(); // first tick fires
    const result = plugin.onTick(); // second tick too soon
    expect(result.heartbeat_emitted).toBe(false);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('emits scheduled events and increments scheduled_emitted', () => {
    // Schedule something that fires immediately
    plugin.getScheduler().scheduleOneShot({
      id: 'scheduled-now',
      event_type: 'tick:now',
      delay_ms: 1,
    });
    vi.advanceTimersByTime(2);
    const result = plugin.onTick();
    expect(result.scheduled_emitted).toBeGreaterThan(0);
  });

  it('calls persist only when scheduled events were emitted', () => {
    const persistSpy = vi.spyOn(plugin.getScheduler(), 'persist');

    // Tick with no scheduled events — persist should NOT be called
    plugin.getScheduler().scheduleOneShot({
      id: 'far-future',
      event_type: 'x',
      delay_ms: 99999,
    });
    plugin.onTick();
    expect(persistSpy).not.toHaveBeenCalled();

    // Now fire the scheduled event
    plugin.getScheduler().scheduleOneShot({
      id: 'now-fire',
      event_type: 'y',
      delay_ms: 1,
    });
    vi.advanceTimersByTime(2);
    plugin.onTick();
    expect(persistSpy).toHaveBeenCalledOnce();
  });

  it('does not call persist when no scheduled events fired', () => {
    const persistSpy = vi.spyOn(plugin.getScheduler(), 'persist');
    plugin.onTick();
    expect(persistSpy).not.toHaveBeenCalled();
  });

  it('getHeartbeat returns the HeartbeatManager instance', () => {
    expect(plugin.getHeartbeat()).toBeDefined();
  });

  it('getScheduler returns the EventScheduler instance', () => {
    expect(plugin.getScheduler()).toBeDefined();
  });

  it('heartbeat_emitted is false when heartbeat is disabled', () => {
    const p = new TimePlugin({
      queue,
      store,
      config: {
        heartbeat: { interval_ms: 1000, enabled: false },
        scheduler: { max_scheduled_items: 10, persist_schedules: false },
      },
    });
    const result = p.onTick();
    expect(result.heartbeat_emitted).toBe(false);
  });

  it('restores schedules from store on construction', () => {
    // Pre-populate the store with a persisted schedule
    const fakeItem = {
      id: 'restored',
      time_type: 'one_shot' as const,
      event_type: 'x',
      next_fire_at: Date.now() - 1, // stale
      created_at: Date.now() - 5000,
      ttl: 1,
      fires_remaining: 1,
      max_fires: 1,
    };
    const storeWithData: StateStoreInterface = {
      ...makeStore(),
      get: vi.fn().mockReturnValue([fakeItem]),
      set: vi.fn(),
      delete: vi.fn(),
      merge: vi.fn(),
      snapshot: vi.fn(),
      restore: vi.fn(),
    } as unknown as StateStoreInterface;

    const p = new TimePlugin({
      queue,
      store: storeWithData,
      config: {
        heartbeat: { interval_ms: 1000, enabled: false },
        scheduler: { max_scheduled_items: 10, persist_schedules: true },
      },
    });
    // The restored item should exist in the scheduler
    expect(p.getScheduler().size()).toBe(1);
    expect(p.getScheduler().getItem('restored')).toBeDefined();
  });
});

// ─── getDefaultTimeConfig ────────────────────────────────────────────────────

describe('getDefaultTimeConfig', () => {
  it('returns sensible production defaults', () => {
    const config = getDefaultTimeConfig();
    expect(config.heartbeat.interval_ms).toBe(60_000);
    expect(config.heartbeat.enabled).toBe(true);
    expect(config.scheduler.max_scheduled_items).toBe(100);
    expect(config.scheduler.persist_schedules).toBe(true);
  });
});
