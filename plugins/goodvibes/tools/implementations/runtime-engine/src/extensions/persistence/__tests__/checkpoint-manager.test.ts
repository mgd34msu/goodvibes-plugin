import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckpointManager } from '../checkpoint-manager.js';
import type { CheckpointManagerDeps } from '../checkpoint-manager.js';
import type { RuntimeConfig } from '../../../shared/config.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../core/observability/timer.js', () => {
  const MockTimer = vi.fn(function(this: Record<string, unknown>, { callback, intervalMs }: { callback: () => void; intervalMs: number }) {
    this.start = vi.fn();
    this.stop = vi.fn();
    this._callback = callback;
    this._intervalMs = intervalMs;
  });
  return { Timer: MockTimer };
});

import { Timer } from '../../../core/observability/timer.js';
const MockTimer = vi.mocked(Timer);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(checkpointIntervalMs?: number): RuntimeConfig {
  return {
    persistence: {
      state_dir: '.goodvibes/state',
      checkpoint_interval_ms: checkpointIntervalMs,
    },
  } as unknown as RuntimeConfig;
}

function makeDeps(overrides: Partial<CheckpointManagerDeps> = {}): CheckpointManagerDeps {
  return {
    stateStore: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      initialize: vi.fn().mockResolvedValue(undefined),
    } as unknown as CheckpointManagerDeps['stateStore'],
    eventLog: {
      compact: vi.fn().mockResolvedValue(undefined),
    } as unknown as CheckpointManagerDeps['eventLog'],
    healthChecker: {
      check: vi.fn().mockReturnValue({
        status: 'healthy',
        uptime_ms: 1000,
        memory_usage_mb: 50,
        pid: 12345,
        checks: [],
        timestamp: new Date().toISOString(),
      }),
    } as unknown as CheckpointManagerDeps['healthChecker'],
    workflowEngine: {
      prune: vi.fn(),
    } as unknown as CheckpointManagerDeps['workflowEngine'],
    agentCoordinator: {
      prune: vi.fn(),
    } as unknown as CheckpointManagerDeps['agentCoordinator'],
    config: makeConfig(30_000),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CheckpointManager — start()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockTimer.mockClear();
  });

  it('creates a Timer and starts it', () => {
    const deps = makeDeps();
    const manager = new CheckpointManager(deps);
    manager.start();
    expect(MockTimer).toHaveBeenCalledTimes(1);
    const instance = MockTimer.mock.results[0].value;
    expect(instance.start).toHaveBeenCalledTimes(1);
  });

  it('uses the configured checkpoint interval', () => {
    const deps = makeDeps({ config: makeConfig(60_000) });
    const manager = new CheckpointManager(deps);
    manager.start();
    const instance = MockTimer.mock.results[0].value;
    expect(instance._intervalMs).toBe(60_000);
  });

  it('enforces MIN_CHECKPOINT_INTERVAL_MS floor (1000ms)', () => {
    const deps = makeDeps({ config: makeConfig(0) });
    const manager = new CheckpointManager(deps);
    manager.start();
    const instance = MockTimer.mock.results[0].value;
    expect(instance._intervalMs).toBeGreaterThanOrEqual(1_000);
  });

  it('uses the default interval when config value is undefined', () => {
    const deps = makeDeps({ config: makeConfig(undefined) });
    const manager = new CheckpointManager(deps);
    manager.start();
    const instance = MockTimer.mock.results[0].value;
    // Default is 30_000; floor is 1_000 — should be 30_000
    expect(instance._intervalMs).toBe(30_000);
  });
});

describe('CheckpointManager — stop()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockTimer.mockClear();
  });

  it('calls stop on the timer and nulls the reference', () => {
    const deps = makeDeps();
    const manager = new CheckpointManager(deps);
    manager.start();
    const instance = MockTimer.mock.results[0].value;
    manager.stop();
    expect(instance.stop).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the timer was never started', () => {
    const deps = makeDeps();
    const manager = new CheckpointManager(deps);
    // Should not throw
    expect(() => manager.stop()).not.toThrow();
  });

  it('is idempotent — stop() twice is safe', () => {
    const deps = makeDeps();
    const manager = new CheckpointManager(deps);
    manager.start();
    const instance = MockTimer.mock.results[0].value;
    manager.stop();
    manager.stop();
    // stop was only called once on the timer instance
    expect(instance.stop).toHaveBeenCalledTimes(1);
  });
});

describe('CheckpointManager — saveCheckpoint()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes checkpoint data to stateStore under "runtime.checkpoint"', async () => {
    const deps = makeDeps();
    const manager = new CheckpointManager(deps);
    await manager.saveCheckpoint();
    expect(deps.stateStore.set).toHaveBeenCalledWith(
      'runtime.checkpoint',
      expect.objectContaining({
        pid: process.pid,
        status: 'healthy',
        uptime_ms: 1000,
        memory_usage_mb: 50,
        timestamp: expect.any(String),
      }),
    );
  });

  it('calls eventLog.compact()', async () => {
    const deps = makeDeps();
    const manager = new CheckpointManager(deps);
    await manager.saveCheckpoint();
    expect(deps.eventLog.compact).toHaveBeenCalledTimes(1);
  });

  it('does not throw when eventLog.compact() fails', async () => {
    const deps = makeDeps({
      eventLog: {
        compact: vi.fn().mockRejectedValue(new Error('compact failed')),
      } as unknown as CheckpointManagerDeps['eventLog'],
    });
    const manager = new CheckpointManager(deps);
    await expect(manager.saveCheckpoint()).resolves.toBeUndefined();
  });

  it('prunes workflowEngine and agentCoordinator via the timer callback', () => {
    const deps = makeDeps();
    const manager = new CheckpointManager(deps);
    manager.start();
    // Extract and invoke the timer callback directly
    const instance = MockTimer.mock.results[0].value;
    instance._callback();
    expect(deps.workflowEngine!.prune).toHaveBeenCalledTimes(1);
    expect(deps.agentCoordinator!.prune).toHaveBeenCalledTimes(1);
  });

  it('does not throw when workflowEngine.prune() throws', () => {
    const deps = makeDeps({
      workflowEngine: {
        prune: vi.fn().mockImplementation(() => { throw new Error('prune failed'); }),
      } as unknown as CheckpointManagerDeps['workflowEngine'],
    });
    const manager = new CheckpointManager(deps);
    manager.start();
    const instance = MockTimer.mock.results[0].value;
    expect(() => instance._callback()).not.toThrow();
  });

  it('works with null workflowEngine and agentCoordinator', () => {
    const deps = makeDeps({ workflowEngine: null, agentCoordinator: null });
    const manager = new CheckpointManager(deps);
    manager.start();
    const instance = MockTimer.mock.results[0].value;
    expect(() => instance._callback()).not.toThrow();
  });
});
