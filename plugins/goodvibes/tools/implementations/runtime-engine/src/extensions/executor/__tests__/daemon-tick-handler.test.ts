import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DaemonTickHandler } from '../daemon-tick-handler.js';
import type { ExecutorConfig } from '../../../shared/config.js';

// Mock external dependencies
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../shared/utils.js', () => ({
  generateEventId: vi.fn(() => 'mock-event-id'),
  timestamp: vi.fn(() => 'mock-timestamp'),
}));

// Mock ContextClearer — we don't want real tmux calls
// Must use a class or regular function (not arrow) so it can be called with `new`.
vi.mock('../context-clearer.js', () => ({
  ContextClearer: vi.fn(function MockContextClearer(this: any) {
    this.clearContext = vi.fn(() => Promise.resolve({ success: true, method: 'tmux' }));
  }),
}));

function makeConfig(overrides: Partial<ExecutorConfig['budget']> = {}): ExecutorConfig {
  return {
    daemon: {
      clear_context_after_batch: false,
      tmux_session_name: 'test-session',
      tick_command: '/usr/local/bin/tick',
      tick_interval_ms: 60_000,
      auto_tick: true,
      eval_interval_ms: 10_000,
    },
    budget: {
      flat_cap_usd: 0,
      daily_cap_usd: 0,
      warning_threshold: 0.8,
      ...overrides,
    },
    // Provide minimal required config keys — extend as needed
  } as unknown as ExecutorConfig;
}

function makeBudgetManager(canProcess = true, spending = { total_usd: 0, daily_usd: 0 }) {
  return {
    canProcess: vi.fn(() => canProcess),
    checkDailyReset: vi.fn(),
    getSpending: vi.fn(() => spending),
  };
}

function makeExecutorMode(shouldClear = false) {
  return {
    getMode: vi.fn(() => 'daemon'),
    shouldClearContext: vi.fn(() => shouldClear),
  };
}

function makeEventBus() {
  return {
    emit: vi.fn(),
    on: vi.fn(() => vi.fn()),
  };
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    executorMode: makeExecutorMode(),
    budgetManager: makeBudgetManager(),
    eventBus: makeEventBus(),
    config: makeConfig(),
    ...overrides,
  };
}

