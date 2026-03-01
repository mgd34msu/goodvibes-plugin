import { describe, it, expect, vi, afterEach } from 'vitest';
import { TickDriver } from '../tick-driver.js';
import type { TickDriverDeps } from '../tick-driver.js';

// Mock external system modules used by TickDriver
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  execFile: vi.fn(),
}));

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Minimal Timer stub — MUST use a regular function (not arrow) to satisfy vitest
// class-constructor requirements. A regular function that returns a non-primitive
// object from `new` causes JS to use the returned object as the instance.
vi.mock('../../../core/observability/timer.js', () => ({
  Timer: vi.fn(function MockTimer(opts: { callback: () => void }) {
    const instance = {
      _callback: opts.callback,
      _running: false,
      isRunning() { return this._running; },
      start() { this._running = true; },
      stop() { this._running = false; },
      reconfigure: vi.fn(),
      fire() { this._callback(); },
    };
    return instance;
  }),
}));

// Retrieve mocked child_process functions for use in tests
import { execFileSync, execFile } from 'node:child_process';
const mockExecFileSync = vi.mocked(execFileSync);
const mockExecFile = vi.mocked(execFile);

function makeConfig(
  daemonOverrides: Record<string, unknown> = {},
  rootOverrides: Record<string, unknown> = {},
) {
  return {
    daemon: {
      auto_tick: true,
      tick_interval_ms: 60_000,
      eval_interval_ms: 10_000,
      tmux_session_name: 'my-session',
      tick_command: '/usr/local/bin/gv-tick',
      clear_context_after_batch: false,
      ...daemonOverrides,
    },
    budget: {
      flat_cap_usd: 0,
      daily_cap_usd: 0,
      warning_threshold: 0.8,
    },
    ...rootOverrides,
  } as any;
}

function makeScheduler() {
  const items = new Map<string, any>();
  return {
    scheduleHeartbeat: vi.fn((params: any) => {
      items.set(params.id, { ...params });
    }),
    cancel: vi.fn((id: string) => items.delete(id)),
    getItem: vi.fn((id: string) => items.get(id)),
    _items: items,
  };
}

function makeTimePlugin(scheduler?: ReturnType<typeof makeScheduler>) {
  const s = scheduler ?? makeScheduler();
  return {
    onTick: vi.fn(() => ({ heartbeat_emitted: false, scheduled_emitted: 0 })),
    getScheduler: vi.fn(() => s),
    _scheduler: s,
  };
}

function makeExecutorMode(mode: 'daemon' | 'engaged' = 'engaged') {
  return {
    getMode: vi.fn(() => mode),
  };
}

function makeDeps(
  overrides: Partial<TickDriverDeps> & { mode?: 'daemon' | 'engaged' } = {},
): TickDriverDeps {
  const { mode = 'engaged', ...rest } = overrides;
  return {
    config: makeConfig(),
    executorMode: makeExecutorMode(mode),
    timePlugin: makeTimePlugin(),
    ...rest,
  } as TickDriverDeps;
}

