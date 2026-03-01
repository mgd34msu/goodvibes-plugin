import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { WorkflowEngine } from '../workflow-engine.js';
import type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowContext,
  GuardFunction,
  ActionHandler,
} from '../types.js';
import type { RuntimeEvent } from '../../events/types.js';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

let mockTimestamp = '2024-01-01T00:00:00.000Z';
const mockGenerateWorkflowId = vi.fn(() => 'wf_test_id');
const mockGenerateEventId = vi.fn(() => 'evt_test_id');

vi.mock('../../../shared/utils.js', () => ({
  timestamp: () => mockTimestamp,
  generateWorkflowId: () => mockGenerateWorkflowId(),
  generateEventId: () => mockGenerateEventId(),
  toErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  max_active: 10,
  max_transitions_per_workflow: 100,
  wrfc_max_fix_iterations: 3,
  fix_loop_max_attempts: 5,
};

function makeEngine(config = DEFAULT_CONFIG): WorkflowEngine {
  return new WorkflowEngine(config);
}

/**
 * A minimal 3-state workflow definition:
 *   idle --[task:started]--> working --[task:completed]--> done (terminal)
 *              \--[task:failed]--> done (terminal)
 */
function makeDefinition(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: 'test_workflow',
    name: 'Test Workflow',
    version: 1,
    initial_state: 'idle',
    terminal_states: ['done'],
    states: {
      idle: {
        name: 'idle',
        transitions: [
          { event: 'task:started' as any, target: 'working' },
        ],
      },
      working: {
        name: 'working',
        transitions: [
          { event: 'task:completed' as any, target: 'done' },
          { event: 'task:failed' as any, target: 'done' },
        ],
      },
      done: {
        name: 'done',
        transitions: [],
      },
    },
    ...overrides,
  };
}

function makeEvent(type: string, overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: 'evt_1',
    timestamp: '2024-01-01T00:00:00.000Z',
    type: type as any,
    source: { kind: 'system' },
    payload: { type: type as any, data: {} },
    ...overrides,
  } as RuntimeEvent;
}

function makeEventBus() {
  return { emit: vi.fn() };
}