describe('DaemonTickHandler', () => {
  // ─── handleTick — budget exceeded ───────────────────────────────────────────

  describe('handleTick — budget exceeded', () => {
    it('returns budget_status=exceeded and does not emit events', async () => {
      const eventBus = makeEventBus();
      const handler = new DaemonTickHandler({
        ...makeDeps({ eventBus }),
        budgetManager: makeBudgetManager(false),
        eventBus,
      } as any);
      const result = await handler.handleTick();
      expect(result.budget_status).toBe('exceeded');
      expect(result.events_processed).toBe(0);
      expect(result.context_cleared).toBe(false);
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('increments tick_number even when budget is exceeded', async () => {
      const handler = new DaemonTickHandler({
        ...makeDeps(),
        budgetManager: makeBudgetManager(false),
      } as any);
      await handler.handleTick();
      await handler.handleTick();
      expect(handler.getTickCount()).toBe(2);
    });
  });

  // ─── handleTick — normal flow ────────────────────────────────────────────────

  describe('handleTick — normal flow', () => {
    it('emits tick_received and tick_completed events', async () => {
      const eventBus = makeEventBus();
      const handler = new DaemonTickHandler(makeDeps({ eventBus }) as any);
      await handler.handleTick();

      const emittedTypes = eventBus.emit.mock.calls.map((c: any) => c[0].type);
      expect(emittedTypes).toContain('executor:tick_received');
      expect(emittedTypes).toContain('executor:tick_completed');
    });

    it('calls checkDailyReset on each tick', async () => {
      const budgetManager = makeBudgetManager();
      const handler = new DaemonTickHandler(makeDeps({ budgetManager }) as any);
      await handler.handleTick();
      expect(budgetManager.checkDailyReset).toHaveBeenCalledOnce();
    });

    it('returns a TickResult with tick_number=1 on first call', async () => {
      const handler = new DaemonTickHandler(makeDeps() as any);
      const result = await handler.handleTick();
      expect(result.tick_number).toBe(1);
      expect(result.events_processed).toBe(0);
      expect(typeof result.duration_ms).toBe('number');
    });

    it('returns budget_status=ok when spending is below warning threshold', async () => {
      const handler = new DaemonTickHandler(
        makeDeps({
          budgetManager: makeBudgetManager(true, { total_usd: 0, daily_usd: 0 }),
          config: makeConfig({ flat_cap_usd: 10, daily_cap_usd: 5, warning_threshold: 0.8 }),
        }) as any,
      );
      const result = await handler.handleTick();
      expect(result.budget_status).toBe('ok');
    });

    it('returns budget_status=warning when flat_cap spending exceeds threshold', async () => {
      const handler = new DaemonTickHandler(
        makeDeps({
          budgetManager: makeBudgetManager(true, { total_usd: 9, daily_usd: 0 }),
          config: makeConfig({ flat_cap_usd: 10, daily_cap_usd: 0, warning_threshold: 0.8 }),
        }) as any,
      );
      const result = await handler.handleTick();
      expect(result.budget_status).toBe('warning');
    });

    it('returns budget_status=warning when daily_cap spending exceeds threshold', async () => {
      const handler = new DaemonTickHandler(
        makeDeps({
          budgetManager: makeBudgetManager(true, { total_usd: 0, daily_usd: 4.1 }),
          config: makeConfig({ flat_cap_usd: 0, daily_cap_usd: 5, warning_threshold: 0.8 }),
        }) as any,
      );
      const result = await handler.handleTick();
      expect(result.budget_status).toBe('warning');
    });
  });

  // ─── handleTick — context clearing ─────────────────────────────────────────

  describe('handleTick — context clearing', () => {
    it('clears context when shouldClearContext returns true', async () => {
      const executorMode = makeExecutorMode(true);
      const eventBus = makeEventBus();
      const handler = new DaemonTickHandler(
        makeDeps({ executorMode, eventBus }) as any,
      );
      const result = await handler.handleTick();
      expect(result.context_cleared).toBe(true);
      const emittedTypes = eventBus.emit.mock.calls.map((c: any) => c[0].type);
      expect(emittedTypes).toContain('executor:context_clearing');
    });

    it('does not clear context when shouldClearContext returns false', async () => {
      const executorMode = makeExecutorMode(false);
      const handler = new DaemonTickHandler(makeDeps({ executorMode }) as any);
      const result = await handler.handleTick();
      expect(result.context_cleared).toBe(false);
    });

    it('handles context clearing failure gracefully', async () => {
      const { ContextClearer } = await import('../context-clearer.js');
      vi.mocked(ContextClearer).mockImplementationOnce(function MockFailing(this: any) {
        this.clearContext = vi.fn(() => Promise.reject(new Error('tmux gone')));
      } as any);

      const executorMode = makeExecutorMode(true);
      const handler = new DaemonTickHandler(makeDeps({ executorMode }) as any);
      const result = await handler.handleTick();
      // Should not throw — context_cleared is false when clearing fails
      expect(result.context_cleared).toBe(false);
    });
  });

  // ─── tick_received payload ───────────────────────────────────────────────────

  describe('tick_received payload', () => {
    it('includes tick_number and pending_events in tick_received payload', async () => {
      const eventBus = makeEventBus();
      const handler = new DaemonTickHandler(makeDeps({ eventBus }) as any);
      handler.setQueueDepthGetter(() => 7);
      await handler.handleTick();

      const tickReceived = eventBus.emit.mock.calls.find(
        (c: any) => c[0].type === 'executor:tick_received',
      );
      expect(tickReceived).toBeDefined();
      expect(tickReceived![0].payload.data.tick_number).toBe(1);
      expect(tickReceived![0].payload.data.pending_events).toBe(7);
    });
  });

  // ─── setQueueDepthGetter ────────────────────────────────────────────────────

  describe('setQueueDepthGetter', () => {
    it('uses 0 as default queue depth when no getter is set', async () => {
      const eventBus = makeEventBus();
      const handler = new DaemonTickHandler(makeDeps({ eventBus }) as any);
      await handler.handleTick();
      const tickReceived = eventBus.emit.mock.calls.find(
        (c: any) => c[0].type === 'executor:tick_received',
      );
      expect(tickReceived![0].payload.data.pending_events).toBe(0);
    });

    it('uses the injected getter for queue depth', async () => {
      const eventBus = makeEventBus();
      const handler = new DaemonTickHandler(makeDeps({ eventBus }) as any);
      handler.setQueueDepthGetter(() => 42);
      await handler.handleTick();
      const tickReceived = eventBus.emit.mock.calls.find(
        (c: any) => c[0].type === 'executor:tick_received',
      );
      expect(tickReceived![0].payload.data.pending_events).toBe(42);
    });
  });

  // ─── buildTickContext ───────────────────────────────────────────────────────

  describe('buildTickContext', () => {
    it('returns a string containing tick count, mode, budget, and event info', async () => {
      const handler = new DaemonTickHandler(makeDeps() as any);
      await handler.handleTick(); // tick 1
      const ctx = handler.buildTickContext();
      expect(typeof ctx).toBe('string');
      expect(ctx).toContain('Tick #1');
      expect(ctx).toContain('Mode:');
      expect(ctx).toContain('Budget:');
      expect(ctx).toContain('Pending events:');
      expect(ctx).toContain('Active workflows:');
    });

    it('reflects the injected queue depth in the context string', async () => {
      const handler = new DaemonTickHandler(makeDeps() as any);
      handler.setQueueDepthGetter(() => 15);
      const ctx = handler.buildTickContext();
      expect(ctx).toContain('Pending events: 15');
    });
  });

  // ─── getTickCount / getTickCommand ──────────────────────────────────────────

  describe('getTickCount', () => {
    it('returns 0 initially', () => {
      const handler = new DaemonTickHandler(makeDeps() as any);
      expect(handler.getTickCount()).toBe(0);
    });

    it('increments with each handleTick call', async () => {
      const handler = new DaemonTickHandler(makeDeps() as any);
      await handler.handleTick();
      await handler.handleTick();
      await handler.handleTick();
      expect(handler.getTickCount()).toBe(3);
    });
  });

  describe('getTickCommand', () => {
    it('returns the configured tick command', () => {
      const handler = new DaemonTickHandler(makeDeps() as any);
      expect(handler.getTickCommand()).toBe('/usr/local/bin/tick');
    });
  });
});
