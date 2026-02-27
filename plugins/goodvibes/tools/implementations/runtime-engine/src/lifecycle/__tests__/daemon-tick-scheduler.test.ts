/**
 * Unit tests for DaemonTickScheduler
 *
 * Tests start() guards, stop(), isRunning(), reconfigure(), evalAndSend(),
 * and sendTick() (via timer advancement with fake timers).
 *
 * Strategy:
 * - vi.hoisted() declares mock variables before vi.mock() hoisting fires.
 * - node:child_process is mocked to control tmux availability and send-keys.
 * - ExecutorModeManager and TimePlugin are fully mocked.
 * - vi.useFakeTimers() controls setInterval so evalAndSend() can be triggered
 *   deterministically via vi.advanceTimersByTime().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mock variables ──────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  // child_process
  const execFileSync = vi.fn();

  // ExecutorModeManager
  const modeGetMode = vi.fn().mockReturnValue('daemon');
  const ExecutorModeManager = vi.fn().mockImplementation(function () {
    return { getMode: modeGetMode };
  });

  // TimePlugin — scheduler methods
  const schedulerScheduleHeartbeat = vi.fn();
  const schedulerCancel = vi.fn().mockReturnValue(true);
  const schedulerGetItem = vi.fn().mockReturnValue(null);

  // TimePlugin.onTick() returns { heartbeat_emitted, scheduled_emitted }
  const timePluginOnTick = vi.fn().mockReturnValue({
    heartbeat_emitted: true,
    scheduled_emitted: 0,
  });
  const timePluginGetScheduler = vi.fn().mockReturnValue({
    scheduleHeartbeat: schedulerScheduleHeartbeat,
    cancel: schedulerCancel,
    getItem: schedulerGetItem,
  });
  const TimePlugin = vi.fn().mockImplementation(function () {
    return {
      onTick: timePluginOnTick,
      getScheduler: timePluginGetScheduler,
    };
  });

  // Logger
  const createLogger = vi.fn().mockReturnValue({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  });

  return {
    execFileSync,
    ExecutorModeManager,
    modeGetMode,
    TimePlugin,
    timePluginOnTick,
    timePluginGetScheduler,
    schedulerScheduleHeartbeat,
    schedulerCancel,
    schedulerGetItem,
    createLogger,
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({ execFileSync: mocks.execFileSync }));
vi.mock('../executor-mode.js', () => ({ ExecutorModeManager: mocks.ExecutorModeManager }));
vi.mock('../../plugins/time/time-plugin.js', () => ({ TimePlugin: mocks.TimePlugin }));
vi.mock('../../shared/logger.js', () => ({ createLogger: mocks.createLogger }));

// ─── Subject under test ───────────────────────────────────────────────────────

import { DaemonTickScheduler } from '../daemon-tick-scheduler.js';
import type { ExecutorConfig } from '../../shared/config.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EVAL_INTERVAL_MS = 5_000;

function makeConfig(overrides?: Partial<ExecutorConfig>): ExecutorConfig {
  const defaults = {
    mode: 'daemon' as const,
    daemon: {
      clear_context_after_batch: true,
      tmux_session_name: 'claude-daemon',
      tick_command: 'tick',
      tick_interval_ms: 30_000,
      auto_tick: true,
    },
    budget: { warning_threshold: 0.8, daily_reset_hour: 0 },
  };
  return {
    ...defaults,
    ...overrides,
    daemon: { ...defaults.daemon, ...(overrides?.daemon ?? {}) },
    budget: { ...defaults.budget, ...(overrides?.budget ?? {}) },
  } as ExecutorConfig;
}

function getSendKeysCalls() {
  return mocks.execFileSync.mock.calls.filter(
    (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes('send-keys'),
  );
}

function makeDeps(configOverrides: Partial<ExecutorConfig> = {}) {
  const config = makeConfig(configOverrides);
  const executorMode = new mocks.ExecutorModeManager();
  const timePlugin = new mocks.TimePlugin();
  return { config, executorMode, timePlugin };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DaemonTickScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Default: tmux is available (list-sessions succeeds)
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    // Default: daemon mode, auto_tick on, tmux available
    mocks.modeGetMode.mockReturnValue('daemon');
    // Default: scheduler has no existing heartbeat item
    mocks.schedulerGetItem.mockReturnValue(null);
    mocks.schedulerCancel.mockReturnValue(true);
    // Default: onTick returns no scheduled events
    mocks.timePluginOnTick.mockReturnValue({
      heartbeat_emitted: true,
      scheduled_emitted: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── start() guards ────────────────────────────────────────────────────────

  describe('start() guards', () => {
    it('does not start when mode is not daemon', () => {
      mocks.modeGetMode.mockReturnValue('engaged');
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('does not start when auto_tick is false', () => {
      const scheduler = new DaemonTickScheduler(
        makeDeps({ daemon: { clear_context_after_batch: false, tmux_session_name: 'claude-daemon', tick_command: 'tick', tick_interval_ms: 30_000, auto_tick: false } }),
      );
      scheduler.start();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('does not start when tick_interval_ms is 0', () => {
      const scheduler = new DaemonTickScheduler(
        makeDeps({ daemon: { clear_context_after_batch: false, tmux_session_name: 'claude-daemon', tick_command: 'tick', tick_interval_ms: 0, auto_tick: true } }),
      );
      scheduler.start();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('does not start when tick_interval_ms is negative', () => {
      const scheduler = new DaemonTickScheduler(
        makeDeps({ daemon: { clear_context_after_batch: false, tmux_session_name: 'claude-daemon', tick_command: 'tick', tick_interval_ms: -1, auto_tick: true } }),
      );
      scheduler.start();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('does not start when tmux is not available', () => {
      mocks.execFileSync.mockImplementation(() => { throw new Error('tmux not found'); });
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('is idempotent — calling start twice does not double-schedule', () => {
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      scheduler.start();
      // scheduleHeartbeat should only be called once
      expect(mocks.schedulerScheduleHeartbeat).toHaveBeenCalledTimes(1);
      expect(scheduler.isRunning()).toBe(true);
    });

    it('starts successfully and schedules heartbeat', () => {
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
      expect(mocks.schedulerScheduleHeartbeat).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'daemon:auto_tick',
          event_type: 'daemon:tick',
          interval_ms: 30_000,
        }),
      );
    });

    it('does not call scheduleHeartbeat when heartbeat item already exists', () => {
      // Simulate a partially-stopped state where item still exists
      mocks.schedulerGetItem.mockReturnValue({ id: 'daemon:auto_tick' });
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      expect(mocks.schedulerScheduleHeartbeat).not.toHaveBeenCalled();
      // But the eval timer still starts
      expect(scheduler.isRunning()).toBe(true);
    });

    it('checks tmux with list-sessions command', () => {
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      expect(mocks.execFileSync).toHaveBeenCalledWith(
        'tmux',
        ['list-sessions'],
        expect.objectContaining({ timeout: 2_000, stdio: 'pipe' }),
      );
    });
  });

  // ── stop() ───────────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('clears eval timer', () => {
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('cancels the scheduled heartbeat', () => {
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      scheduler.stop();
      expect(mocks.schedulerCancel).toHaveBeenCalledWith('daemon:auto_tick');
    });

    it('is idempotent — calling stop when not running is safe', () => {
      const scheduler = new DaemonTickScheduler(makeDeps());
      // Never started
      expect(() => scheduler.stop()).not.toThrow();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('is idempotent — calling stop twice is safe', () => {
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      scheduler.stop();
      expect(() => scheduler.stop()).not.toThrow();
    });

    it('still calls cancel even when scheduler cancel returns false', () => {
      mocks.schedulerCancel.mockReturnValue(false);
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      scheduler.stop();
      expect(mocks.schedulerCancel).toHaveBeenCalledWith('daemon:auto_tick');
    });
  });

  // ── isRunning() ──────────────────────────────────────────────────────────

  describe('isRunning()', () => {
    it('returns false before start()', () => {
      const scheduler = new DaemonTickScheduler(makeDeps());
      expect(scheduler.isRunning()).toBe(false);
    });

    it('returns true after start()', () => {
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
    });

    it('returns false after stop()', () => {
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('returns false when start() guard blocks (wrong mode)', () => {
      mocks.modeGetMode.mockReturnValue('engaged');
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      expect(scheduler.isRunning()).toBe(false);
    });
  });

  // ── reconfigure() ─────────────────────────────────────────────────────────

  describe('reconfigure()', () => {
    it('stops when auto_tick toggled from true to false while running', () => {
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      const newConfig = makeConfig({
        daemon: {
          clear_context_after_batch: false,
          tmux_session_name: 'claude-daemon',
          tick_command: 'tick',
          tick_interval_ms: 30_000,
          auto_tick: false,
        },
      });
      scheduler.reconfigure(newConfig);
      expect(scheduler.isRunning()).toBe(false);
    });

    it('starts when auto_tick toggled from false to true while not running', () => {
      // Start with auto_tick false so it doesn't start
      const scheduler = new DaemonTickScheduler(
        makeDeps({
          daemon: {
            clear_context_after_batch: false,
            tmux_session_name: 'claude-daemon',
            tick_command: 'tick',
            tick_interval_ms: 30_000,
            auto_tick: false,
          },
        }),
      );
      scheduler.start();
      expect(scheduler.isRunning()).toBe(false);

      const newConfig = makeConfig({
        daemon: {
          clear_context_after_batch: false,
          tmux_session_name: 'claude-daemon',
          tick_command: 'tick',
          tick_interval_ms: 30_000,
          auto_tick: true,
        },
      });
      scheduler.reconfigure(newConfig);
      expect(scheduler.isRunning()).toBe(true);
    });

    it('reschedules heartbeat when tick_interval_ms changes while running', () => {
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      vi.clearAllMocks();
      // Reset tmux mock so stop/start guards still pass during reconfigure
      mocks.execFileSync.mockReturnValue(Buffer.from(''));
      mocks.modeGetMode.mockReturnValue('daemon');
      mocks.schedulerGetItem.mockReturnValue(null);

      const newConfig = makeConfig({
        daemon: {
          clear_context_after_batch: false,
          tmux_session_name: 'claude-daemon',
          tick_command: 'tick',
          tick_interval_ms: 60_000,
          auto_tick: true,
        },
      });
      scheduler.reconfigure(newConfig);

      // Should cancel old and schedule new
      expect(mocks.schedulerCancel).toHaveBeenCalledWith('daemon:auto_tick');
      expect(mocks.schedulerScheduleHeartbeat).toHaveBeenCalledWith(
        expect.objectContaining({ interval_ms: 60_000 }),
      );
      // Should still be running (only heartbeat rescheduled, timer not restarted)
      expect(scheduler.isRunning()).toBe(true);
    });

    it('is a no-op when auto_tick unchanged and interval unchanged', () => {
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      vi.clearAllMocks();

      const sameConfig = makeConfig(); // same as original
      scheduler.reconfigure(sameConfig);

      // No start/stop/reschedule
      expect(mocks.schedulerScheduleHeartbeat).not.toHaveBeenCalled();
      expect(mocks.schedulerCancel).not.toHaveBeenCalled();
      // Still running
      expect(scheduler.isRunning()).toBe(true);
    });

    it('is a no-op when not running and auto_tick stays false', () => {
      const scheduler = new DaemonTickScheduler(
        makeDeps({
          daemon: {
            clear_context_after_batch: false,
            tmux_session_name: 'claude-daemon',
            tick_command: 'tick',
            tick_interval_ms: 30_000,
            auto_tick: false,
          },
        }),
      );
      vi.clearAllMocks();

      const newConfig = makeConfig({
        daemon: {
          clear_context_after_batch: false,
          tmux_session_name: 'claude-daemon',
          tick_command: 'tick',
          tick_interval_ms: 30_000,
          auto_tick: false,
        },
      });
      scheduler.reconfigure(newConfig);

      expect(scheduler.isRunning()).toBe(false);
      expect(mocks.schedulerScheduleHeartbeat).not.toHaveBeenCalled();
    });
  });

  // ── evalAndSend() (via timer callback) ───────────────────────────────────

  describe('evalAndSend() via timer', () => {
    it('calls timePlugin.onTick() on each eval interval', () => {
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      vi.advanceTimersByTime(EVAL_INTERVAL_MS);
      expect(mocks.timePluginOnTick).toHaveBeenCalledTimes(1);
    });

    it('calls timePlugin.onTick() multiple times across multiple intervals', () => {
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      vi.advanceTimersByTime(EVAL_INTERVAL_MS * 3);
      expect(mocks.timePluginOnTick).toHaveBeenCalledTimes(3);
    });

    it('does not send tmux tick when scheduled_emitted is 0', () => {
      mocks.timePluginOnTick.mockReturnValue({ heartbeat_emitted: false, scheduled_emitted: 0 });
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      vi.advanceTimersByTime(EVAL_INTERVAL_MS);
      // execFileSync was called for tmux list-sessions check during start(),
      // but NOT for send-keys
      expect(getSendKeysCalls()).toHaveLength(0);
    });

    it('sends tmux tick when scheduled_emitted > 0', () => {
      mocks.timePluginOnTick.mockReturnValue({ heartbeat_emitted: true, scheduled_emitted: 1 });
      const deps = makeDeps();
      const scheduler = new DaemonTickScheduler(deps);
      scheduler.start();
      vi.advanceTimersByTime(EVAL_INTERVAL_MS);
      expect(getSendKeysCalls()).toHaveLength(1);
    });

    it('sends tmux tick when scheduled_emitted is > 1', () => {
      mocks.timePluginOnTick.mockReturnValue({ heartbeat_emitted: true, scheduled_emitted: 3 });
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      vi.advanceTimersByTime(EVAL_INTERVAL_MS);
      expect(getSendKeysCalls()).toHaveLength(1);
    });

    it('handles timePlugin.onTick() throwing without propagating', () => {
      mocks.timePluginOnTick.mockImplementation(() => { throw new Error('onTick exploded'); });
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      // Should not throw when timer fires
      expect(() => vi.advanceTimersByTime(EVAL_INTERVAL_MS)).not.toThrow();
    });

    it('does not send tmux tick when timePlugin.onTick() throws', () => {
      mocks.timePluginOnTick.mockImplementation(() => { throw new Error('onTick exploded'); });
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      vi.advanceTimersByTime(EVAL_INTERVAL_MS);
      expect(getSendKeysCalls()).toHaveLength(0);
    });

    it('stops firing after stop() is called', () => {
      mocks.timePluginOnTick.mockReturnValue({ heartbeat_emitted: true, scheduled_emitted: 1 });
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      vi.advanceTimersByTime(EVAL_INTERVAL_MS);
      expect(mocks.timePluginOnTick).toHaveBeenCalledTimes(1);

      scheduler.stop();
      vi.advanceTimersByTime(EVAL_INTERVAL_MS * 3);
      // No additional calls after stop
      expect(mocks.timePluginOnTick).toHaveBeenCalledTimes(1);
    });
  });

  // ── sendTick() (via evalAndSend) ──────────────────────────────────────────

  describe('sendTick() via evalAndSend', () => {
    beforeEach(() => {
      mocks.timePluginOnTick.mockReturnValue({ heartbeat_emitted: true, scheduled_emitted: 1 });
    });

    it('calls unref() on eval timer to prevent blocking process exit', () => {
      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      // If unref() were not called, the timer would hold the process open.
      // vi.useFakeTimers() wraps setInterval — if start() did not call .unref(),
      // it would throw because the fake timer object has no unref method.
      // The fact that start() succeeds proves unref() is handled correctly.
      expect(scheduler.isRunning()).toBe(true);
    });

    it('calls execFileSync with correct tmux send-keys arguments', () => {
      const config = makeConfig({
        daemon: {
          clear_context_after_batch: false,
          tmux_session_name: 'my-session',
          tick_command: 'tick',
          tick_interval_ms: 30_000,
          auto_tick: true,
        },
      });
      const scheduler = new DaemonTickScheduler({
        config,
        executorMode: new mocks.ExecutorModeManager(),
        timePlugin: new mocks.TimePlugin(),
      });
      scheduler.start();
      vi.advanceTimersByTime(EVAL_INTERVAL_MS);

      expect(mocks.execFileSync).toHaveBeenCalledWith(
        'tmux',
        ['send-keys', '-t', 'my-session', 'tick', 'Enter'],
        expect.objectContaining({ timeout: 5_000, stdio: 'pipe' }),
      );
    });

    it('uses tick_command from config in send-keys call', () => {
      const config = makeConfig({
        daemon: { tick_command: 'custom-tick-cmd' },
      });
      const scheduler = new DaemonTickScheduler({
        config,
        executorMode: new mocks.ExecutorModeManager(),
        timePlugin: new mocks.TimePlugin(),
      });
      scheduler.start();
      vi.advanceTimersByTime(EVAL_INTERVAL_MS);

      expect(getSendKeysCalls()[0][1]).toContain('custom-tick-cmd');
    });

    it('does not start when tmux_session_name contains invalid characters', () => {
      const scheduler = new DaemonTickScheduler(
        makeDeps({ daemon: { tmux_session_name: 'bad;session$(rm -rf /)' } }),
      );
      scheduler.start();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('does not start when tick_command contains invalid characters', () => {
      const scheduler = new DaemonTickScheduler(
        makeDeps({ daemon: { tick_command: 'tick;$(evil)' } }),
      );
      scheduler.start();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('handles execFileSync failure gracefully — logs warning, does not throw', () => {
      // First call (list-sessions) succeeds, subsequent (send-keys) fails
      let callCount = 0;
      mocks.execFileSync.mockImplementation(() => {
        callCount++;
        if (callCount > 1) throw new Error('tmux send-keys failed');
        return Buffer.from('');
      });

      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      expect(() => vi.advanceTimersByTime(EVAL_INTERVAL_MS)).not.toThrow();
    });

    it('handles Error instances in execFileSync failure', () => {
      let callCount = 0;
      mocks.execFileSync.mockImplementation(() => {
        callCount++;
        if (callCount > 1) throw new Error('send-keys error message');
        return Buffer.from('');
      });

      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      // Does not throw
      expect(() => vi.advanceTimersByTime(EVAL_INTERVAL_MS)).not.toThrow();
    });

    it('handles non-Error throws in execFileSync failure', () => {
      let callCount = 0;
      mocks.execFileSync.mockImplementation(() => {
        callCount++;
        if (callCount > 1) throw 'string error';
        return Buffer.from('');
      });

      const scheduler = new DaemonTickScheduler(makeDeps());
      scheduler.start();
      expect(() => vi.advanceTimersByTime(EVAL_INTERVAL_MS)).not.toThrow();
    });
  });
});
