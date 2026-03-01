import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TriggerActionExecutor } from '../trigger-action-executor.js';
import type { RuntimeEvent } from '../../events/types.js';
import type { TriggerAction, TriggerActionHandler } from '../types.js';
import type { TriggersConfig } from '../../../shared/config.js';

// Mock logger
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock utils
vi.mock('../../../shared/utils.js', () => ({
  generateEventId: () => 'generated-id',
  timestamp: () => 1000000,
  toErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

// Mock legacy-directive-builder
vi.mock('../../directives/legacy-directive-builder.js', () => ({
  buildSpawnDirectiveMessage: (agentType: string, task: string) => `spawn:${agentType}:${task}`,
}));

const DEFAULT_CONFIG: TriggersConfig = {
  max_triggers: 100,
  default_cooldown_ms: 0,
  max_fires_per_session: 50,
  handler_timeout_ms: 30_000,
};

function makeEvent(type: string, data: Record<string, unknown> = {}, id = 'evt-1'): RuntimeEvent {
  return {
    id,
    type: type as RuntimeEvent['type'],
    timestamp: new Date().toISOString(),
    source: { kind: 'system' } as RuntimeEvent['source'],
    payload: {
      type: type as RuntimeEvent['payload']['type'],
      data,
    } as RuntimeEvent['payload'],
    metadata: {
      sequence: 1,
      version: 1,
      session_id: 'sess-1',
      correlation_id: 'corr-1',
    },
  };
}

function makeEventBus() {
  return { emit: vi.fn() };
}

function makeDirectiveQueue() {
  return { enqueue: vi.fn(), drain: vi.fn(() => []), size: vi.fn(() => 0) };
}

function makeWorkflowEngine(instanceId = 'wf-1') {
  return {
    create: vi.fn(() => ({ id: instanceId })),
    listActive: vi.fn(() => [{ id: instanceId }]),
    sendEvent: vi.fn(),
  };
}

function makeWRFCConfigStore(min_review_score = 8, max_fix_attempts = 3) {
  return {
    get: vi.fn(() => ({ min_review_score, max_fix_attempts })),
  };
}

describe('TriggerActionExecutor', () => {
  // ─── emit_event ──────────────────────────────────────────────────────────────

  describe('emit_event action', () => {
    it('returns success: false when eventBus is not provided', async () => {
      const executor = new TriggerActionExecutor(null);
      const action: TriggerAction = {
        type: 'emit_event',
        event_type: 'agent:budget_warning' as TriggerAction['type'] extends 'emit_event' ? never : never & 'agent:budget_warning',
        payload_template: { key: 'value' },
      } as TriggerAction;
      const result = await executor.execute(action, makeEvent('test:event'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('EventBus not provided');
    });

    it('emits event via eventBus with resolved payload template', async () => {
      const bus = makeEventBus();
      const executor = new TriggerActionExecutor(bus as any);
      const action: TriggerAction = {
        type: 'emit_event',
        event_type: 'agent:budget_warning' as TriggerAction extends { type: 'emit_event' } ? never : never,
        payload_template: {
          source_id: '$event.id',
          event_type: '$event.type',
          static_key: 'static_value',
        },
      } as TriggerAction;
      const event = makeEvent('test:event', {}, 'my-event-id');
      const result = await executor.execute(action, event);
      expect(result.success).toBe(true);
      expect(bus.emit).toHaveBeenCalledOnce();
      const emitted = bus.emit.mock.calls[0][0];
      expect(emitted.payload.data.source_id).toBe('my-event-id');
      expect(emitted.payload.data.event_type).toBe('test:event');
      expect(emitted.payload.data.static_key).toBe('static_value');
    });

    it('resolves nested payload data references', async () => {
      const bus = makeEventBus();
      const executor = new TriggerActionExecutor(bus as any);
      const action: TriggerAction = {
        type: 'emit_event',
        event_type: 'agent:budget_warning' as never,
        payload_template: {
          agent_id: '$event.payload.data.agent_id',
        },
      } as TriggerAction;
      const event = makeEvent('agent:progress', { agent_id: 'agent-42' });
      const result = await executor.execute(action, event);
      expect(result.success).toBe(true);
      const emitted = bus.emit.mock.calls[0][0];
      expect(emitted.payload.data.agent_id).toBe('agent-42');
    });

    it('sets empty string for missing $event.* references', async () => {
      const bus = makeEventBus();
      const executor = new TriggerActionExecutor(bus as any);
      const action: TriggerAction = {
        type: 'emit_event',
        event_type: 'test:event' as never,
        payload_template: { missing_field: '$event.payload.data.nonexistent' },
      } as TriggerAction;
      const event = makeEvent('test:event', {});
      const result = await executor.execute(action, event);
      expect(result.success).toBe(true);
      const emitted = bus.emit.mock.calls[0][0];
      expect(emitted.payload.data.missing_field).toBe('');
    });

    it('sets empty string when $event.* reference resolves to null', async () => {
      const bus = makeEventBus();
      const executor = new TriggerActionExecutor(bus as any);
      const action: TriggerAction = {
        type: 'emit_event',
        event_type: 'test:event' as never,
        payload_template: { null_field: '$event.payload.data.null_val' },
      } as TriggerAction;
      const event = makeEvent('test:event', { null_val: null as unknown as string });
      const result = await executor.execute(action, event);
      expect(result.success).toBe(true);
      const emitted = bus.emit.mock.calls[0][0];
      expect(emitted.payload.data.null_field).toBe('');
    });

    it('sets empty string when $event.* reference resolves to an object', async () => {
      const bus = makeEventBus();
      const executor = new TriggerActionExecutor(bus as any);
      const action: TriggerAction = {
        type: 'emit_event',
        event_type: 'test:event' as never,
        payload_template: { nested: '$event.payload.data.nested_obj' },
      } as TriggerAction;
      const event = makeEvent('test:event', { nested_obj: { inner: 'val' } as unknown as string });
      const result = await executor.execute(action, event);
      expect(result.success).toBe(true);
      const emitted = bus.emit.mock.calls[0][0];
      expect(emitted.payload.data.nested).toBe('');
    });
  });

  // ─── prototype pollution protection ───────────────────────────────────────────

  describe('prototype pollution protection', () => {
    it('returns empty string for __proto__ path segment', async () => {
      const bus = makeEventBus();
      const executor = new TriggerActionExecutor(bus as any);
      const action: TriggerAction = {
        type: 'emit_event',
        event_type: 'test:event' as never,
        payload_template: { bad: '$event.__proto__.polluted' },
      } as TriggerAction;
      const event = makeEvent('test:event');
      const result = await executor.execute(action, event);
      expect(result.success).toBe(true);
      const emitted = bus.emit.mock.calls[0][0];
      expect(emitted.payload.data.bad).toBe('');
    });

    it('returns empty string for constructor path segment', async () => {
      const bus = makeEventBus();
      const executor = new TriggerActionExecutor(bus as any);
      const action: TriggerAction = {
        type: 'emit_event',
        event_type: 'test:event' as never,
        payload_template: { bad: '$event.constructor.name' },
      } as TriggerAction;
      const event = makeEvent('test:event');
      const result = await executor.execute(action, event);
      expect(result.success).toBe(true);
      const emitted = bus.emit.mock.calls[0][0];
      expect(emitted.payload.data.bad).toBe('');
    });

    it('returns empty string for prototype path segment', async () => {
      const bus = makeEventBus();
      const executor = new TriggerActionExecutor(bus as any);
      const action: TriggerAction = {
        type: 'emit_event',
        event_type: 'test:event' as never,
        payload_template: { bad: '$event.prototype.anything' },
      } as TriggerAction;
      const event = makeEvent('test:event');
      const result = await executor.execute(action, event);
      expect(result.success).toBe(true);
      const emitted = bus.emit.mock.calls[0][0];
      expect(emitted.payload.data.bad).toBe('');
    });
  });

  // ─── spawn_agent ────────────────────────────────────────────────────────────

  describe('spawn_agent action', () => {
    const spawnAction: TriggerAction = {
      type: 'spawn_agent',
      agent_type: 'engineer',
      task_template: 'Fix issue $event.id',
      budget: { max_tokens: 10000, max_turns: 5 },
    };

    it('succeeds with success:true even when directiveQueue is null (logs intent only)', async () => {
      const executor = new TriggerActionExecutor(null, null);
      const event = makeEvent('test:event', {}, 'evt-123');
      const result = await executor.execute(spawnAction, event);
      expect(result.success).toBe(true);
    });

    it('enqueues directive when directiveQueue is provided', async () => {
      const queue = makeDirectiveQueue();
      const executor = new TriggerActionExecutor(null, queue as any);
      const event = makeEvent('test:event', {}, 'evt-123');
      const result = await executor.execute(spawnAction, event);
      expect(result.success).toBe(true);
      expect(queue.enqueue).toHaveBeenCalledOnce();
      const [target, directive] = queue.enqueue.mock.calls[0];
      expect(target).toBe('subagent_stop');
      expect(directive.type).toBe('inject_system_message');
      expect(directive.content).toContain('engineer');
    });

    it('resolves $event.id in task template', async () => {
      const queue = makeDirectiveQueue();
      const executor = new TriggerActionExecutor(null, queue as any);
      const event = makeEvent('test:event', {}, 'my-event-id');
      await executor.execute(spawnAction, event);
      const [, directive] = queue.enqueue.mock.calls[0];
      expect(directive.content).toContain('my-event-id');
    });
  });

  // ─── invoke_handler ─────────────────────────────────────────────────────────

  describe('invoke_handler action', () => {
    it('returns success: false when handler is not registered', async () => {
      const executor = new TriggerActionExecutor();
      const action: TriggerAction = {
        type: 'invoke_handler',
        handler: 'nonexistentHandler',
        args_template: {},
      };
      const result = await executor.execute(action, makeEvent('test:event'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('nonexistentHandler');
    });

    it('invokes registered handler with resolved args and event', async () => {
      const executor = new TriggerActionExecutor(null, null, null, DEFAULT_CONFIG);
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      executor.registerHandler('myHandler', handlerFn);
      const action: TriggerAction = {
        type: 'invoke_handler',
        handler: 'myHandler',
        args_template: { event_id: '$event.id', static: 'constant' },
      };
      const event = makeEvent('test:event', {}, 'evt-xyz');
      const result = await executor.execute(action, event);
      expect(result.success).toBe(true);
      expect(handlerFn).toHaveBeenCalledOnce();
      const [args, receivedEvent] = handlerFn.mock.calls[0];
      expect(args.event_id).toBe('evt-xyz');
      expect(args.static).toBe('constant');
      expect(receivedEvent).toBe(event);
    });

    it('returns success: false when handler throws', async () => {
      const executor = new TriggerActionExecutor(null, null, null, DEFAULT_CONFIG);
      executor.registerHandler('throwingHandler', async () => {
        throw new Error('handler error');
      });
      const action: TriggerAction = {
        type: 'invoke_handler',
        handler: 'throwingHandler',
        args_template: {},
      };
      const result = await executor.execute(action, makeEvent('test:event'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('handler error');
    });

    it('times out when handler does not resolve within handler_timeout_ms', async () => {
      const config: TriggersConfig = { ...DEFAULT_CONFIG, handler_timeout_ms: 10 };
      const executor = new TriggerActionExecutor(null, null, null, config);
      executor.registerHandler('slowHandler', () => new Promise<void>(() => { /* never resolves */ }));
      const action: TriggerAction = {
        type: 'invoke_handler',
        handler: 'slowHandler',
        args_template: {},
      };
      const result = await executor.execute(action, makeEvent('test:event'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    }, 5000);

    it('invokes handler directly when handler_timeout_ms is 0 (timeout disabled)', async () => {
      const config: TriggersConfig = { ...DEFAULT_CONFIG, handler_timeout_ms: 0 };
      const executor = new TriggerActionExecutor(null, null, null, config);
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      executor.registerHandler('fastHandler', handlerFn);
      const action: TriggerAction = {
        type: 'invoke_handler',
        handler: 'fastHandler',
        args_template: {},
      };
      const result = await executor.execute(action, makeEvent('test:event'));
      expect(result.success).toBe(true);
      expect(handlerFn).toHaveBeenCalledOnce();
    });

    it('uses default timeout of 30000ms when config is null', async () => {
      const executor = new TriggerActionExecutor(null, null, null, null);
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      executor.registerHandler('defaultTimeoutHandler', handlerFn);
      const action: TriggerAction = {
        type: 'invoke_handler',
        handler: 'defaultTimeoutHandler',
        args_template: {},
      };
      const result = await executor.execute(action, makeEvent('test:event'));
      expect(result.success).toBe(true);
    });
  });

  // ─── start_workflow ────────────────────────────────────────────────────────

  describe('start_workflow action', () => {
    it('succeeds with success:true when workflowEngine is null (logs only)', async () => {
      const executor = new TriggerActionExecutor();
      const action: TriggerAction = {
        type: 'start_workflow',
        workflow_definition: 'fix_loop',
        context_template: { trigger: 'test' },
      };
      const result = await executor.execute(action, makeEvent('build:failed'));
      expect(result.success).toBe(true);
    });

    it('returns success: false when workflow_definition is missing', async () => {
      const workflowEngine = makeWorkflowEngine();
      const executor = new TriggerActionExecutor(null, null, workflowEngine as any);
      const action: TriggerAction = {
        type: 'start_workflow',
        // No workflow_definition
        context_template: {},
      };
      const result = await executor.execute(action, makeEvent('build:failed'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('workflow_definition is required');
    });

    it('creates workflow when workflowEngine is provided', async () => {
      const workflowEngine = makeWorkflowEngine();
      const executor = new TriggerActionExecutor(null, null, workflowEngine as any, DEFAULT_CONFIG);
      const action: TriggerAction = {
        type: 'start_workflow',
        workflow_definition: 'fix_loop',
        context_template: { event_id: '$event.id' },
      };
      const event = makeEvent('build:failed', {}, 'evt-999');
      const result = await executor.execute(action, event);
      expect(result.success).toBe(true);
      expect(workflowEngine.create).toHaveBeenCalledOnce();
      const [definition, context] = workflowEngine.create.mock.calls[0] as unknown[];
      expect(definition).toBe('fix_loop');
      expect((context as Record<string, unknown>)['event_id']).toBe('evt-999');
    });

    it('returns success: false when workflowEngine.create throws', async () => {
      const workflowEngine = makeWorkflowEngine();
      workflowEngine.create.mockImplementation(() => { throw new Error('create failed'); });
      const executor = new TriggerActionExecutor(null, null, workflowEngine as any, DEFAULT_CONFIG);
      const action: TriggerAction = {
        type: 'start_workflow',
        workflow_definition: 'fix_loop',
        context_template: {},
      };
      const result = await executor.execute(action, makeEvent('build:failed'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('create failed');
    });

    it('seeds WRFC defaults from wrfcConfigStore when directiveQueue and wrfcConfigStore are provided', async () => {
      const workflowEngine = makeWorkflowEngine();
      const directiveQueue = makeDirectiveQueue();
      const wrfcStore = makeWRFCConfigStore(7, 4);
      const executor = new TriggerActionExecutor(
        null,
        directiveQueue as any,
        workflowEngine as any,
        DEFAULT_CONFIG,
        wrfcStore as any,
      );
      const action: TriggerAction = {
        type: 'start_workflow',
        workflow_definition: 'fix_loop',
        context_template: {},
      };
      const result = await executor.execute(action, makeEvent('build:failed'));
      expect(result.success).toBe(true);
      const [, context] = workflowEngine.create.mock.calls[0] as unknown[];
      expect((context as Record<string, unknown>)['min_review_score']).toBe(7);
      expect((context as Record<string, unknown>)['max_fix_attempts']).toBe(4);
    });

    it('does not include non-finite WRFC config values', async () => {
      const workflowEngine = makeWorkflowEngine();
      const directiveQueue = makeDirectiveQueue();
      const wrfcStore = { get: vi.fn(() => ({ min_review_score: NaN, max_fix_attempts: Infinity })) };
      const executor = new TriggerActionExecutor(
        null,
        directiveQueue as any,
        workflowEngine as any,
        DEFAULT_CONFIG,
        wrfcStore as any,
      );
      const action: TriggerAction = {
        type: 'start_workflow',
        workflow_definition: 'fix_loop',
        context_template: {},
      };
      const result = await executor.execute(action, makeEvent('build:failed'));
      expect(result.success).toBe(true);
      const [, context] = workflowEngine.create.mock.calls[0] as unknown[];
      expect((context as Record<string, unknown>)['min_review_score']).toBeUndefined();
      // Infinity is not finite
      expect((context as Record<string, unknown>)['max_fix_attempts']).toBeUndefined();
    });

    it('handles missing context_template (uses empty context)', async () => {
      const workflowEngine = makeWorkflowEngine();
      const executor = new TriggerActionExecutor(null, null, workflowEngine as any, DEFAULT_CONFIG);
      const action: TriggerAction = {
        type: 'start_workflow',
        workflow_definition: 'fix_loop',
      };
      const result = await executor.execute(action, makeEvent('build:failed'));
      expect(result.success).toBe(true);
      const [, context] = workflowEngine.create.mock.calls[0] as unknown[];
      expect(context).toEqual({});
    });
  });

  // ─── send_workflow_event ──────────────────────────────────────────────────────

  describe('send_workflow_event action', () => {
    it('succeeds with success:true when workflowEngine is null (logs only)', async () => {
      const executor = new TriggerActionExecutor();
      const action: TriggerAction = { type: 'send_workflow_event' };
      const result = await executor.execute(action, makeEvent('agent:completed'));
      expect(result.success).toBe(true);
    });

    it('sends event to all active workflows', async () => {
      const workflowEngine = {
        create: vi.fn(),
        listActive: vi.fn(() => [{ id: 'wf-1' }, { id: 'wf-2' }]),
        sendEvent: vi.fn(),
      };
      const executor = new TriggerActionExecutor(null, null, workflowEngine as any, DEFAULT_CONFIG);
      const action: TriggerAction = { type: 'send_workflow_event' };
      const event = makeEvent('agent:completed');
      const result = await executor.execute(action, event);
      expect(result.success).toBe(true);
      expect(workflowEngine.sendEvent).toHaveBeenCalledTimes(2);
      expect(workflowEngine.sendEvent).toHaveBeenCalledWith('wf-1', event);
      expect(workflowEngine.sendEvent).toHaveBeenCalledWith('wf-2', event);
    });

    it('continues sending to other workflows when one sendEvent throws', async () => {
      const workflowEngine = {
        create: vi.fn(),
        listActive: vi.fn(() => [{ id: 'wf-1' }, { id: 'wf-2' }]),
        sendEvent: vi.fn()
          .mockImplementationOnce(() => { throw new Error('send failed'); })
          .mockImplementationOnce(() => undefined),
      };
      const executor = new TriggerActionExecutor(null, null, workflowEngine as any, DEFAULT_CONFIG);
      const action: TriggerAction = { type: 'send_workflow_event' };
      const result = await executor.execute(action, makeEvent('agent:completed'));
      // Should still return success even if one workflow failed
      expect(result.success).toBe(true);
      expect(workflowEngine.sendEvent).toHaveBeenCalledTimes(2);
    });

    it('returns success when no active workflows exist', async () => {
      const workflowEngine = {
        create: vi.fn(),
        listActive: vi.fn(() => []),
        sendEvent: vi.fn(),
      };
      const executor = new TriggerActionExecutor(null, null, workflowEngine as any, DEFAULT_CONFIG);
      const action: TriggerAction = { type: 'send_workflow_event' };
      const result = await executor.execute(action, makeEvent('agent:completed'));
      expect(result.success).toBe(true);
      expect(workflowEngine.sendEvent).not.toHaveBeenCalled();
    });
  });

  // ─── parallel action ─────────────────────────────────────────────────────────

  describe('parallel action', () => {
    it('executes all sub-actions in parallel and returns success when all succeed', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);
      const executor = new TriggerActionExecutor(null, null, null, DEFAULT_CONFIG);
      executor.registerHandler('h1', handler1);
      executor.registerHandler('h2', handler2);
      const action: TriggerAction = {
        type: 'parallel',
        actions: [
          { type: 'invoke_handler', handler: 'h1', args_template: {} },
          { type: 'invoke_handler', handler: 'h2', args_template: {} },
        ],
      };
      const result = await executor.execute(action, makeEvent('test:event'));
      expect(result.success).toBe(true);
      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('returns failure when any sub-action fails', async () => {
      const executor = new TriggerActionExecutor(null, null, null, DEFAULT_CONFIG);
      executor.registerHandler('goodHandler', vi.fn().mockResolvedValue(undefined));
      const action: TriggerAction = {
        type: 'parallel',
        actions: [
          { type: 'invoke_handler', handler: 'goodHandler', args_template: {} },
          { type: 'invoke_handler', handler: 'missingHandler', args_template: {} },
        ],
      };
      const result = await executor.execute(action, makeEvent('test:event'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('1 of 2 parallel actions failed');
    });

    it('includes error messages in failure description', async () => {
      const executor = new TriggerActionExecutor(null, null, null, DEFAULT_CONFIG);
      const action: TriggerAction = {
        type: 'parallel',
        actions: [
          { type: 'invoke_handler', handler: 'missing1', args_template: {} },
          { type: 'invoke_handler', handler: 'missing2', args_template: {} },
        ],
      };
      const result = await executor.execute(action, makeEvent('test:event'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('2 of 2 parallel actions failed');
      expect(result.error).toContain('missing1');
      expect(result.error).toContain('missing2');
    });

    it('returns success for empty actions array', async () => {
      const executor = new TriggerActionExecutor();
      const action: TriggerAction = { type: 'parallel', actions: [] };
      const result = await executor.execute(action, makeEvent('test:event'));
      expect(result.success).toBe(true);
    });
  });

  // ─── sequence action ─────────────────────────────────────────────────────────

  describe('sequence action', () => {
    it('executes all sub-actions in order and returns success when all succeed', async () => {
      const callOrder: string[] = [];
      const executor = new TriggerActionExecutor(null, null, null, DEFAULT_CONFIG);
      executor.registerHandler('step1', async () => { callOrder.push('step1'); });
      executor.registerHandler('step2', async () => { callOrder.push('step2'); });
      const action: TriggerAction = {
        type: 'sequence',
        actions: [
          { type: 'invoke_handler', handler: 'step1', args_template: {} },
          { type: 'invoke_handler', handler: 'step2', args_template: {} },
        ],
      };
      const result = await executor.execute(action, makeEvent('test:event'));
      expect(result.success).toBe(true);
      expect(callOrder).toEqual(['step1', 'step2']);
    });

    it('stops at first failure and does not execute subsequent actions', async () => {
      const step2 = vi.fn().mockResolvedValue(undefined);
      const executor = new TriggerActionExecutor(null, null, null, DEFAULT_CONFIG);
      executor.registerHandler('step2', step2);
      const action: TriggerAction = {
        type: 'sequence',
        actions: [
          { type: 'invoke_handler', handler: 'missingStep1', args_template: {} },
          { type: 'invoke_handler', handler: 'step2', args_template: {} },
        ],
      };
      const result = await executor.execute(action, makeEvent('test:event'));
      expect(result.success).toBe(false);
      expect(step2).not.toHaveBeenCalled();
    });

    it('returns success for empty actions array', async () => {
      const executor = new TriggerActionExecutor();
      const action: TriggerAction = { type: 'sequence', actions: [] };
      const result = await executor.execute(action, makeEvent('test:event'));
      expect(result.success).toBe(true);
    });
  });

  // ─── registerHandler ──────────────────────────────────────────────────────────

  describe('registerHandler', () => {
    it('can overwrite a handler with the same name', async () => {
      const executor = new TriggerActionExecutor(null, null, null, DEFAULT_CONFIG);
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);
      executor.registerHandler('myHandler', handler1);
      executor.registerHandler('myHandler', handler2);
      const action: TriggerAction = {
        type: 'invoke_handler',
        handler: 'myHandler',
        args_template: {},
      };
      await executor.execute(action, makeEvent('test:event'));
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledOnce();
    });
  });

  // ─── resolveTemplate with arrays ─────────────────────────────────────────────

  describe('resolveTemplate with arrays', () => {
    it('resolves $event.* references inside array items', async () => {
      const bus = makeEventBus();
      const executor = new TriggerActionExecutor(bus as any);
      const action: TriggerAction = {
        type: 'emit_event',
        event_type: 'test:out' as never,
        payload_template: { items: ['$event.id', '$event.type', 'static'] },
      } as TriggerAction;
      const event = makeEvent('test:in', {}, 'evt-arr');
      const result = await executor.execute(action, event);
      expect(result.success).toBe(true);
      const emitted = bus.emit.mock.calls[0][0];
      expect(emitted.payload.data.items).toEqual(['evt-arr', 'test:in', 'static']);
    });

    it('preserves non-string, non-object, non-array values unchanged', async () => {
      const bus = makeEventBus();
      const executor = new TriggerActionExecutor(bus as any);
      const action: TriggerAction = {
        type: 'emit_event',
        event_type: 'test:out' as never,
        payload_template: { count: 42, flag: true, nothing: null as unknown as string },
      } as TriggerAction;
      const event = makeEvent('test:in');
      const result = await executor.execute(action, event);
      expect(result.success).toBe(true);
      const emitted = bus.emit.mock.calls[0][0];
      expect(emitted.payload.data.count).toBe(42);
      expect(emitted.payload.data.flag).toBe(true);
      expect(emitted.payload.data.nothing).toBeNull();
    });
  });

  // ─── unknown action type ───────────────────────────────────────────────────────

  describe('unknown action type', () => {
    it('returns success: false for an unrecognized action type', async () => {
      const executor = new TriggerActionExecutor();
      const action = { type: 'totally_unknown' } as unknown as TriggerAction;
      const result = await executor.execute(action, makeEvent('test:event'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action type');
    });
  });
});
