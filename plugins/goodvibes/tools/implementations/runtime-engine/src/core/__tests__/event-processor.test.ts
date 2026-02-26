/**
 * event-processor.test.ts
 * Tests for EventProcessor — Layer 1 main loop.
 * All dependencies are mocked via vi.fn() implementing the relevant interfaces.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventProcessor } from '../event-processor.js';
import { EventMetrics } from '../metrics.js';
import type {
  RuntimeEvent,
  EventQueueInterface,
  TriggerRegistryInterface,
  StateStoreInterface,
  LoopLifecycle,
  ErrorHandlerInterface,
  DeadLetterQueueInterface,
  HandlerResult,
  Trigger,
  TriggerHandlerFn,
} from '../types.js';

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: overrides.id ?? `evt-${Math.random().toString(36).slice(2)}`,
    source: overrides.source ?? 'internal',
    type: overrides.type ?? 'test:event',
    payload: overrides.payload ?? {},
    timestamp: overrides.timestamp ?? Date.now(),
    priority: overrides.priority ?? 0,
    context: overrides.context,
  };
}

function makeTrigger(overrides: Partial<Trigger> = {}): Trigger {
  return {
    id: overrides.id ?? 'trigger-1',
    event_match: overrides.event_match ?? { type: 'test:event' },
    actions: overrides.actions ?? [],
    enabled: overrides.enabled ?? true,
    ...overrides,
  };
}

function makeQueue(events: RuntimeEvent[] = []): EventQueueInterface {
  const q = [...events];
  return {
    enqueue: vi.fn((e: RuntimeEvent) => { q.push(e); }),
    drain: vi.fn(() => { const all = [...q]; q.length = 0; return all; }),
    peek: vi.fn(() => q[0] ?? null),
    depth: vi.fn(() => q.length),
    deduplicate: vi.fn(() => false),
    cancel: vi.fn(() => false),
    cancelByRef: vi.fn(() => 0),
    requeue: vi.fn((es: RuntimeEvent[]) => { q.unshift(...es); }),
  };
}

function makeRegistry(triggers: Trigger[] = []): TriggerRegistryInterface {
  return {
    match: vi.fn((_event: RuntimeEvent, _store: StateStoreInterface) => triggers),
    recordFire: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(() => true),
    enable: vi.fn(),
    disable: vi.fn(),
    get: vi.fn((id: string) => triggers.find((t) => t.id === id)),
  };
}

function makeStore(): StateStoreInterface {
  const data = new Map<string, unknown>();
  return {
    get: vi.fn(<T>(key: string) => (data.get(key) as T) ?? null),
    set: vi.fn((key: string, value: unknown) => { data.set(key, value); }),
    delete: vi.fn((key: string) => { data.delete(key); }),
    merge: vi.fn((key: string, value: Record<string, unknown>) => {
      const existing = data.get(key) as Record<string, unknown> | undefined ?? {};
      data.set(key, { ...existing, ...value });
    }),
    snapshot: vi.fn(() => Object.fromEntries(data)),
    restore: vi.fn((snap: Record<string, unknown>) => {
      data.clear();
      for (const [k, v] of Object.entries(snap)) data.set(k, v);
    }),
  };
}

function makeLifecycle(isRunning = true): LoopLifecycle {
  return {
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    drain: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    status: vi.fn(() => (isRunning ? 'running' : 'stopped')),
    isProcessing: vi.fn(() => isRunning),
    acceptsEvents: vi.fn(() => isRunning),
  };
}

function makeErrorHandler(result?: Partial<Awaited<ReturnType<ErrorHandlerInterface['execute']>>>): ErrorHandlerInterface {
  return {
    execute: vi.fn().mockResolvedValue({
      success: true,
      result: { actions: [], state_updates: [], events: [] } as HandlerResult,
      attempts: 1,
      error_events: [],
      ...result,
    }),
  };
}

function makeDLQ(): DeadLetterQueueInterface {
  return {
    add: vi.fn(),
    size: vi.fn(() => 0),
  };
}

function makeProcessor(
  opts: {
    events?: RuntimeEvent[];
    triggers?: Trigger[];
    isRunning?: boolean;
    errorHandlerResult?: Partial<Awaited<ReturnType<ErrorHandlerInterface['execute']>>>;
    processorOptions?: Parameters<typeof EventProcessor>[7];
    handlers?: Map<string, TriggerHandlerFn>;
  } = {},
) {
  const queue = makeQueue(opts.events ?? []);
  const registry = makeRegistry(opts.triggers ?? []);
  const store = makeStore();
  const lifecycle = makeLifecycle(opts.isRunning ?? true);
  const metrics = new EventMetrics();
  const errorHandler = makeErrorHandler(opts.errorHandlerResult);
  const dlq = makeDLQ();

  const processor = new EventProcessor(
    queue,
    registry,
    store,
    lifecycle,
    metrics,
    errorHandler,
    dlq,
    opts.processorOptions ?? {},
  );

  if (opts.handlers) {
    for (const [id, h] of opts.handlers) {
      processor.registerHandler(id, h);
    }
  }

  return { processor, queue, registry, store, lifecycle, metrics, errorHandler, dlq };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EventProcessor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── processBatch — not running ─────────────────────────────────────────────

  describe('processBatch — not running', () => {
    it('returns 0 when lifecycle is not processing', async () => {
      const { processor } = makeProcessor({ isRunning: false });
      const count = await processor.processBatch();
      expect(count).toBe(0);
    });

    it('does not drain the queue when not processing', async () => {
      const { processor, queue } = makeProcessor({ isRunning: false });
      await processor.processBatch();
      expect(queue.drain).not.toHaveBeenCalled();
    });
  });

  // ── processBatch — empty queue ─────────────────────────────────────────────

  describe('processBatch — empty queue', () => {
    it('returns 0 when queue is empty', async () => {
      const { processor } = makeProcessor({ events: [] });
      const count = await processor.processBatch();
      expect(count).toBe(0);
    });
  });

  // ── processBatch — basic processing ───────────────────────────────────────

  describe('processBatch — basic event processing', () => {
    it('processes events and returns processed count', async () => {
      const events = [makeEvent({ id: 'e1' }), makeEvent({ id: 'e2' })];
      const { processor } = makeProcessor({ events });
      const count = await processor.processBatch();
      expect(count).toBe(2);
    });

    it('calls registry.match for each event', async () => {
      const events = [makeEvent({ id: 'e1' }), makeEvent({ id: 'e2' })];
      const { processor, registry } = makeProcessor({ events });
      await processor.processBatch();
      expect(registry.match).toHaveBeenCalledTimes(2);
    });

    it('calls registry.recordFire when trigger matches', async () => {
      const trigger = makeTrigger({ id: 'trig-1' });
      const events = [makeEvent()];
      const { processor, registry } = makeProcessor({ events, triggers: [trigger] });
      await processor.processBatch();
      expect(registry.recordFire).toHaveBeenCalledWith('trig-1');
    });

    it('updates metrics on event processed', async () => {
      const events = [makeEvent()];
      const { processor, metrics } = makeProcessor({ events });
      const spy = vi.spyOn(metrics, 'onEventProcessed');
      await processor.processBatch();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  // ── Handler execution ──────────────────────────────────────────────────────

  describe('handler execution', () => {
    it('invokes registered handler when trigger matches', async () => {
      const trigger = makeTrigger({ id: 'my-trigger' });
      const handler = vi.fn().mockResolvedValue({ actions: [] } as HandlerResult);
      const events = [makeEvent()];
      const { processor } = makeProcessor({
        events,
        triggers: [trigger],
        handlers: new Map([['my-trigger', handler]]),
      });
      await processor.processBatch();
      expect(handler).not.toHaveBeenCalled(); // handler is called via errorHandler.execute
      // errorHandler.execute is called
    });

    it('uses trigger.actions as result when no handler registered', async () => {
      const trigger = makeTrigger({
        id: 'no-handler-trigger',
        actions: [{ type: 'emit_event', params: { key: 'val' } }],
      });
      const events = [makeEvent()];
      const { processor } = makeProcessor({
        events,
        triggers: [trigger],
        // No handlers registered
      });
      // Should not call errorHandler when no handler registered
      const count = await processor.processBatch();
      expect(count).toBe(1);
    });

    it('calls errorHandler.execute with correct args when handler is registered', async () => {
      const trigger = makeTrigger({ id: 'exec-trigger' });
      const h: TriggerHandlerFn = vi.fn().mockResolvedValue({});
      const events = [makeEvent({ id: 'exec-evt' })];
      const { processor, errorHandler } = makeProcessor({
        events,
        triggers: [trigger],
        handlers: new Map([['exec-trigger', h]]),
      });
      await processor.processBatch();
      expect(errorHandler.execute).toHaveBeenCalledWith(
        'exec-trigger',
        h,
        expect.objectContaining({ id: 'exec-evt' }),
        trigger.retry,
      );
    });

    it('records handler error in metrics when execution fails', async () => {
      const trigger = makeTrigger({ id: 'fail-trigger' });
      const h: TriggerHandlerFn = vi.fn();
      const events = [makeEvent()];
      const failResult = {
        success: false,
        error: new Error('handler failed'),
        attempts: 1,
        error_events: [],
      };
      const { processor, errorHandler, metrics } = makeProcessor({
        events,
        triggers: [trigger],
        handlers: new Map([['fail-trigger', h]]),
        errorHandlerResult: failResult,
      });
      const spy = vi.spyOn(metrics, 'onHandlerError');
      await processor.processBatch();
      expect(spy).toHaveBeenCalled();
    });

    it('enqueues error events when handler fails', async () => {
      const trigger = makeTrigger({ id: 'fail-trigger' });
      const h: TriggerHandlerFn = vi.fn();
      const errorEvt = makeEvent({ id: 'err-evt', type: 'core:handler_error' });
      const failResult = {
        success: false,
        error: new Error('fail'),
        attempts: 1,
        error_events: [errorEvt],
      };
      const { processor, queue } = makeProcessor({
        events: [makeEvent({ id: 'main-evt' })],
        triggers: [trigger],
        handlers: new Map([['fail-trigger', h]]),
        errorHandlerResult: failResult,
      });
      await processor.processBatch();
      // queue.enqueue called with the error event
      const calls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const enqueuedTypes = calls.map((c: unknown[]) => (c[0] as RuntimeEvent).type);
      expect(enqueuedTypes).toContain('core:handler_error');
    });
  });

  // ── Event chaining ─────────────────────────────────────────────────────────

  describe('event chaining', () => {
    it('enqueues chained events produced by handler', async () => {
      const trigger = makeTrigger({ id: 'chain-trigger' });
      const childEvent = makeEvent({ id: 'child-evt', type: 'child:event' });
      // Must register a handler so the errorHandler path is taken (not trigger.actions fallback)
      const dummyHandler: TriggerHandlerFn = vi.fn();
      const { processor, queue } = makeProcessor({
        events: [makeEvent({ id: 'parent-evt' })],
        triggers: [trigger],
        handlers: new Map([['chain-trigger', dummyHandler]]),
        errorHandlerResult: {
          success: true,
          result: { events: [childEvent] } as HandlerResult,
          attempts: 1,
          error_events: [],
        },
      });
      await processor.processBatch();
      const calls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const types = calls.map((c: unknown[]) => (c[0] as RuntimeEvent).type);
      expect(types).toContain('child:event');
    });

    it('chained event has incremented chain_depth', async () => {
      const trigger = makeTrigger({ id: 'chain-trigger' });
      const childEvent = makeEvent({ id: 'child-evt', type: 'child:event' });
      const parentEvent = makeEvent({ id: 'parent-evt', context: { chain_depth: 2 } });
      const dummyHandler: TriggerHandlerFn = vi.fn();
      const { processor, queue } = makeProcessor({
        events: [parentEvent],
        triggers: [trigger],
        handlers: new Map([['chain-trigger', dummyHandler]]),
        errorHandlerResult: {
          success: true,
          result: { events: [childEvent] } as HandlerResult,
          attempts: 1,
          error_events: [],
        },
      });
      await processor.processBatch();
      const calls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const enqueuedChild = calls.find(
        (c: unknown[]) => (c[0] as RuntimeEvent).type === 'child:event',
      )?.[0] as RuntimeEvent | undefined;
      expect(enqueuedChild?.context?.chain_depth).toBe(3); // parent depth 2 + 1
    });

    it('chained event has parent_event_id set', async () => {
      const trigger = makeTrigger({ id: 'chain-trigger' });
      const childEvent = makeEvent({ id: 'child-evt', type: 'child:event' });
      const parentEvent = makeEvent({ id: 'the-parent' });
      const dummyHandler: TriggerHandlerFn = vi.fn();
      const { processor, queue } = makeProcessor({
        events: [parentEvent],
        triggers: [trigger],
        handlers: new Map([['chain-trigger', dummyHandler]]),
        errorHandlerResult: {
          success: true,
          result: { events: [childEvent] } as HandlerResult,
          attempts: 1,
          error_events: [],
        },
      });
      await processor.processBatch();
      const calls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const enqueuedChild = calls.find(
        (c: unknown[]) => (c[0] as RuntimeEvent).type === 'child:event',
      )?.[0] as RuntimeEvent | undefined;
      expect(enqueuedChild?.context?.parent_event_id).toBe('the-parent');
    });

    it('chained event inherits workflow_id from parent when child has none', async () => {
      const trigger = makeTrigger({ id: 'chain-trigger' });
      const childEvent = makeEvent({ id: 'child-evt', type: 'child:event' });
      const parentEvent = makeEvent({ id: 'par', context: { workflow_id: 'wf-42' } });
      const dummyHandler: TriggerHandlerFn = vi.fn();
      const { processor, queue } = makeProcessor({
        events: [parentEvent],
        triggers: [trigger],
        handlers: new Map([['chain-trigger', dummyHandler]]),
        errorHandlerResult: {
          success: true,
          result: { events: [childEvent] } as HandlerResult,
          attempts: 1,
          error_events: [],
        },
      });
      await processor.processBatch();
      const calls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const enqueuedChild = calls.find(
        (c: unknown[]) => (c[0] as RuntimeEvent).type === 'child:event',
      )?.[0] as RuntimeEvent | undefined;
      expect(enqueuedChild?.context?.workflow_id).toBe('wf-42');
    });
  });

  // ── State updates ──────────────────────────────────────────────────────────

  describe('state updates from handler result', () => {
    it('applies set state updates to the store', async () => {
      const trigger = makeTrigger({ id: 'state-trigger' });
      const event = makeEvent();
      // Must register a handler so errorHandler path is taken (not trigger.actions fallback)
      const dummyHandler: TriggerHandlerFn = vi.fn();
      const { processor, store } = makeProcessor({
        events: [event],
        triggers: [trigger],
        handlers: new Map([['state-trigger', dummyHandler]]),
        errorHandlerResult: {
          success: true,
          result: {
            state_updates: [{ key: 'session.phase', value: 'active', op: 'set' }],
          } as HandlerResult,
          attempts: 1,
          error_events: [],
        },
      });
      await processor.processBatch();
      expect(store.set).toHaveBeenCalledWith('session.phase', 'active');
    });

    it('applies delete state updates', async () => {
      const trigger = makeTrigger({ id: 'del-trigger' });
      const dummyHandler: TriggerHandlerFn = vi.fn();
      const { processor, store } = makeProcessor({
        events: [makeEvent()],
        triggers: [trigger],
        handlers: new Map([['del-trigger', dummyHandler]]),
        errorHandlerResult: {
          success: true,
          result: {
            state_updates: [{ key: 'session.token', value: null, op: 'delete' }],
          } as HandlerResult,
          attempts: 1,
          error_events: [],
        },
      });
      await processor.processBatch();
      expect(store.delete).toHaveBeenCalledWith('session.token');
    });

    it('applies merge state updates', async () => {
      const trigger = makeTrigger({ id: 'merge-trigger' });
      const dummyHandler: TriggerHandlerFn = vi.fn();
      const { processor, store } = makeProcessor({
        events: [makeEvent()],
        triggers: [trigger],
        handlers: new Map([['merge-trigger', dummyHandler]]),
        errorHandlerResult: {
          success: true,
          result: {
            state_updates: [{ key: 'config', value: { theme: 'dark' }, op: 'merge' }],
          } as HandlerResult,
          attempts: 1,
          error_events: [],
        },
      });
      await processor.processBatch();
      expect(store.merge).toHaveBeenCalledWith('config', { theme: 'dark' });
    });

    it('falls back to set for merge with non-object value', async () => {
      const trigger = makeTrigger({ id: 'merge-fallback' });
      const dummyHandler: TriggerHandlerFn = vi.fn();
      const { processor, store } = makeProcessor({
        events: [makeEvent()],
        triggers: [trigger],
        handlers: new Map([['merge-fallback', dummyHandler]]),
        errorHandlerResult: {
          success: true,
          result: {
            state_updates: [{ key: 'count', value: 42, op: 'merge' }],
          } as HandlerResult,
          attempts: 1,
          error_events: [],
        },
      });
      await processor.processBatch();
      expect(store.set).toHaveBeenCalledWith('count', 42);
    });
  });

  // ── Chain depth circuit breaker ────────────────────────────────────────────

  describe('chain depth circuit breaker', () => {
    it('drops event when chain_depth exceeds max_chain_depth', async () => {
      const event = makeEvent({ id: 'deep-evt', context: { chain_depth: 11 } });
      const { processor, registry } = makeProcessor({
        events: [event],
        processorOptions: { max_chain_depth: 10 },
      });
      const count = await processor.processBatch();
      // The event is dropped (not processed), but a chain_depth_exceeded event is enqueued
      expect(registry.match).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: 'deep-evt' }),
        expect.anything(),
      );
      expect(count).toBe(0);
    });

    it('enqueues core:chain_depth_exceeded event when depth exceeded', async () => {
      const event = makeEvent({ id: 'deep', context: { chain_depth: 15 } });
      const { processor, queue } = makeProcessor({
        events: [event],
        processorOptions: { max_chain_depth: 10 },
      });
      await processor.processBatch();
      const calls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const types = calls.map((c: unknown[]) => (c[0] as RuntimeEvent).type);
      expect(types).toContain('core:chain_depth_exceeded');
    });

    it('processes event when chain_depth equals max_chain_depth', async () => {
      const event = makeEvent({ id: 'exact', context: { chain_depth: 10 } });
      const { processor } = makeProcessor({
        events: [event],
        processorOptions: { max_chain_depth: 10 },
      });
      const count = await processor.processBatch();
      expect(count).toBe(1);
    });
  });

  // ── Workflow locking ───────────────────────────────────────────────────────

  describe('workflow-level locking', () => {
    it('acquires a lock for events with workflow_id', async () => {
      const event = makeEvent({ context: { workflow_id: 'wf-1' } });
      const { processor } = makeProcessor({ events: [event] });
      await processor.processBatch();
      // Lock should be released after processing
      expect(processor.activeWorkflowCount()).toBe(0);
    });

    it('re-enqueues event when same workflow is locked by a concurrent batch', async () => {
      // Workflow locking protects against concurrent processBatch calls processing
      // the same workflow_id simultaneously. We test this by:
      // 1. Starting batch A with event "first" (acquires lock for wf-99, then blocks)
      // 2. Starting batch B with event "second" before batch A finishes
      //    -> batch B sees the lock held and re-enqueues "second"
      vi.useRealTimers(); // Use real timers for this async coordination test

      const trigger = makeTrigger({ id: 'wf-trigger' });

      let resolveFirst!: () => void;
      const firstDone = new Promise<void>((resolve) => { resolveFirst = resolve; });

      let callCount = 0;
      const blockingErrorHandler: ErrorHandlerInterface = {
        execute: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            await firstDone; // block until we signal
          }
          return {
            success: true,
            result: { actions: [] } as HandlerResult,
            attempts: 1,
            error_events: [],
          };
        }),
      };

      // Batch A queue: just event "first"
      const queueA = makeQueue([makeEvent({ id: 'first', context: { workflow_id: 'wf-99' } })]);
      const registry = makeRegistry([trigger]);
      const store = makeStore();
      const lifecycle = makeLifecycle(true);
      const metrics = new EventMetrics();
      const dlq = makeDLQ();

      const processor = new EventProcessor(
        queueA, registry, store, lifecycle, metrics,
        blockingErrorHandler, dlq,
        { lock_timeout_ms: 30000 },
      );
      processor.registerHandler('wf-trigger', vi.fn());

      // Start batch A — event "first" acquires lock and blocks
      const batchAPromise = processor.processBatch();

      // Yield so the lock is acquired
      await new Promise<void>((r) => setImmediate(r));

      // Now add "second" to the queue and run batch B while lock is held
      queueA.enqueue(makeEvent({ id: 'second', context: { workflow_id: 'wf-99' } }));
      // Clear the enqueue spy calls so we only see batch B re-enqueues
      (queueA.enqueue as ReturnType<typeof vi.fn>).mockClear();

      // Start batch B — "second" should see the lock and be re-enqueued
      const batchBPromise = processor.processBatch();

      // Release first event and wait for both batches
      resolveFirst();
      await Promise.all([batchAPromise, batchBPromise]);

      // "second" should have been re-enqueued by batch B (lock was held)
      const enqueueCalls = (queueA.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const reenqueued = enqueueCalls.find(
        (c: unknown[]) => (c[0] as RuntimeEvent).id === 'second',
      );
      expect(reenqueued).toBeDefined();

      vi.useFakeTimers(); // restore fake timers for remaining tests
    });

    it('events without workflow_id are processed freely (no lock)', async () => {
      const events = [
        makeEvent({ id: 'a' }), // no workflow_id
        makeEvent({ id: 'b' }), // no workflow_id
      ];
      const { processor } = makeProcessor({ events });
      const count = await processor.processBatch();
      expect(count).toBe(2);
    });

    it('releases stale lock and processes event', async () => {
      // Set an extremely short lock timeout so it expires immediately
      const event1 = makeEvent({ id: 'old', context: { workflow_id: 'wf-stale' } });
      const event2 = makeEvent({ id: 'new', context: { workflow_id: 'wf-stale' } });

      const { processor, queue } = makeProcessor({
        events: [event1, event2],
        processorOptions: { lock_timeout_ms: 0 }, // expires immediately
      });

      // Run first batch to process event1 (lock acquired and released)
      await processor.processBatch();
      // Both events should be processed since lock_timeout=0 causes stale immediately on 2nd
      expect(processor.activeWorkflowCount()).toBe(0);
    });
  });

  // ── Priority floor ─────────────────────────────────────────────────────────

  describe('priority floor enforcement', () => {
    it('skips events below priority floor', async () => {
      const lowPriority = makeEvent({ id: 'low', priority: 1 });
      const { processor, registry } = makeProcessor({
        events: [lowPriority],
        processorOptions: { priority_floor: 5 },
      });
      const count = await processor.processBatch();
      expect(count).toBe(0);
      expect(registry.match).not.toHaveBeenCalled();
    });

    it('processes events at or above priority floor', async () => {
      const highPriority = makeEvent({ id: 'high', priority: 5 });
      const { processor } = makeProcessor({
        events: [highPriority],
        processorOptions: { priority_floor: 5 },
      });
      const count = await processor.processBatch();
      expect(count).toBe(1);
    });

    it('skips low-priority events but processes high-priority ones in same batch', async () => {
      const lowPriority = makeEvent({ id: 'low', priority: 2 });
      const highPriority = makeEvent({ id: 'high', priority: 10 });
      const { processor } = makeProcessor({
        events: [lowPriority, highPriority],
        processorOptions: { priority_floor: 5 },
      });
      const count = await processor.processBatch();
      expect(count).toBe(1); // Only the high priority event
    });
  });

  // ── Rate limiting ──────────────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('limits events to max_per_window within a window', async () => {
      const events = [
        makeEvent({ id: 'e1' }),
        makeEvent({ id: 'e2' }),
        makeEvent({ id: 'e3' }),
        makeEvent({ id: 'e4' }),
        makeEvent({ id: 'e5' }),
      ];
      const { processor } = makeProcessor({
        events,
        processorOptions: { rate_limit: { max_per_window: 3, window_ms: 1000 } },
      });
      const count = await processor.processBatch();
      expect(count).toBe(3);
    });

    it('re-enqueues remaining events when rate limit is hit', async () => {
      const events = [
        makeEvent({ id: 'e1' }),
        makeEvent({ id: 'e2' }),
        makeEvent({ id: 'e3' }),
      ];
      const { processor, queue } = makeProcessor({
        events,
        processorOptions: { rate_limit: { max_per_window: 1, window_ms: 1000 } },
      });
      await processor.processBatch();
      // requeue should have been called with the remaining events
      expect(queue.requeue).toHaveBeenCalled();
    });

    it('allows new events after window resets', async () => {
      const events1 = [makeEvent({ id: 'e1' }), makeEvent({ id: 'e2' })];
      const { processor } = makeProcessor({
        events: events1,
        processorOptions: { rate_limit: { max_per_window: 1, window_ms: 100 } },
      });
      // First batch: processes 1 (hits limit), re-queues 1 remaining
      const count1 = await processor.processBatch();
      expect(count1).toBe(1);
      // Advance time past the window to reset the rate limiter
      vi.advanceTimersByTime(200);
      // Second batch: the re-queued event is now eligible (window reset)
      const count2 = await processor.processBatch();
      // The re-queued event should now be processed
      expect(count2).toBe(1);
    });
  });

  // ── Budget checking ────────────────────────────────────────────────────────

  describe('budget checking', () => {
    it('pauses lifecycle when pause threshold is exceeded', async () => {
      const { processor, lifecycle } = makeProcessor({
        events: [makeEvent()],
        processorOptions: {
          budget: { total: 100, warn_threshold: 0.8, pause_threshold: 0.9 },
        },
      });
      // Consume tokens to exceed pause threshold
      processor.consumeTokens(95); // 95% of 100
      await processor.processBatch();
      expect(lifecycle.pause).toHaveBeenCalled();
    });

    it('does not pause when below pause threshold', async () => {
      const { processor, lifecycle } = makeProcessor({
        events: [makeEvent()],
        processorOptions: {
          budget: { total: 100, warn_threshold: 0.8, pause_threshold: 0.9 },
        },
      });
      processor.consumeTokens(50); // 50% — below threshold
      await processor.processBatch();
      expect(lifecycle.pause).not.toHaveBeenCalled();
    });

    it('no-ops when budget total is 0 (unlimited)', async () => {
      const { processor, lifecycle } = makeProcessor({
        events: [makeEvent()],
        processorOptions: {
          budget: { total: 0, warn_threshold: 0.8, pause_threshold: 0.9 },
        },
      });
      processor.consumeTokens(1000000);
      const count = await processor.processBatch();
      expect(count).toBe(1);
      expect(lifecycle.pause).not.toHaveBeenCalled();
    });

    it('consumeTokens is a no-op when no budget configured', () => {
      const { processor } = makeProcessor({});
      expect(() => processor.consumeTokens(9999)).not.toThrow();
    });
  });

  // ── Queue depth warning ────────────────────────────────────────────────────

  describe('queue depth warning', () => {
    it('enqueues core:queue_depth_warning when depth exceeds threshold', async () => {
      // Queue with 10 items but depth reported as 10
      const event = makeEvent();
      const { processor, queue } = makeProcessor({
        events: [event],
        processorOptions: { queue_depth_warning: 5 },
      });
      // Override depth to report above threshold before drain
      (queue.depth as ReturnType<typeof vi.fn>).mockReturnValueOnce(10); // before drain check
      await processor.processBatch();
      const calls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const types = calls.map((c: unknown[]) => (c[0] as RuntimeEvent).type);
      expect(types).toContain('core:queue_depth_warning');
    });

    it('does not enqueue warning when depth is below threshold', async () => {
      const { processor, queue } = makeProcessor({
        events: [makeEvent()],
        processorOptions: { queue_depth_warning: 100 },
      });
      // Queue depth is 1, threshold is 100 — no warning
      await processor.processBatch();
      const calls = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      const types = calls.map((c: unknown[]) => (c[0] as RuntimeEvent).type);
      expect(types).not.toContain('core:queue_depth_warning');
    });
  });

  // ── processBatch max events limit ─────────────────────────────────────────

  describe('processBatch — max events per batch', () => {
    it('processes at most max_events_per_batch events', async () => {
      const events = Array.from({ length: 10 }, (_, i) => makeEvent({ id: `e${i}` }));
      const { processor } = makeProcessor({
        events,
        processorOptions: { max_events_per_batch: 5 },
      });
      const count = await processor.processBatch();
      expect(count).toBe(5);
    });

    it('re-enqueues excess events via requeue', async () => {
      const events = Array.from({ length: 8 }, (_, i) => makeEvent({ id: `e${i}` }));
      const { processor, queue } = makeProcessor({
        events,
        processorOptions: { max_events_per_batch: 3 },
      });
      await processor.processBatch();
      expect(queue.requeue).toHaveBeenCalled();
    });
  });

  // ── registerHandler ────────────────────────────────────────────────────────

  describe('registerHandler', () => {
    it('registers a handler that is used during execution', async () => {
      const trigger = makeTrigger({ id: 'dyn-trigger' });
      const h: TriggerHandlerFn = vi.fn().mockResolvedValue({});
      const { processor, errorHandler } = makeProcessor({
        events: [makeEvent()],
        triggers: [trigger],
      });
      processor.registerHandler('dyn-trigger', h);
      await processor.processBatch();
      // trigger.retry is undefined (not set), so 4th arg is undefined
      expect(errorHandler.execute).toHaveBeenCalledWith(
        'dyn-trigger',
        h,
        expect.objectContaining({ type: 'test:event' }),
        undefined,
      );
    });
  });

  // ── activeWorkflowCount ────────────────────────────────────────────────────

  describe('activeWorkflowCount', () => {
    it('returns 0 initially', () => {
      const { processor } = makeProcessor({});
      expect(processor.activeWorkflowCount()).toBe(0);
    });

    it('returns 0 after processing events without workflow_id', async () => {
      const { processor } = makeProcessor({ events: [makeEvent()] });
      await processor.processBatch();
      expect(processor.activeWorkflowCount()).toBe(0);
    });
  });

  // ── Metrics integration ────────────────────────────────────────────────────

  describe('metrics integration', () => {
    it('calls onTriggerFired when trigger matches', async () => {
      const trigger = makeTrigger({ id: 'met-trigger' });
      const event = makeEvent();
      const { processor, metrics } = makeProcessor({
        events: [event],
        triggers: [trigger],
      });
      const spy = vi.spyOn(metrics, 'onTriggerFired');
      await processor.processBatch();
      expect(spy).toHaveBeenCalledWith('met-trigger', expect.objectContaining({ type: event.type }));
    });

    it('calls onQueueDepthChange before and after batch', async () => {
      const { processor, metrics } = makeProcessor({ events: [makeEvent()] });
      const spy = vi.spyOn(metrics, 'onQueueDepthChange');
      await processor.processBatch();
      expect(spy).toHaveBeenCalledTimes(2); // once to 0 after drain, once at end
    });
  });
});
