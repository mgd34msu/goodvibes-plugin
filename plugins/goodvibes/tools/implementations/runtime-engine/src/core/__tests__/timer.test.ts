/**
 * Unit tests for Timer
 *
 * Tests lifecycle management: idempotent start/stop, isRunning state,
 * intervalMs <= 0 guard, reconfigure atomicity, and getIntervalMs.
 *
 * Strategy:
 * - vi.useFakeTimers() controls setInterval/clearInterval without wall-clock delays.
 * - Logger is mocked to suppress output.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mock variables ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const createLogger = vi.fn().mockReturnValue({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  });
  return { createLogger };
});

vi.mock('../../shared/logger.js', () => ({ createLogger: mocks.createLogger }));

// ─── Subject under test ───────────────────────────────────────────────────────

import { Timer } from '../timer.js';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── start / stop idempotency ────────────────────────────────────────────

  describe('start()', () => {
    it('starts the timer and sets isRunning to true', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });
      timer.start();
      expect(timer.isRunning()).toBe(true);
    });

    it('is idempotent — calling start() twice does not create duplicate timers', () => {
      const callback = vi.fn();
      const timer = new Timer({ callback, intervalMs: 1000 });
      timer.start();
      timer.start();
      // Advance by two intervals — if duplicate, callback would fire twice per tick
      vi.advanceTimersByTime(2000);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('invokes callback on each interval tick', () => {
      const callback = vi.fn();
      const timer = new Timer({ callback, intervalMs: 500 });
      timer.start();
      vi.advanceTimersByTime(1500);
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('does not start when intervalMs <= 0', () => {
      const callback = vi.fn();
      const timer = new Timer({ callback, intervalMs: 0 });
      timer.start();
      expect(timer.isRunning()).toBe(false);
      vi.advanceTimersByTime(5000);
      expect(callback).not.toHaveBeenCalled();
    });

    it('does not start when intervalMs is negative', () => {
      const callback = vi.fn();
      const timer = new Timer({ callback, intervalMs: -100 });
      timer.start();
      expect(timer.isRunning()).toBe(false);
    });
  });

  describe('stop()', () => {
    it('stops the timer and sets isRunning to false', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });
      timer.start();
      timer.stop();
      expect(timer.isRunning()).toBe(false);
    });

    it('is idempotent — calling stop() when not running does not throw', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });
      expect(() => timer.stop()).not.toThrow();
    });

    it('stops callback invocations after stop()', () => {
      const callback = vi.fn();
      const timer = new Timer({ callback, intervalMs: 1000 });
      timer.start();
      vi.advanceTimersByTime(1000);
      timer.stop();
      vi.advanceTimersByTime(3000);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('can be restarted after stop()', () => {
      const callback = vi.fn();
      const timer = new Timer({ callback, intervalMs: 1000 });
      timer.start();
      vi.advanceTimersByTime(1000);
      timer.stop();
      timer.start();
      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  // ── isRunning ───────────────────────────────────────────────────────────

  describe('isRunning()', () => {
    it('returns false before start()', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });
      expect(timer.isRunning()).toBe(false);
    });

    it('returns true after start()', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });
      timer.start();
      expect(timer.isRunning()).toBe(true);
    });

    it('returns false after stop()', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });
      timer.start();
      timer.stop();
      expect(timer.isRunning()).toBe(false);
    });
  });

  // ── reconfigure ─────────────────────────────────────────────────────────

  describe('reconfigure()', () => {
    it('updates intervalMs without restarting when not running', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });
      timer.reconfigure(2000);
      expect(timer.isRunning()).toBe(false);
      expect(timer.getIntervalMs()).toBe(2000);
    });

    it('atomically stops and restarts with new interval when running', () => {
      const callback = vi.fn();
      const timer = new Timer({ callback, intervalMs: 1000 });
      timer.start();
      timer.reconfigure(500);
      expect(timer.isRunning()).toBe(true);
      expect(timer.getIntervalMs()).toBe(500);
      vi.advanceTimersByTime(1500);
      // With 500ms interval, 3 ticks in 1500ms
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('leaves timer stopped when reconfigure sets intervalMs <= 0 and was running', () => {
      const callback = vi.fn();
      const timer = new Timer({ callback, intervalMs: 1000 });
      timer.start();
      expect(timer.isRunning()).toBe(true);
      // Reconfigure to 0 — start() guard should prevent restart
      timer.reconfigure(0);
      expect(timer.isRunning()).toBe(false);
    });
  });

  // ── getIntervalMs ────────────────────────────────────────────────────────

  describe('callback error resilience', () => {
    it('continues running when the callback throws', () => {
      let callCount = 0;
      const callback = vi.fn().mockImplementation(() => {
        callCount++;
        throw new Error('callback error');
      });
      const timer = new Timer({ callback, intervalMs: 1000 });
      timer.start();

      // Advance through 3 ticks — each will throw, but the interval must survive
      expect(() => vi.advanceTimersByTime(3000)).not.toThrow();

      // Timer is still running despite the callback throwing every tick
      expect(timer.isRunning()).toBe(true);
      expect(callCount).toBe(3);
    });
  });

  describe('getIntervalMs()', () => {
    it('returns the initial interval', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 3000 });
      expect(timer.getIntervalMs()).toBe(3000);
    });

    it('returns the updated interval after reconfigure()', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });
      timer.reconfigure(5000);
      expect(timer.getIntervalMs()).toBe(5000);
    });
  });
});
