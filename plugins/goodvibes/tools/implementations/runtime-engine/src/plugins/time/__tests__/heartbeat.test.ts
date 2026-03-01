import { describe, it, expect, beforeEach } from 'vitest';
import { HeartbeatManager } from '../heartbeat.js';
import type { HeartbeatConfig } from '../heartbeat.js';

// HeartbeatManager uses no imports that need mocking — it depends only on
// internal logic and an optional `now` clock injected via constructor.

const INTERVAL_MS = 1000;

function makeHeartbeat(
  config: Partial<HeartbeatConfig> & { now?: () => number } = {},
): HeartbeatManager {
  return new HeartbeatManager({
    interval_ms: INTERVAL_MS,
    enabled: true,
    ...config,
  });
}

describe('HeartbeatManager', () => {
  // ─── tick — basic emission ──────────────────────────────────────────────────

  describe('tick', () => {
    it('emits a heartbeat event on the first tick', () => {
      let fakeNow = 0;
      const hb = makeHeartbeat({ now: () => fakeNow });
      const event = hb.tick();
      expect(event).not.toBeNull();
      expect(event!.time_type).toBe('heartbeat');
      expect(event!.type).toBe('tick:heartbeat');
    });

    it('includes tick_count and timestamp in the payload', () => {
      let fakeNow = 1_000_000;
      const hb = makeHeartbeat({ now: () => fakeNow });
      const event = hb.tick();
      expect(event).not.toBeNull();
      expect((event!.payload as any).tick_count).toBe(1);
      expect((event!.payload as any).timestamp).toBe(fakeNow);
    });

    it('uses the configured interval_ms in the emitted event', () => {
      const hb = makeHeartbeat({ interval_ms: 5000 });
      const event = hb.tick();
      expect(event!.interval_ms).toBe(5000);
    });

    it('uses default priority of 10 when none is set', () => {
      const hb = makeHeartbeat();
      const event = hb.tick();
      expect(event!.priority).toBe(10);
    });

    it('uses the provided priority', () => {
      const hb = makeHeartbeat({ priority: 5 });
      const event = hb.tick();
      expect(event!.priority).toBe(5);
    });
  });

  // ─── tick — debounce ────────────────────────────────────────────────────────

  describe('debounce guard', () => {
    it('returns null if called again before 80% of the interval has elapsed', () => {
      let fakeNow = 1_000_000;
      const hb = makeHeartbeat({ interval_ms: 1000, now: () => fakeNow });
      hb.tick(); // first tick — sets lastTickAt = 1_000_000

      // Advance to 79% of interval — should be blocked
      fakeNow = 1_000_790;
      expect(hb.tick()).toBeNull();
    });

    it('emits again after 80% of the interval has elapsed', () => {
      let fakeNow = 1_000_000;
      const hb = makeHeartbeat({ interval_ms: 1000, now: () => fakeNow });
      hb.tick(); // first tick

      // Advance to 80% — should pass
      fakeNow = 1_000_800;
      expect(hb.tick()).not.toBeNull();
    });

    it('emits again after the full interval has elapsed', () => {
      let fakeNow = 1_000_000;
      const hb = makeHeartbeat({ interval_ms: 1000, now: () => fakeNow });
      hb.tick();

      fakeNow = 1_001_000;
      expect(hb.tick()).not.toBeNull();
    });

    it('increments tick_count on each successful emission', () => {
      let fakeNow = 1_000_000;
      const hb = makeHeartbeat({ interval_ms: 100, now: () => fakeNow });
      hb.tick(); // tick 1
      fakeNow = 1_000_100;
      hb.tick(); // tick 2
      fakeNow = 1_000_200;
      hb.tick(); // tick 3
      expect(hb.getTickCount()).toBe(3);
    });

    it('does not increment tick_count on a debounced tick', () => {
      let fakeNow = 1_000_000;
      const hb = makeHeartbeat({ interval_ms: 1000, now: () => fakeNow });
      hb.tick();
      fakeNow = 1_000_500; // < 80% threshold (800ms)
      hb.tick();
      expect(hb.getTickCount()).toBe(1);
    });
  });

  // ─── enabled / disabled ─────────────────────────────────────────────────────

  describe('enabled state', () => {
    it('returns null when disabled', () => {
      const hb = makeHeartbeat({ enabled: false });
      expect(hb.tick()).toBeNull();
    });

    it('emits after being enabled', () => {
      const hb = makeHeartbeat({ enabled: false });
      hb.enable();
      expect(hb.tick()).not.toBeNull();
    });

    it('returns null after being disabled', () => {
      const hb = makeHeartbeat({ enabled: true });
      hb.disable();
      expect(hb.tick()).toBeNull();
    });

    it('isEnabled reflects current state', () => {
      const hb = makeHeartbeat({ enabled: true });
      expect(hb.isEnabled()).toBe(true);
      hb.disable();
      expect(hb.isEnabled()).toBe(false);
      hb.enable();
      expect(hb.isEnabled()).toBe(true);
    });
  });

  // ─── setInterval ────────────────────────────────────────────────────────────

  describe('setInterval', () => {
    it('updates the interval used for debouncing', () => {
      let fakeNow = 1_000_000;
      const hb = makeHeartbeat({ interval_ms: 1000, now: () => fakeNow });
      hb.tick(); // first tick at 1_000_000

      // With old interval (1000ms), 500ms is < 80% threshold — blocked
      fakeNow = 1_000_500;
      expect(hb.tick()).toBeNull();

      // Reduce interval to 500ms — 500ms elapsed >= 80% of 500ms = 400ms
      hb.setInterval(500);
      // elapsed = 1_000_500 - 1_000_000 = 500 >= 0.8*500=400 — passes
      expect(hb.tick()).not.toBeNull();
    });
  });

  // ─── reset ──────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('resets tick count and last fire time', () => {
      let fakeNow = 1_000_000;
      const hb = makeHeartbeat({ interval_ms: 100, now: () => fakeNow });
      hb.tick();
      fakeNow = 1_000_100;
      hb.tick();
      expect(hb.getTickCount()).toBe(2);
      expect(hb.getLastTickAt()).toBeGreaterThan(0);

      hb.reset();
      expect(hb.getTickCount()).toBe(0);
      expect(hb.getLastTickAt()).toBe(0);
    });

    it('allows immediate re-emission after reset (no debounce)', () => {
      let fakeNow = 1_000_000;
      const hb = makeHeartbeat({ interval_ms: 1000, now: () => fakeNow });
      hb.tick(); // sets lastTickAt = 1_000_000

      // Would normally be debounced (500ms < 800ms threshold)
      fakeNow = 1_000_500;
      expect(hb.tick()).toBeNull();

      hb.reset();
      // After reset, lastTickAt = 0, so the debounce guard (lastTickAt > 0) is skipped
      expect(hb.tick()).not.toBeNull();
    });
  });

  // ─── stop ───────────────────────────────────────────────────────────────────

  describe('stop', () => {
    it('disables the heartbeat and resets state', () => {
      let fakeNow = 1_000_000;
      const hb = makeHeartbeat({ interval_ms: 100, now: () => fakeNow });
      hb.tick();
      fakeNow = 1_000_100;
      hb.tick();

      hb.stop();

      expect(hb.isEnabled()).toBe(false);
      expect(hb.getTickCount()).toBe(0);
      expect(hb.getLastTickAt()).toBe(0);
      expect(hb.tick()).toBeNull();
    });
  });

  // ─── Accessors ──────────────────────────────────────────────────────────────

  describe('accessors', () => {
    it('getTickCount returns 0 initially', () => {
      const hb = makeHeartbeat();
      expect(hb.getTickCount()).toBe(0);
    });

    it('getLastTickAt returns 0 initially', () => {
      const hb = makeHeartbeat();
      expect(hb.getLastTickAt()).toBe(0);
    });

    it('getLastTickAt returns the timestamp of the last successful tick', () => {
      let fakeNow = 42_000;
      const hb = makeHeartbeat({ now: () => fakeNow });
      hb.tick();
      expect(hb.getLastTickAt()).toBe(42_000);
    });
  });
});