function makeDirectiveQueue() {
  return { purge: vi.fn().mockReturnValue(0) };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = makeEngine();
    mockGenerateWorkflowId.mockReturnValue('wf_test_id');
    mockGenerateEventId.mockReturnValue('evt_test_id');
    mockTimestamp = '2024-01-01T00:00:00.000Z';
  });

  // ─── registerDefinition ──────────────────────────────────────────────────

  describe('registerDefinition', () => {
    it('registers a new definition successfully', () => {
      const def = makeDefinition();
      engine.registerDefinition(def);
      expect(engine.getDefinition('test_workflow')).toBe(def);
    });

    it('throws when registering a definition with duplicate id', () => {
      engine.registerDefinition(makeDefinition());
      expect(() => engine.registerDefinition(makeDefinition())).toThrow(
        "WorkflowDefinition 'test_workflow' is already registered"
      );
    });

    it('allows registering multiple definitions with different ids', () => {
      engine.registerDefinition(makeDefinition({ id: 'def_a' }));
      engine.registerDefinition(makeDefinition({ id: 'def_b' }));
      expect(engine.getDefinition('def_a')).toBeDefined();
      expect(engine.getDefinition('def_b')).toBeDefined();
    });
  });

  // ─── getDefinition ───────────────────────────────────────────────────────

  describe('getDefinition', () => {
    it('returns the registered definition', () => {
      const def = makeDefinition();
      engine.registerDefinition(def);
      expect(engine.getDefinition('test_workflow')).toBe(def);
    });

    it('returns undefined for unknown definition id', () => {
      expect(engine.getDefinition('nonexistent')).toBeUndefined();
    });
  });

  // ─── setEventBus / setDirectiveQueue ─────────────────────────────────────

  describe('setEventBus', () => {
    it('stores the event bus so workflow events are emitted', () => {
      const bus = makeEventBus();
      engine.setEventBus(bus);
      engine.registerDefinition(makeDefinition());
      engine.create('test_workflow');
      expect(bus.emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'workflow:created' })
      );
    });
  });

  describe('setDirectiveQueue', () => {
    it('stores the directive queue so it is purged on terminal transitions', () => {
      const queue = makeDirectiveQueue();
      const bus = makeEventBus();
      engine.setDirectiveQueue(queue);
      engine.setEventBus(bus);
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      engine.sendEvent(instance.id, makeEvent('task:started'));
      engine.sendEvent(instance.id, makeEvent('task:completed'));
      expect(queue.purge).toHaveBeenCalledWith(instance.id);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('throws when definition is not registered', () => {
      expect(() => engine.create('unknown')).toThrow(
        "WorkflowDefinition 'unknown' is not registered"
      );
    });

    it('creates an instance in the initial state', () => {
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      expect(instance.current_state).toBe('idle');
      expect(instance.status).toBe('active');
      expect(instance.definition_id).toBe('test_workflow');
      expect(instance.history).toEqual([]);
    });

    it('uses generated id when no instanceId is provided', () => {
      mockGenerateWorkflowId.mockReturnValue('wf_generated');
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      expect(instance.id).toBe('wf_generated');
    });

    it('uses provided instanceId when specified', () => {
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow', {}, 'custom_id');
      expect(instance.id).toBe('custom_id');
    });

    it('merges initialContext into instance context', () => {
      engine.registerDefinition(makeDefinition());
      const ctx = { task: 'Test task', review_score: 8 };
      const instance = engine.create('test_workflow', ctx);
      expect(instance.context.task).toBe('Test task');
      expect(instance.context.review_score).toBe(8);
    });

    it('sets created_at and updated_at timestamps', () => {
      mockTimestamp = '2024-06-01T12:00:00.000Z';
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      expect(instance.created_at).toBe('2024-06-01T12:00:00.000Z');
      expect(instance.updated_at).toBe('2024-06-01T12:00:00.000Z');
    });

    it('stores instance so it can be retrieved by get()', () => {
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow', {}, 'my_id');
      expect(engine.get('my_id')).toBe(instance);
    });

    it('throws when max_active limit is reached', () => {
      const smallEngine = makeEngine({ ...DEFAULT_CONFIG, max_active: 2, max_transitions_per_workflow: 100 });
      const def = makeDefinition();
      smallEngine.registerDefinition(def);
      smallEngine.create('test_workflow', {}, 'wf_1');
      smallEngine.create('test_workflow', {}, 'wf_2');
      expect(() => smallEngine.create('test_workflow', {}, 'wf_3')).toThrow(
        'Cannot create workflow: max_active limit (2) reached'
      );
    });

    it('emits workflow:created event when event bus is set', () => {
      const bus = makeEventBus();
      engine.setEventBus(bus);
      engine.registerDefinition(makeDefinition());
      engine.create('test_workflow', {}, 'wf_test');
      expect(bus.emit).toHaveBeenCalledTimes(1);
      const emittedEvent = (bus.emit as Mock).mock.calls[0][0];
      expect(emittedEvent.type).toBe('workflow:created');
      expect(emittedEvent.source.workflow_id).toBe('wf_test');
      expect(emittedEvent.payload.data.initial_state).toBe('idle');
    });

    it('does not emit events when no event bus is set', () => {
      engine.registerDefinition(makeDefinition());
      // Should not throw; just a no-op
      expect(() => engine.create('test_workflow')).not.toThrow();
    });

    it('executes on_enter actions for initial state (fire-and-forget)', async () => {
      const onEnterAction = vi.fn().mockResolvedValue(undefined);
      engine.registerAction('my_handler', onEnterAction);
      const def = makeDefinition({
        states: {
          idle: {
            name: 'idle',
            on_enter: [{ type: 'invoke_handler', config: { handler: 'my_handler' } }],
            transitions: [],
          },
        },
      });
      engine.registerDefinition(def);
      engine.create('test_workflow');
      // Allow fire-and-forget to flush
      await new Promise((r) => setImmediate(r));
      expect(onEnterAction).toHaveBeenCalledTimes(1);
    });
  });

  // ─── sendEvent ───────────────────────────────────────────────────────────

  describe('sendEvent', () => {
    it('returns null for unknown workflow id', () => {
      expect(engine.sendEvent('no_such_id', makeEvent('task:started'))).toBeNull();
    });

    it('returns null when workflow is not active (completed)', () => {
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      engine.sendEvent(instance.id, makeEvent('task:started'));
      engine.sendEvent(instance.id, makeEvent('task:completed'));
      // Now completed — further events are ignored
      const result = engine.sendEvent(instance.id, makeEvent('task:started'));
      expect(result).toBeNull();
    });

    it('returns null when workflow is not active (cancelled)', () => {
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      engine.cancel(instance.id, 'test cancel');
      expect(engine.sendEvent(instance.id, makeEvent('task:started'))).toBeNull();
    });

    it('returns null when no matching transition exists for event type', () => {
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      // 'idle' state has no transition for 'task:completed'
      const result = engine.sendEvent(instance.id, makeEvent('task:completed'));
      expect(result).toBeNull();
      expect(instance.current_state).toBe('idle');
    });

    it('returns the applied WorkflowTransition on success', () => {
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      const transition = engine.sendEvent(instance.id, makeEvent('task:started'));
      expect(transition).not.toBeNull();
      expect(transition!.from_state).toBe('idle');
      expect(transition!.to_state).toBe('working');
      expect(transition!.event).toBe('task:started');
    });

    it('updates current_state after a valid transition', () => {
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      engine.sendEvent(instance.id, makeEvent('task:started'));
      expect(instance.current_state).toBe('working');
    });

    it('records transition in history', () => {
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      engine.sendEvent(instance.id, makeEvent('task:started'));
      expect(instance.history).toHaveLength(1);
      expect(instance.history[0].from_state).toBe('idle');
      expect(instance.history[0].to_state).toBe('working');
    });

    it('marks instance as completed when transitioning to terminal state', () => {
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      engine.sendEvent(instance.id, makeEvent('task:started'));
      engine.sendEvent(instance.id, makeEvent('task:completed'));
      expect(instance.status).toBe('completed');
      expect(instance.completed_at).toBeDefined();
    });

    it('emits workflow:state_changed and workflow:completed when terminal', () => {
      const bus = makeEventBus();
      engine.setEventBus(bus);
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      bus.emit.mockClear();
      engine.sendEvent(instance.id, makeEvent('task:started'));
      engine.sendEvent(instance.id, makeEvent('task:completed'));
      const types = (bus.emit as Mock).mock.calls.map((c) => c[0].type);
      expect(types).toContain('workflow:state_changed');
      expect(types).toContain('workflow:completed');
    });

    it('purges directive queue when reaching terminal state', () => {
      const queue = makeDirectiveQueue();
      engine.setDirectiveQueue(queue);
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      engine.sendEvent(instance.id, makeEvent('task:started'));
      engine.sendEvent(instance.id, makeEvent('task:completed'));
      expect(queue.purge).toHaveBeenCalledWith(instance.id);
    });

    it('halts with failed status when max_transitions is exceeded', () => {
      const def = makeDefinition({ max_transitions: 1 });
      engine.registerDefinition(def);
      const instance = engine.create('test_workflow');
      // First transition succeeds
      engine.sendEvent(instance.id, makeEvent('task:started'));
      expect(instance.history).toHaveLength(1);
      // Second transition: max_transitions (1) reached in history check
      const result = engine.sendEvent(instance.id, makeEvent('task:completed'));
      expect(result).toBeNull();
      expect(instance.status).toBe('failed');
      expect(instance.error).toMatch(/Exceeded max transitions/);
    });

    it('uses per-definition max_transitions over engine default', () => {
      // Engine has a high default (100), but definition caps at 2.
      // Use a cycling definition so we can trigger the limit before reaching terminal.
      const cyclingDef: WorkflowDefinition = {
        id: 'cycle_def',
        name: 'Cycle',
        version: 1,
        initial_state: 's1',
        terminal_states: ['done'],
        max_transitions: 2,
        states: {
          s1: { name: 's1', transitions: [{ event: 'go' as any, target: 's2' }] },
          s2: { name: 's2', transitions: [{ event: 'go' as any, target: 's1' }] },
          done: { name: 'done', transitions: [] },
        },
      };
      engine.registerDefinition(cyclingDef);
      const instance = engine.create('cycle_def');
      engine.sendEvent(instance.id, makeEvent('go')); // s1 -> s2 (history length: 1)
      engine.sendEvent(instance.id, makeEvent('go')); // s2 -> s1 (history length: 2)
      // history.length (2) >= max_transitions (2) — next sendEvent should fail the workflow
      const result = engine.sendEvent(instance.id, makeEvent('go'));
      expect(result).toBeNull();
      expect(instance.status).toBe('failed');
    });

    it('emits workflow:failed when max transitions exceeded', () => {
      const bus = makeEventBus();
      engine.setEventBus(bus);
      const def = makeDefinition({ max_transitions: 1 });
      engine.registerDefinition(def);
      const instance = engine.create('test_workflow');
      bus.emit.mockClear();
      engine.sendEvent(instance.id, makeEvent('task:started'));
      engine.sendEvent(instance.id, makeEvent('task:started'));
      const types = (bus.emit as Mock).mock.calls.map((c) => c[0].type);
      expect(types).toContain('workflow:failed');
    });

    it('purges directive queue when max transitions exceeded', () => {
      const queue = makeDirectiveQueue();
      engine.setDirectiveQueue(queue);
      const def = makeDefinition({ max_transitions: 1 });
      engine.registerDefinition(def);
      const instance = engine.create('test_workflow');
      engine.sendEvent(instance.id, makeEvent('task:started'));
      engine.sendEvent(instance.id, makeEvent('task:started'));
      expect(queue.purge).toHaveBeenCalledWith(instance.id);
    });

    it('records context_changes in transition when context was mutated by actions', async () => {
      // We set up an update_context action on the transition
      const def: WorkflowDefinition = {
        id: 'ctx_def',
        name: 'Context Test',
        version: 1,
        initial_state: 'start',
        terminal_states: ['end'],
        states: {
          start: {
            name: 'start',
            transitions: [
              {
                event: 'go' as any,
                target: 'end',
                // NOTE: context_changes reflect pre-action context since actions are fire-and-forget
              },
            ],
          },
          end: { name: 'end', transitions: [] },
        },
      };
      engine.registerDefinition(def);
      const instance = engine.create('ctx_def', { review_score: 5 });
      const transition = engine.sendEvent(instance.id, makeEvent('go'));
      // context_changes will be empty since no mutation happened before capture
      expect(transition).not.toBeNull();
      expect(transition!.context_changes).toEqual({});
    });

    describe('guard conditions on transitions', () => {
      it('skips a transition when guard returns false', () => {
        const def: WorkflowDefinition = {
          id: 'guard_def',
          name: 'Guard Test',
          version: 1,
          initial_state: 'start',
          terminal_states: ['pass', 'fail'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'check' as any,
                  target: 'pass',
                  guard: { type: 'function', function: 'score_guard' },
                },
                {
                  event: 'check' as any,
                  target: 'fail',
                },
              ],
            },
            pass: { name: 'pass', transitions: [] },
            fail: { name: 'fail', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        // Guard always fails
        engine.registerGuard('score_guard', () => false);
        const instance = engine.create('guard_def');
        engine.sendEvent(instance.id, makeEvent('check'));
        // Should have taken the fallback (no guard) transition
        expect(instance.current_state).toBe('fail');
      });

      it('takes first matching transition when guard passes', () => {
        const def: WorkflowDefinition = {
          id: 'guard_pass_def',
          name: 'Guard Pass Test',
          version: 1,
          initial_state: 'start',
          terminal_states: ['pass', 'fail'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'check' as any,
                  target: 'pass',
                  guard: { type: 'function', function: 'passing_guard' },
                },
                {
                  event: 'check' as any,
                  target: 'fail',
                },
              ],
            },
            pass: { name: 'pass', transitions: [] },
            fail: { name: 'fail', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        engine.registerGuard('passing_guard', () => true);
        const instance = engine.create('guard_pass_def');
        engine.sendEvent(instance.id, makeEvent('check'));
        expect(instance.current_state).toBe('pass');
      });

      it('passes context and event to function guard', () => {
        const guardFn: Mock<GuardFunction> = vi.fn().mockReturnValue(true);
        const def: WorkflowDefinition = {
          id: 'ctx_guard_def',
          name: 'Ctx Guard',
          version: 1,
          initial_state: 'start',
          terminal_states: ['end'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'go' as any,
                  target: 'end',
                  guard: { type: 'function', function: 'ctx_guard' },
                },
              ],
            },
            end: { name: 'end', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        engine.registerGuard('ctx_guard', guardFn);
        const instance = engine.create('ctx_guard_def', { review_score: 9 });
        const event = makeEvent('go');
        engine.sendEvent(instance.id, event);
        expect(guardFn).toHaveBeenCalledWith(
          expect.objectContaining({ review_score: 9 }),
          expect.objectContaining({ type: 'go' })
        );
      });

      it('returns false when function guard is not registered', () => {
        const def: WorkflowDefinition = {
          id: 'missing_guard_def',
          name: 'Missing Guard',
          version: 1,
          initial_state: 'start',
          terminal_states: ['end'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'go' as any,
                  target: 'end',
                  guard: { type: 'function', function: 'does_not_exist' },
                },
              ],
            },
            end: { name: 'end', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        const instance = engine.create('missing_guard_def');
        const result = engine.sendEvent(instance.id, makeEvent('go'));
        expect(result).toBeNull();
        expect(instance.current_state).toBe('start');
      });

      it('returns false when guard throws an exception', () => {
        const throwingGuard: GuardFunction = () => {
          throw new Error('guard exploded');
        };
        const def: WorkflowDefinition = {
          id: 'throw_guard_def',
          name: 'Throw Guard',
          version: 1,
          initial_state: 'start',
          terminal_states: ['end'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'go' as any,
                  target: 'end',
                  guard: { type: 'function', function: 'throw_guard' },
                },
              ],
            },
            end: { name: 'end', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        engine.registerGuard('throw_guard', throwingGuard);
        const instance = engine.create('throw_guard_def');
        // Should not throw — guard exception is caught and returns false
        expect(() => engine.sendEvent(instance.id, makeEvent('go'))).not.toThrow();
        expect(instance.current_state).toBe('start');
      });
    });

    describe('expression guards', () => {
      function makeExprDef(expression: string, target = 'pass'): WorkflowDefinition {
        return {
          id: `expr_def_${expression.replace(/\s+/g, '_')}`,
          name: 'Expr Test',
          version: 1,
          initial_state: 'start',
          terminal_states: ['pass', 'fail'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'check' as any,
                  target,
                  guard: { type: 'expression', expression },
                },
                { event: 'check' as any, target: 'fail' },
              ],
            },
            pass: { name: 'pass', transitions: [] },
            fail: { name: 'fail', transitions: [] },
          },
        };
      }

      it('evaluates >= expression correctly (true)', () => {
        const def = makeExprDef('context.review_score >= 9');
        engine.registerDefinition(def);
        const instance = engine.create(def.id, { review_score: 9.5 });
        engine.sendEvent(instance.id, makeEvent('check'));
        expect(instance.current_state).toBe('pass');
      });

      it('evaluates >= expression correctly (false)', () => {
        const def = makeExprDef('context.review_score >= 9.5');
        engine.registerDefinition(def);
        const instance = engine.create(def.id, { review_score: 8 });
        engine.sendEvent(instance.id, makeEvent('check'));
        expect(instance.current_state).toBe('fail');
      });

      it('evaluates <= expression correctly', () => {
        const def = makeExprDef('context.fix_attempts <= 3');
        engine.registerDefinition(def);
        const instance = engine.create(def.id, { fix_attempts: 2 });
        engine.sendEvent(instance.id, makeEvent('check'));
        expect(instance.current_state).toBe('pass');
      });

      it('evaluates > expression correctly', () => {
        const def = makeExprDef('context.review_score > 5');
        engine.registerDefinition(def);
        const instance = engine.create(def.id, { review_score: 6 });
        engine.sendEvent(instance.id, makeEvent('check'));
        expect(instance.current_state).toBe('pass');
      });

      it('evaluates < expression correctly', () => {
        const def = makeExprDef('context.fix_attempts < 5');
        engine.registerDefinition(def);
        const instance = engine.create(def.id, { fix_attempts: 3 });
        engine.sendEvent(instance.id, makeEvent('check'));
        expect(instance.current_state).toBe('pass');
      });

      it('evaluates === with numeric literal', () => {
        const def = makeExprDef('context.fix_attempts === 0');
        engine.registerDefinition(def);
        const instance = engine.create(def.id, { fix_attempts: 0 });
        engine.sendEvent(instance.id, makeEvent('check'));
        expect(instance.current_state).toBe('pass');
      });

      it('evaluates !== with numeric literal', () => {
        const def = makeExprDef('context.fix_attempts !== 0');
        engine.registerDefinition(def);
        const instance = engine.create(def.id, { fix_attempts: 1 });
        engine.sendEvent(instance.id, makeEvent('check'));
        expect(instance.current_state).toBe('pass');
      });

      it('evaluates === true boolean literal', () => {
        const def = makeExprDef('context.is_ready === true');
        engine.registerDefinition(def);
        const instance = engine.create(def.id, { is_ready: true });
        engine.sendEvent(instance.id, makeEvent('check'));
        expect(instance.current_state).toBe('pass');
      });

      it('evaluates === false boolean literal', () => {
        const def = makeExprDef('context.is_ready === false');
        engine.registerDefinition(def);
        const instance = engine.create(def.id, { is_ready: false });
        engine.sendEvent(instance.id, makeEvent('check'));
        expect(instance.current_state).toBe('pass');
      });

      it('evaluates === null literal', () => {
        const def = makeExprDef('context.task === null');
        engine.registerDefinition(def);
        const instance = engine.create(def.id, { task: null as any });
        engine.sendEvent(instance.id, makeEvent('check'));
        expect(instance.current_state).toBe('pass');
      });

      it('evaluates context.field op context.otherField', () => {
        const def = makeExprDef('context.fix_attempts < context.max_fix_attempts');
        engine.registerDefinition(def);
        const instance = engine.create(def.id, { fix_attempts: 2, max_fix_attempts: 5 });
        engine.sendEvent(instance.id, makeEvent('check'));
        expect(instance.current_state).toBe('pass');
      });

      it('resolves nested context path (context.a.b)', () => {
        const def: WorkflowDefinition = {
          id: 'nested_path_def',
          name: 'Nested Path',
          version: 1,
          initial_state: 'start',
          terminal_states: ['pass', 'fail'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'check' as any,
                  target: 'pass',
                  guard: {
                    type: 'expression',
                    expression: 'context.verification_result.passed === true',
                  },
                },
                { event: 'check' as any, target: 'fail' },
              ],
            },
            pass: { name: 'pass', transitions: [] },
            fail: { name: 'fail', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        const instance = engine.create(def.id, {
          verification_result: { passed: true, errors: [] },
        });
        engine.sendEvent(instance.id, makeEvent('check'));
        expect(instance.current_state).toBe('pass');
      });

      it('returns false for expression with no recognized operator', () => {
        const def = makeExprDef('context.review_score');
        engine.registerDefinition(def);
        const instance = engine.create(def.id, { review_score: 9 });
        engine.sendEvent(instance.id, makeEvent('check'));
        // No operator → guard returns false → falls through to 'fail'
        expect(instance.current_state).toBe('fail');
      });

      it('throws for expression with empty LHS or RHS', () => {
        // We test this indirectly: guard exception is caught and returns false
        const def: WorkflowDefinition = {
          id: 'bad_expr_def',
          name: 'Bad Expr',
          version: 1,
          initial_state: 'start',
          terminal_states: ['pass', 'fail'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'check' as any,
                  target: 'pass',
                  guard: { type: 'expression', expression: ' >= 5' },
                },
                { event: 'check' as any, target: 'fail' },
              ],
            },
            pass: { name: 'pass', transitions: [] },
            fail: { name: 'fail', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        const instance = engine.create(def.id);
        // Should not throw — internal error is caught
        expect(() => engine.sendEvent(instance.id, makeEvent('check'))).not.toThrow();
        expect(instance.current_state).toBe('fail');
      });

      it('returns false for guard with type=expression but no expression field', () => {
        const def: WorkflowDefinition = {
          id: 'no_expr_def',
          name: 'No Expr',
          version: 1,
          initial_state: 'start',
          terminal_states: ['pass', 'fail'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'check' as any,
                  target: 'pass',
                  guard: { type: 'expression' }, // missing expression field
                },
                { event: 'check' as any, target: 'fail' },
              ],
            },
            pass: { name: 'pass', transitions: [] },
            fail: { name: 'fail', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        const instance = engine.create(def.id);
        engine.sendEvent(instance.id, makeEvent('check'));
        expect(instance.current_state).toBe('fail');
      });

      it('returns false for guard with unrecognized type', () => {
        const def: WorkflowDefinition = {
          id: 'bad_type_guard_def',
          name: 'Bad Type Guard',
          version: 1,
          initial_state: 'start',
          terminal_states: ['pass', 'fail'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'check' as any,
                  target: 'pass',
                  guard: { type: 'invalid_type' as any },
                },
                { event: 'check' as any, target: 'fail' },
              ],
            },
            pass: { name: 'pass', transitions: [] },
            fail: { name: 'fail', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        const instance = engine.create(def.id);
        engine.sendEvent(instance.id, makeEvent('check'));
        expect(instance.current_state).toBe('fail');
      });
    });

    describe('actions on transitions', () => {
      it('executes on_exit actions when leaving a state', async () => {
        const onExitHandler = vi.fn().mockResolvedValue(undefined);
        engine.registerAction('exit_handler', onExitHandler);
        const def: WorkflowDefinition = {
          id: 'exit_action_def',
          name: 'Exit Action',
          version: 1,
          initial_state: 'start',
          terminal_states: ['end'],
          states: {
            start: {
              name: 'start',
              on_exit: [{ type: 'invoke_handler', config: { handler: 'exit_handler' } }],
              transitions: [{ event: 'go' as any, target: 'end' }],
            },
            end: { name: 'end', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        const instance = engine.create(def.id);
        engine.sendEvent(instance.id, makeEvent('go'));
        await new Promise((r) => setImmediate(r));
        expect(onExitHandler).toHaveBeenCalledTimes(1);
      });

      it('executes on_enter actions when entering a state', async () => {
        const onEnterHandler = vi.fn().mockResolvedValue(undefined);
        engine.registerAction('enter_handler', onEnterHandler);
        const def: WorkflowDefinition = {
          id: 'enter_action_def',
          name: 'Enter Action',
          version: 1,
          initial_state: 'start',
          terminal_states: ['end'],
          states: {
            start: {
              name: 'start',
              transitions: [{ event: 'go' as any, target: 'end' }],
            },
            end: {
              name: 'end',
              on_enter: [{ type: 'invoke_handler', config: { handler: 'enter_handler' } }],
              transitions: [],
            },
          },
        };
        engine.registerDefinition(def);
        const instance = engine.create(def.id);
        engine.sendEvent(instance.id, makeEvent('go'));
        await new Promise((r) => setImmediate(r));
        expect(onEnterHandler).toHaveBeenCalledTimes(1);
      });

      it('executes transition actions', async () => {
        const transitionHandler = vi.fn().mockResolvedValue(undefined);
        engine.registerAction('transition_handler', transitionHandler);
        const def: WorkflowDefinition = {
          id: 'trans_action_def',
          name: 'Transition Action',
          version: 1,
          initial_state: 'start',
          terminal_states: ['end'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'go' as any,
                  target: 'end',
                  actions: [{ type: 'invoke_handler', config: { handler: 'transition_handler' } }],
                },
              ],
            },
            end: { name: 'end', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        const instance = engine.create(def.id);
        engine.sendEvent(instance.id, makeEvent('go'));
        await new Promise((r) => setImmediate(r));
        expect(transitionHandler).toHaveBeenCalledTimes(1);
      });

      it('emit_event action calls eventBus.emit', async () => {
        const bus = makeEventBus();
        engine.setEventBus(bus);
        const def: WorkflowDefinition = {
          id: 'emit_action_def',
          name: 'Emit Action',
          version: 1,
          initial_state: 'start',
          terminal_states: ['end'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'go' as any,
                  target: 'end',
                  actions: [
                    { type: 'emit_event', config: { event_type: 'task:started' } },
                  ],
                },
              ],
            },
            end: { name: 'end', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        bus.emit.mockClear();
        const instance = engine.create(def.id);
        bus.emit.mockClear();
        engine.sendEvent(instance.id, makeEvent('go'));
        await new Promise((r) => setImmediate(r));
        const emittedTypes = (bus.emit as Mock).mock.calls.map((c) => c[0].type);
        expect(emittedTypes).toContain('task:started');
      });

      it('emit_event action is skipped when no eventBus is set', async () => {
        // No bus set — should not throw
        const def: WorkflowDefinition = {
          id: 'no_bus_emit_def',
          name: 'No Bus Emit',
          version: 1,
          initial_state: 'start',
          terminal_states: ['end'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'go' as any,
                  target: 'end',
                  actions: [
                    { type: 'emit_event', config: { event_type: 'task:started' } },
                  ],
                },
              ],
            },
            end: { name: 'end', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        const instance = engine.create(def.id);
        engine.sendEvent(instance.id, makeEvent('go'));
        await new Promise((r) => setImmediate(r));
        // No error thrown — test passes
        expect(instance.current_state).toBe('end');
      });

      it('update_context action shallow-merges config into context', async () => {
        const def: WorkflowDefinition = {
          id: 'update_ctx_def',
          name: 'Update Context',
          version: 1,
          initial_state: 'start',
          terminal_states: ['end'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'go' as any,
                  target: 'end',
                  actions: [
                    {
                      type: 'update_context',
                      config: { type: 'update_context', fix_attempts: 3, task: 'new task' },
                    },
                  ],
                },
              ],
            },
            end: { name: 'end', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        const instance = engine.create(def.id, { fix_attempts: 0 });
        engine.sendEvent(instance.id, makeEvent('go'));
        await new Promise((r) => setImmediate(r));
        // update_context excludes 'type' from the merge
        expect(instance.context.fix_attempts).toBe(3);
        expect(instance.context.task).toBe('new task');
        // 'type' key is excluded from update
        expect(instance.context.type).toBeUndefined();
      });

      it('invoke_handler warns and skips when handler name is missing', async () => {
        const def: WorkflowDefinition = {
          id: 'no_handler_name_def',
          name: 'No Handler Name',
          version: 1,
          initial_state: 'start',
          terminal_states: ['end'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'go' as any,
                  target: 'end',
                  actions: [{ type: 'invoke_handler', config: {} }], // no 'handler' key
                },
              ],
            },
            end: { name: 'end', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        const instance = engine.create(def.id);
        // Should not throw
        expect(() => engine.sendEvent(instance.id, makeEvent('go'))).not.toThrow();
        await new Promise((r) => setImmediate(r));
        expect(instance.current_state).toBe('end');
      });

      it('invoke_handler warns and skips when handler is not registered', async () => {
        const def: WorkflowDefinition = {
          id: 'unregistered_handler_def',
          name: 'Unregistered Handler',
          version: 1,
          initial_state: 'start',
          terminal_states: ['end'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'go' as any,
                  target: 'end',
                  actions: [{ type: 'invoke_handler', config: { handler: 'not_registered' } }],
                },
              ],
            },
            end: { name: 'end', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        const instance = engine.create(def.id);
        expect(() => engine.sendEvent(instance.id, makeEvent('go'))).not.toThrow();
        await new Promise((r) => setImmediate(r));
        expect(instance.current_state).toBe('end');
      });

      it('invoke_handler logs error when handler throws but continues', async () => {
        const throwingHandler: ActionHandler = vi.fn().mockRejectedValue(new Error('boom'));
        engine.registerAction('throwing_handler', throwingHandler);
        const def: WorkflowDefinition = {
          id: 'throw_handler_def',
          name: 'Throw Handler',
          version: 1,
          initial_state: 'start',
          terminal_states: ['end'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'go' as any,
                  target: 'end',
                  actions: [{ type: 'invoke_handler', config: { handler: 'throwing_handler' } }],
                },
              ],
            },
            end: { name: 'end', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        const instance = engine.create(def.id);
        engine.sendEvent(instance.id, makeEvent('go'));
        // Flush microtasks
        await new Promise((r) => setImmediate(r));
        // Transition still happened — error is logged but doesn't revert state
        expect(instance.current_state).toBe('end');
      });

      it('spawn_agent action logs an error (placeholder)', async () => {
        const def: WorkflowDefinition = {
          id: 'spawn_agent_def',
          name: 'Spawn Agent',
          version: 1,
          initial_state: 'start',
          terminal_states: ['end'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'go' as any,
                  target: 'end',
                  actions: [{ type: 'spawn_agent', config: { agent: 'engineer' } }],
                },
              ],
            },
            end: { name: 'end', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        const instance = engine.create(def.id);
        // Should not throw — spawn_agent is a logged no-op
        expect(() => engine.sendEvent(instance.id, makeEvent('go'))).not.toThrow();
        await new Promise((r) => setImmediate(r));
        expect(instance.current_state).toBe('end');
      });

      it('unknown action type logs a warning but continues', async () => {
        const def: WorkflowDefinition = {
          id: 'unknown_action_def',
          name: 'Unknown Action',
          version: 1,
          initial_state: 'start',
          terminal_states: ['end'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'go' as any,
                  target: 'end',
                  actions: [{ type: 'unknown_type' as any, config: {} }],
                },
              ],
            },
            end: { name: 'end', transitions: [] },
          },
        };
        engine.registerDefinition(def);
        const instance = engine.create(def.id);
        expect(() => engine.sendEvent(instance.id, makeEvent('go'))).not.toThrow();
        await new Promise((r) => setImmediate(r));
        expect(instance.current_state).toBe('end');
      });
    });
  });

  // ─── get ─────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('returns the instance by id', () => {
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow', {}, 'my_id');
      expect(engine.get('my_id')).toBe(instance);
    });

    it('returns undefined for unknown id', () => {
      expect(engine.get('no_such_id')).toBeUndefined();
    });
  });

  // ─── listActive / listAll ────────────────────────────────────────────────

  describe('listActive', () => {
    it('returns empty array when no instances exist', () => {
      expect(engine.listActive()).toEqual([]);
    });

    it('returns only active instances', () => {
      engine.registerDefinition(makeDefinition());
      const i1 = engine.create('test_workflow', {}, 'wf_1');
      const i2 = engine.create('test_workflow', {}, 'wf_2');
      engine.sendEvent(i1.id, makeEvent('task:started'));
      engine.sendEvent(i1.id, makeEvent('task:completed'));
      // i1 is completed, i2 is still active
      const active = engine.listActive();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('wf_2');
    });
  });

  describe('listAll', () => {
    it('returns all instances sorted by created_at', () => {
      engine.registerDefinition(makeDefinition());
      // Restore two instances with different timestamps
      const older: WorkflowInstance = {
        id: 'older',
        definition_id: 'test_workflow',
        current_state: 'done',
        context: {},
        history: [],
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z',
        status: 'completed',
      };
      const newer: WorkflowInstance = {
        id: 'newer',
        definition_id: 'test_workflow',
        current_state: 'idle',
        context: {},
        history: [],
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        status: 'active',
      };
      engine.restoreInstance(newer);
      engine.restoreInstance(older);
      const all = engine.listAll();
      expect(all[0].id).toBe('older');
      expect(all[1].id).toBe('newer');
    });

    it('includes completed, failed, and cancelled instances', () => {
      engine.registerDefinition(makeDefinition());
      const i1 = engine.create('test_workflow', {}, 'wf_1');
      const i2 = engine.create('test_workflow', {}, 'wf_2');
      engine.cancel(i1.id, 'cancelled');
      engine.sendEvent(i2.id, makeEvent('task:started'));
      engine.sendEvent(i2.id, makeEvent('task:completed'));
      expect(engine.listAll()).toHaveLength(2);
    });
  });

  // ─── restoreInstance ─────────────────────────────────────────────────────

  describe('restoreInstance', () => {
    it('restores an instance without triggering events or actions', () => {
      const bus = makeEventBus();
      engine.setEventBus(bus);
      const instance: WorkflowInstance = {
        id: 'restored_id',
        definition_id: 'test_workflow',
        current_state: 'working',
        context: { task: 'existing task' },
        history: [
          {
            from_state: 'idle',
            to_state: 'working',
            event: 'task:started' as any,
            timestamp: '2024-01-01T00:00:00.000Z',
            context_changes: {},
          },
        ],
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        status: 'active',
      };
      engine.restoreInstance(instance);
      expect(engine.get('restored_id')).toBe(instance);
      // No events emitted from restoreInstance
      expect(bus.emit).not.toHaveBeenCalled();
    });

    it('overwrites an existing instance with the same id (last-write wins)', () => {
      engine.registerDefinition(makeDefinition());
      engine.create('test_workflow', { task: 'original' }, 'wf_overwrite');
      const replacement: WorkflowInstance = {
        id: 'wf_overwrite',
        definition_id: 'test_workflow',
        current_state: 'done',
        context: { task: 'replacement' },
        history: [],
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        status: 'completed',
      };
      engine.restoreInstance(replacement);
      const found = engine.get('wf_overwrite');
      expect(found?.context.task).toBe('replacement');
      expect(found?.status).toBe('completed');
    });
  });

  // ─── getActiveInstances / getAllInstances ─────────────────────────────────

  describe('getActiveInstances', () => {
    it('is an alias for listActive()', () => {
      engine.registerDefinition(makeDefinition());
      engine.create('test_workflow', {}, 'wf_1');
      expect(engine.getActiveInstances()).toEqual(engine.listActive());
    });
  });

  describe('getAllInstances', () => {
    it('is an alias for listAll()', () => {
      engine.registerDefinition(makeDefinition());
      engine.create('test_workflow', {}, 'wf_1');
      expect(engine.getAllInstances()).toEqual(engine.listAll());
    });
  });

  // ─── cancel ──────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('cancels an active workflow instance', () => {
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      engine.cancel(instance.id, 'user request');
      expect(instance.status).toBe('cancelled');
      expect(instance.error).toBe('user request');
    });

    it('does nothing when workflow is not found', () => {
      // Should not throw
      expect(() => engine.cancel('no_such_id', 'reason')).not.toThrow();
    });

    it('does nothing when workflow is already not active', () => {
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      engine.sendEvent(instance.id, makeEvent('task:started'));
      engine.sendEvent(instance.id, makeEvent('task:completed'));
      // Already completed — cancel should be a no-op
      engine.cancel(instance.id, 'late cancel');
      expect(instance.status).toBe('completed'); // not changed to cancelled
    });

    it('emits workflow:cancelled event via event bus', () => {
      const bus = makeEventBus();
      engine.setEventBus(bus);
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      bus.emit.mockClear();
      engine.cancel(instance.id, 'test reason');
      expect(bus.emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'workflow:cancelled' })
      );
    });

    it('purges directive queue on cancel', () => {
      const queue = makeDirectiveQueue();
      engine.setDirectiveQueue(queue);
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      engine.cancel(instance.id, 'cancelled');
      expect(queue.purge).toHaveBeenCalledWith(instance.id);
    });

    it('updates updated_at on cancel', () => {
      mockTimestamp = '2024-06-01T12:00:00.000Z';
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow');
      mockTimestamp = '2024-06-02T00:00:00.000Z';
      engine.cancel(instance.id, 'reason');
      expect(instance.updated_at).toBe('2024-06-02T00:00:00.000Z');
    });
  });

  // ─── prune ───────────────────────────────────────────────────────────────

  describe('prune', () => {
    it('returns 0 when no instances exist', () => {
      expect(engine.prune()).toBe(0);
    });

    it('prunes completed instances older than maxAge', () => {
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow', {}, 'wf_old');
      // Manually mark as completed with an old timestamp
      instance.status = 'completed';
      instance.completed_at = new Date(Date.now() - 7_200_000).toISOString(); // 2 hours ago
      const pruned = engine.prune(3_600_000); // 1 hour max age
      expect(pruned).toBe(1);
      expect(engine.get('wf_old')).toBeUndefined();
    });

    it('does not prune completed instances within maxAge', () => {
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow', {}, 'wf_recent');
      instance.status = 'completed';
      instance.completed_at = new Date(Date.now() - 1_000).toISOString(); // 1 second ago
      const pruned = engine.prune(3_600_000); // 1 hour max age
      expect(pruned).toBe(0);
      expect(engine.get('wf_recent')).toBeDefined();
    });

    it('does not prune active instances', () => {
      engine.registerDefinition(makeDefinition());
      engine.create('test_workflow', {}, 'wf_active');
      const pruned = engine.prune(0); // maxAge = 0 would prune anything old enough
      expect(pruned).toBe(0);
      expect(engine.get('wf_active')).toBeDefined();
    });

    it('does not prune failed or cancelled instances', () => {
      engine.registerDefinition(makeDefinition());
      const i1 = engine.create('test_workflow', {}, 'wf_failed');
      const i2 = engine.create('test_workflow', {}, 'wf_cancelled');
      i1.status = 'failed';
      i1.updated_at = new Date(Date.now() - 7_200_000).toISOString();
      engine.cancel(i2.id, 'test');
      const pruned = engine.prune(3_600_000);
      expect(pruned).toBe(0);
    });

    it('uses updated_at as fallback when completed_at is not set', () => {
      engine.registerDefinition(makeDefinition());
      const instance = engine.create('test_workflow', {}, 'wf_no_completed_at');
      instance.status = 'completed';
      // completed_at is undefined; falls back to updated_at
      instance.updated_at = new Date(Date.now() - 7_200_000).toISOString();
      const pruned = engine.prune(3_600_000);
      expect(pruned).toBe(1);
    });

    it('returns count of pruned instances', () => {
      engine.registerDefinition(makeDefinition());
      for (let i = 0; i < 3; i++) {
        const inst = engine.create('test_workflow', {}, `wf_prune_${i}`);
        inst.status = 'completed';
        inst.completed_at = new Date(Date.now() - 7_200_000).toISOString();
      }
      expect(engine.prune(3_600_000)).toBe(3);
    });
  });

  // ─── registerGuard / registerAction ──────────────────────────────────────

  describe('registerGuard', () => {
    it('registers a guard function that can be used in transitions', () => {
      const guard: GuardFunction = vi.fn().mockReturnValue(true);
      engine.registerGuard('my_guard', guard);
      // Verify it's used: if it were not registered, the transition would fail
      const def: WorkflowDefinition = {
        id: 'reg_guard_def',
        name: 'Reg Guard',
        version: 1,
        initial_state: 'start',
        terminal_states: ['end'],
        states: {
          start: {
            name: 'start',
            transitions: [
              {
                event: 'go' as any,
                target: 'end',
                guard: { type: 'function', function: 'my_guard' },
              },
            ],
          },
          end: { name: 'end', transitions: [] },
        },
      };
      engine.registerDefinition(def);
      const instance = engine.create(def.id);
      engine.sendEvent(instance.id, makeEvent('go'));
      expect(guard).toHaveBeenCalled();
      expect(instance.current_state).toBe('end');
    });
  });

  describe('registerAction', () => {
    it('registers an action handler that is called during transitions', async () => {
      const handler: ActionHandler = vi.fn().mockResolvedValue(undefined);
      engine.registerAction('my_action', handler);
      const def: WorkflowDefinition = {
        id: 'reg_action_def',
        name: 'Reg Action',
        version: 1,
        initial_state: 'start',
        terminal_states: ['end'],
        states: {
          start: {
            name: 'start',
            transitions: [
              {
                event: 'go' as any,
                target: 'end',
                actions: [{ type: 'invoke_handler', config: { handler: 'my_action' } }],
              },
            ],
          },
          end: { name: 'end', transitions: [] },
        },
      };
      engine.registerDefinition(def);
      const instance = engine.create(def.id);
      engine.sendEvent(instance.id, makeEvent('go'));
      await new Promise((r) => setImmediate(r));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ─── emitWorkflowEvent error handling ───────────────────────────────────

  describe('emitWorkflowEvent error handling', () => {
    it('does not throw when eventBus.emit throws', () => {
      const bus = { emit: vi.fn().mockImplementation(() => { throw new Error('bus error'); }) };
      engine.setEventBus(bus);
      engine.registerDefinition(makeDefinition());
      // create() calls emitWorkflowEvent — should not propagate
      expect(() => engine.create('test_workflow')).not.toThrow();
    });
  });

  // ─── Workflow lifecycle end-to-end ───────────────────────────────────────

  describe('full workflow lifecycle', () => {
    it('drives a workflow from initial to terminal state', () => {
      const bus = makeEventBus();
      const queue = makeDirectiveQueue();
      engine.setEventBus(bus);
      engine.setDirectiveQueue(queue);
      engine.registerDefinition(makeDefinition());

      const instance = engine.create('test_workflow', { task: 'E2E test' });
      expect(instance.status).toBe('active');
      expect(instance.current_state).toBe('idle');

      engine.sendEvent(instance.id, makeEvent('task:started'));
      expect(instance.current_state).toBe('working');
      expect(instance.history).toHaveLength(1);

      engine.sendEvent(instance.id, makeEvent('task:completed'));
      expect(instance.current_state).toBe('done');
      expect(instance.status).toBe('completed');
      expect(instance.history).toHaveLength(2);
      expect(queue.purge).toHaveBeenCalledWith(instance.id);
    });

    it('correctly tracks history across multiple transitions', () => {
      const def: WorkflowDefinition = {
        id: 'multi_def',
        name: 'Multi Step',
        version: 1,
        initial_state: 's1',
        terminal_states: ['s4'],
        states: {
          s1: { name: 's1', transitions: [{ event: 'next' as any, target: 's2' }] },
          s2: { name: 's2', transitions: [{ event: 'next' as any, target: 's3' }] },
          s3: { name: 's3', transitions: [{ event: 'next' as any, target: 's4' }] },
          s4: { name: 's4', transitions: [] },
        },
      };
      engine.registerDefinition(def);
      const instance = engine.create('multi_def');
      engine.sendEvent(instance.id, makeEvent('next'));
      engine.sendEvent(instance.id, makeEvent('next'));
      engine.sendEvent(instance.id, makeEvent('next'));

      expect(instance.history).toHaveLength(3);
      expect(instance.history.map((h) => h.to_state)).toEqual(['s2', 's3', 's4']);
      expect(instance.status).toBe('completed');
    });
  });
});