describe('TickDriver', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── start — engaged mode ────────────────────────────────────────────────────

  describe('start (engaged mode)', () => {
    it('starts the timer in engaged mode unconditionally', () => {
      const deps = makeDeps({ mode: 'engaged' });
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(true);
    });

    it('is idempotent — start is a no-op when already running', () => {
      const deps = makeDeps({ mode: 'engaged' });
      const driver = new TickDriver(deps);
      driver.start();
      driver.start();
      expect(driver.isRunning()).toBe(true);
    });
  });

  // ─── start — daemon mode guards ─────────────────────────────────────────────

  describe('start (daemon mode guards)', () => {
    it('does not start when auto_tick is false', () => {
      const deps = makeDeps({
        mode: 'daemon',
        config: makeConfig({ auto_tick: false }),
      });
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(false);
    });

    it('does not start when tick_interval_ms is 0', () => {
      const deps = makeDeps({
        mode: 'daemon',
        config: makeConfig({ tick_interval_ms: 0 }),
      });
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(false);
    });

    it('does not start when tmux is unavailable', () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('tmux not found');
      });
      const deps = makeDeps({ mode: 'daemon' });
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(false);
    });

    it('does not start when tmux_session_name is invalid', () => {
      // execFileSync succeeds (tmux available)
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      const deps = makeDeps({
        mode: 'daemon',
        config: makeConfig({ tmux_session_name: 'bad session!!' }),
      });
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(false);
    });

    it('does not start when tick_command is invalid', () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      const deps = makeDeps({
        mode: 'daemon',
        config: makeConfig({ tick_command: 'bad command; rm -rf' }),
      });
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(false);
    });

    it('starts and schedules daemon heartbeat when all guards pass', () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      const scheduler = makeScheduler();
      const timePlugin = makeTimePlugin(scheduler);
      const deps = makeDeps({ mode: 'daemon', timePlugin });
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(true);
      expect(scheduler.scheduleHeartbeat).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'daemon:auto_tick',
          event_type: 'daemon:tick',
          interval_ms: 60_000,
        }),
      );
    });

    it('cancels a stale heartbeat with a different interval before rescheduling', () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      const scheduler = makeScheduler();
      // Pre-populate the stale heartbeat with a different interval
      scheduler._items.set('daemon:auto_tick', { id: 'daemon:auto_tick', interval_ms: 999 });
      const timePlugin = makeTimePlugin(scheduler);
      const deps = makeDeps({ mode: 'daemon', timePlugin });
      const driver = new TickDriver(deps);
      driver.start();
      expect(scheduler.cancel).toHaveBeenCalledWith('daemon:auto_tick');
      expect(scheduler.scheduleHeartbeat).toHaveBeenCalled();
    });

    it('does not reschedule daemon heartbeat if one already exists with correct interval', () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      const scheduler = makeScheduler();
      // Pre-populate with matching interval
      scheduler._items.set('daemon:auto_tick', { id: 'daemon:auto_tick', interval_ms: 60_000 });
      const timePlugin = makeTimePlugin(scheduler);
      const deps = makeDeps({ mode: 'daemon', timePlugin });
      const driver = new TickDriver(deps);
      driver.start();
      expect(scheduler.scheduleHeartbeat).not.toHaveBeenCalled();
    });
  });

  // ─── stop ───────────────────────────────────────────────────────────────────

  describe('stop', () => {
    it('stops the timer', () => {
      const deps = makeDeps({ mode: 'engaged' });
      const driver = new TickDriver(deps);
      driver.start();
      driver.stop();
      expect(driver.isRunning()).toBe(false);
    });

    it('cancels the daemon heartbeat on stop', () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      const scheduler = makeScheduler();
      const timePlugin = makeTimePlugin(scheduler);
      const deps = makeDeps({ mode: 'daemon', timePlugin });
      const driver = new TickDriver(deps);
      driver.start();
      driver.stop();
      // cancel is called once during stop
      // (may also be called during start if no existing heartbeat was found)
      const cancelCalls = scheduler.cancel.mock.calls.map((c: any) => c[0]);
      expect(cancelCalls).toContain('daemon:auto_tick');
    });
  });

  // ─── reconfigure ────────────────────────────────────────────────────────────

  describe('reconfigure', () => {
    it('starts the driver when auto_tick is toggled on in engaged mode', () => {
      // Start with auto_tick=false so driver doesn't start initially
      const deps = makeDeps({
        mode: 'engaged',
        config: makeConfig({ auto_tick: false }),
      });
      const driver = new TickDriver(deps);
      driver.start(); // won't start in daemon mode guard... but in engaged mode start() ignores auto_tick
      // In engaged mode, start() runs unconditionally. So we simulate the daemon case
      // by stopping and testing the reconfigure path:
      driver.stop();
      expect(driver.isRunning()).toBe(false);

      const newConfig = makeConfig({ auto_tick: true });
      driver.reconfigure(newConfig);
      expect(driver.isRunning()).toBe(true);
    });

    it('stops the driver when auto_tick is toggled off', () => {
      const deps = makeDeps({ mode: 'engaged' });
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(true);

      const newConfig = makeConfig({ auto_tick: false });
      driver.reconfigure(newConfig);
      expect(driver.isRunning()).toBe(false);
    });

    it('reconfigures timer interval when eval_interval_ms changes while running', () => {
      const deps = makeDeps({ mode: 'engaged' });
      const driver = new TickDriver(deps);
      driver.start();

      const newConfig = makeConfig({ eval_interval_ms: 5000 });
      driver.reconfigure(newConfig);
      // isRunning should still be true (didn't stop)
      expect(driver.isRunning()).toBe(true);
    });
  });

  // ─── evaluate pipeline ──────────────────────────────────────────────────────

  describe('evaluate (pipeline)', () => {
    it('calls timePlugin.onTick on each evaluate cycle', () => {
      const deps = makeDeps({ mode: 'engaged' });
      const driver = new TickDriver(deps);
      driver.start();
      // Manually trigger the evaluate by calling the timer callback via fire()
      (driver as any).timer.fire();
      expect(deps.timePlugin.onTick).toHaveBeenCalledOnce();
    });

    it('calls externalPlugin.onTick when provided', async () => {
      const externalPlugin = { onTick: vi.fn(() => Promise.resolve()) };
      const deps = makeDeps({ mode: 'engaged', externalPlugin });
      const driver = new TickDriver(deps);
      driver.start();
      (driver as any).timer.fire();
      expect(externalPlugin.onTick).toHaveBeenCalledOnce();
    });

    it('calls eventProcessor.processBatch when provided', async () => {
      const eventProcessor = { processBatch: vi.fn(() => Promise.resolve()) };
      const deps = makeDeps({ mode: 'engaged', eventProcessor });
      const driver = new TickDriver(deps);
      driver.start();
      (driver as any).timer.fire();
      expect(eventProcessor.processBatch).toHaveBeenCalledOnce();
    });

    it('calls staleWorkflowChecker when provided', () => {
      const staleWorkflowChecker = vi.fn();
      const deps = makeDeps({ mode: 'engaged', staleWorkflowChecker });
      const driver = new TickDriver(deps);
      driver.start();
      (driver as any).timer.fire();
      expect(staleWorkflowChecker).toHaveBeenCalledOnce();
    });

    it('increments evalFailureCount when timePlugin.onTick throws', () => {
      const timePlugin = makeTimePlugin();
      vi.mocked(timePlugin.onTick).mockImplementationOnce(() => {
        throw new Error('boom');
      });
      const deps = makeDeps({ mode: 'engaged', timePlugin });
      const driver = new TickDriver(deps);
      driver.start();
      (driver as any).timer.fire();
      expect(driver.getEvalFailureCount()).toBe(1);
    });

    it('increments evalFailureCount when staleWorkflowChecker throws', () => {
      const staleWorkflowChecker = vi.fn().mockImplementationOnce(() => {
        throw new Error('stale error');
      });
      const deps = makeDeps({ mode: 'engaged', staleWorkflowChecker });
      const driver = new TickDriver(deps);
      driver.start();
      (driver as any).timer.fire();
      expect(driver.getEvalFailureCount()).toBe(1);
    });

    it('sends tmux tick when scheduled_emitted > 0 in daemon mode', () => {
      const timePlugin = makeTimePlugin();
      vi.mocked(timePlugin.onTick).mockReturnValueOnce({
        heartbeat_emitted: false,
        scheduled_emitted: 2,
      });
      const executorMode = makeExecutorMode('daemon');
      const deps = makeDeps({ mode: 'daemon', timePlugin, executorMode });
      const driver = new TickDriver(deps);
      // Manually trigger evaluate without starting the timer (avoids tmux guard)
      (driver as any).evaluate();
      expect(mockExecFile).toHaveBeenCalled();
    });

    it('does not send tmux tick in engaged mode even when scheduled_emitted > 0', () => {
      const timePlugin = makeTimePlugin();
      vi.mocked(timePlugin.onTick).mockReturnValueOnce({
        heartbeat_emitted: false,
        scheduled_emitted: 2,
      });
      const deps = makeDeps({ mode: 'engaged', timePlugin });
      const driver = new TickDriver(deps);
      driver.start();
      (driver as any).timer.fire();
      expect(mockExecFile).not.toHaveBeenCalled();
    });
  });

  // ─── getEvalFailureCount ─────────────────────────────────────────────────────

  describe('getEvalFailureCount', () => {
    it('returns 0 initially', () => {
      const driver = new TickDriver(makeDeps());
      expect(driver.getEvalFailureCount()).toBe(0);
    });
  });
});
