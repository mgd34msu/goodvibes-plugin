/**
 * Tests for createExecutorSubsystem() factory
 *
 * Covers: successful creation, component types, event emission, failure handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExecutorSubsystem } from '../subsystem.js';

// ─── Module mocks ────────────────────────────────────────────────────────────

// Track what mode/detectionMethod is returned from mocked instances
let mockMode = 'engaged';
let mockDetectionMethod = 'default';
let mockExecutorModeManagerShouldThrow = false;
let mockExecutorBudgetManagerShouldThrow = false;
let mockDaemonTickHandlerShouldThrow = false;

vi.mock('../../core/processing/executor-mode.js', () => {
  return {
    ExecutorModeManager: vi.fn().mockImplementation(function (this: any) {
      if (mockExecutorModeManagerShouldThrow) throw new Error('mode manager init failed');
      this.getMode = vi.fn(() => mockMode);
      this.getDetectionMethod = vi.fn(() => mockDetectionMethod);
      this.setMode = vi.fn();
      this.shouldProcessQueue = vi.fn().mockReturnValue(true);
      this.shouldClearContext = vi.fn().mockReturnValue(false);
      this.detectMode = vi.fn(() => mockMode);
      this.updateConfig = vi.fn();
    }),
  };
});

vi.mock('../executor-budget.js', () => {
  return {
    ExecutorBudgetManager: vi.fn().mockImplementation(function (this: any) {
      if (mockExecutorBudgetManagerShouldThrow) throw new Error('budget manager init failed');
      this.canProcess = vi.fn().mockReturnValue(true);
      this.getSpending = vi.fn().mockReturnValue({ total_usd: 0, daily_usd: 0, daily_reset_at: '', last_updated: '' });
      this.recordSpending = vi.fn();
      this.checkDailyReset = vi.fn().mockReturnValue(false);
      this.adjustBudget = vi.fn();
      this.persist = vi.fn();
      this.restore = vi.fn();
    }),
  };
});

vi.mock('../daemon-tick-handler.js', () => {
  return {
    DaemonTickHandler: vi.fn().mockImplementation(function (this: any) {
      if (mockDaemonTickHandlerShouldThrow) throw new Error('tick handler init failed');
      this.setQueueDepthGetter = vi.fn();
      this.handleTick = vi.fn();
      this.buildTickContext = vi.fn().mockReturnValue('tick context');
      this.getTickCount = vi.fn().mockReturnValue(0);
      this.getTickCommand = vi.fn().mockReturnValue('/tick');
    }),
  };
});

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockGenerateEventId = vi.fn().mockReturnValue('evt-123');
const mockTimestamp = vi.fn().mockReturnValue('2025-01-01T00:00:00.000Z');

vi.mock('../../../shared/utils.js', () => ({
  generateEventId: mockGenerateEventId,
  timestamp: mockTimestamp,
  toErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(): any {
  return {
    executor: {
      mode: 'engaged' as const,
      daemon: {
        clear_context_after_batch: false,
        tmux_session_name: 'gv',
        tick_command: '/tick',
        tick_interval_ms: 0,
        auto_tick: false,
        eval_interval_ms: 10000,
      },
      budget: {
        flat_cap_usd: undefined,
        daily_cap_usd: undefined,
        warning_threshold: 0.8,
        daily_reset_hour: 0,
      },
    },
  };
}

function makeEventBus(): any {
  return {
    emit: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createExecutorSubsystem()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset control flags
    mockMode = 'engaged';
    mockDetectionMethod = 'default';
    mockExecutorModeManagerShouldThrow = false;
    mockExecutorBudgetManagerShouldThrow = false;
    mockDaemonTickHandlerShouldThrow = false;
    // Re-apply mock return values after clear
    mockGenerateEventId.mockReturnValue('evt-123');
    mockTimestamp.mockReturnValue('2025-01-01T00:00:00.000Z');
  });

  // ─── Successful creation ──────────────────────────────────────────────────

  describe('successful creation', () => {
    it('returns an ExecutorSubsystem object (not null)', () => {
      const result = createExecutorSubsystem(makeConfig(), makeEventBus());
      expect(result).not.toBeNull();
    });

    it('returns all three subsystem components', () => {
      const result = createExecutorSubsystem(makeConfig(), makeEventBus());
      expect(result).toHaveProperty('executorMode');
      expect(result).toHaveProperty('executorBudget');
      expect(result).toHaveProperty('daemonTickHandler');
    });

    it('executorMode component has expected methods', () => {
      const result = createExecutorSubsystem(makeConfig(), makeEventBus())!;
      expect(typeof result.executorMode.getMode).toBe('function');
      expect(typeof result.executorMode.getDetectionMethod).toBe('function');
    });

    it('executorBudget component has expected methods', () => {
      const result = createExecutorSubsystem(makeConfig(), makeEventBus())!;
      expect(typeof result.executorBudget.canProcess).toBe('function');
      expect(typeof result.executorBudget.getSpending).toBe('function');
    });

    it('daemonTickHandler component has expected methods', () => {
      const result = createExecutorSubsystem(makeConfig(), makeEventBus())!;
      expect(typeof result.daemonTickHandler.handleTick).toBe('function');
    });
  });

  // ─── EventBus emission ────────────────────────────────────────────────────

  describe('event bus emission', () => {
    it('emits executor:mode_set event on successful creation', () => {
      const eventBus = makeEventBus();
      createExecutorSubsystem(makeConfig(), eventBus);
      expect(eventBus.emit).toHaveBeenCalledTimes(1);
    });

    it('emits event with correct type executor:mode_set', () => {
      const eventBus = makeEventBus();
      createExecutorSubsystem(makeConfig(), eventBus);
      const emittedEvent = eventBus.emit.mock.calls[0][0];
      expect(emittedEvent.type).toBe('executor:mode_set');
    });

    it('emits event with mode from executorMode.getMode()', () => {
      mockMode = 'daemon';
      const eventBus = makeEventBus();
      createExecutorSubsystem(makeConfig(), eventBus);
      const emittedEvent = eventBus.emit.mock.calls[0][0];
      expect(emittedEvent.payload.data.mode).toBe('daemon');
    });

    it('emits event with detection_method from executorMode.getDetectionMethod()', () => {
      mockDetectionMethod = 'inferred';
      const eventBus = makeEventBus();
      createExecutorSubsystem(makeConfig(), eventBus);
      const emittedEvent = eventBus.emit.mock.calls[0][0];
      expect(emittedEvent.payload.data.detection_method).toBe('inferred');
    });

    it('emits event with generated id and timestamp', () => {
      const eventBus = makeEventBus();
      createExecutorSubsystem(makeConfig(), eventBus);
      const emittedEvent = eventBus.emit.mock.calls[0][0];
      expect(emittedEvent.id).toBe('evt-123');
      expect(emittedEvent.timestamp).toBe('2025-01-01T00:00:00.000Z');
    });

    it('emits event with source kind="system"', () => {
      const eventBus = makeEventBus();
      createExecutorSubsystem(makeConfig(), eventBus);
      const emittedEvent = eventBus.emit.mock.calls[0][0];
      expect(emittedEvent.source).toEqual({ kind: 'system' });
    });

    it('emits event payload with type executor:mode_set', () => {
      const eventBus = makeEventBus();
      createExecutorSubsystem(makeConfig(), eventBus);
      const emittedEvent = eventBus.emit.mock.calls[0][0];
      expect(emittedEvent.payload.type).toBe('executor:mode_set');
    });
  });

  // ─── Constructor injection ────────────────────────────────────────────────

  describe('constructor calls', () => {
    it('instantiates ExecutorModeManager with executor config and eventBus', async () => {
      const { ExecutorModeManager } = await import('../../core/processing/executor-mode.js');
      const config = makeConfig();
      const eventBus = makeEventBus();
      createExecutorSubsystem(config, eventBus);
      expect(ExecutorModeManager).toHaveBeenCalledWith(config.executor, eventBus);
    });

    it('instantiates ExecutorBudgetManager with budget config and eventBus', async () => {
      const { ExecutorBudgetManager } = await import('../executor-budget.js');
      const config = makeConfig();
      const eventBus = makeEventBus();
      createExecutorSubsystem(config, eventBus);
      expect(ExecutorBudgetManager).toHaveBeenCalledWith(config.executor.budget, eventBus);
    });

    it('instantiates DaemonTickHandler with executorMode, budgetManager, eventBus, config', async () => {
      const { DaemonTickHandler } = await import('../daemon-tick-handler.js');
      const config = makeConfig();
      const eventBus = makeEventBus();
      createExecutorSubsystem(config, eventBus);
      expect(DaemonTickHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventBus,
          config: config.executor,
        }),
      );
    });
  });

  // ─── Failure handling ─────────────────────────────────────────────────────

  describe('failure handling', () => {
    it('returns null when ExecutorModeManager constructor throws', () => {
      mockExecutorModeManagerShouldThrow = true;
      const result = createExecutorSubsystem(makeConfig(), makeEventBus());
      expect(result).toBeNull();
    });

    it('returns null when ExecutorBudgetManager constructor throws', () => {
      mockExecutorBudgetManagerShouldThrow = true;
      const result = createExecutorSubsystem(makeConfig(), makeEventBus());
      expect(result).toBeNull();
    });

    it('returns null when DaemonTickHandler constructor throws', () => {
      mockDaemonTickHandlerShouldThrow = true;
      const result = createExecutorSubsystem(makeConfig(), makeEventBus());
      expect(result).toBeNull();
    });

    it('returns null when eventBus.emit throws', () => {
      const eventBus = makeEventBus();
      eventBus.emit.mockImplementation(() => { throw new Error('emit failed'); });
      const result = createExecutorSubsystem(makeConfig(), eventBus);
      expect(result).toBeNull();
    });

    it('does not throw even when creation fails — swallows error', () => {
      mockExecutorModeManagerShouldThrow = true;
      expect(() => createExecutorSubsystem(makeConfig(), makeEventBus())).not.toThrow();
    });

    it('does not emit event when creation fails', () => {
      mockExecutorModeManagerShouldThrow = true;
      const eventBus = makeEventBus();
      createExecutorSubsystem(makeConfig(), eventBus);
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });

  // ─── Various executor modes ───────────────────────────────────────────────

  describe('executor mode variations', () => {
    it.each(['engaged', 'daemon', 'hybrid'] as const)(
      'creates subsystem for mode=%s',
      (mode) => {
        mockMode = mode;
        const config = makeConfig();
        config.executor.mode = mode;
        const result = createExecutorSubsystem(config, makeEventBus());
        expect(result).not.toBeNull();
      },
    );

    it('returns executorMode with the mode from the mock instance', () => {
      mockMode = 'hybrid';
      const result = createExecutorSubsystem(makeConfig(), makeEventBus())!;
      expect(result.executorMode.getMode()).toBe('hybrid');
    });
  });
});
