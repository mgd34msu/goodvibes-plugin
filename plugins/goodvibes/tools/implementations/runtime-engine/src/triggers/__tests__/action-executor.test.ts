/**
 * ActionExecutor Tests
 *
 * Tests for each action type: emit_event, spawn_agent, invoke_handler,
 * start_workflow, send_workflow_event, parallel, sequence composites.
 * Also covers template resolution and missing-dependency guards.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionExecutor } from '../action-executor.js';
import type {
  EmitEventAction,
  SpawnAgentAction,
  InvokeHandlerAction,
  WorkflowAction,
  CompositeAction,
} from '../types.js';
import type { RuntimeEvent } from '../../events/types.js';
import type { EventBus } from '../../events/event-bus.js';
import { DirectiveQueue } from '../../directives/directive-queue.js';
import type { WorkflowEngine } from '../../workflow/workflow-engine.js';
import type { TriggersConfig } from '../../shared/config.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(type: string, data?: Record<string, unknown>): RuntimeEvent {
  return {
    id: 'evt_test_123',
    timestamp: '2024-01-01T00:00:00.000Z',
    type: type as RuntimeEvent['type'],
    source: { kind: 'system' },
    payload: {
      type: type as RuntimeEvent['type'],
      data: data ?? {},
    } as RuntimeEvent['payload'],
    metadata: {
      session_id: 'sess_abc',
      correlation_id: 'corr_xyz',
      causation_id: undefined,
      sequence: 1,
      version: 1,
    },
  };
}

function makeEmitAction(overrides: Partial<EmitEventAction> = {}): EmitEventAction {
  return {
    type: 'emit_event',
    event_type: 'system:error' as RuntimeEvent['type'],
    payload_template: { message: 'test error' },
    ...overrides,
  };
}

function makeSpawnAction(overrides: Partial<SpawnAgentAction> = {}): SpawnAgentAction {
  return {
    type: 'spawn_agent',
    agent_type: 'engineer',
    task_template: 'Fix the issue in $event.id',
    budget: { max_tokens: 50000, max_turns: 20 },
    ...overrides,
  };
}

function makeInvokeAction(overrides: Partial<InvokeHandlerAction> = {}): InvokeHandlerAction {
  return {
    type: 'invoke_handler',
    handler: 'myHandler',
    args_template: { key: 'value', eventId: '$event.id' },
    ...overrides,
  };
}

function makeStartWorkflowAction(overrides: Partial<WorkflowAction> = {}): WorkflowAction {
  return {
    type: 'start_workflow',
    workflow_definition: 'my_workflow',
    context_template: { task: '$event.id' },
    ...overrides,
  };
}

function makeSendWorkflowEventAction(overrides: Partial<WorkflowAction> = {}): WorkflowAction {
  return {
    type: 'send_workflow_event',
    ...overrides,
  };
}

function makeExecutor(
  eventBus: EventBus | null = null,
  directiveQueue: DirectiveQueue | null = null,
  workflowEngine: WorkflowEngine | null = null,
  config: TriggersConfig | null = null,
) {
  return new ActionExecutor(eventBus, directiveQueue, workflowEngine, config);
}

function makeTriggersConfig(overrides: Partial<TriggersConfig> = {}): TriggersConfig {
  return {
    max_triggers: 100,
    default_cooldown_ms: 5000,
    max_fires_per_session: 50,
    handler_timeout_ms: 30_000,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ActionExecutor', () => {
  let executor: ActionExecutor;
  let event: RuntimeEvent;

  beforeEach(() => {
    executor = makeExecutor();
    event = makeEvent('session:started', { status: 'ok' });
  });

  // ── emit_event ────────────────────────────────────────────────────────────

  describe('emit_event', () => {
    it('returns error when EventBus is not provided', async () => {
      const result = await executor.execute(makeEmitAction(), event);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/EventBus not provided/);
    });

    it('calls EventBus.emit with correct event type', async () => {
      const emitFn = vi.fn();
      const bus = { emit: emitFn } as unknown as EventBus;
      const ex = makeExecutor(bus);
      const result = await ex.execute(makeEmitAction(), event);
      expect(result.success).toBe(true);
      expect(emitFn).toHaveBeenCalledOnce();
      const emitted = emitFn.mock.calls[0][0] as { type: string };
      expect(emitted.type).toBe('system:error');
    });

    it('propagates causation_id and correlation_id from triggering event', async () => {
      const emitFn = vi.fn();
      const ex = makeExecutor({ emit: emitFn } as unknown as EventBus);
      await ex.execute(makeEmitAction(), event);
      const emitted = emitFn.mock.calls[0][0] as { metadata: { causation_id: string; correlation_id: string } };
      expect(emitted.metadata.causation_id).toBe(event.id);
      expect(emitted.metadata.correlation_id).toBe('corr_xyz');
    });

    it('resolves $event template values in payload', async () => {
      const emitFn = vi.fn();
      const ex = makeExecutor({ emit: emitFn } as unknown as EventBus);
      const action = makeEmitAction({
        payload_template: { triggerId: '$event.id', eventType: '$event.type' },
      });
      await ex.execute(action, event);
      const emitted = emitFn.mock.calls[0][0] as { payload: { data: Record<string, string> } };
      expect(emitted.payload.data.triggerId).toBe(event.id);
      expect(emitted.payload.data.eventType).toBe('session:started');
    });

    it('resolves nested $event.payload.data references', async () => {
      const emitFn = vi.fn();
      const ex = makeExecutor({ emit: emitFn } as unknown as EventBus);
      const action = makeEmitAction({
        payload_template: { status: '$event.payload.data.status' },
      });
      await ex.execute(action, event);
      const emitted = emitFn.mock.calls[0][0] as { payload: { data: Record<string, string> } };
      expect(emitted.payload.data.status).toBe('ok');
    });
  });

  // ── spawn_agent ───────────────────────────────────────────────────────────

  describe('spawn_agent', () => {
    it('returns success and logs when DirectiveQueue is not set', async () => {
      const result = await executor.execute(makeSpawnAction(), event);
      expect(result.success).toBe(true);
    });

    it('enqueues a directive when DirectiveQueue is set', async () => {
      const enqueueFn = vi.fn();
      const queue = { enqueue: enqueueFn } as unknown as DirectiveQueue;
      const ex = makeExecutor(null, queue);
      const result = await ex.execute(makeSpawnAction(), event);
      expect(result.success).toBe(true);
      expect(enqueueFn).toHaveBeenCalledOnce();
      const [hookName, directive] = enqueueFn.mock.calls[0] as [string, { type: string }];
      expect(hookName).toBe('subagent_stop');
      expect(directive.type).toBe('inject_system_message');
    });

    it('resolves $event template in task_template', async () => {
      const enqueueFn = vi.fn();
      const ex = makeExecutor(null, { enqueue: enqueueFn } as unknown as DirectiveQueue);
      const action = makeSpawnAction({ task_template: 'Handle event $event.id' });
      await ex.execute(action, event);
      const [, directive] = enqueueFn.mock.calls[0] as [string, { content: string }];
      expect(directive.content).toContain(event.id);
    });

    it('uses correct agent_type when building the directive', async () => {
      const enqueueFn = vi.fn();
      const ex = makeExecutor(null, { enqueue: enqueueFn } as unknown as DirectiveQueue);
      await ex.execute(makeSpawnAction({ agent_type: 'reviewer' }), event);
      const [, directive] = enqueueFn.mock.calls[0] as [string, { content: string }];
      expect(directive.content).toContain('reviewer');
    });
  });

  // ── invoke_handler ────────────────────────────────────────────────────────

  describe('invoke_handler', () => {
    it('returns error when handler is not registered', async () => {
      const result = await executor.execute(makeInvokeAction({ handler: 'missing' }), event);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Handler 'missing' not registered/);
    });

    it('calls the registered handler with resolved args and event', async () => {
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      executor.registerHandler('myHandler', handlerFn);
      const result = await executor.execute(makeInvokeAction(), event);
      expect(result.success).toBe(true);
      expect(handlerFn).toHaveBeenCalledOnce();
      const [args, calledEvent] = handlerFn.mock.calls[0] as [Record<string, string>, RuntimeEvent];
      expect(args.key).toBe('value');
      expect(args.eventId).toBe(event.id); // $event.id resolved
      expect(calledEvent).toBe(event);
    });

    it('resolves $event.type reference in args_template', async () => {
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      executor.registerHandler('typeHandler', handlerFn);
      const action = makeInvokeAction({
        handler: 'typeHandler',
        args_template: { evtType: '$event.type' },
      });
      await executor.execute(action, event);
      const [args] = handlerFn.mock.calls[0] as [Record<string, string>];
      expect(args.evtType).toBe('session:started');
    });

    it('wraps handler errors as failure result', async () => {
      executor.registerHandler('throwing', vi.fn().mockRejectedValue(new Error('handler boom')));
      const result = await executor.execute(
        makeInvokeAction({ handler: 'throwing' }),
        event,
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/handler boom/);
    });

    it('times out handlers that exceed handler_timeout_ms', async () => {
      const config = makeTriggersConfig({ handler_timeout_ms: 50 });
      const ex = makeExecutor(null, null, null, config);
      // Handler that never resolves
      ex.registerHandler('hung', () => new Promise<void>(() => { /* never resolves */ }));
      const result = await ex.execute(makeInvokeAction({ handler: 'hung' }), event);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/timed out after 50ms/);
    });

    it('successful handler clears timeout without leaking timers', async () => {
      const config = makeTriggersConfig({ handler_timeout_ms: 500 });
      const ex = makeExecutor(null, null, null, config);
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      ex.registerHandler('fast', handlerFn);
      const result = await ex.execute(makeInvokeAction({ handler: 'fast' }), event);
      expect(result.success).toBe(true);
      expect(handlerFn).toHaveBeenCalledOnce();
    });

    it('resolves array values in args_template', async () => {
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      executor.registerHandler('arrayHandler', handlerFn);
      const action = makeInvokeAction({
        handler: 'arrayHandler',
        args_template: { items: ['$event.id', 'static'] },
      });
      await executor.execute(action, event);
      const [args] = handlerFn.mock.calls[0] as [Record<string, string[]>];
      expect(args.items[0]).toBe(event.id);
      expect(args.items[1]).toBe('static');
    });

    it('resolves nested object values in args_template', async () => {
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      executor.registerHandler('nestedHandler', handlerFn);
      const action = makeInvokeAction({
        handler: 'nestedHandler',
        args_template: { meta: { id: '$event.id' } },
      });
      await executor.execute(action, event);
      const [args] = handlerFn.mock.calls[0] as [Record<string, Record<string, string>>];
      expect(args.meta.id).toBe(event.id);
    });
  });

  // ── start_workflow ────────────────────────────────────────────────────────

  describe('start_workflow', () => {
    it('returns success (logs only) when WorkflowEngine is not set', async () => {
      const result = await executor.execute(makeStartWorkflowAction(), event);
      expect(result.success).toBe(true);
    });

    it('calls workflowEngine.create when engine is set', async () => {
      const createFn = vi.fn().mockReturnValue({ id: 'wf_123' });
      const mockEngine = { create: createFn, listActive: vi.fn().mockReturnValue([]) } as unknown as WorkflowEngine;
      const ex = makeExecutor(null, null, mockEngine);
      const result = await ex.execute(makeStartWorkflowAction(), event);
      expect(result.success).toBe(true);
      expect(createFn).toHaveBeenCalledOnce();
      expect(createFn).toHaveBeenCalledWith('my_workflow', expect.any(Object));
    });

    it('returns error when workflow_definition is missing', async () => {
      const mockEngine = { create: vi.fn(), listActive: vi.fn().mockReturnValue([]) } as unknown as WorkflowEngine;
      const ex = makeExecutor(null, null, mockEngine);
      const result = await ex.execute(
        makeStartWorkflowAction({ workflow_definition: undefined }),
        event,
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/workflow_definition is required/);
    });

    it('returns error when engine.create throws', async () => {
      const mockEngine = {
        create: vi.fn().mockImplementation(() => { throw new Error('def not found'); }),
        listActive: vi.fn().mockReturnValue([]),
      } as unknown as WorkflowEngine;
      const ex = makeExecutor(null, null, mockEngine);
      const result = await ex.execute(makeStartWorkflowAction(), event);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/def not found/);
    });

    it('resolves context_template values from event', async () => {
      const createFn = vi.fn().mockReturnValue({ id: 'wf_123' });
      const mockEngine = { create: createFn, listActive: vi.fn().mockReturnValue([]) } as unknown as WorkflowEngine;
      const ex = makeExecutor(null, null, mockEngine);
      await ex.execute(makeStartWorkflowAction({ context_template: { eventId: '$event.id' } }), event);
      const [, ctx] = createFn.mock.calls[0] as [string, Record<string, string>];
      expect(ctx.eventId).toBe(event.id);
    });

    it('seeds WRFC config into context when directiveQueue has config set', async () => {
      const createFn = vi.fn().mockReturnValue({ id: 'wf_123' });
      const mockEngine = { create: createFn, listActive: vi.fn().mockReturnValue([]) } as unknown as WorkflowEngine;
      const queue = new DirectiveQueue();
      queue.setWRFCConfig({ min_review_score: 8.5, max_fix_attempts: 4 });
      const ex = makeExecutor(null, queue, mockEngine);
      await ex.execute(makeStartWorkflowAction(), event);
      const [, ctx] = createFn.mock.calls[0] as [string, Record<string, unknown>];
      expect(ctx['min_review_score']).toBe(8.5);
      expect(ctx['max_fix_attempts']).toBe(4);
    });

    it('allows resolvedContext to override WRFC defaults', async () => {
      const createFn = vi.fn().mockReturnValue({ id: 'wf_123' });
      const mockEngine = { create: createFn, listActive: vi.fn().mockReturnValue([]) } as unknown as WorkflowEngine;
      const queue = new DirectiveQueue();
      queue.setWRFCConfig({ min_review_score: 8.5, max_fix_attempts: 4 });
      const ex = makeExecutor(null, queue, mockEngine);
      // context_template overrides the WRFC default for min_review_score
      await ex.execute(makeStartWorkflowAction({ context_template: { min_review_score: 9.5 } }), event);
      const [, ctx] = createFn.mock.calls[0] as [string, Record<string, unknown>];
      expect(ctx['min_review_score']).toBe(9.5);
      expect(ctx['max_fix_attempts']).toBe(4);
    });

    it('works without WRFC config when directiveQueue is null', async () => {
      const createFn = vi.fn().mockReturnValue({ id: 'wf_123' });
      const mockEngine = { create: createFn, listActive: vi.fn().mockReturnValue([]) } as unknown as WorkflowEngine;
      const ex = makeExecutor(null, null, mockEngine);
      const result = await ex.execute(makeStartWorkflowAction(), event);
      expect(result.success).toBe(true);
      const [, ctx] = createFn.mock.calls[0] as [string, Record<string, unknown>];
      expect(ctx['min_review_score']).toBeUndefined();
      expect(ctx['max_fix_attempts']).toBeUndefined();
    });

    it('does not seed WRFC config when directiveQueue has no config set', async () => {
      const createFn = vi.fn().mockReturnValue({ id: 'wf_123' });
      const mockEngine = { create: createFn, listActive: vi.fn().mockReturnValue([]) } as unknown as WorkflowEngine;
      const queue = new DirectiveQueue();
      // queue has default empty config
      const ex = makeExecutor(null, queue, mockEngine);
      await ex.execute(makeStartWorkflowAction(), event);
      const [, ctx] = createFn.mock.calls[0] as [string, Record<string, unknown>];
      expect(ctx['min_review_score']).toBeUndefined();
      expect(ctx['max_fix_attempts']).toBeUndefined();
    });
  });

  // ── send_workflow_event ───────────────────────────────────────────────────

  describe('send_workflow_event', () => {
    it('returns success (logs only) when WorkflowEngine is not set', async () => {
      const result = await executor.execute(makeSendWorkflowEventAction(), event);
      expect(result.success).toBe(true);
    });

    it('sends event to all active workflows when engine is set', async () => {
      const sendEventFn = vi.fn();
      const activeInstances = [{ id: 'wf_1' }, { id: 'wf_2' }];
      const mockEngine = {
        listActive: vi.fn().mockReturnValue(activeInstances),
        sendEvent: sendEventFn,
      } as unknown as WorkflowEngine;
      const ex = makeExecutor(null, null, mockEngine);
      const result = await ex.execute(makeSendWorkflowEventAction(), event);
      expect(result.success).toBe(true);
      expect(sendEventFn).toHaveBeenCalledTimes(2);
    });

    it('continues sending even when one workflow throws', async () => {
      const sendEventFn = vi
        .fn()
        .mockImplementationOnce(() => { throw new Error('workflow gone'); })
        .mockReturnValue(null);
      const mockEngine = {
        listActive: vi.fn().mockReturnValue([{ id: 'wf_1' }, { id: 'wf_2' }]),
        sendEvent: sendEventFn,
      } as unknown as WorkflowEngine;
      const ex = makeExecutor(null, null, mockEngine);
      const result = await ex.execute(makeSendWorkflowEventAction(), event);
      expect(result.success).toBe(true);
      expect(sendEventFn).toHaveBeenCalledTimes(2);
    });
  });

  // ── parallel composite ────────────────────────────────────────────────────

  describe('parallel composite action', () => {
    it('executes all actions in parallel and returns success', async () => {
      const h1 = vi.fn().mockResolvedValue(undefined);
      const h2 = vi.fn().mockResolvedValue(undefined);
      executor.registerHandler('h1', h1);
      executor.registerHandler('h2', h2);
      const action: CompositeAction = {
        type: 'parallel',
        actions: [
          { type: 'invoke_handler', handler: 'h1', args_template: {} },
          { type: 'invoke_handler', handler: 'h2', args_template: {} },
        ],
      };
      const result = await executor.execute(action, event);
      expect(result.success).toBe(true);
      expect(h1).toHaveBeenCalledOnce();
      expect(h2).toHaveBeenCalledOnce();
    });

    it('returns failure when any parallel action fails', async () => {
      executor.registerHandler('ok', vi.fn().mockResolvedValue(undefined));
      const action: CompositeAction = {
        type: 'parallel',
        actions: [
          { type: 'invoke_handler', handler: 'ok', args_template: {} },
          { type: 'invoke_handler', handler: 'missing_handler', args_template: {} },
        ],
      };
      const result = await executor.execute(action, event);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/of .* parallel actions failed/);
    });

    it('reports count of failures in error message', async () => {
      const action: CompositeAction = {
        type: 'parallel',
        actions: [
          { type: 'invoke_handler', handler: 'missing1', args_template: {} },
          { type: 'invoke_handler', handler: 'missing2', args_template: {} },
        ],
      };
      const result = await executor.execute(action, event);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/2 of 2 parallel actions failed/);
    });
  });

  // ── sequence composite ────────────────────────────────────────────────────

  describe('sequence composite action', () => {
    it('executes all actions in sequence and returns success', async () => {
      const order: string[] = [];
      executor.registerHandler('first', vi.fn().mockImplementation(async () => { order.push('first'); }));
      executor.registerHandler('second', vi.fn().mockImplementation(async () => { order.push('second'); }));
      const action: CompositeAction = {
        type: 'sequence',
        actions: [
          { type: 'invoke_handler', handler: 'first', args_template: {} },
          { type: 'invoke_handler', handler: 'second', args_template: {} },
        ],
      };
      const result = await executor.execute(action, event);
      expect(result.success).toBe(true);
      expect(order).toEqual(['first', 'second']);
    });

    it('stops at first failure and returns error', async () => {
      const secondFn = vi.fn().mockResolvedValue(undefined);
      executor.registerHandler('second', secondFn);
      const action: CompositeAction = {
        type: 'sequence',
        actions: [
          { type: 'invoke_handler', handler: 'missing_in_sequence', args_template: {} },
          { type: 'invoke_handler', handler: 'second', args_template: {} },
        ],
      };
      const result = await executor.execute(action, event);
      expect(result.success).toBe(false);
      expect(secondFn).not.toHaveBeenCalled();
    });

    it('returns success for empty sequence', async () => {
      const action: CompositeAction = { type: 'sequence', actions: [] };
      const result = await executor.execute(action, event);
      expect(result.success).toBe(true);
    });
  });

  // ── template resolution edge cases ────────────────────────────────────────

  describe('template resolution', () => {
    it('returns empty string for unresolvable $event path', async () => {
      const emitFn = vi.fn();
      const ex = makeExecutor({ emit: emitFn } as unknown as EventBus);
      const action = makeEmitAction({
        payload_template: { val: '$event.nonexistent.deep.path' },
      });
      await ex.execute(action, event);
      const emitted = emitFn.mock.calls[0][0] as { payload: { data: Record<string, string> } };
      expect(emitted.payload.data.val).toBe('');
    });

    it('passes through non-string template values unchanged', async () => {
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      executor.registerHandler('numHandler', handlerFn);
      const action = makeInvokeAction({
        handler: 'numHandler',
        args_template: { count: 42, enabled: true, nothing: null },
      });
      await executor.execute(action, event);
      const [args] = handlerFn.mock.calls[0] as [Record<string, unknown>];
      expect(args.count).toBe(42);
      expect(args.enabled).toBe(true);
      expect(args.nothing).toBeNull();
    });
  });

  // ── prototype chain traversal protection ────────────────────────────────

  describe('prototype chain traversal protection', () => {
    it('blocks __proto__ traversal in template resolution', async () => {
      const emitFn = vi.fn();
      const ex = makeExecutor({ emit: emitFn } as unknown as EventBus);
      const action = makeEmitAction({
        payload_template: { val: '$event.__proto__.polluted' },
      });
      await ex.execute(action, event);
      const emitted = emitFn.mock.calls[0][0] as { payload: { data: Record<string, string> } };
      expect(emitted.payload.data.val).toBe('');
      expect(emitFn).toHaveBeenCalledOnce();
    });

    it('blocks constructor traversal in template resolution', async () => {
      const emitFn = vi.fn();
      const ex = makeExecutor({ emit: emitFn } as unknown as EventBus);
      const action = makeEmitAction({
        payload_template: { val: '$event.constructor.name' },
      });
      await ex.execute(action, event);
      const emitted = emitFn.mock.calls[0][0] as { payload: { data: Record<string, string> } };
      expect(emitted.payload.data.val).toBe('');
      expect(emitFn).toHaveBeenCalledOnce();
    });

    it('blocks prototype traversal in template resolution', async () => {
      const emitFn = vi.fn();
      const ex = makeExecutor({ emit: emitFn } as unknown as EventBus);
      const action = makeEmitAction({
        payload_template: { val: '$event.prototype.method' },
      });
      await ex.execute(action, event);
      const emitted = emitFn.mock.calls[0][0] as { payload: { data: Record<string, string> } };
      expect(emitted.payload.data.val).toBe('');
      expect(emitFn).toHaveBeenCalledOnce();
    });

    it('blocks denied segments in nested paths', async () => {
      const emitFn = vi.fn();
      const ex = makeExecutor({ emit: emitFn } as unknown as EventBus);
      const action = makeEmitAction({
        payload_template: { val: '$event.payload.__proto__.polluted' },
      });
      await ex.execute(action, event);
      const emitted = emitFn.mock.calls[0][0] as { payload: { data: Record<string, string> } };
      expect(emitted.payload.data.val).toBe('');
      // Event is still emitted despite the blocked traversal
      expect(emitFn).toHaveBeenCalledOnce();
    });
  });

  // ── constructor injection ─────────────────────────────────────────────────

  describe('dependency injection via constructor', () => {
    it('uses the eventBus passed to the constructor', async () => {
      const emitFn = vi.fn();
      const ex = makeExecutor({ emit: emitFn } as unknown as EventBus);
      await ex.execute(makeEmitAction(), event);
      expect(emitFn).toHaveBeenCalledOnce();
    });

    it('uses the workflowEngine passed to the constructor', async () => {
      const createFn = vi.fn().mockReturnValue({ id: 'wf_1' });
      const ex = makeExecutor(
        null,
        null,
        { create: createFn, listActive: vi.fn().mockReturnValue([]) } as unknown as WorkflowEngine,
      );
      await ex.execute(makeStartWorkflowAction(), event);
      expect(createFn).toHaveBeenCalledOnce();
    });

    it('defaults all deps to null when no args passed', async () => {
      const ex = new ActionExecutor();
      const emitResult = await ex.execute(makeEmitAction(), event);
      expect(emitResult.success).toBe(false);
      expect(emitResult.error).toMatch(/EventBus not provided/);
    });
  });
});
