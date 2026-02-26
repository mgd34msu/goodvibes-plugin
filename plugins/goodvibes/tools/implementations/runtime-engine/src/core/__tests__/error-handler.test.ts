/**
 * error-handler.test.ts
 * Tests for ErrorHandler — Layer 1.
 * Uses vi.useFakeTimers to avoid real delays from retry backoff.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorHandler } from '../error-handler.js';
import type {
  DeadLetterQueueInterface,
  DeadLetterEntry,
  TriggerHandlerFn,
  RuntimeEvent,
  HandlerResult,
  RetryPolicy,
} from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: overrides.id ?? 'evt-1',
    source: 'internal',
    type: overrides.type ?? 'test:event',
    payload: {},
    timestamp: Date.now(),
    priority: 0,
    ...overrides,
  };
}

function makeDLQ(): DeadLetterQueueInterface & { entries: DeadLetterEntry[] } {
  const entries: DeadLetterEntry[] = [];
  return {
    entries,
    add: vi.fn((entry: DeadLetterEntry) => { entries.push(entry); }),
    size: vi.fn(() => entries.length),
  };
}

function makeHandler(result: Partial<HandlerResult> = {}): TriggerHandlerFn {
  return vi.fn().mockResolvedValue(result as HandlerResult);
}

function makeThrowingHandler(error: Error): TriggerHandlerFn {
  return vi.fn().mockRejectedValue(error);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ErrorHandler', () => {
  let dlq: ReturnType<typeof makeDLQ>;
  let handler: ErrorHandler;

  beforeEach(() => {
    vi.useFakeTimers();
    dlq = makeDLQ();
    handler = new ErrorHandler({ deadLetter: dlq });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Success path ───────────────────────────────────────────────────────────

  describe('execute — success path', () => {
    it('returns success:true on first attempt', async () => {
      const h = makeHandler({ actions: [] });
      const promise = handler.execute('t1', h, makeEvent());
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.error_events).toHaveLength(0);
    });

    it('returns the handler result', async () => {
      const handlerResult: HandlerResult = {
        actions: [{ type: 'emit_event', params: { foo: 'bar' } }],
        state_updates: [{ key: 'mykey', value: 'myval', op: 'set' }],
      };
      const h = makeHandler(handlerResult);
      const promise = handler.execute('t1', h, makeEvent());
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.result).toMatchObject(handlerResult);
    });

    it('does not add to dead-letter queue on success', async () => {
      const promise = handler.execute('t1', makeHandler(), makeEvent());
      await vi.runAllTimersAsync();
      await promise;
      expect(dlq.add).not.toHaveBeenCalled();
    });

    it('calls handler exactly once when no retry policy', async () => {
      const h = makeHandler();
      const promise = handler.execute('t1', h, makeEvent());
      await vi.runAllTimersAsync();
      await promise;
      expect(h).toHaveBeenCalledTimes(1);
    });

    it('passes the event to the handler', async () => {
      const event = makeEvent({ id: 'specific-event', type: 'custom:type' });
      const h = makeHandler();
      const promise = handler.execute('t1', h, event);
      await vi.runAllTimersAsync();
      await promise;
      expect(h).toHaveBeenCalledWith(event);
    });
  });

  // ── Soft error (handler returns error in result) ────────────────────────────

  describe('execute — soft errors (error in HandlerResult)', () => {
    it('retries on soft error and succeeds', async () => {
      const softError = new Error('soft');
      const h = vi
        .fn()
        .mockResolvedValueOnce({ error: softError } as HandlerResult)
        .mockResolvedValueOnce({} as HandlerResult);

      const retry: RetryPolicy = { max_attempts: 2, backoff: 'fixed', delay_ms: 100 };
      const promise = handler.execute('t1', h, makeEvent(), retry);
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    it('dead-letters after all soft-error retries exhausted', async () => {
      const softError = new Error('persistent soft error');
      const h = vi.fn().mockResolvedValue({ error: softError } as HandlerResult);
      const retry: RetryPolicy = { max_attempts: 2, backoff: 'fixed', delay_ms: 50 };
      const promise = handler.execute('t1', h, makeEvent(), retry);
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.success).toBe(false);
      expect(dlq.add).toHaveBeenCalledTimes(1);
    });
  });

  // ── No retry policy (single attempt) ──────────────────────────────────────

  describe('execute — no retry policy', () => {
    it('dead-letters immediately on throw without retry', async () => {
      const err = new Error('no retry');
      const h = makeThrowingHandler(err);
      const promise = handler.execute('t1', h, makeEvent());
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(dlq.add).toHaveBeenCalledTimes(1);
    });

    it('produces one error event on single-attempt failure', async () => {
      const err = new Error('fail');
      const h = makeThrowingHandler(err);
      const promise = handler.execute('t1', h, makeEvent());
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.error_events).toHaveLength(1);
      expect(result.error_events[0].type).toBe('core:handler_error');
    });

    it('never throws even when handler throws', async () => {
      const h = makeThrowingHandler(new Error('boom'));
      const promise = handler.execute('t1', h, makeEvent());
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBeDefined();
    });
  });

  // ── Fixed backoff retry ────────────────────────────────────────────────────

  describe('execute — fixed backoff retry', () => {
    it('retries up to max_attempts with fixed delay', async () => {
      const err = new Error('transient');
      const h = vi
        .fn()
        .mockRejectedValueOnce(err)
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce({} as HandlerResult);

      const retry: RetryPolicy = { max_attempts: 3, backoff: 'fixed', delay_ms: 100 };
      const promise = handler.execute('t1', h, makeEvent(), retry);
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(h).toHaveBeenCalledTimes(3);
    });

    it('dead-letters after exhausting all fixed-backoff retries', async () => {
      const err = new Error('always fails');
      const h = makeThrowingHandler(err);
      const retry: RetryPolicy = { max_attempts: 3, backoff: 'fixed', delay_ms: 100 };
      const promise = handler.execute('t1', h, makeEvent(), retry);
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(dlq.add).toHaveBeenCalledTimes(1);
    });

    it('respects max_attempts limit (does not exceed it)', async () => {
      const h = makeThrowingHandler(new Error('fail'));
      const retry: RetryPolicy = { max_attempts: 4, backoff: 'fixed', delay_ms: 10 };
      const promise = handler.execute('t1', h, makeEvent(), retry);
      await vi.runAllTimersAsync();
      await promise;
      expect(h).toHaveBeenCalledTimes(4);
    });
  });

  // ── Exponential backoff retry ──────────────────────────────────────────────

  describe('execute — exponential backoff retry', () => {
    it('retries successfully with exponential backoff', async () => {
      const err = new Error('transient');
      const h = vi
        .fn()
        .mockRejectedValueOnce(err)
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce({} as HandlerResult);

      const retry: RetryPolicy = { max_attempts: 3, backoff: 'exponential', delay_ms: 50 };
      const promise = handler.execute('t1', h, makeEvent(), retry);
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });

    it('dead-letters after exhausting exponential retries', async () => {
      const h = makeThrowingHandler(new Error('always'));
      const retry: RetryPolicy = { max_attempts: 3, backoff: 'exponential', delay_ms: 50 };
      const promise = handler.execute('t1', h, makeEvent(), retry);
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.success).toBe(false);
      expect(dlq.add).toHaveBeenCalledTimes(1);
    });
  });

  // ── Dead-letter routing ────────────────────────────────────────────────────

  describe('dead-letter routing', () => {
    it('dead-letter entry contains correct event, trigger_id, attempts', async () => {
      const event = makeEvent({ id: 'dlq-evt', type: 'agent:work' });
      const h = makeThrowingHandler(new Error('final error'));
      const retry: RetryPolicy = { max_attempts: 2, backoff: 'fixed', delay_ms: 10 };
      const promise = handler.execute('my-trigger', h, event, retry);
      await vi.runAllTimersAsync();
      await promise;

      expect(dlq.add).toHaveBeenCalledWith(
        expect.objectContaining({
          event,
          trigger_id: 'my-trigger',
          attempt_count: 2,
        }),
      );
    });

    it('dead-letter entry error string matches the error message', async () => {
      const event = makeEvent();
      const h = makeThrowingHandler(new Error('specific failure message'));
      const promise = handler.execute('t1', h, event);
      await vi.runAllTimersAsync();
      await promise;

      const entry = dlq.entries[0]!;
      expect(entry.error).toBe('specific failure message');
    });

    it('dead-letter entry has a dead_lettered_at timestamp', async () => {
      const before = Date.now();
      const h = makeThrowingHandler(new Error('x'));
      const promise = handler.execute('t1', h, makeEvent());
      await vi.runAllTimersAsync();
      await promise;
      const entry = dlq.entries[0]!;
      expect(entry.dead_lettered_at).toBeGreaterThanOrEqual(before);
    });
  });

  // ── Error event emission ───────────────────────────────────────────────────

  describe('error event emission', () => {
    it('error event has type core:handler_error', async () => {
      const h = makeThrowingHandler(new Error('fail'));
      const promise = handler.execute('t1', h, makeEvent());
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.error_events[0]!.type).toBe('core:handler_error');
    });

    it('error event payload contains trigger_id and original event details', async () => {
      const event = makeEvent({ id: 'orig-evt', type: 'some:type' });
      const h = makeThrowingHandler(new Error('test error'));
      const promise = handler.execute('my-trigger', h, event);
      await vi.runAllTimersAsync();
      const result = await promise;
      const payload = result.error_events[0]!.payload as Record<string, unknown>;
      expect(payload['trigger_id']).toBe('my-trigger');
      expect(payload['original_event_id']).toBe('orig-evt');
      expect(payload['original_event_type']).toBe('some:type');
    });

    it('error event has source: internal', async () => {
      const h = makeThrowingHandler(new Error('x'));
      const promise = handler.execute('t1', h, makeEvent());
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.error_events[0]!.source).toBe('internal');
    });

    it('error event has low priority (-1)', async () => {
      const h = makeThrowingHandler(new Error('x'));
      const promise = handler.execute('t1', h, makeEvent());
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.error_events[0]!.priority).toBe(-1);
    });

    it('error event context inherits workflow_id from original event', async () => {
      const event = makeEvent({ context: { workflow_id: 'wf-123', chain_depth: 2 } });
      const h = makeThrowingHandler(new Error('x'));
      const promise = handler.execute('t1', h, event);
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.error_events[0]!.context?.workflow_id).toBe('wf-123');
    });

    it('error event chain_depth is parent depth + 1', async () => {
      const event = makeEvent({ context: { chain_depth: 3 } });
      const h = makeThrowingHandler(new Error('x'));
      const promise = handler.execute('t1', h, event);
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.error_events[0]!.context?.chain_depth).toBe(4);
    });

    it('no error events produced on success', async () => {
      const h = makeHandler({});
      const promise = handler.execute('t1', h, makeEvent());
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.error_events).toHaveLength(0);
    });
  });

  // ── buildFailureActions ────────────────────────────────────────────────────

  describe('buildFailureActions', () => {
    it('returns a cancel_event action', () => {
      const actions = handler.buildFailureActions('my-trigger');
      expect(actions).toHaveLength(1);
      expect(actions[0]!.type).toBe('cancel_event');
    });

    it('cancel_event params contain trigger_id and reason', () => {
      const actions = handler.buildFailureActions('trigger-abc');
      expect(actions[0]!.params['trigger_id']).toBe('trigger-abc');
      expect(actions[0]!.params['reason']).toBe('handler_exhausted');
    });
  });

  // ── Non-Error thrown values ────────────────────────────────────────────────

  describe('non-Error thrown values', () => {
    it('handles string throws gracefully', async () => {
      const h = vi.fn().mockRejectedValue('string error');
      const promise = handler.execute('t1', h, makeEvent());
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('string error');
    });

    it('handles object throws gracefully', async () => {
      const h = vi.fn().mockRejectedValue({ code: 42 });
      const promise = handler.execute('t1', h, makeEvent());
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.success).toBe(false);
    });
  });
});
