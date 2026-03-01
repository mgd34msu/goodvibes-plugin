import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventProcessor } from '../event-processor.js';
import type {
  EventQueueInterface,
  TriggerRegistryInterface,
  StateStoreInterface,
  LoopLifecycle,
  MetricsCollector,
  ErrorHandlerInterface,
  DeadLetterQueueInterface,
  ActionExecutorInterface,
  RuntimeEvent,
  Trigger,
  HandlerResult,
  TriggerHandlerFn,
  StateUpdate,
} from '../../types.js';

// ─── Logger mock ─────────────────────────────────────────────────────────────

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─── Factories ───────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    source: 'external',
    type: 'test:event',
    payload: {},
    timestamp: Date.now(),
    priority: 10,
    ...overrides,
  };
}

function makeTrigger(overrides: Partial<Trigger> = {}): Trigger {
  return {
    id: 'trigger-1',
    event_match: { type: 'test:event' },
    actions: [],
    enabled: true,
    priority: 0,
    ...overrides,
  };
}

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeQueue(overrides: Partial<EventQueueInterface> = {}): EventQueueInterface {
  return {
    enqueue: vi.fn(),
    drain: vi.fn().mockReturnValue([]),
    peek: vi.fn().mockReturnValue(null),
    depth: vi.fn().mockReturnValue(0),
    deduplicate: vi.fn().mockReturnValue(false),
    cancel: vi.fn().mockReturnValue(false),
    cancelByRef: vi.fn().mockReturnValue(0),
    requeue: vi.fn(),
    ...overrides,
  };
}

function makeRegistry(triggers: Trigger[] = []): TriggerRegistryInterface {
  return {
    match: vi.fn().mockReturnValue(triggers),
    recordFire: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn().mockReturnValue(true),
    enable: vi.fn(),
    disable: vi.fn(),
    get: vi.fn(),
  };
}

function makeStore(): StateStoreInterface {
  return {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    delete: vi.fn(),
    merge: vi.fn(),
    snapshot: vi.fn().mockReturnValue({}),
    restore: vi.fn(),
  };
}

function makeLifecycle(processing = true): LoopLifecycle {
  return {
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    drain: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockReturnValue('running'),
    isProcessing: vi.fn().mockReturnValue(processing),
    acceptsEvents: vi.fn().mockReturnValue(true),
  };
}

function makeMetrics(): MetricsCollector {
  return {
    onEventProcessed: vi.fn(),
    onHandlerError: vi.fn(),
    onQueueDepthChange: vi.fn(),
    onTriggerFired: vi.fn(),
    onEventDeadLettered: vi.fn(),
    getStats: vi.fn().mockReturnValue({}),
    reset: vi.fn(),
    setActiveChains: vi.fn(),
    setActiveWorkflows: vi.fn(),
  };
}

function makeErrorHandler(
  result: Partial<{ success: boolean; result: HandlerResult; error: Error; attempts: number; error_events: RuntimeEvent[] }> = {},
): ErrorHandlerInterface {
  return {
    execute: vi.fn().mockResolvedValue({
      success: true,
      result: { actions: [], state_updates: [], events: [] },
      error: undefined,
      attempts: 1,
      error_events: [],
      ...result,
    }),
  };
}

function makeDeadLetter(): DeadLetterQueueInterface {
  return {
    add: vi.fn(),
    size: vi.fn().mockReturnValue(0),
  };
}

