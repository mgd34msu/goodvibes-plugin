/**
 * Tests for Timer — core/observability/timer.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Timer } from '../timer.js';

// Mock logger to suppress output
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('construction', () => {
    it('constructs with required options', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });
      expect(timer).toBeInstanceOf(Timer);
    });

    it('uses default label when none provided', () => {
      // No error — just ensure it constructs cleanly
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });
      expect(timer).toBeDefined();
    });

    it('accepts a custom label', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 500, label: 'heartbeat' });
      expect(timer).toBeDefined();
    });

    it('isRunning() returns false before start', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });
      expect(timer.isRunning()).toBe(false);
    });

    it('getIntervalMs() returns the configured interval', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 2500 });
      expect(timer.getIntervalMs()).toBe(2500);
    });
  });

  describe('start()', () => {
    it('transitions isRunning to true', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });
      timer.start();
      expect(timer.isRunning()).toBe(true);
      timer.stop();
    });

    it('is idempotent — second call is a no-op', () => {
      const callback = vi.fn();
      const timer = new Timer({ callback, intervalMs: 1000 });
      timer.start();
      timer.start(); // should not create a second interval
      vi.advanceTimersByTime(1000);
      // Should fire exactly once (not twice)
      expect(callback).toHaveBeenCalledTimes(1);
      timer.stop();
    });

    it('fires callback at the configured interval', () => {
      const callback = vi.fn();
      const timer = new Timer({ callback, intervalMs: 500 });
      timer.start();
      vi.advanceTimersByTime(1500);
      expect(callback).toHaveBeenCalledTimes(3);
      timer.stop();
    });

    it('does not fire callback before the interval elapses', () => {
      const callback = vi.fn();
      const timer = new Timer({ callback, intervalMs: 1000 });
      timer.start();
      vi.advanceTimersByTime(999);
      expect(callback).not.toHaveBeenCalled();
      timer.stop();
    });

    it('refuses to start when intervalMs <= 0', () => {
      const callback = vi.fn();
      const timer = new Timer({ callback, intervalMs: 0 });
      timer.start();
      expect(timer.isRunning()).toBe(false);
      vi.advanceTimersByTime(1000);
      expect(callback).not.toHaveBeenCalled();
    });

    it('refuses to start when intervalMs is negative', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: -100 });
      timer.start();
      expect(timer.isRunning()).toBe(false);
    });
  });

  describe('stop()', () => {
    it('transitions isRunning to false', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });
      timer.start();
      timer.stop();
      expect(timer.isRunning()).toBe(false);
    });

    it('is idempotent — stop on a stopped timer is a no-op', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });
      expect(() => timer.stop()).not.toThrow();
      expect(timer.isRunning()).toBe(false);
    });

    it('prevents callback from firing after stop', () => {
      const callback = vi.fn();
      const timer = new Timer({ callback, intervalMs: 1000 });
      timer.start();
      timer.stop();
      vi.advanceTimersByTime(3000);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('callback error handling', () => {
    it('swallows errors thrown by the callback and continues running', () => {
      let callCount = 0;
      const callback = vi.fn(() => {
        callCount++;
        throw new Error('callback error');
      });
      const timer = new Timer({ callback, intervalMs: 100 });
      timer.start();

      expect(() => vi.advanceTimersByTime(300)).not.toThrow();
      expect(callCount).toBe(3);
      expect(timer.isRunning()).toBe(true);
      timer.stop();
    });

    it('continues firing after an error in the callback', () => {
      let callCount = 0;
      const callback = vi.fn(() => {
        callCount++;
        if (callCount === 1) throw new Error('first call fails');
      });
      const timer = new Timer({ callback, intervalMs: 500 });
      timer.start();
      vi.advanceTimersByTime(2000);
      expect(callCount).toBe(4); // all 4 intervals fire despite first throwing
      timer.stop();
    });
  });

  describe('reconfigure()', () => {
    it('updates intervalMs via getIntervalMs()', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });
      timer.reconfigure(5000);
      expect(timer.getIntervalMs()).toBe(5000);
    });

    it('no-op restart when timer was not running', () => {
      const callback = vi.fn();
      const timer = new Timer({ callback, intervalMs: 1000 });
      timer.reconfigure(500);
      // Timer was stopped, so it should remain stopped
      expect(timer.isRunning()).toBe(false);
      vi.advanceTimersByTime(1000);
      expect(callback).not.toHaveBeenCalled();
    });

    it('atomically restarts when timer was running', () => {
      const callback = vi.fn();
      const timer = new Timer({ callback, intervalMs: 1000 });
      timer.start();

      vi.advanceTimersByTime(500);
      timer.reconfigure(200); // restart with new interval

      expect(timer.isRunning()).toBe(true);
      expect(timer.getIntervalMs()).toBe(200);

      vi.advanceTimersByTime(600);
      // Should fire at 200, 400, 600 ms after reconfigure (3 times)
      expect(callback).toHaveBeenCalledTimes(3);
      timer.stop();
    });

    it('does not restart to invalid interval (0) when running', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });
      timer.start();
      timer.reconfigure(0);
      // Timer stopped due to invalid interval, start() refused
      expect(timer.isRunning()).toBe(false);
    });
  });

  describe('isRunning()', () => {
    it('reflects actual state through full lifecycle', () => {
      const timer = new Timer({ callback: vi.fn(), intervalMs: 1000 });

      expect(timer.isRunning()).toBe(false);
      timer.start();
      expect(timer.isRunning()).toBe(true);
      timer.stop();
      expect(timer.isRunning()).toBe(false);
      timer.start();
      expect(timer.isRunning()).toBe(true);
      timer.stop();
      expect(timer.isRunning()).toBe(false);
    });
  });
});
