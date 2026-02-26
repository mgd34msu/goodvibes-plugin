/**
 * Unit tests for ExecutorBudgetManager
 *
 * Tests flat cap, daily cap, warning events, daily reset, persist/restore,
 * adjustBudget, and recordSpending accumulation.
 *
 * Strategy:
 * - vi.hoisted() declares mock variables before vi.mock() hoisting fires.
 * - EventBus is fully mocked; only the emit method is exercised.
 * - StateStoreInterface is mocked inline per test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock variables ──────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const eventBusEmit = vi.fn();
  const EventBus = vi.fn().mockImplementation(function () {
    return { emit: eventBusEmit };
  });

  const createLogger = vi.fn().mockReturnValue({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  });

  const generateEventId = vi.fn().mockReturnValue('event-id-mock');
  const timestampFn = vi.fn().mockReturnValue('2026-01-01T00:00:00.000Z');

  return { eventBusEmit, EventBus, createLogger, generateEventId, timestampFn };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../events/event-bus.js', () => ({ EventBus: mocks.EventBus }));
vi.mock('../shared/logger.js', () => ({ createLogger: mocks.createLogger }));
vi.mock('../shared/utils.js', () => ({
  generateEventId: mocks.generateEventId,
  timestamp: mocks.timestampFn,
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { ExecutorBudgetManager } from '../executor-budget.js';
import type { ExecutorBudgetConfig } from '../shared/config.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ExecutorBudgetConfig> = {}): ExecutorBudgetConfig {
  return {
    warning_threshold: 0.8,
    daily_reset_hour: 0,
    ...overrides,
  };
}

function makeStateStore(initial?: unknown) {
  const store = new Map<string, unknown>();
  if (initial !== undefined) {
    store.set('executor.budget.spending', initial);
  }
  return {
    get: vi.fn().mockImplementation((key: string) => store.get(key) ?? null),
    set: vi.fn().mockImplementation((key: string, value: unknown) => { store.set(key, value); }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ExecutorBudgetManager', () => {
  let bus: ReturnType<typeof mocks.EventBus>;

  beforeEach(() => {
    vi.clearAllMocks();
    bus = new mocks.EventBus();
  });

  // ── No caps set ──────────────────────────────────────────────────────────

  describe('no caps configured', () => {
    it('canProcess returns true initially', () => {
      const mgr = new ExecutorBudgetManager(makeConfig(), bus);
      expect(mgr.canProcess()).toBe(true);
    });

    it('canProcess remains true after spending', () => {
      const mgr = new ExecutorBudgetManager(makeConfig(), bus);
      mgr.recordSpending(9999);
      expect(mgr.canProcess()).toBe(true);
    });

    it('recordSpending accumulates total_usd', () => {
      const mgr = new ExecutorBudgetManager(makeConfig(), bus);
      mgr.recordSpending(1.5);
      mgr.recordSpending(0.5);
      expect(mgr.getSpending().total_usd).toBeCloseTo(2.0);
    });

    it('recordSpending accumulates daily_usd', () => {
      const mgr = new ExecutorBudgetManager(makeConfig(), bus);
      mgr.recordSpending(0.3);
      mgr.recordSpending(0.7);
      expect(mgr.getSpending().daily_usd).toBeCloseTo(1.0);
    });

    it('recordSpending ignores zero or negative amounts', () => {
      const mgr = new ExecutorBudgetManager(makeConfig(), bus);
      mgr.recordSpending(0);
      mgr.recordSpending(-5);
      expect(mgr.getSpending().total_usd).toBe(0);
      expect(mocks.eventBusEmit).not.toHaveBeenCalled();
    });
  });

  // ── Flat cap ─────────────────────────────────────────────────────────────

  describe('flat cap', () => {
    it('canProcess returns true while under flat cap', () => {
      const mgr = new ExecutorBudgetManager(makeConfig({ flat_cap_usd: 10 }), bus);
      mgr.recordSpending(5);
      expect(mgr.canProcess()).toBe(true);
    });

    it('canProcess returns false when flat cap is reached exactly', () => {
      const mgr = new ExecutorBudgetManager(makeConfig({ flat_cap_usd: 10 }), bus);
      mgr.recordSpending(10);
      expect(mgr.canProcess()).toBe(false);
    });

    it('canProcess returns false when flat cap is exceeded', () => {
      const mgr = new ExecutorBudgetManager(makeConfig({ flat_cap_usd: 10 }), bus);
      mgr.recordSpending(11);
      expect(mgr.canProcess()).toBe(false);
    });

    it('emits executor:budget_exceeded with cap_type flat', () => {
      const mgr = new ExecutorBudgetManager(makeConfig({ flat_cap_usd: 10 }), bus);
      mgr.recordSpending(10);
      expect(mocks.eventBusEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'executor:budget_exceeded',
          payload: expect.objectContaining({
            data: expect.objectContaining({ cap_type: 'flat' }),
          }),
        }),
      );
    });

    it('emits executor:paused with reason flat_cap_exceeded', () => {
      const mgr = new ExecutorBudgetManager(makeConfig({ flat_cap_usd: 10 }), bus);
      mgr.recordSpending(10);
      expect(mocks.eventBusEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'executor:paused',
          payload: expect.objectContaining({
            data: expect.objectContaining({ reason: 'flat_cap_exceeded' }),
          }),
        }),
      );
    });

    it('does not emit paused twice when flat cap already triggered', () => {
      const mgr = new ExecutorBudgetManager(makeConfig({ flat_cap_usd: 10 }), bus);
      mgr.recordSpending(10);
      const callCount = mocks.eventBusEmit.mock.calls.length;
      mgr.recordSpending(1);
      // No additional paused event
      expect(mocks.eventBusEmit.mock.calls.length).toBe(callCount);
    });
  });

  // ── Daily cap ───────────────────────────────────────────────────────────

  describe('daily cap', () => {
    it('canProcess returns true while under daily cap', () => {
      const mgr = new ExecutorBudgetManager(makeConfig({ daily_cap_usd: 5 }), bus);
      mgr.recordSpending(3);
      expect(mgr.canProcess()).toBe(true);
    });

    it('canProcess returns false when daily cap is reached exactly', () => {
      const mgr = new ExecutorBudgetManager(makeConfig({ daily_cap_usd: 5 }), bus);
      mgr.recordSpending(5);
      expect(mgr.canProcess()).toBe(false);
    });

    it('canProcess returns false when daily cap is exceeded', () => {
      const mgr = new ExecutorBudgetManager(makeConfig({ daily_cap_usd: 5 }), bus);
      mgr.recordSpending(6);
      expect(mgr.canProcess()).toBe(false);
    });

    it('emits executor:budget_exceeded with cap_type daily', () => {
      const mgr = new ExecutorBudgetManager(makeConfig({ daily_cap_usd: 5 }), bus);
      mgr.recordSpending(5);
      expect(mocks.eventBusEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'executor:budget_exceeded',
          payload: expect.objectContaining({
            data: expect.objectContaining({ cap_type: 'daily' }),
          }),
        }),
      );
    });

    it('emits executor:paused with reason daily_cap_exceeded', () => {
      const mgr = new ExecutorBudgetManager(makeConfig({ daily_cap_usd: 5 }), bus);
      mgr.recordSpending(5);
      expect(mocks.eventBusEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'executor:paused',
          payload: expect.objectContaining({
            data: expect.objectContaining({ reason: 'daily_cap_exceeded' }),
          }),
        }),
      );
    });
  });

  // ── Both caps: flat triggers first ────────────────────────────────────────

  describe('both caps configured', () => {
    it('flat cap triggers first when flat is hit before daily', () => {
      // flat_cap=10, daily_cap=20: spend 10 → flat triggers
      const mgr = new ExecutorBudgetManager(
        makeConfig({ flat_cap_usd: 10, daily_cap_usd: 20 }),
        bus,
      );
      mgr.recordSpending(10);
      expect(mgr.canProcess()).toBe(false);
      expect(mocks.eventBusEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'executor:budget_exceeded',
          payload: expect.objectContaining({
            data: expect.objectContaining({ cap_type: 'flat' }),
          }),
        }),
      );
    });

    it('daily cap triggers first when daily is hit before flat', () => {
      // flat_cap=20, daily_cap=5: spend 5 → daily triggers
      const mgr = new ExecutorBudgetManager(
        makeConfig({ flat_cap_usd: 20, daily_cap_usd: 5 }),
        bus,
      );
      mgr.recordSpending(5);
      expect(mgr.canProcess()).toBe(false);
      expect(mocks.eventBusEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'executor:budget_exceeded',
          payload: expect.objectContaining({
            data: expect.objectContaining({ cap_type: 'daily' }),
          }),
        }),
      );
    });
  });

  // ── Warning events ──────────────────────────────────────────────────────

  describe('warning events', () => {
    it('emits executor:budget_warning when flat threshold is crossed', () => {
      const mgr = new ExecutorBudgetManager(
        makeConfig({ flat_cap_usd: 10, warning_threshold: 0.8 }),
        bus,
      );
      mgr.recordSpending(8); // 80% → warning
      expect(mocks.eventBusEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'executor:budget_warning',
          payload: expect.objectContaining({
            data: expect.objectContaining({ cap_type: 'flat' }),
          }),
        }),
      );
    });

    it('flat warning fires only once', () => {
      const mgr = new ExecutorBudgetManager(
        makeConfig({ flat_cap_usd: 10, warning_threshold: 0.8 }),
        bus,
      );
      mgr.recordSpending(8);
      const warningCalls = mocks.eventBusEmit.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === 'executor:budget_warning',
      ).length;
      mocks.eventBusEmit.mockClear();
      mgr.recordSpending(0.5);
      const warningCallsAfter = mocks.eventBusEmit.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === 'executor:budget_warning',
      ).length;
      expect(warningCalls).toBe(1);
      expect(warningCallsAfter).toBe(0);
    });

    it('emits executor:budget_warning when daily threshold is crossed', () => {
      const mgr = new ExecutorBudgetManager(
        makeConfig({ daily_cap_usd: 10, warning_threshold: 0.8 }),
        bus,
      );
      mgr.recordSpending(8); // 80% → warning
      expect(mocks.eventBusEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'executor:budget_warning',
          payload: expect.objectContaining({
            data: expect.objectContaining({ cap_type: 'daily' }),
          }),
        }),
      );
    });

    it('daily warning fires only once', () => {
      const mgr = new ExecutorBudgetManager(
        makeConfig({ daily_cap_usd: 10, warning_threshold: 0.8 }),
        bus,
      );
      mgr.recordSpending(8);
      mocks.eventBusEmit.mockClear();
      mgr.recordSpending(0.5);
      const warningCallsAfter = mocks.eventBusEmit.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === 'executor:budget_warning',
      ).length;
      expect(warningCallsAfter).toBe(0);
    });

    it('uses custom warning_threshold', () => {
      // threshold = 0.5 (50%)
      const mgr = new ExecutorBudgetManager(
        makeConfig({ flat_cap_usd: 10, warning_threshold: 0.5 }),
        bus,
      );
      mgr.recordSpending(5); // exactly 50%
      expect(mocks.eventBusEmit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'executor:budget_warning' }),
      );
    });

    it('does NOT warn below threshold', () => {
      const mgr = new ExecutorBudgetManager(
        makeConfig({ flat_cap_usd: 10, warning_threshold: 0.8 }),
        bus,
      );
      mgr.recordSpending(7); // 70% — under 80% threshold
      const warningCalls = mocks.eventBusEmit.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === 'executor:budget_warning',
      ).length;
      expect(warningCalls).toBe(0);
    });
  });

  // ── Daily reset ────────────────────────────────────────────────────────

  describe('checkDailyReset', () => {
    it('returns false when called on the same day as reset_at', () => {
      const mgr = new ExecutorBudgetManager(makeConfig(), bus);
      // daily_reset_at is set to now in constructor (via timestamp mock)
      expect(mgr.checkDailyReset()).toBe(false);
    });

    it('resets daily_usd to 0 when a new day and past reset_hour', () => {
      const mgr = new ExecutorBudgetManager(
        makeConfig({ daily_cap_usd: 10, daily_reset_hour: 0 }),
        bus,
      );
      // Simulate spending
      mgr.recordSpending(5);
      expect(mgr.getSpending().daily_usd).toBeCloseTo(5);

      // Move daily_reset_at to yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      // Inject via restore with an old daily_reset_at
      const storeWithYesterday = makeStateStore({
        total_usd: 5,
        daily_usd: 5,
        daily_reset_at: yesterday.toISOString(),
        last_updated: yesterday.toISOString(),
      });
      mgr.restore(storeWithYesterday);

      const reset = mgr.checkDailyReset();
      expect(reset).toBe(true);
      expect(mgr.getSpending().daily_usd).toBe(0);
    });

    it('emits executor:budget_reset on daily reset', () => {
      const mgr = new ExecutorBudgetManager(
        makeConfig({ daily_cap_usd: 10, daily_reset_hour: 0 }),
        bus,
      );
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const storeWithYesterday = makeStateStore({
        total_usd: 0,
        daily_usd: 5,
        daily_reset_at: yesterday.toISOString(),
        last_updated: yesterday.toISOString(),
      });
      mgr.restore(storeWithYesterday);
      mocks.eventBusEmit.mockClear();

      mgr.checkDailyReset();
      expect(mocks.eventBusEmit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'executor:budget_reset' }),
      );
    });

    it('resets warningFired.daily on daily reset', () => {
      const mgr = new ExecutorBudgetManager(
        makeConfig({ daily_cap_usd: 10, warning_threshold: 0.8, daily_reset_hour: 0 }),
        bus,
      );
      mgr.recordSpending(8); // fires warning

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const storeWithYesterday = makeStateStore({
        total_usd: 8,
        daily_usd: 8,
        daily_reset_at: yesterday.toISOString(),
        last_updated: yesterday.toISOString(),
      });
      mgr.restore(storeWithYesterday);
      mgr.checkDailyReset();
      mocks.eventBusEmit.mockClear();

      // After reset, warning can fire again
      mgr.recordSpending(8); // 80% of 10 again
      const warningCalls = mocks.eventBusEmit.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === 'executor:budget_warning',
      ).length;
      expect(warningCalls).toBe(1);
    });

    it('resumes processing after daily reset if only daily cap was exceeded', () => {
      const mgr = new ExecutorBudgetManager(
        makeConfig({ daily_cap_usd: 5, daily_reset_hour: 0 }),
        bus,
      );
      mgr.recordSpending(5); // hits daily cap → paused
      expect(mgr.canProcess()).toBe(false);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const storeWithYesterday = makeStateStore({
        total_usd: 5,
        daily_usd: 5,
        daily_reset_at: yesterday.toISOString(),
        last_updated: yesterday.toISOString(),
      });
      mgr.restore(storeWithYesterday);
      // After restore with daily exceeded but within flat cap, paused=true
      // Now reset
      mgr.checkDailyReset();
      // daily_usd is now 0 → under daily cap → should resume
      expect(mgr.canProcess()).toBe(true);
    });

    it('stays paused after daily reset if flat cap is also exceeded', () => {
      const mgr = new ExecutorBudgetManager(
        makeConfig({ flat_cap_usd: 5, daily_cap_usd: 5, daily_reset_hour: 0 }),
        bus,
      );
      mgr.recordSpending(5); // both caps hit

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      // Restore with daily exceeded, flat exceeded
      const storeExceeded = makeStateStore({
        total_usd: 5,
        daily_usd: 5,
        daily_reset_at: yesterday.toISOString(),
        last_updated: yesterday.toISOString(),
      });
      mgr.restore(storeExceeded);
      mgr.checkDailyReset();
      // Flat cap still exceeded → stays paused
      expect(mgr.canProcess()).toBe(false);
    });
  });

  // ── persist / restore ──────────────────────────────────────────────────

  describe('persist / restore', () => {
    it('persist calls stateStore.set with correct key and data', () => {
      const mgr = new ExecutorBudgetManager(makeConfig(), bus);
      mgr.recordSpending(2.5);
      const store = makeStateStore();
      mgr.persist(store);
      expect(store.set).toHaveBeenCalledWith(
        'executor.budget.spending',
        expect.objectContaining({ total_usd: 2.5, daily_usd: 2.5 }),
      );
    });

    it('restore loads spending state from store', () => {
      const stored = {
        total_usd: 7,
        daily_usd: 3,
        daily_reset_at: '2026-01-01T00:00:00.000Z',
        last_updated: '2026-01-01T00:00:00.000Z',
      };
      const store = makeStateStore(stored);
      const mgr = new ExecutorBudgetManager(makeConfig(), bus);
      mgr.restore(store);
      expect(mgr.getSpending().total_usd).toBe(7);
      expect(mgr.getSpending().daily_usd).toBe(3);
    });

    it('restore does nothing when store returns null', () => {
      const store = makeStateStore(); // nothing stored
      const mgr = new ExecutorBudgetManager(makeConfig(), bus);
      mgr.restore(store);
      expect(mgr.getSpending().total_usd).toBe(0);
    });

    it('persist/restore roundtrip preserves spending values', () => {
      const mgr = new ExecutorBudgetManager(makeConfig(), bus);
      mgr.recordSpending(4.75);
      const store = makeStateStore();
      mgr.persist(store);

      const mgr2 = new ExecutorBudgetManager(makeConfig(), bus);
      mgr2.restore(store);
      expect(mgr2.getSpending().total_usd).toBeCloseTo(4.75);
      expect(mgr2.getSpending().daily_usd).toBeCloseTo(4.75);
    });

    it('restore pauses when restored state already exceeds flat cap', () => {
      const stored = {
        total_usd: 12,
        daily_usd: 2,
        daily_reset_at: '2026-01-01T00:00:00.000Z',
        last_updated: '2026-01-01T00:00:00.000Z',
      };
      const store = makeStateStore(stored);
      const mgr = new ExecutorBudgetManager(
        makeConfig({ flat_cap_usd: 10 }),
        bus,
      );
      mgr.restore(store);
      expect(mgr.canProcess()).toBe(false);
    });

    it('restore pauses when restored state already exceeds daily cap', () => {
      const stored = {
        total_usd: 2,
        daily_usd: 6,
        daily_reset_at: '2026-01-01T00:00:00.000Z',
        last_updated: '2026-01-01T00:00:00.000Z',
      };
      const store = makeStateStore(stored);
      const mgr = new ExecutorBudgetManager(
        makeConfig({ daily_cap_usd: 5 }),
        bus,
      );
      mgr.restore(store);
      expect(mgr.canProcess()).toBe(false);
    });
  });

  // ── adjustBudget ─────────────────────────────────────────────────────────

  describe('adjustBudget', () => {
    it('increases flat cap to resume processing', () => {
      const mgr = new ExecutorBudgetManager(makeConfig({ flat_cap_usd: 10 }), bus);
      mgr.recordSpending(10); // paused
      expect(mgr.canProcess()).toBe(false);
      mgr.adjustBudget({ flat_cap_usd: 20 });
      expect(mgr.canProcess()).toBe(true);
    });

    it('emits executor:resumed after adjustBudget resumes processing', () => {
      const mgr = new ExecutorBudgetManager(makeConfig({ flat_cap_usd: 10 }), bus);
      mgr.recordSpending(10);
      mocks.eventBusEmit.mockClear();
      mgr.adjustBudget({ flat_cap_usd: 20 });
      expect(mocks.eventBusEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'executor:resumed',
          payload: expect.objectContaining({
            data: expect.objectContaining({ reason: 'budget_adjusted' }),
          }),
        }),
      );
    });

    it('stays paused if adjusted cap is still exceeded', () => {
      const mgr = new ExecutorBudgetManager(makeConfig({ flat_cap_usd: 10 }), bus);
      mgr.recordSpending(10);
      mgr.adjustBudget({ flat_cap_usd: 9 }); // still exceeded
      expect(mgr.canProcess()).toBe(false);
    });

    it('updates warning_threshold', () => {
      const mgr = new ExecutorBudgetManager(
        makeConfig({ flat_cap_usd: 10, warning_threshold: 0.8 }),
        bus,
      );
      mgr.adjustBudget({ warning_threshold: 0.5 });
      // Warning should now fire at 50% instead of 80%
      mocks.eventBusEmit.mockClear();
      mgr.recordSpending(5); // 50% of 10
      expect(mocks.eventBusEmit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'executor:budget_warning' }),
      );
    });
  });

  // ── getSpending ─────────────────────────────────────────────────────────

  describe('getSpending', () => {
    it('returns a snapshot (not a reference to internal state)', () => {
      const mgr = new ExecutorBudgetManager(makeConfig(), bus);
      const snap1 = mgr.getSpending();
      mgr.recordSpending(5);
      const snap2 = mgr.getSpending();
      expect(snap1.total_usd).toBe(0);
      expect(snap2.total_usd).toBe(5);
    });
  });
});