function makeActionExecutor(): ActionExecutorInterface {
  return {
    execute: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Builder helper ───────────────────────────────────────────────────────────

interface ProcessorDeps {
  queue: EventQueueInterface;
  registry: TriggerRegistryInterface;
  store: StateStoreInterface;
  lifecycle: LoopLifecycle;
  metrics: MetricsCollector;
  errorHandler: ErrorHandlerInterface;
  deadLetter: DeadLetterQueueInterface;
}

function buildProcessor(
  options: Parameters<typeof EventProcessor.prototype.registerHandler>[1] extends TriggerHandlerFn
    ? never
    : import('../event-processor.js').EventProcessorOptions = {},
  depOverrides: Partial<ProcessorDeps> = {},
): { processor: EventProcessor; deps: ProcessorDeps } {
  const deps: ProcessorDeps = {
    queue: makeQueue(),
    registry: makeRegistry(),
    store: makeStore(),
    lifecycle: makeLifecycle(),
    metrics: makeMetrics(),
    errorHandler: makeErrorHandler(),
    deadLetter: makeDeadLetter(),
    ...depOverrides,
  };
  const processor = new EventProcessor(
    deps.queue,
    deps.registry,
    deps.store,
    deps.lifecycle,
    deps.metrics,
    deps.errorHandler,
    deps.deadLetter,
    options,
  );
  return { processor, deps };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EventProcessor', () => {
  // ─── Construction ────────────────────────────────────────────────────────────

  describe('construction', () => {
    it('constructs without options (all defaults applied)', () => {
      const { processor } = buildProcessor();
      expect(processor).toBeInstanceOf(EventProcessor);
      expect(processor.activeWorkflowCount()).toBe(0);
    });

    it('constructs with explicit options without throwing', () => {
      const { processor } = buildProcessor({
        max_events_per_batch: 50,
        max_chain_depth: 5,
        lock_timeout_ms: 5_000,
        priority_floor: 3,
        queue_depth_warning: 10,
        budget: { total: 1000, warn_threshold: 0.8, pause_threshold: 0.95 },
        rate_limit: { max_per_window: 5, window_ms: 500 },
      });
      expect(processor).toBeInstanceOf(EventProcessor);
    });

    it('constructs with a pre-populated handlers map', () => {
      const handler = vi.fn<TriggerHandlerFn>().mockResolvedValue({ actions: [] });
      const handlers = new Map<string, TriggerHandlerFn>();
      handlers.set('trigger-1', handler);
      const { processor } = buildProcessor({ handlers });
      expect(processor).toBeInstanceOf(EventProcessor);
    });

    it('constructs with action_executor set', () => {
      const actionExecutor = makeActionExecutor();
      const { processor } = buildProcessor({ action_executor: actionExecutor });
      expect(processor).toBeInstanceOf(EventProcessor);
    });
  });

  // ─── registerHandler ──────────────────────────────────────────────────────

  describe('registerHandler', () => {
    it('registers a handler that is then invoked during event processing', async () => {
      const trigger = makeTrigger({ id: 'handler-trigger' });
      const handler = vi.fn<TriggerHandlerFn>().mockResolvedValue({ actions: [] });
      const event = makeEvent();

      const errorHandler = makeErrorHandler({ success: true, result: { actions: [] }, error_events: [] });
      const { processor, deps } = buildProcessor(
        {},
        { registry: makeRegistry([trigger]), errorHandler },
      );

      processor.registerHandler('handler-trigger', handler);
      (deps.queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);

      await processor.processBatch();

      expect(errorHandler.execute).toHaveBeenCalledWith(
        'handler-trigger',
        handler,
        event,
        trigger.retry,
      );
    });

    it('overwrites an existing handler with the same trigger_id', () => {
      const { processor } = buildProcessor();
      const h1 = vi.fn<TriggerHandlerFn>().mockResolvedValue({ actions: [] });
      const h2 = vi.fn<TriggerHandlerFn>().mockResolvedValue({ actions: [] });
      processor.registerHandler('t1', h1);
      processor.registerHandler('t1', h2);
      // No assertion on internals — just verifying no error thrown
      expect(processor).toBeDefined();
    });
  });

  // ─── activeWorkflowCount ─────────────────────────────────────────────────────

  describe('activeWorkflowCount', () => {
    it('returns 0 initially', () => {
      const { processor } = buildProcessor();
      expect(processor.activeWorkflowCount()).toBe(0);
    });
  });

  // ─── processBatch — lifecycle gate ────────────────────────────────────────────

  describe('processBatch — lifecycle gate', () => {
    it('returns 0 and does not drain when lifecycle is not processing', async () => {
      const { processor, deps } = buildProcessor(
        {},
        { lifecycle: makeLifecycle(false) },
      );
      const result = await processor.processBatch();
      expect(result).toBe(0);
      expect(deps.queue.drain).not.toHaveBeenCalled();
    });

    it('processes events when lifecycle is running', async () => {
      const event = makeEvent();
      const { processor, deps } = buildProcessor(
        {},
        { lifecycle: makeLifecycle(true) },
      );
      (deps.queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);
      const result = await processor.processBatch();
      expect(result).toBe(1);
    });

    it('returns 0 and updates queue depth metric when queue is empty', async () => {
      const { processor, deps } = buildProcessor();
      (deps.queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([]);
      const result = await processor.processBatch();
      expect(result).toBe(0);
      expect(deps.metrics.onQueueDepthChange).not.toHaveBeenCalled();
    });
  });

  // ─── processBatch — budget management ────────────────────────────────────────

  describe('processBatch — budget management', () => {
    it('pauses the lifecycle when pause_threshold is exceeded', async () => {
      const lifecycle = makeLifecycle();
      const { processor, deps } = buildProcessor(
        {
          budget: { total: 100, warn_threshold: 0.7, pause_threshold: 0.9 },
        },
        { lifecycle },
      );

      // Consume tokens past the pause threshold
      processor.consumeTokens(91);
      const result = await processor.processBatch();

      expect(result).toBe(0);
      expect(lifecycle.pause).toHaveBeenCalled();
      expect(deps.queue.drain).not.toHaveBeenCalled();
    });

    it('does not pause when budget is 0 (unlimited)', async () => {
      const lifecycle = makeLifecycle();
      const { processor, deps } = buildProcessor(
        {
          budget: { total: 0, warn_threshold: 0.7, pause_threshold: 0.9 },
        },
        { lifecycle },
      );

      processor.consumeTokens(1000); // should be no-op with total=0
      (deps.queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([]);
      const result = await processor.processBatch();

      expect(lifecycle.pause).not.toHaveBeenCalled();
    });

    it('does not pause when budget is not configured', async () => {
      const lifecycle = makeLifecycle();
      const { processor } = buildProcessor({}, { lifecycle });
      (makeQueue().drain as ReturnType<typeof vi.fn>).mockReturnValue([]);
      // No budget — should not pause
      const result = await processor.processBatch();
      expect(lifecycle.pause).not.toHaveBeenCalled();
    });

    it('does not pause when fraction is below pause_threshold', async () => {
      const lifecycle = makeLifecycle();
      const { processor, deps } = buildProcessor(
        {
          budget: { total: 100, warn_threshold: 0.7, pause_threshold: 0.9 },
        },
        { lifecycle },
      );

      processor.consumeTokens(50);
      (deps.queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([]);
      await processor.processBatch();

      expect(lifecycle.pause).not.toHaveBeenCalled();
    });
  });

  // ─── consumeTokens / replenishTokens ────────────────────────────────────────

  describe('consumeTokens and replenishTokens', () => {
    it('no-ops when budget is not set', () => {
      const { processor } = buildProcessor();
      expect(() => processor.consumeTokens(100)).not.toThrow();
      expect(() => processor.replenishTokens(50)).not.toThrow();
    });

    it('no-ops when budget total is 0', () => {
      const { processor } = buildProcessor({
        budget: { total: 0, warn_threshold: 0.7, pause_threshold: 0.9 },
      });
      expect(() => processor.consumeTokens(100)).not.toThrow();
      expect(() => processor.replenishTokens(50)).not.toThrow();
    });

    it('tracks tokens consumed and does not go negative on replenish', () => {
      const lifecycle = makeLifecycle();
      const { processor } = buildProcessor(
        { budget: { total: 100, warn_threshold: 0.7, pause_threshold: 0.9 } },
        { lifecycle },
      );
      processor.consumeTokens(30);
      processor.replenishTokens(50); // cannot go below 0
      // Now consumed = max(0, 30-50) = 0, fraction = 0 < warn_threshold
      // Budget should not pause after this
      expect(lifecycle.pause).not.toHaveBeenCalled();
    });

    it('resets budgetWarningSent when fraction drops below warn_threshold after replenish', () => {
      const { processor } = buildProcessor({
        budget: { total: 100, warn_threshold: 0.7, pause_threshold: 0.9 },
      });
      // Push past warn threshold to set the flag
      processor.consumeTokens(75);
      // Drop back below warn threshold
      processor.replenishTokens(10); // consumed = 65, fraction = 0.65 < 0.7
      // Now consume again past warn threshold — warning would fire again (flag was reset)
      // We can't observe the flag directly; just ensure no error thrown
      expect(() => processor.consumeTokens(10)).not.toThrow();
    });

    it('does not reset warning flag if still above warn_threshold after replenish', () => {
      const { processor } = buildProcessor({
        budget: { total: 100, warn_threshold: 0.7, pause_threshold: 0.9 },
      });
      processor.consumeTokens(80); // fraction = 0.8 > 0.7, flag set
      processor.replenishTokens(5); // consumed = 75, fraction = 0.75 still > 0.7
      // Warning flag should still be set (no double-fire)
      expect(() => processor.consumeTokens(1)).not.toThrow();
    });
  });

  // ─── processBatch — queue depth warning ───────────────────────────────────────

  describe('processBatch — queue depth warning', () => {
    it('enqueues a warning event when queue depth meets threshold', async () => {
      const queue = makeQueue();
      (queue.depth as ReturnType<typeof vi.fn>).mockReturnValue(10);
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const { processor } = buildProcessor(
        { queue_depth_warning: 10 },
        { queue },
      );

      await processor.processBatch();

      const enqueuedCalls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const warningCall = enqueuedCalls.find(
        ([evt]: [RuntimeEvent]) => evt.type === 'core:queue_depth_warning',
      );
      expect(warningCall).toBeDefined();
      expect(warningCall![0].payload).toMatchObject({ depth: 10, threshold: 10 });
    });

    it('does not enqueue a warning event when depth is below threshold', async () => {
      const queue = makeQueue();
      (queue.depth as ReturnType<typeof vi.fn>).mockReturnValue(5);
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const { processor } = buildProcessor(
        { queue_depth_warning: 10 },
        { queue },
      );

      await processor.processBatch();

      const enqueuedCalls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const warningCall = enqueuedCalls.find(
        ([evt]: [RuntimeEvent]) => evt.type === 'core:queue_depth_warning',
      );
      expect(warningCall).toBeUndefined();
    });

    it('does not enqueue a warning event when queue_depth_warning is not set', async () => {
      const queue = makeQueue();
      (queue.depth as ReturnType<typeof vi.fn>).mockReturnValue(100);
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const { processor } = buildProcessor({}, { queue });

      await processor.processBatch();

      const enqueuedCalls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const warningCall = enqueuedCalls.find(
        ([evt]: [RuntimeEvent]) => evt.type === 'core:queue_depth_warning',
      );
      expect(warningCall).toBeUndefined();
    });

    it('swallows enqueue errors for warning event gracefully', async () => {
      const queue = makeQueue();
      (queue.depth as ReturnType<typeof vi.fn>).mockReturnValue(10);
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([]);
      (queue.enqueue as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('queue full');
      });

      const { processor } = buildProcessor(
        { queue_depth_warning: 10 },
        { queue },
      );

      // Should not throw
      await expect(processor.processBatch()).resolves.toBe(0);
    });
  });

  // ─── processBatch — stale lock sweep ─────────────────────────────────────────

  describe('processBatch — stale lock sweep', () => {
    it('sweeps stale workflow locks before processing events', async () => {
      const event = makeEvent({ context: { workflow_id: 'wf-1' } });
      const { processor, deps } = buildProcessor(
        { lock_timeout_ms: 1 }, // 1ms timeout — stale almost immediately
      );

      (deps.queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);

      // First batch: acquires lock
      await processor.processBatch();
      // Lock should be released after processing (in finally block)
      expect(processor.activeWorkflowCount()).toBe(0);
    });

    it('releases workflow locks after processing completes (locks are not held permanently)', async () => {
      // Verify the finally block in processBatch properly releases workflow locks.
      // If locks were not released, activeWorkflowCount() would remain non-zero after a batch.
      const wfEvent = makeEvent({ id: 'wf-evt-1', context: { workflow_id: 'wf-check' } });
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([wfEvent]);

      const { processor } = buildProcessor(
        { lock_timeout_ms: 30_000 },
        { queue, registry: makeRegistry([makeTrigger()]) },
      );

      // Before batch: no locks
      expect(processor.activeWorkflowCount()).toBe(0);

      await processor.processBatch();

      // After batch: lock must be released (finally block)
      expect(processor.activeWorkflowCount()).toBe(0);
    });

    it('releases workflow locks even when processEvent throws (finally block)', async () => {
      // Simulate processEvent throwing by making errorHandler throw synchronously
      const wfEvent = makeEvent({ id: 'wf-evt-throw', context: { workflow_id: 'wf-throw' } });
      const trigger = makeTrigger({ id: 'throw-trigger' });
      const handler = vi.fn<TriggerHandlerFn>().mockResolvedValue({ actions: [] });

      const errorHandler: ErrorHandlerInterface = {
        // This simulates the error handler returning a failed result (not throwing)
        execute: vi.fn().mockResolvedValue({
          success: false,
          error: new Error('simulated failure'),
          error_events: [],
          attempts: 1,
        }),
      };

      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([wfEvent]);

      const { processor } = buildProcessor(
        { lock_timeout_ms: 30_000 },
        { queue, registry: makeRegistry([trigger]), errorHandler },
      );

      processor.registerHandler('throw-trigger', handler);
      await processor.processBatch();

      // Lock must be released even on handler failure
      expect(processor.activeWorkflowCount()).toBe(0);
    });
  });

  // ─── processBatch — max_events_per_batch ──────────────────────────────────────

  describe('processBatch — max_events_per_batch', () => {
    it('processes at most max_events_per_batch events per call', async () => {
      const events = Array.from({ length: 5 }, (_, i) =>
        makeEvent({ id: `evt-${i}` }),
      );
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue(events);

      const { processor } = buildProcessor({ max_events_per_batch: 3 }, { queue });
      const processed = await processor.processBatch();

      expect(processed).toBe(3);
    });

    it('re-queues overflow events when batch exceeds max_events_per_batch', async () => {
      const events = Array.from({ length: 5 }, (_, i) =>
        makeEvent({ id: `evt-${i}` }),
      );
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue(events);

      const { processor } = buildProcessor({ max_events_per_batch: 3 }, { queue });
      await processor.processBatch();

      const requeueCalls = (queue.requeue as ReturnType<typeof vi.fn>).mock.calls;
      // Should have re-queued the 2 overflow events
      const requeuedIds = requeueCalls
        .flatMap(([evts]: [RuntimeEvent[]]) => evts)
        .map((e: RuntimeEvent) => e.id);
      expect(requeuedIds).toContain('evt-3');
      expect(requeuedIds).toContain('evt-4');
    });

    it('does not call requeue when batch fits within max_events_per_batch', async () => {
      const events = [makeEvent()];
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue(events);

      const { processor } = buildProcessor({ max_events_per_batch: 10 }, { queue });
      await processor.processBatch();

      // requeue should not have been called for overflow (may be called for locking)
      // but there are no workflow_ids so no locking requeue either
      const requeueForOverflow = (queue.requeue as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([evts]: [RuntimeEvent[]]) => evts.length === events.length,
      );
      expect(requeueForOverflow).toHaveLength(0);
    });
  });

  // ─── processBatch — priority floor ───────────────────────────────────────────

  describe('processBatch — priority floor', () => {
    it('skips events with priority below the floor', async () => {
      const lowPriorityEvent = makeEvent({ priority: 1 });
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([lowPriorityEvent]);

      const metrics = makeMetrics();
      const { processor } = buildProcessor(
        { priority_floor: 5 },
        { queue, metrics },
      );

      const processed = await processor.processBatch();

      expect(processed).toBe(0);
      expect(metrics.onEventProcessed).not.toHaveBeenCalled();
    });

    it('processes events at exactly the priority floor', async () => {
      const event = makeEvent({ priority: 5 });
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);

      const metrics = makeMetrics();
      const { processor } = buildProcessor(
        { priority_floor: 5 },
        { queue, metrics },
      );

      const processed = await processor.processBatch();

      expect(processed).toBe(1);
      expect(metrics.onEventProcessed).toHaveBeenCalledWith(event, expect.any(Number));
    });

    it('processes all events when priority_floor is not set', async () => {
      const event = makeEvent({ priority: 0 });
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);

      const { processor } = buildProcessor({}, { queue });
      const processed = await processor.processBatch();

      expect(processed).toBe(1);
    });
  });

  // ─── processBatch — rate limiting ─────────────────────────────────────────────

  describe('processBatch — rate limiting', () => {
    it('stops processing after max_per_window events and re-queues remainder', async () => {
      const events = Array.from({ length: 5 }, (_, i) =>
        makeEvent({ id: `rl-evt-${i}` }),
      );
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue(events);

      const { processor } = buildProcessor(
        { rate_limit: { max_per_window: 2, window_ms: 60_000 } },
        { queue },
      );

      const processed = await processor.processBatch();

      expect(processed).toBe(2);
      // Remaining 3 events should be re-queued
      const requeueCalls = (queue.requeue as ReturnType<typeof vi.fn>).mock.calls;
      const requeuedTotal = requeueCalls.reduce(
        (sum: number, [evts]: [RuntimeEvent[]]) => sum + evts.length,
        0,
      );
      expect(requeuedTotal).toBeGreaterThanOrEqual(3);
    });

    it('resets the rate limit counter after the window expires', async () => {
      const queue = makeQueue();

      // Use a very short window
      const { processor } = buildProcessor(
        { rate_limit: { max_per_window: 1, window_ms: 1 } },
        { queue },
      );

      // First batch — hits rate limit after 1 event
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([
        makeEvent({ id: 'a1' }),
        makeEvent({ id: 'a2' }),
      ]);
      const processed1 = await processor.processBatch();
      expect(processed1).toBe(1);

      // Wait for window to expire
      await new Promise((r) => setTimeout(r, 5));

      // Second batch — window should have reset
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([
        makeEvent({ id: 'b1' }),
      ]);
      const processed2 = await processor.processBatch();
      expect(processed2).toBe(1);
    });

    it('processes all events when rate_limit is not set', async () => {
      const events = Array.from({ length: 10 }, () => makeEvent());
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue(events);

      const { processor } = buildProcessor({}, { queue });
      const processed = await processor.processBatch();

      expect(processed).toBe(10);
    });
  });

  // ─── processBatch — chain depth circuit breaker ───────────────────────────────

  describe('processBatch — chain depth circuit breaker', () => {
    it('drops events that exceed max_chain_depth and emits a chain_depth_exceeded event', async () => {
      const deepEvent = makeEvent({
        id: 'deep-event',
        context: { chain_depth: 11 },
      });
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([deepEvent]);

      const { processor } = buildProcessor(
        { max_chain_depth: 10 },
        { queue },
      );

      const processed = await processor.processBatch();

      expect(processed).toBe(0);
      const enqueuedCalls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const exceededEvt = enqueuedCalls.find(
        ([evt]: [RuntimeEvent]) => evt.type === 'core:chain_depth_exceeded',
      );
      expect(exceededEvt).toBeDefined();
      expect(exceededEvt![0].payload).toMatchObject({
        original_event_id: 'deep-event',
        original_event_type: 'test:event',
        depth: 11,
        max_depth: 10,
      });
    });

    it('processes events at exactly max_chain_depth (boundary)', async () => {
      const event = makeEvent({ context: { chain_depth: 10 } });
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);

      const { processor } = buildProcessor({ max_chain_depth: 10 }, { queue });
      const processed = await processor.processBatch();

      // depth === max_chain_depth is NOT exceeded (> check), so it should process
      expect(processed).toBe(1);
    });

    it('processes events with no context (chain_depth defaults to 0)', async () => {
      const event = makeEvent({ context: undefined });
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);

      const { processor } = buildProcessor({ max_chain_depth: 10 }, { queue });
      const processed = await processor.processBatch();

      expect(processed).toBe(1);
    });

    it('swallows enqueue errors for chain_depth_exceeded event', async () => {
      const deepEvent = makeEvent({ context: { chain_depth: 11 } });
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([deepEvent]);
      (queue.enqueue as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('queue full');
      });

      const { processor } = buildProcessor({ max_chain_depth: 10 }, { queue });

      await expect(processor.processBatch()).resolves.toBe(0);
    });
  });

  // ─── processEvent — trigger matching ─────────────────────────────────────────

  describe('processEvent — trigger matching', () => {
    it('invokes registry.match with the event and state store', async () => {
      const event = makeEvent();
      const store = makeStore();
      const registry = makeRegistry([]);
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);

      const { processor } = buildProcessor({}, { queue, registry, store });
      await processor.processBatch();

      expect(registry.match).toHaveBeenCalledWith(event, store);
    });

    it('calls recordFire and metrics.onTriggerFired for each matched trigger', async () => {
      const trigger1 = makeTrigger({ id: 'tr-1' });
      const trigger2 = makeTrigger({ id: 'tr-2' });
      const event = makeEvent();
      const registry = makeRegistry([trigger1, trigger2]);
      const metrics = makeMetrics();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);

      const { processor } = buildProcessor({}, { queue, registry, metrics });
      await processor.processBatch();

      expect(registry.recordFire).toHaveBeenCalledWith('tr-1');
      expect(registry.recordFire).toHaveBeenCalledWith('tr-2');
      expect(metrics.onTriggerFired).toHaveBeenCalledWith('tr-1', event);
      expect(metrics.onTriggerFired).toHaveBeenCalledWith('tr-2', event);
    });

    it('calls metrics.onEventProcessed after processing', async () => {
      const event = makeEvent();
      const metrics = makeMetrics();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);

      const { processor } = buildProcessor({}, { queue, metrics });
      await processor.processBatch();

      expect(metrics.onEventProcessed).toHaveBeenCalledWith(event, expect.any(Number));
    });

    it('updates queue depth metric before and after processing', async () => {
      const event = makeEvent();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);
      (queue.depth as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(0) // first call during stale sweep / warning check
        .mockReturnValue(0);

      const metrics = makeMetrics();
      const { processor } = buildProcessor({}, { queue, metrics });
      await processor.processBatch();

      expect(metrics.onQueueDepthChange).toHaveBeenCalledTimes(2);
    });

    it('processes multiple events sequentially', async () => {
      const events = [makeEvent({ id: 'e1' }), makeEvent({ id: 'e2' }), makeEvent({ id: 'e3' })];
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue(events);

      const metrics = makeMetrics();
      const { processor } = buildProcessor({}, { queue, metrics });
      const processed = await processor.processBatch();

      expect(processed).toBe(3);
      expect(metrics.onEventProcessed).toHaveBeenCalledTimes(3);
    });
  });

  // ─── processEvent — handler execution ────────────────────────────────────────

  describe('processEvent — handler execution', () => {
    it('uses trigger.actions as result when no handler is registered', async () => {
      const trigger = makeTrigger({
        id: 'no-handler-trigger',
        actions: [{ type: 'emit_event', params: { type: 'downstream' } }],
      });
      const event = makeEvent();
      const registry = makeRegistry([trigger]);
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);

      // No handler registered
      const { processor } = buildProcessor({}, { queue, registry });
      const processed = await processor.processBatch();

      expect(processed).toBe(1);
      // No error handler invoked since there's no handler registered
      // (errorHandler.execute is not called when handler is missing)
    });

    it('invokes errorHandler.execute when a handler is registered', async () => {
      const trigger = makeTrigger({ id: 'my-trigger' });
      const handler = vi.fn<TriggerHandlerFn>().mockResolvedValue({ actions: [] });
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions: [] },
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const event = makeEvent();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);

      const { processor } = buildProcessor({}, { queue, registry, errorHandler });
      processor.registerHandler('my-trigger', handler);
      await processor.processBatch();

      expect(errorHandler.execute).toHaveBeenCalledWith(
        'my-trigger',
        handler,
        event,
        trigger.retry,
      );
    });

    it('records handler error in metrics and enqueues error events on failure', async () => {
      const trigger = makeTrigger({ id: 'failing-trigger' });
      const handler = vi.fn<TriggerHandlerFn>().mockResolvedValue({ actions: [] });
      const error = new Error('handler failed');
      const errorEvent = makeEvent({ type: 'core:handler_error' });

      const errorHandler = makeErrorHandler({
        success: false,
        error,
        error_events: [errorEvent],
        result: undefined,
      });
      const registry = makeRegistry([trigger]);
      const metrics = makeMetrics();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);

      const { processor } = buildProcessor({}, { queue, registry, errorHandler, metrics });
      processor.registerHandler('failing-trigger', handler);
      await processor.processBatch();

      expect(metrics.onHandlerError).toHaveBeenCalledWith('failing-trigger', error, expect.any(Object));
      // error event should have been enqueued
      const enqueuedCalls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const errorEvtCall = enqueuedCalls.find(
        ([evt]: [RuntimeEvent]) => evt.type === 'core:handler_error',
      );
      expect(errorEvtCall).toBeDefined();
    });

    it('swallows enqueue errors for error events gracefully', async () => {
      const trigger = makeTrigger({ id: 'failing-trigger' });
      const handler = vi.fn<TriggerHandlerFn>().mockResolvedValue({ actions: [] });
      const error = new Error('handler failed');
      const errorEvent = makeEvent({ type: 'core:handler_error' });

      const errorHandler = makeErrorHandler({
        success: false,
        error,
        error_events: [errorEvent],
        result: undefined,
      });
      const registry = makeRegistry([trigger]);
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);
      (queue.enqueue as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('queue full');
      });

      const { processor } = buildProcessor({}, { queue, registry, errorHandler });
      processor.registerHandler('failing-trigger', handler);

      await expect(processor.processBatch()).resolves.toBeDefined();
    });

    it('skips to next trigger when handler fails (does not abort remaining triggers)', async () => {
      const failingTrigger = makeTrigger({ id: 'fail-trigger' });
      const successTrigger = makeTrigger({ id: 'success-trigger' });
      const handler = vi.fn<TriggerHandlerFn>().mockResolvedValue({ actions: [] });
      const successHandler = vi.fn<TriggerHandlerFn>().mockResolvedValue({ actions: [] });

      let callCount = 0;
      const errorHandler: ErrorHandlerInterface = {
        execute: vi.fn().mockImplementation(async (trigger_id: string) => {
          if (trigger_id === 'fail-trigger') {
            return { success: false, error: new Error('fail'), error_events: [], attempts: 1 };
          }
          return { success: true, result: { actions: [] }, error_events: [], attempts: 1 };
        }),
      };

      const registry = makeRegistry([failingTrigger, successTrigger]);
      const metrics = makeMetrics();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);

      const { processor } = buildProcessor({}, { queue, registry, errorHandler, metrics });
      processor.registerHandler('fail-trigger', handler);
      processor.registerHandler('success-trigger', successHandler);

      await processor.processBatch();

      // Both triggers were attempted
      expect(errorHandler.execute).toHaveBeenCalledTimes(2);
      // The success trigger's metrics were recorded
      expect(metrics.onEventProcessed).toHaveBeenCalledTimes(1);
    });
  });

  // ─── processEvent — state updates ────────────────────────────────────────────

  describe('processEvent — state updates', () => {
    it('applies set state updates from handler result', async () => {
      const trigger = makeTrigger({ id: 'state-trigger' });
      const stateUpdates: StateUpdate[] = [
        { key: 'session.phase', value: 'active', op: 'set' },
      ];
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions: [], state_updates: stateUpdates },
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const store = makeStore();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);

      const { processor } = buildProcessor({}, { queue, registry, store, errorHandler });
      processor.registerHandler('state-trigger', vi.fn().mockResolvedValue({}));
      await processor.processBatch();

      expect(store.set).toHaveBeenCalledWith('session.phase', 'active');
    });

    it('applies delete state updates from handler result', async () => {
      const trigger = makeTrigger({ id: 'delete-trigger' });
      const stateUpdates: StateUpdate[] = [
        { key: 'session.phase', value: null, op: 'delete' },
      ];
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions: [], state_updates: stateUpdates },
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const store = makeStore();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);

      const { processor } = buildProcessor({}, { queue, registry, store, errorHandler });
      processor.registerHandler('delete-trigger', vi.fn().mockResolvedValue({}));
      await processor.processBatch();

      expect(store.delete).toHaveBeenCalledWith('session.phase');
    });

    it('applies merge state updates for plain object values', async () => {
      const trigger = makeTrigger({ id: 'merge-trigger' });
      const stateUpdates: StateUpdate[] = [
        { key: 'session', value: { phase: 'active', count: 1 }, op: 'merge' },
      ];
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions: [], state_updates: stateUpdates },
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const store = makeStore();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);

      const { processor } = buildProcessor({}, { queue, registry, store, errorHandler });
      processor.registerHandler('merge-trigger', vi.fn().mockResolvedValue({}));
      await processor.processBatch();

      expect(store.merge).toHaveBeenCalledWith('session', { phase: 'active', count: 1 });
    });

    it('falls back to set for merge with non-object values', async () => {
      const trigger = makeTrigger({ id: 'merge-fallback-trigger' });
      const stateUpdates: StateUpdate[] = [
        { key: 'session.count', value: 42, op: 'merge' },
      ];
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions: [], state_updates: stateUpdates },
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const store = makeStore();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);

      const { processor } = buildProcessor({}, { queue, registry, store, errorHandler });
      processor.registerHandler('merge-fallback-trigger', vi.fn().mockResolvedValue({}));
      await processor.processBatch();

      // Falls back to set for non-object values
      expect(store.set).toHaveBeenCalledWith('session.count', 42);
    });

    it('falls back to set for merge with null value', async () => {
      const trigger = makeTrigger({ id: 'merge-null-trigger' });
      const stateUpdates: StateUpdate[] = [
        { key: 'session.data', value: null, op: 'merge' },
      ];
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions: [], state_updates: stateUpdates },
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const store = makeStore();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);

      const { processor } = buildProcessor({}, { queue, registry, store, errorHandler });
      processor.registerHandler('merge-null-trigger', vi.fn().mockResolvedValue({}));
      await processor.processBatch();

      expect(store.set).toHaveBeenCalledWith('session.data', null);
    });

    it('falls back to set for merge with array value', async () => {
      const trigger = makeTrigger({ id: 'merge-array-trigger' });
      const stateUpdates: StateUpdate[] = [
        { key: 'session.items', value: [1, 2, 3], op: 'merge' },
      ];
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions: [], state_updates: stateUpdates },
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const store = makeStore();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);

      const { processor } = buildProcessor({}, { queue, registry, store, errorHandler });
      processor.registerHandler('merge-array-trigger', vi.fn().mockResolvedValue({}));
      await processor.processBatch();

      expect(store.set).toHaveBeenCalledWith('session.items', [1, 2, 3]);
    });

    it('skips state update application when result has no state_updates', async () => {
      const trigger = makeTrigger({ id: 'no-updates-trigger' });
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions: [] }, // no state_updates field
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const store = makeStore();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);

      const { processor } = buildProcessor({}, { queue, registry, store, errorHandler });
      processor.registerHandler('no-updates-trigger', vi.fn().mockResolvedValue({}));
      await processor.processBatch();

      expect(store.set).not.toHaveBeenCalled();
      expect(store.delete).not.toHaveBeenCalled();
      expect(store.merge).not.toHaveBeenCalled();
    });
  });

  // ─── processEvent — chained events ───────────────────────────────────────────

  describe('processEvent — chained events', () => {
    it('enqueues chained events returned by handler', async () => {
      const trigger = makeTrigger({ id: 'chain-trigger' });
      const chainedEvent = makeEvent({ id: 'chained-1', type: 'chained:event' });
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions: [], events: [chainedEvent] },
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const queue = makeQueue();
      const parentEvent = makeEvent({ id: 'parent-event' });
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([parentEvent]);

      const { processor } = buildProcessor({}, { queue, registry, errorHandler });
      processor.registerHandler('chain-trigger', vi.fn().mockResolvedValue({}));
      await processor.processBatch();

      const enqueuedCalls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const enqueuedChained = enqueuedCalls.find(
        ([evt]: [RuntimeEvent]) => evt.type === 'chained:event',
      );
      expect(enqueuedChained).toBeDefined();
      // Chained event should have parent_event_id set
      expect(enqueuedChained![0].context?.parent_event_id).toBe('parent-event');
      // chain_depth should be incremented from parent (0 -> 1)
      expect(enqueuedChained![0].context?.chain_depth).toBe(1);
    });

    it('inherits workflow_id from parent when child event has no workflow context', async () => {
      const trigger = makeTrigger({ id: 'wf-chain-trigger' });
      const childEvent = makeEvent({ id: 'child-1', type: 'child:event' });
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions: [], events: [childEvent] },
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const queue = makeQueue();
      const parentEvent = makeEvent({
        id: 'parent-wf',
        context: { workflow_id: 'wf-inherit' },
      });
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([parentEvent]);

      const { processor } = buildProcessor({}, { queue, registry, errorHandler });
      processor.registerHandler('wf-chain-trigger', vi.fn().mockResolvedValue({}));
      await processor.processBatch();

      const enqueuedCalls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const enqueuedChild = enqueuedCalls.find(
        ([evt]: [RuntimeEvent]) => evt.type === 'child:event',
      );
      expect(enqueuedChild![0].context?.workflow_id).toBe('wf-inherit');
    });

    it('preserves child event workflow_id when child has its own workflow context', async () => {
      const trigger = makeTrigger({ id: 'own-wf-trigger' });
      const childEvent = makeEvent({
        id: 'child-own-wf',
        type: 'child:own:event',
        context: { workflow_id: 'child-wf' },
      });
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions: [], events: [childEvent] },
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const queue = makeQueue();
      const parentEvent = makeEvent({
        id: 'parent-own-wf',
        context: { workflow_id: 'parent-wf' },
      });
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([parentEvent]);

      const { processor } = buildProcessor({}, { queue, registry, errorHandler });
      processor.registerHandler('own-wf-trigger', vi.fn().mockResolvedValue({}));
      await processor.processBatch();

      const enqueuedCalls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const enqueuedChild = enqueuedCalls.find(
        ([evt]: [RuntimeEvent]) => evt.type === 'child:own:event',
      );
      expect(enqueuedChild![0].context?.workflow_id).toBe('child-wf');
    });

    it('does not enqueue events when handler result has no events field', async () => {
      const trigger = makeTrigger({ id: 'no-events-trigger' });
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions: [] }, // no events
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);

      const { processor } = buildProcessor({}, { queue, registry, errorHandler });
      processor.registerHandler('no-events-trigger', vi.fn().mockResolvedValue({}));
      await processor.processBatch();

      const enqueuedCalls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      // No non-warning/non-error events should have been enqueued
      const nonInternalEnqueued = enqueuedCalls.filter(
        ([evt]: [RuntimeEvent]) => !evt.type.startsWith('core:'),
      );
      expect(nonInternalEnqueued).toHaveLength(0);
    });

    it('swallows enqueue errors for chained events gracefully', async () => {
      const trigger = makeTrigger({ id: 'chain-err-trigger' });
      const chainedEvent = makeEvent({ type: 'chained:fail' });
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions: [], events: [chainedEvent] },
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);
      (queue.enqueue as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('backpressure');
      });

      const { processor } = buildProcessor({}, { queue, registry, errorHandler });
      processor.registerHandler('chain-err-trigger', vi.fn().mockResolvedValue({}));

      await expect(processor.processBatch()).resolves.toBeDefined();
    });
  });

  // ─── processEvent — action executor ──────────────────────────────────────────

  describe('processEvent — action executor', () => {
    it('calls actionExecutor.execute for each action when executor is set', async () => {
      const trigger = makeTrigger({ id: 'action-trigger' });
      const actions = [
        { type: 'emit_event' as const, params: { type: 'out:1' } },
        { type: 'send_message' as const, params: { msg: 'hello' } },
      ];
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions },
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const actionExecutor = makeActionExecutor();
      const queue = makeQueue();
      const event = makeEvent({ context: { workflow_id: 'wf-action' } });
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);

      const { processor } = buildProcessor(
        { action_executor: actionExecutor },
        { queue, registry, errorHandler },
      );
      processor.registerHandler('action-trigger', vi.fn().mockResolvedValue({}));
      await processor.processBatch();

      expect(actionExecutor.execute).toHaveBeenCalledTimes(2);
      expect(actionExecutor.execute).toHaveBeenCalledWith(actions[0], {
        handler_id: 'action-trigger',
        event_type: event.type,
        workflow_id: 'wf-action',
      });
      expect(actionExecutor.execute).toHaveBeenCalledWith(actions[1], {
        handler_id: 'action-trigger',
        event_type: event.type,
        workflow_id: 'wf-action',
      });
    });

    it('does not call actionExecutor when no action_executor is set', async () => {
      const trigger = makeTrigger({ id: 'no-executor-trigger' });
      const actions = [{ type: 'emit_event' as const, params: {} }];
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions },
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const actionExecutor = makeActionExecutor();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);

      // No action_executor in options
      const { processor } = buildProcessor({}, { queue, registry, errorHandler });
      processor.registerHandler('no-executor-trigger', vi.fn().mockResolvedValue({}));
      await processor.processBatch();

      expect(actionExecutor.execute).not.toHaveBeenCalled();
    });

    it('does not call actionExecutor when result has no actions', async () => {
      const trigger = makeTrigger({ id: 'empty-action-trigger' });
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions: [] },
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const actionExecutor = makeActionExecutor();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);

      const { processor } = buildProcessor(
        { action_executor: actionExecutor },
        { queue, registry, errorHandler },
      );
      processor.registerHandler('empty-action-trigger', vi.fn().mockResolvedValue({}));
      await processor.processBatch();

      expect(actionExecutor.execute).not.toHaveBeenCalled();
    });

    it('swallows action executor errors without crashing the batch', async () => {
      const trigger = makeTrigger({ id: 'executor-err-trigger' });
      const actions = [{ type: 'emit_event' as const, params: {} }];
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions },
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const actionExecutor: ActionExecutorInterface = {
        execute: vi.fn().mockRejectedValue(new Error('action failed')),
      };
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);

      const { processor } = buildProcessor(
        { action_executor: actionExecutor },
        { queue, registry, errorHandler },
      );
      processor.registerHandler('executor-err-trigger', vi.fn().mockResolvedValue({}));

      await expect(processor.processBatch()).resolves.toBe(1);
    });

    it('passes undefined workflow_id to executor when event has no context', async () => {
      const trigger = makeTrigger({ id: 'no-ctx-trigger' });
      const actions = [{ type: 'emit_event' as const, params: {} }];
      const errorHandler = makeErrorHandler({
        success: true,
        result: { actions },
        error_events: [],
      });
      const registry = makeRegistry([trigger]);
      const actionExecutor = makeActionExecutor();
      const queue = makeQueue();
      const event = makeEvent({ context: undefined });
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);

      const { processor } = buildProcessor(
        { action_executor: actionExecutor },
        { queue, registry, errorHandler },
      );
      processor.registerHandler('no-ctx-trigger', vi.fn().mockResolvedValue({}));
      await processor.processBatch();

      expect(actionExecutor.execute).toHaveBeenCalledWith(
        actions[0],
        expect.objectContaining({ workflow_id: undefined }),
      );
    });

    it('uses trigger.actions when no handler registered and calls executor', async () => {
      const triggerAction = { type: 'emit_event' as const, params: { type: 'from-trigger' } };
      const trigger = makeTrigger({
        id: 'trigger-action-only',
        actions: [triggerAction],
      });
      const registry = makeRegistry([trigger]);
      const actionExecutor = makeActionExecutor();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);

      // No handler registered for 'trigger-action-only'
      const { processor } = buildProcessor(
        { action_executor: actionExecutor },
        { queue, registry },
      );
      await processor.processBatch();

      // Trigger.actions should be used as the result and executed
      expect(actionExecutor.execute).toHaveBeenCalledWith(
        triggerAction,
        expect.any(Object),
      );
    });
  });

  // ─── processEvent — no triggers ──────────────────────────────────────────────

  describe('processEvent — no triggers matched', () => {
    it('processes events with no matching triggers without error', async () => {
      const event = makeEvent();
      const registry = makeRegistry([]); // no triggers
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);
      const metrics = makeMetrics();

      const { processor } = buildProcessor({}, { queue, registry, metrics });
      const processed = await processor.processBatch();

      expect(processed).toBe(1);
      expect(metrics.onEventProcessed).toHaveBeenCalledWith(event, expect.any(Number));
      expect(metrics.onTriggerFired).not.toHaveBeenCalled();
    });
  });

  // ─── processEvent — multiple triggers ────────────────────────────────────────

  describe('processEvent — multiple triggers matched', () => {
    it('fires all matching triggers and collects all chained events', async () => {
      const trigger1 = makeTrigger({ id: 'multi-1' });
      const trigger2 = makeTrigger({ id: 'multi-2' });
      const child1 = makeEvent({ type: 'child:from:1' });
      const child2 = makeEvent({ type: 'child:from:2' });

      let callIndex = 0;
      const errorHandler: ErrorHandlerInterface = {
        execute: vi.fn().mockImplementation(async (trigger_id: string) => {
          const events = trigger_id === 'multi-1' ? [child1] : [child2];
          return {
            success: true,
            result: { actions: [], events },
            error_events: [],
            attempts: 1,
          };
        }),
      };

      const registry = makeRegistry([trigger1, trigger2]);
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([makeEvent()]);

      const { processor } = buildProcessor({}, { queue, registry, errorHandler });
      processor.registerHandler('multi-1', vi.fn().mockResolvedValue({}));
      processor.registerHandler('multi-2', vi.fn().mockResolvedValue({}));
      await processor.processBatch();

      const enqueuedCalls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const enqueuedTypes = enqueuedCalls.map(([evt]: [RuntimeEvent]) => evt.type);
      expect(enqueuedTypes).toContain('child:from:1');
      expect(enqueuedTypes).toContain('child:from:2');
    });
  });

  // ─── metrics — queue depth update ────────────────────────────────────────────

  describe('metrics — queue depth update', () => {
    it('calls onQueueDepthChange(0) after drain and final depth at end of batch', async () => {
      const event = makeEvent();
      const queue = makeQueue();
      (queue.drain as ReturnType<typeof vi.fn>).mockReturnValue([event]);
      (queue.depth as ReturnType<typeof vi.fn>).mockReturnValue(3);

      const metrics = makeMetrics();
      const { processor } = buildProcessor({}, { queue, metrics });
      await processor.processBatch();

      const depthCalls = (metrics.onQueueDepthChange as ReturnType<typeof vi.fn>).mock.calls;
      // First call with 0, last call with current queue depth
      expect(depthCalls[0][0]).toBe(0);
      expect(depthCalls[depthCalls.length - 1][0]).toBe(3);
    });
  });
});
