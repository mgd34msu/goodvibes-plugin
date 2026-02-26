/**
 * Unit tests for DaemonTickHandler
 *
 * Tests tick counter, budget gating, event emission, context clearing,
 * TickResult structure, buildTickContext, getTickCount, and budget status.
 *
 * Strategy:
 * - vi.hoisted() declares mock variables before vi.mock() hoisting fires.
 * - ExecutorModeManager, ExecutorBudgetManager, and ContextClearer are all
 *   fully mocked so DaemonTickHandler logic is tested in isolation.
 * - EventBus is mocked to capture emitted events.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock variables ──────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  // EventBus
  const eventBusEmit = vi.fn();
  const EventBus = vi.fn().mockImplementation(function () {
    return { emit: eventBusEmit };
  });

  // ExecutorModeManager
  const modeGetMode = vi.fn().mockReturnValue('daemon');
  const modeShouldClearContext = vi.fn().mockReturnValue(false);
  const modeGetDetectionMethod = vi.fn().mockReturnValue('default');
  const ExecutorModeManager = vi.fn().mockImplementation(function () {
    return {
      getMode: modeGetMode,
      shouldClearContext: modeShouldClearContext,
      getDetectionMethod: modeGetDetectionMethod,
    };
  });

  // ExecutorBudgetManager
  const budgetCanProcess = vi.fn().mockReturnValue(true);
  const budgetCheckDailyReset = vi.fn().mockReturnValue(false);
  const budgetGetSpending = vi.fn().mockReturnValue({
    total_usd: 0,
    daily_usd: 0,
    daily_reset_at: '2026-01-01T00:00:00.000Z',
    last_updated: '2026-01-01T00:00:00.000Z',
  });
  const ExecutorBudgetManager = vi.fn().mockImplementation(function () {
    return {
      canProcess: budgetCanProcess,
      checkDailyReset: budgetCheckDailyReset,
      getSpending: budgetGetSpending,
    };
  });

  // ContextClearer
  const contextClearerClearContext = vi.fn().mockResolvedValue({
    method: 'tmux',
    success: true,
  });
  const ContextClearer = vi.fn().mockImplementation(function () {
    return { clearContext: contextClearerClearContext };
  });

  // Logger
  const createLogger = vi.fn().mockReturnValue({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  });

  const generateEventId = vi.fn().mockReturnValue('event-id-mock');
  const timestampFn = vi.fn().mockReturnValue('2026-01-01T00:00:00.000Z');

  return {
    eventBusEmit,
    EventBus,
    modeGetMode,
    modeShouldClearContext,
    modeGetDetectionMethod,
    ExecutorModeManager,
    budgetCanProcess,
    budgetCheckDailyReset,
    budgetGetSpending,
    ExecutorBudgetManager,
    contextClearerClearContext,
    ContextClearer,
    createLogger,
    generateEventId,
    timestampFn,
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../events/event-bus.js', () => ({ EventBus: mocks.EventBus }));
vi.mock('../context-clearer.js', () => ({ ContextClearer: mocks.ContextClearer }));
vi.mock('../../shared/logger.js', () => ({ createLogger: mocks.createLogger }));
vi.mock('../../shared/utils.js', () => ({
  generateEventId: mocks.generateEventId,
  timestamp: mocks.timestampFn,
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { DaemonTickHandler } from '../daemon-tick-handler.js';
import type { ExecutorConfig } from '../shared/config.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeExecutorConfig(overrides: Partial<ExecutorConfig> = {}): ExecutorConfig {
  return {
    mode: 'daemon',
    daemon: {
      clear_context_after_batch: false,
      tmux_session_name: 'claude-daemon',
      tick_command: 'tick',
    },
    budget: {
      warning_threshold: 0.8,
      daily_reset_hour: 0,
    },
    ...overrides,
  };
}

function makeDeps(config?: ExecutorConfig) {
  const executorMode = new mocks.ExecutorModeManager();
  const budgetManager = new mocks.ExecutorBudgetManager();
  const eventBus = new mocks.EventBus();
  return {
    executorMode,
    budgetManager,
    eventBus,
    config: config ?? makeExecutorConfig(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DaemonTickHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock implementations
    mocks.budgetCanProcess.mockReturnValue(true);
    mocks.budgetCheckDailyReset.mockReturnValue(false);
    mocks.budgetGetSpending.mockReturnValue({
      total_usd: 0,
      daily_usd: 0,
      daily_reset_at: '2026-01-01T00:00:00.000Z',
      last_updated: '2026-01-01T00:00:00.000Z',
    });
    mocks.modeShouldClearContext.mockReturnValue(false);
    mocks.modeGetMode.mockReturnValue('daemon');
    mocks.contextClearerClearContext.mockResolvedValue({ method: 'tmux', success: true });
  });

  // ── handleTick: tick counter ────────────────────────────────────────────

  describe('tick counter', () => {
    it('starts at 0 before any ticks', () => {
      const handler = new DaemonTickHandler(makeDeps());
      expect(handler.getTickCount()).toBe(0);
    });

    it('increments counter to 1 after first handleTick', async () => {
      const handler = new DaemonTickHandler(makeDeps());
      await handler.handleTick();
      expect(handler.getTickCount()).toBe(1);
    });

    it('increments counter on each successive handleTick call', async () => {
      const handler = new DaemonTickHandler(makeDeps());
      await handler.handleTick();
      await handler.handleTick();
      await handler.handleTick();
      expect(handler.getTickCount()).toBe(3);
    });

    it('returns tick_number in TickResult matching counter', async () => {
      const handler = new DaemonTickHandler(makeDeps());
      const result = await handler.handleTick();
      expect(result.tick_number).toBe(1);
      const result2 = await handler.handleTick();
      expect(result2.tick_number).toBe(2);
    });
  });

  // ── handleTick: budget gating ────────────────────────────────────────

  describe('budget gating', () => {
    it('checks budget before proceeding', async () => {
      const deps = makeDeps();
      const handler = new DaemonTickHandler(deps);
      await handler.handleTick();
      expect(mocks.budgetCanProcess).toHaveBeenCalled();
    });

    it('aborts and returns budget_status exceeded when budget is exceeded', async () => {
      mocks.budgetCanProcess.mockReturnValue(false);
      const handler = new DaemonTickHandler(makeDeps());
      const result = await handler.handleTick();
      expect(result.budget_status).toBe('exceeded');
      expect(result.events_processed).toBe(0);
      expect(result.context_cleared).toBe(false);
    });

    it('does not emit tick_received when budget is exceeded', async () => {
      mocks.budgetCanProcess.mockReturnValue(false);
      const handler = new DaemonTickHandler(makeDeps());
      await handler.handleTick();
      const tickReceivedCalls = mocks.eventBusEmit.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === 'executor:tick_received',
      );
      expect(tickReceivedCalls.length).toBe(0);
    });

    it('calls checkDailyReset after budget check passes', async () => {
      const handler = new DaemonTickHandler(makeDeps());
      await handler.handleTick();
      expect(mocks.budgetCheckDailyReset).toHaveBeenCalled();
    });
  });

  // ── handleTick: event emission ──────────────────────────────────────────

  describe('event emission', () => {
    it('emits executor:tick_received with tick_number', async () => {
      const handler = new DaemonTickHandler(makeDeps());
      await handler.handleTick();
      expect(mocks.eventBusEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'executor:tick_received',
          payload: expect.objectContaining({
            type: 'executor:tick_received',
            data: expect.objectContaining({ tick_number: 1 }),
          }),
        }),
      );
    });

    it('emits executor:tick_completed with tick_number and events_processed', async () => {
      const handler = new DaemonTickHandler(makeDeps());
      await handler.handleTick();
      expect(mocks.eventBusEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'executor:tick_completed',
          payload: expect.objectContaining({
            type: 'executor:tick_completed',
            data: expect.objectContaining({
              tick_number: 1,
              events_processed: 0,
            }),
          }),
        }),
      );
    });

    it('emits both tick_received and tick_completed in order', async () => {
      const handler = new DaemonTickHandler(makeDeps());
      await handler.handleTick();
      const eventTypes = mocks.eventBusEmit.mock.calls.map(
        (c: unknown[]) => (c[0] as { type: string }).type,
      );
      const receivedIdx = eventTypes.indexOf('executor:tick_received');
      const completedIdx = eventTypes.indexOf('executor:tick_completed');
      expect(receivedIdx).toBeGreaterThanOrEqual(0);
      expect(completedIdx).toBeGreaterThanOrEqual(0);
      expect(receivedIdx).toBeLessThan(completedIdx);
    });
  });

  // ── handleTick: context clearing ───────────────────────────────────────

  describe('context clearing', () => {
    it('clears context when shouldClearContext returns true (daemon mode)', async () => {
      mocks.modeShouldClearContext.mockReturnValue(true);
      const handler = new DaemonTickHandler(makeDeps());
      const result = await handler.handleTick();
      expect(mocks.contextClearerClearContext).toHaveBeenCalledOnce();
      expect(result.context_cleared).toBe(true);
    });

    it('emits executor:context_clearing event when clearing occurs', async () => {
      mocks.modeShouldClearContext.mockReturnValue(true);
      const handler = new DaemonTickHandler(makeDeps());
      await handler.handleTick();
      expect(mocks.eventBusEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'executor:context_clearing',
          payload: expect.objectContaining({
            type: 'executor:context_clearing',
            data: expect.objectContaining({
              method: 'tmux',
              success: true,
            }),
          }),
        }),
      );
    });

    it('does NOT clear context when shouldClearContext returns false (engaged mode)', async () => {
      mocks.modeShouldClearContext.mockReturnValue(false);
      mocks.modeGetMode.mockReturnValue('engaged');
      const handler = new DaemonTickHandler(makeDeps());
      const result = await handler.handleTick();
      expect(mocks.contextClearerClearContext).not.toHaveBeenCalled();
      expect(result.context_cleared).toBe(false);
    });

    it('does NOT clear context in hybrid mode (shouldClearContext returns false)', async () => {
      mocks.modeShouldClearContext.mockReturnValue(false);
      mocks.modeGetMode.mockReturnValue('hybrid');
      const handler = new DaemonTickHandler(makeDeps());
      const result = await handler.handleTick();
      expect(mocks.contextClearerClearContext).not.toHaveBeenCalled();
      expect(result.context_cleared).toBe(false);
    });

    it('context_cleared is false when clearContext returns success: false', async () => {
      mocks.modeShouldClearContext.mockReturnValue(true);
      mocks.contextClearerClearContext.mockResolvedValue({ method: 'tmux', success: false });
      const handler = new DaemonTickHandler(makeDeps());
      const result = await handler.handleTick();
      expect(result.context_cleared).toBe(false);
    });

    it('handles clearContext throwing an error without propagating', async () => {
      mocks.modeShouldClearContext.mockReturnValue(true);
      mocks.contextClearerClearContext.mockRejectedValue(new Error('context clear crashed'));
      const handler = new DaemonTickHandler(makeDeps());
      // Should not throw
      await expect(handler.handleTick()).resolves.toBeDefined();
    });
  });

  // ── handleTick: TickResult structure ──────────────────────────────────

  describe('TickResult', () => {
    it('returns a complete TickResult on successful tick', async () => {
      const handler = new DaemonTickHandler(makeDeps());
      const result = await handler.handleTick();
      expect(result).toMatchObject({
        tick_number: 1,
        events_processed: 0,
        context_cleared: false,
        budget_status: 'ok',
      });
      expect(typeof result.duration_ms).toBe('number');
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('returns budget_status ok when under warning threshold', async () => {
      mocks.budgetGetSpending.mockReturnValue({
        total_usd: 0,
        daily_usd: 0,
        daily_reset_at: '2026-01-01T00:00:00.000Z',
        last_updated: '2026-01-01T00:00:00.000Z',
      });
      const handler = new DaemonTickHandler(makeDeps());
      const result = await handler.handleTick();
      expect(result.budget_status).toBe('ok');
    });

    it('returns budget_status warning when flat cap threshold is reached', async () => {
      mocks.budgetGetSpending.mockReturnValue({
        total_usd: 8, // 80% of flat_cap=10
        daily_usd: 0,
        daily_reset_at: '2026-01-01T00:00:00.000Z',
        last_updated: '2026-01-01T00:00:00.000Z',
      });
      const config = makeExecutorConfig({
        budget: { flat_cap_usd: 10, warning_threshold: 0.8, daily_reset_hour: 0 },
      });
      const handler = new DaemonTickHandler(makeDeps(config));
      const result = await handler.handleTick();
      expect(result.budget_status).toBe('warning');
    });

    it('returns budget_status warning when daily cap threshold is reached', async () => {
      mocks.budgetGetSpending.mockReturnValue({
        total_usd: 0,
        daily_usd: 8, // 80% of daily_cap=10
        daily_reset_at: '2026-01-01T00:00:00.000Z',
        last_updated: '2026-01-01T00:00:00.000Z',
      });
      const config = makeExecutorConfig({
        budget: { daily_cap_usd: 10, warning_threshold: 0.8, daily_reset_hour: 0 },
      });
      const handler = new DaemonTickHandler(makeDeps(config));
      const result = await handler.handleTick();
      expect(result.budget_status).toBe('warning');
    });
  });

  // ── buildTickContext ────────────────────────────────────────────────────────

  describe('buildTickContext', () => {
    it('returns a non-empty string', () => {
      const handler = new DaemonTickHandler(makeDeps());
      const ctx = handler.buildTickContext();
      expect(typeof ctx).toBe('string');
      expect(ctx.length).toBeGreaterThan(0);
    });

    it('includes the Daemon Tick Context header', () => {
      const handler = new DaemonTickHandler(makeDeps());
      expect(handler.buildTickContext()).toContain('Daemon Tick Context');
    });

    it('includes the current mode from executorMode.getMode()', () => {
      mocks.modeGetMode.mockReturnValue('hybrid');
      const handler = new DaemonTickHandler(makeDeps());
      expect(handler.buildTickContext()).toContain('hybrid');
    });

    it('includes the current tick count', async () => {
      const handler = new DaemonTickHandler(makeDeps());
      await handler.handleTick();
      await handler.handleTick();
      expect(handler.buildTickContext()).toContain('2');
    });

    it('includes spending data from budgetManager.getSpending()', () => {
      mocks.budgetGetSpending.mockReturnValue({
        total_usd: 3.14,
        daily_usd: 1.59,
        daily_reset_at: '2026-01-01T00:00:00.000Z',
        last_updated: '2026-01-01T00:00:00.000Z',
      });
      const handler = new DaemonTickHandler(makeDeps());
      const ctx = handler.buildTickContext();
      expect(ctx).toContain('3.1400');
      expect(ctx).toContain('1.5900');
    });
  });

  // ── getTickCount ───────────────────────────────────────────────────────────

  describe('getTickCount', () => {
    it('returns cumulative count across multiple ticks', async () => {
      const handler = new DaemonTickHandler(makeDeps());
      for (let i = 0; i < 5; i++) {
        await handler.handleTick();
      }
      expect(handler.getTickCount()).toBe(5);
    });

    it('counts aborted ticks (budget exceeded) in tick count', async () => {
      mocks.budgetCanProcess.mockReturnValue(false);
      const handler = new DaemonTickHandler(makeDeps());
      await handler.handleTick();
      // Even aborted ticks increment the counter
      expect(handler.getTickCount()).toBe(1);
    });
  });
});
