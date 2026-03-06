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
  overrides: Partial<Record<keyof TickDriverDeps, unknown>> & { mode?: 'daemon' | 'engaged' } = {},
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

    it('sends tmux tick when heartbeat_emitted is true in daemon mode', () => {
      const timePlugin = makeTimePlugin();
      vi.mocked(timePlugin.onTick).mockReturnValueOnce({
        heartbeat_emitted: true,
        scheduled_emitted: 0,
      });
      const executorMode = makeExecutorMode('daemon');
      const deps = makeDeps({ mode: 'daemon', timePlugin, executorMode });
      const driver = new TickDriver(deps);
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

  // ─── deliverWebhookEvents ────────────────────────────────────────────────────

  describe('deliverWebhookEvents', () => {
    function makeEventLog(events: any[] = []) {
      return {
        query: vi.fn(() => Promise.resolve(events)),
      };
    }

    function makeWebhookEvent(overrides: Partial<any> = {}) {
      return {
        id: 'evt-1',
        source: 'external',
        type: 'webhook:github',
        payload: {},
        timestamp: 1000,
        priority: 0,
        metadata: {},
        ...overrides,
      };
    }

    it('delivers webhook events to tmux in daemon mode with eventLog', async () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb?.(null);
        return {} as any;
      });
      const event = makeWebhookEvent({ timestamp: 2000 });
      const eventLog = makeEventLog([event]);
      const executorMode = makeExecutorMode('daemon');
      const deps = makeDeps({ mode: 'daemon', executorMode, eventLog });
      const driver = new TickDriver(deps);

      await (driver as any).deliverWebhookEvents();

      expect(eventLog.query).toHaveBeenCalledOnce();
      // sendToTmux calls execFile 3 times per event
      expect(mockExecFile).toHaveBeenCalledTimes(3);
    });

    it('filters out non-webhook events (keeps only webhook: prefix)', async () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb?.(null);
        return {} as any;
      });
      const webhookEvent = makeWebhookEvent({ type: 'webhook:push', timestamp: 2000 });
      const nonWebhookEvent = makeWebhookEvent({ id: 'evt-2', type: 'daemon:tick', timestamp: 3000 });
      const eventLog = makeEventLog([webhookEvent, nonWebhookEvent]);
      const deps = makeDeps({ mode: 'daemon', eventLog });
      const driver = new TickDriver(deps);

      await (driver as any).deliverWebhookEvents();

      // Only 1 event delivered (3 execFile calls for one sendToTmux)
      expect(mockExecFile).toHaveBeenCalledTimes(3);
    });

    it('updates lastWebhookDeliveredAt after delivering events', async () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb?.(null);
        return {} as any;
      });
      const event = makeWebhookEvent({ timestamp: 5000 });
      const eventLog = makeEventLog([event]);
      const deps = makeDeps({ mode: 'daemon', eventLog });
      const driver = new TickDriver(deps);

      expect((driver as any).lastWebhookDeliveredAt).toBe(0);
      await (driver as any).deliverWebhookEvents();
      expect((driver as any).lastWebhookDeliveredAt).toBe(5000);
    });

    it('skips events at or before lastWebhookDeliveredAt', async () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb?.(null);
        return {} as any;
      });
      const oldEvent = makeWebhookEvent({ id: 'old', timestamp: 1000 });
      const newEvent = makeWebhookEvent({ id: 'new', timestamp: 2000 });
      const eventLog = makeEventLog([oldEvent, newEvent]);
      const deps = makeDeps({ mode: 'daemon', eventLog });
      const driver = new TickDriver(deps);
      // Set lastWebhookDeliveredAt to 1000 — oldEvent should be skipped
      (driver as any).lastWebhookDeliveredAt = 1000;

      await (driver as any).deliverWebhookEvents();

      // Only newEvent delivered → 3 execFile calls
      expect(mockExecFile).toHaveBeenCalledTimes(3);
    });

    it('does nothing when no webhook events exist', async () => {
      const eventLog = makeEventLog([{ id: 'e', type: 'daemon:tick', timestamp: 1, source: 'x', payload: {}, priority: 0, metadata: {} }]);
      const deps = makeDeps({ mode: 'daemon', eventLog });
      const driver = new TickDriver(deps);

      await (driver as any).deliverWebhookEvents();

      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('handles eventLog.query() rejection gracefully via evaluate catch wrapper', async () => {
      const eventLog = { query: vi.fn(() => Promise.reject(new Error('db error'))) };
      const timePlugin = makeTimePlugin();
      vi.mocked(timePlugin.onTick).mockReturnValue({ heartbeat_emitted: false, scheduled_emitted: 0 });
      const executorMode = makeExecutorMode('daemon');
      const deps = makeDeps({ mode: 'daemon', executorMode, timePlugin, eventLog });
      const driver = new TickDriver(deps);

      // evaluate() wraps deliverWebhookEvents in .catch() — should not throw
      expect(() => (driver as any).evaluate()).not.toThrow();
      // Let promise rejection propagate and be caught
      await new Promise((resolve) => setTimeout(resolve, 0));
      // No crash — evalFailureCount stays at 0 (rejected promise is caught by .catch)
      expect(driver.getEvalFailureCount()).toBe(0);
    });

    it('queries with a limit of 50', async () => {
      const eventLog = makeEventLog([]);
      const deps = makeDeps({ mode: 'daemon', eventLog });
      const driver = new TickDriver(deps);

      await (driver as any).deliverWebhookEvents();

      expect(eventLog.query).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 }),
      );
    });

    it('queries without types filter (post-fix: filters in JS with startsWith)', async () => {
      const eventLog = makeEventLog([]);
      const deps = makeDeps({ mode: 'daemon', eventLog });
      const driver = new TickDriver(deps);

      await (driver as any).deliverWebhookEvents();

      const callArg = eventLog.query.mock.calls[0][0];
      expect(callArg).not.toHaveProperty('types');
    });
  });

  // ─── sendToTmux ──────────────────────────────────────────────────────────────

  describe('sendToTmux', () => {
    it('sends content with -l flag, then two Enter commands (3 execFile calls)', () => {
      // All three calls succeed
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb?.(null);
        return {} as any;
      });
      const deps = makeDeps();
      const driver = new TickDriver(deps);

      (driver as any).sendToTmux('my-session', 'hello world');

      expect(mockExecFile).toHaveBeenCalledTimes(3);
      // First call: content with -l flag
      const firstCall = mockExecFile.mock.calls[0];
      expect(firstCall[0]).toBe('tmux');
      expect(firstCall[1]).toEqual(['send-keys', '-l', '-t', 'my-session', 'hello world']);
      // Second call: first Enter (no -l)
      const secondCall = mockExecFile.mock.calls[1];
      expect(secondCall[1]).toEqual(['send-keys', '-t', 'my-session', 'Enter']);
      // Third call: second Enter (no -l)
      const thirdCall = mockExecFile.mock.calls[2];
      expect(thirdCall[1]).toEqual(['send-keys', '-t', 'my-session', 'Enter']);
    });

    it('stops on first execFile failure — does not send Enter if content send fails', () => {
      // First call fails, no subsequent calls
      mockExecFile.mockImplementationOnce((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb?.(new Error('send failed'));
        return {} as any;
      });
      const deps = makeDeps();
      const driver = new TickDriver(deps);

      (driver as any).sendToTmux('my-session', 'test content');

      // Only 1 call — subsequent Enters are not made
      expect(mockExecFile).toHaveBeenCalledTimes(1);
    });

    it('stops on second execFile failure — does not send second Enter', () => {
      // First call succeeds, second fails
      mockExecFile
        .mockImplementationOnce((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb?.(null);
          return {} as any;
        })
        .mockImplementationOnce((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb?.(new Error('first Enter failed'));
          return {} as any;
        });
      const deps = makeDeps();
      const driver = new TickDriver(deps);

      (driver as any).sendToTmux('my-session', 'test content');

      // 2 calls — third Enter is not made
      expect(mockExecFile).toHaveBeenCalledTimes(2);
    });

    it('all three calls use correct session name and timeout', () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb?.(null);
        return {} as any;
      });
      const deps = makeDeps({ config: makeConfig({ tmux_session_name: 'test-session' }) });
      const driver = new TickDriver(deps);

      (driver as any).sendToTmux('test-session', 'payload');

      for (const call of mockExecFile.mock.calls) {
        // Session name appears in args
        expect(call[1]).toContain('test-session');
        // Timeout option is set
        expect((call[2] as any).timeout).toBe(5_000);
      }
    });
  });

  // ─── formatWebhookEvent ──────────────────────────────────────────────────────

  describe('formatWebhookEvent', () => {
    function makeEvent(type: string, payload: Record<string, unknown>) {
      return {
        id: 'evt-format',
        source: 'external',
        type,
        payload,
        timestamp: 1000,
        priority: 0,
        metadata: {},
      };
    }

    it('formats GitHub issue event with action, repo, issue number/title/body', () => {
      const event = makeEvent('webhook:github', {
        action: 'opened',
        repository: { full_name: 'org/repo' },
        issue: { number: 42, title: 'Fix the bug', body: 'Please fix it.' },
      });
      const result = (new TickDriver(makeDeps()) as any).formatWebhookEvent(event);
      expect(result).toContain('[Webhook: webhook:github]');
      expect(result).toContain('Action: opened');
      expect(result).toContain('Repo: org/repo');
      expect(result).toContain('Issue #42: Fix the bug');
      expect(result).toContain('Body: Please fix it.');
    });

    it('formats GitHub PR event with PR number and title', () => {
      const event = makeEvent('webhook:github', {
        action: 'synchronize',
        repository: { full_name: 'org/repo' },
        pull_request: { number: 7, title: 'Add feature' },
      });
      const result = (new TickDriver(makeDeps()) as any).formatWebhookEvent(event);
      expect(result).toContain('PR #7: Add feature');
      expect(result).toContain('Action: synchronize');
    });

    it('formats GitHub push event with ref and head_commit message', () => {
      const event = makeEvent('webhook:github', {
        ref: 'refs/heads/main',
        head_commit: { message: 'chore: bump version' },
      });
      const result = (new TickDriver(makeDeps()) as any).formatWebhookEvent(event);
      expect(result).toContain('Ref: refs/heads/main');
      expect(result).toContain('Commit: chore: bump version');
    });

    it('formats event with comment body', () => {
      const event = makeEvent('webhook:github', {
        action: 'created',
        comment: { body: 'Nice work!' },
      });
      const result = (new TickDriver(makeDeps()) as any).formatWebhookEvent(event);
      expect(result).toContain('Comment: Nice work!');
    });

    it('truncates long issue body to 500 chars', () => {
      const longBody = 'x'.repeat(600);
      const event = makeEvent('webhook:github', {
        issue: { number: 1, title: 'Big issue', body: longBody },
      });
      const result = (new TickDriver(makeDeps()) as any).formatWebhookEvent(event);
      const bodyPart = result.split('Body: ')[1].split(' | ')[0];
      expect(bodyPart).toHaveLength(500);
    });

    it('truncates long comment body to 500 chars', () => {
      const longComment = 'c'.repeat(700);
      const event = makeEvent('webhook:github', {
        comment: { body: longComment },
      });
      const result = (new TickDriver(makeDeps()) as any).formatWebhookEvent(event);
      const commentPart = result.split('Comment: ')[1];
      expect(commentPart).toHaveLength(500);
    });

    it('handles minimal event with no optional fields', () => {
      const event = makeEvent('webhook:custom', {});
      const result = (new TickDriver(makeDeps()) as any).formatWebhookEvent(event);
      expect(result).toBe('[Webhook: webhook:custom]');
    });

    it('uses event.type in the header (not any payload field)', () => {
      const event = makeEvent('webhook:push', {
        type: 'should-not-appear-in-header',
      });
      const result = (new TickDriver(makeDeps()) as any).formatWebhookEvent(event);
      expect(result).toContain('[Webhook: webhook:push]');
      expect(result).not.toContain('should-not-appear-in-header');
    });
  });
});

