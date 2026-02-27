/**
 * Unit tests for TickDriver
 *
 * Replaces the deleted daemon-tick-scheduler.test.ts. Tests the unified
 * v3 pipeline evaluation driver across daemon and non-daemon modes.
 *
 * Strategy:
 * - vi.hoisted() declares mock variables before vi.mock() hoisting fires.
 * - node:child_process is fully mocked to intercept tmux calls.
 * - TimePlugin, ExecutorModeManager, ExternalPlugin, EventProcessor are all
 *   minimal mocks so TickDriver logic is tested in isolation.
 * - vi.useFakeTimers() controls the internal Timer without wall-clock delays.
 * - evaluate() is private — triggered via vi.advanceTimersByTime() or by
 *   calling start() in non-daemon mode then advancing the timer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mock variables ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  // child_process
  const execFileSync = vi.fn();
  const execFile = vi.fn();

  // ExecutorModeManager
  const modeGetMode = vi.fn().mockReturnValue('daemon');
  const ExecutorModeManager = vi.fn().mockImplementation(function () {
    return { getMode: modeGetMode };
  });

  // EventScheduler (returned by timePlugin.getScheduler())
  const schedulerGetItem = vi.fn().mockReturnValue(null);
  const schedulerCancel = vi.fn().mockReturnValue(true);
  const schedulerScheduleHeartbeat = vi.fn();

  // TimePlugin
  const timeOnTick = vi.fn().mockReturnValue({ heartbeat_emitted: false, scheduled_emitted: 0 });
  const timeGetScheduler = vi.fn().mockReturnValue({
    getItem: schedulerGetItem,
    cancel: schedulerCancel,
    scheduleHeartbeat: schedulerScheduleHeartbeat,
  });
  const TimePlugin = vi.fn().mockImplementation(function () {
    return { onTick: timeOnTick, getScheduler: timeGetScheduler };
  });

  // Logger
  const loggerInstance = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const createLogger = vi.fn().mockReturnValue(loggerInstance);

  return {
    execFileSync,
    execFile,
    modeGetMode,
    ExecutorModeManager,
    schedulerGetItem,
    schedulerCancel,
    schedulerScheduleHeartbeat,
    timeOnTick,
    timeGetScheduler,
    TimePlugin,
    createLogger,
    loggerInstance,
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({ execFileSync: mocks.execFileSync, execFile: mocks.execFile }));
vi.mock('../executor-mode.js', () => ({ ExecutorModeManager: mocks.ExecutorModeManager }));
vi.mock('../../plugins/time/index.js', () => ({ TimePlugin: mocks.TimePlugin }));
vi.mock('../../shared/logger.js', () => ({ createLogger: mocks.createLogger }));

// ─── Subject under test ───────────────────────────────────────────────────────

import { TickDriver } from '../tick-driver.js';
import type { ExecutorConfig } from '../../shared/config.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ExecutorConfig['daemon']> = {}): ExecutorConfig {
  return {
    mode: 'daemon',
    daemon: {
      clear_context_after_batch: false,
      tmux_session_name: 'claude-daemon',
      tick_command: 'tick',
      tick_interval_ms: 60_000,
      auto_tick: true,
      eval_interval_ms: 1_000,
      ...overrides,
    },
    budget: {
      warning_threshold: 0.8,
      daily_reset_hour: 0,
    },
  };
}

function makeDeps(configOverrides: Partial<ExecutorConfig['daemon']> = {}) {
  const config = makeConfig(configOverrides);
  const executorMode = new mocks.ExecutorModeManager();
  const timePlugin = new mocks.TimePlugin();
  return { config, executorMode, timePlugin };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TickDriver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Default: execFileSync succeeds for isTmuxAvailable (list-sessions)
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    // Default: execFile succeeds for sendTick (send-keys) — calls callback with null error
    mocks.execFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null) => void) => { cb(null); });
    // Default: daemon mode
    mocks.modeGetMode.mockReturnValue('daemon');
    // Default: auto_tick on, scheduler has no existing item
    mocks.schedulerGetItem.mockReturnValue(null);
    mocks.schedulerCancel.mockReturnValue(true);
    // Default: timePlugin returns no events
    mocks.timeOnTick.mockReturnValue({ heartbeat_emitted: false, scheduled_emitted: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── start() idempotency ──────────────────────────────────────────────────

  describe('start()', () => {
    it('is idempotent — calling start() twice does not create duplicate eval timers', () => {
      const deps = makeDeps();
      const driver = new TickDriver(deps);
      driver.start();
      driver.start();
      expect(driver.isRunning()).toBe(true);
      // Advance 2 intervals — should fire exactly twice if no duplication
      vi.advanceTimersByTime(2_000);
      expect(mocks.timeOnTick).toHaveBeenCalledTimes(2);
    });

    it('schedules daemon heartbeat when auto_tick is true and tmux is available', () => {
      const deps = makeDeps();
      const driver = new TickDriver(deps);
      driver.start();
      expect(mocks.schedulerScheduleHeartbeat).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'daemon:auto_tick',
          event_type: 'daemon:tick',
          interval_ms: 60_000,
        }),
      );
    });

    it('skips scheduling heartbeat if one already exists with the same interval', () => {
      mocks.schedulerGetItem.mockReturnValue({ interval_ms: 60_000 });
      const deps = makeDeps();
      const driver = new TickDriver(deps);
      driver.start();
      expect(mocks.schedulerScheduleHeartbeat).not.toHaveBeenCalled();
    });

    it('cancels stale heartbeat and reschedules when interval changed', () => {
      // First getItem call returns stale item (triggering cancel);
      // second call (post-cancel check) returns null so scheduleHeartbeat fires.
      mocks.schedulerGetItem
        .mockReturnValueOnce({ interval_ms: 30_000 }) // existing item with old interval
        .mockReturnValueOnce(null); // after cancel, no item exists
      const deps = makeDeps({ tick_interval_ms: 60_000 });
      const driver = new TickDriver(deps);
      driver.start();
      expect(mocks.schedulerCancel).toHaveBeenCalledWith('daemon:auto_tick');
      expect(mocks.schedulerScheduleHeartbeat).toHaveBeenCalled();
    });
  });

  // ── start() daemon mode guards ───────────────────────────────────────────

  describe('daemon mode guards', () => {
    it('returns early when auto_tick is false', () => {
      const deps = makeDeps({ auto_tick: false });
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(false);
    });

    it('returns early when tick_interval_ms is 0', () => {
      const deps = makeDeps({ tick_interval_ms: 0 });
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(false);
    });

    it('returns early when tick_interval_ms is undefined', () => {
      const deps = makeDeps({ tick_interval_ms: undefined });
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(false);
    });

    it('returns early when tmux is unavailable', () => {
      mocks.execFileSync.mockImplementation(() => { throw new Error('tmux not found'); });
      const deps = makeDeps();
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(false);
    });

    it('returns early when tmux_session_name is invalid', () => {
      const deps = makeDeps({ tmux_session_name: 'invalid session name!' });
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(false);
    });

    it('returns early when tick_command is invalid', () => {
      // Characters like ; | & $ are not in the allowed set [a-zA-Z0-9\/_.-]
      const deps = makeDeps({ tick_command: 'tick; rm -rf /' });
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(false);
    });

    it('returns early when tick_command contains spaces', () => {
      // Spaces are no longer allowed in tick_command (tightened regex)
      const deps = makeDeps({ tick_command: 'tick command' });
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(false);
    });
  });

  // ── Non-daemon mode ──────────────────────────────────────────────────────

  describe('non-daemon mode', () => {
    it('starts unconditionally in non-daemon mode regardless of auto_tick', () => {
      mocks.modeGetMode.mockReturnValue('engaged');
      const deps = makeDeps({ auto_tick: false });
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(true);
    });

    it('does not schedule daemon heartbeat in non-daemon mode', () => {
      mocks.modeGetMode.mockReturnValue('engaged');
      const deps = makeDeps();
      const driver = new TickDriver(deps);
      driver.start();
      expect(mocks.schedulerScheduleHeartbeat).not.toHaveBeenCalled();
    });
  });

  // ── stop() ───────────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('stops the timer and isRunning() returns false', () => {
      const deps = makeDeps();
      const driver = new TickDriver(deps);
      driver.start();
      driver.stop();
      expect(driver.isRunning()).toBe(false);
    });

    it('cancels daemon heartbeat from scheduler on stop()', () => {
      const deps = makeDeps();
      const driver = new TickDriver(deps);
      driver.start();
      vi.clearAllMocks();
      driver.stop();
      expect(mocks.schedulerCancel).toHaveBeenCalledWith('daemon:auto_tick');
    });

    it('stops callback invocations after stop()', () => {
      const deps = makeDeps();
      const driver = new TickDriver(deps);
      driver.start();
      vi.advanceTimersByTime(1_000);
      driver.stop();
      vi.advanceTimersByTime(5_000);
      // Only 1 tick before stop
      expect(mocks.timeOnTick).toHaveBeenCalledTimes(1);
    });
  });

  // ── isRunning() ──────────────────────────────────────────────────────────

  describe('isRunning()', () => {
    it('returns false before start()', () => {
      const driver = new TickDriver(makeDeps());
      expect(driver.isRunning()).toBe(false);
    });

    it('returns true after successful start()', () => {
      const driver = new TickDriver(makeDeps());
      driver.start();
      expect(driver.isRunning()).toBe(true);
    });

    it('returns false after stop()', () => {
      const driver = new TickDriver(makeDeps());
      driver.start();
      driver.stop();
      expect(driver.isRunning()).toBe(false);
    });
  });

  // ── reconfigure() ────────────────────────────────────────────────────────

  describe('reconfigure()', () => {
    it('starts when auto_tick is enabled via reconfigure (was not running)', () => {
      const deps = makeDeps({ auto_tick: false });
      const driver = new TickDriver(deps);
      // Not running (auto_tick was false)
      expect(driver.isRunning()).toBe(false);
      const newConfig = makeConfig({ auto_tick: true });
      mocks.modeGetMode.mockReturnValue('daemon');
      driver.reconfigure(newConfig);
      expect(driver.isRunning()).toBe(true);
    });

    it('stops when auto_tick is disabled via reconfigure (was running)', () => {
      const deps = makeDeps({ auto_tick: true });
      const driver = new TickDriver(deps);
      driver.start();
      expect(driver.isRunning()).toBe(true);
      const newConfig = makeConfig({ auto_tick: false });
      driver.reconfigure(newConfig);
      expect(driver.isRunning()).toBe(false);
    });

    it('reschedules heartbeat when tick_interval_ms changes while running', () => {
      const deps = makeDeps({ tick_interval_ms: 60_000 });
      const driver = new TickDriver(deps);
      driver.start();
      vi.clearAllMocks();
      mocks.schedulerGetItem.mockReturnValue(null); // cleared after cancel
      const newConfig = makeConfig({ auto_tick: true, tick_interval_ms: 30_000 });
      driver.reconfigure(newConfig);
      expect(mocks.schedulerCancel).toHaveBeenCalledWith('daemon:auto_tick');
      expect(mocks.schedulerScheduleHeartbeat).toHaveBeenCalledWith(
        expect.objectContaining({ interval_ms: 30_000 }),
      );
    });
  });

  // ── evaluate() — pipeline steps ──────────────────────────────────────────

  describe('evaluate() — pipeline steps', () => {
    it('calls timePlugin.onTick() on each eval cycle', () => {
      const deps = makeDeps();
      const driver = new TickDriver(deps);
      driver.start();
      vi.advanceTimersByTime(3_000); // 3 eval ticks
      expect(mocks.timeOnTick).toHaveBeenCalledTimes(3);
    });

    it('calls externalPlugin.onTick() if provided', () => {
      const externalOnTick = vi.fn().mockResolvedValue(undefined);
      const deps = {
        ...makeDeps(),
        externalPlugin: { onTick: externalOnTick } as any,
      };
      const driver = new TickDriver(deps);
      driver.start();
      vi.advanceTimersByTime(1_000);
      expect(externalOnTick).toHaveBeenCalledTimes(1);
    });

    it('does not call externalPlugin.onTick() when not provided', () => {
      const externalOnTick = vi.fn().mockResolvedValue(undefined);
      const deps = makeDeps(); // no externalPlugin
      const driver = new TickDriver(deps);
      driver.start();
      vi.advanceTimersByTime(1_000);
      expect(externalOnTick).not.toHaveBeenCalled();
    });

    it('calls eventProcessor.processBatch() if provided', () => {
      const processBatch = vi.fn().mockResolvedValue(undefined);
      const deps = {
        ...makeDeps(),
        eventProcessor: { processBatch } as any,
      };
      const driver = new TickDriver(deps);
      driver.start();
      vi.advanceTimersByTime(1_000);
      expect(processBatch).toHaveBeenCalledTimes(1);
    });

    it('does not call eventProcessor.processBatch() when not provided', () => {
      const processBatch = vi.fn().mockResolvedValue(undefined);
      const deps = makeDeps(); // no eventProcessor
      const driver = new TickDriver(deps);
      driver.start();
      vi.advanceTimersByTime(1_000);
      expect(processBatch).not.toHaveBeenCalled();
    });

    it('calls staleWorkflowChecker if provided', () => {
      const checker = vi.fn();
      const deps = {
        ...makeDeps(),
        staleWorkflowChecker: checker,
      };
      const driver = new TickDriver(deps);
      driver.start();
      vi.advanceTimersByTime(1_000);
      expect(checker).toHaveBeenCalledTimes(1);
    });

    it('does not throw when timePlugin.onTick() throws', () => {
      mocks.timeOnTick.mockImplementation(() => { throw new Error('tick error'); });
      const deps = makeDeps();
      const driver = new TickDriver(deps);
      driver.start();
      expect(() => vi.advanceTimersByTime(1_000)).not.toThrow();
    });

    it('increments evalFailureCount on timePlugin.onTick() error (without propagating)', () => {
      // We verify non-propagation — evalFailureCount is private, so we confirm
      // that subsequent evals still fire after a failure
      mocks.timeOnTick.mockImplementationOnce(() => { throw new Error('tick error'); });
      const deps = makeDeps();
      const driver = new TickDriver(deps);
      driver.start();
      vi.advanceTimersByTime(2_000); // 2 ticks: first throws, second succeeds
      expect(mocks.timeOnTick).toHaveBeenCalledTimes(2);
    });

    it('getEvalFailureCount() returns 0 initially', () => {
      const driver = new TickDriver(makeDeps());
      expect(driver.getEvalFailureCount()).toBe(0);
    });

    it('getEvalFailureCount() reflects accumulated failures', () => {
      mocks.modeGetMode.mockReturnValue('engaged');
      mocks.timeOnTick.mockImplementation(() => { throw new Error('tick error'); });
      const deps = makeDeps();
      const driver = new TickDriver(deps);
      driver.start();
      vi.advanceTimersByTime(3_000); // 3 ticks, each throws
      expect(driver.getEvalFailureCount()).toBe(3);
    });

    it('logs threshold warning when evalFailureCount reaches 5', () => {
      // mocks.loggerInstance.warn is the stable vi.fn() returned by createLogger;
      // beforeEach clears its call history so we get a clean baseline each test.
      mocks.modeGetMode.mockReturnValue('engaged');
      mocks.timeOnTick.mockImplementation(() => { throw new Error('tick error'); });
      const deps = makeDeps();
      new TickDriver(deps).start();
      vi.advanceTimersByTime(5_000); // 5 ticks, each throws → evalFailureCount reaches 5
      const thresholdCalls = mocks.loggerInstance.warn.mock.calls.filter(
        (c: unknown[]) => c[0] === 'eval failure threshold crossed',
      );
      expect(thresholdCalls.length).toBeGreaterThanOrEqual(1);
      expect(thresholdCalls[0][1]).toMatchObject({ eval_failures: 5 });
    });
  });

  // ── sendTick() — daemon mode tmux integration ─────────────────────────────

  describe('sendTick() via evaluate()', () => {
    it('sends tmux tick in daemon mode when scheduled_emitted > 0', () => {
      mocks.timeOnTick.mockReturnValue({ heartbeat_emitted: false, scheduled_emitted: 1 });
      mocks.modeGetMode.mockReturnValue('daemon');
      const deps = makeDeps();
      const driver = new TickDriver(deps);
      driver.start();
      vi.advanceTimersByTime(1_000);
      // sendTick() uses async execFile — verify it was called with send-keys args
      expect(mocks.execFile).toHaveBeenCalledWith(
        'tmux',
        ['send-keys', '-t', 'claude-daemon', 'tick', 'Enter'],
        expect.objectContaining({ timeout: 5000 }),
        expect.any(Function),
      );
    });

    it('does not send tmux tick in daemon mode when scheduled_emitted is 0', () => {
      mocks.timeOnTick.mockReturnValue({ heartbeat_emitted: false, scheduled_emitted: 0 });
      mocks.modeGetMode.mockReturnValue('daemon');
      const deps = makeDeps();
      const driver = new TickDriver(deps);
      driver.start();
      vi.clearAllMocks(); // clear isTmuxAvailable call from start()
      vi.advanceTimersByTime(1_000);
      expect(mocks.execFile).not.toHaveBeenCalled();
    });

    it('does not send tmux tick in non-daemon mode even when scheduled_emitted > 0', () => {
      mocks.modeGetMode.mockReturnValue('engaged');
      mocks.timeOnTick.mockReturnValue({ heartbeat_emitted: false, scheduled_emitted: 5 });
      const deps = makeDeps();
      const driver = new TickDriver(deps);
      driver.start();
      vi.clearAllMocks(); // clear any calls from start()
      vi.advanceTimersByTime(1_000);
      expect(mocks.execFile).not.toHaveBeenCalled();
    });

    it('handles tmux send-keys failure gracefully (does not throw)', () => {
      mocks.timeOnTick.mockReturnValue({ heartbeat_emitted: false, scheduled_emitted: 1 });
      mocks.modeGetMode.mockReturnValue('daemon');
      // isTmuxAvailable uses execFileSync; sendTick uses execFile with callback
      mocks.execFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null) => void) => {
        cb(new Error('tmux send-keys failed'));
      });
      const deps = makeDeps();
      const driver = new TickDriver(deps);
      driver.start();
      expect(() => vi.advanceTimersByTime(1_000)).not.toThrow();
    });
  });
});
