/**
 * WorkflowEngine Tests
 *
 * Comprehensive test suite for the WorkflowEngine state machine.
 * Covers: definition registration, instance creation, state transitions,
 * guard evaluation, action execution, terminal states, cancellation,
 * EventBus integration, and safety limits.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEngine, type EventBus } from '../workflow-engine.js';
import type { WorkflowDefinition } from '../types.js';
import type { RuntimeEvent } from '../../events/types.js';
import type { WorkflowsConfig } from '../../shared/config.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_CONFIG: WorkflowsConfig = {
  max_active: 10,
  max_transitions_per_workflow: 50,
  wrfc_max_fix_iterations: 3,
  fix_loop_max_attempts: 5,
};

function makeEvent(type: string, payload?: Record<string, unknown>): RuntimeEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    type: type as RuntimeEvent['type'],
    source: { kind: 'system' },
    payload: {
      type: type as RuntimeEvent['type'],
      data: payload ?? {},
    } as RuntimeEvent['payload'],
  };
}

/** Minimal 2-state definition: idle -[session:started]-> active (terminal) */
function makeSimpleDef(id = 'simple'): WorkflowDefinition {
  return {
    id,
    name: 'Simple',
    version: 1,
    initial_state: 'idle',
    terminal_states: ['active'],
    states: {
      idle: {
        name: 'idle',
        transitions: [
          { event: 'session:started' as RuntimeEvent['type'], target: 'active' },
        ],
      },
      active: {
        name: 'active',
        transitions: [],
      },
    },
  };
}

/** 3-state linear chain: start -> middle -> done (terminal) */
function makeLinearDef(id = 'linear'): WorkflowDefinition {
  return {
    id,
    name: 'Linear',
    version: 1,
    initial_state: 'start',
    terminal_states: ['done'],
    states: {
      start: {
        name: 'start',
        transitions: [
          { event: 'session:started' as RuntimeEvent['type'], target: 'middle' },
        ],
      },
      middle: {
        name: 'middle',
        transitions: [
          { event: 'session:ended' as RuntimeEvent['type'], target: 'done' },
        ],
      },
      done: {
        name: 'done',
        transitions: [],
      },
    },
  };
}

function makeEngine(config: Partial<WorkflowsConfig> = {}) {
  return new WorkflowEngine({ ...TEST_CONFIG, ...config });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = makeEngine();
  });

  // ── Definition Registration ────────────────────────────────────────────────

  describe('registerDefinition', () => {
    it('registers a workflow definition successfully', () => {
      expect(() => engine.registerDefinition(makeSimpleDef())).not.toThrow();
    });

    it('throws when registering the same id twice', () => {
      engine.registerDefinition(makeSimpleDef());
      expect(() => engine.registerDefinition(makeSimpleDef())).toThrow(
        "WorkflowDefinition 'simple' is already registered",
      );
    });

    it('registers multiple definitions with different ids', () => {
      engine.registerDefinition(makeSimpleDef('def-a'));
      engine.registerDefinition(makeSimpleDef('def-b'));
      expect(engine.getDefinition('def-a')).toBeDefined();
      expect(engine.getDefinition('def-b')).toBeDefined();
    });
  });

  // ── getDefinition ─────────────────────────────────────────────────────────

  describe('getDefinition', () => {
    it('returns the registered definition', () => {
      const def = makeSimpleDef();
      engine.registerDefinition(def);
      expect(engine.getDefinition('simple')).toBe(def);
    });

    it('returns undefined for unknown id', () => {
      expect(engine.getDefinition('nope')).toBeUndefined();
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    beforeEach(() => {
      engine.registerDefinition(makeSimpleDef());
    });

    it('creates an instance in the initial state', () => {
      const instance = engine.create('simple');
      expect(instance.current_state).toBe('idle');
      expect(instance.status).toBe('active');
      expect(instance.history).toHaveLength(0);
    });

    it('assigns a unique id starting with wf_', () => {
      const a = engine.create('simple');
      const b = engine.create('simple');
      expect(a.id).toMatch(/^wf_/);
      expect(b.id).toMatch(/^wf_/);
      expect(a.id).not.toBe(b.id);
    });

    it('merges initial context into the instance', () => {
      const instance = engine.create('simple', { task: 'Do the thing' });
      expect(instance.context.task).toBe('Do the thing');
    });

    it('sets created_at and updated_at timestamps', () => {
      const before = new Date().toISOString();
      const instance = engine.create('simple');
      expect(instance.created_at >= before).toBe(true);
      expect(instance.updated_at).toBe(instance.created_at);
    });

    it('throws for an unregistered definition id', () => {
      expect(() => engine.create('not-registered')).toThrow(
        "WorkflowDefinition 'not-registered' is not registered",
      );
    });

    it('throws when max_active limit is reached', () => {
      const limitEngine = makeEngine({ max_active: 2 });
      limitEngine.registerDefinition(makeSimpleDef());
      limitEngine.create('simple');
      limitEngine.create('simple');
      expect(() => limitEngine.create('simple')).toThrow('max_active limit (2) reached');
    });

    it('executes on_enter actions for the initial state', async () => {
      const handlerFn = vi.fn().mockResolvedValue(undefined);
      const def: WorkflowDefinition = {
        id: 'with-enter',
        name: 'WithEnter',
        version: 1,
        initial_state: 'start',
        terminal_states: [],
        states: {
          start: {
            name: 'start',
            on_enter: [{ type: 'invoke_handler', config: { handler: 'myHandler' } }],
            transitions: [],
          },
        },
      };
      engine.registerDefinition(def);
      engine.registerAction('myHandler', handlerFn);
      engine.create('with-enter');
      // on_enter is fire-and-forget; give the microtask queue a tick
      await Promise.resolve();
      expect(handlerFn).toHaveBeenCalledTimes(1);
    });

    it('emits workflow:created when EventBus is set', () => {
      const emitFn = vi.fn();
      const bus: EventBus = { emit: emitFn };
      engine.setEventBus(bus);
      engine.create('simple');
      expect(emitFn).toHaveBeenCalledOnce();
      const emitted = emitFn.mock.calls[0][0];
      expect(emitted.type).toBe('workflow:created');
    });

    it('does not throw when EventBus is not set', () => {
      expect(() => engine.create('simple')).not.toThrow();
    });
  });

  // ── get ────────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('retrieves an instance by id', () => {
      engine.registerDefinition(makeSimpleDef());
      const instance = engine.create('simple');
      expect(engine.get(instance.id)).toBe(instance);
    });

    it('returns undefined for unknown id', () => {
      expect(engine.get('unknown')).toBeUndefined();
    });
  });

  // ── listActive / listAll ───────────────────────────────────────────────────

  describe('listActive', () => {
    it('returns only active instances', () => {
      engine.registerDefinition(makeSimpleDef());
      const a = engine.create('simple');
      const b = engine.create('simple');
      engine.cancel(b.id, 'test');
      const active = engine.listActive();
      expect(active).toHaveLength(1);
      expect(active[0]!.id).toBe(a.id);
    });

    it('returns empty array when no active instances', () => {
      expect(engine.listActive()).toHaveLength(0);
    });
  });

  describe('listAll', () => {
    it('returns all instances sorted by creation time', () => {
      engine.registerDefinition(makeSimpleDef());
      const a = engine.create('simple');
      const b = engine.create('simple');
      engine.cancel(b.id, 'done');
      const all = engine.listAll();
      expect(all).toHaveLength(2);
      // created_at is ISO string; lexicographic sort matches chronological
      // a was created first, so it must appear at index 0
      expect(all[0]!.id).toBe(a.id);
    });
  });

  // ── sendEvent ──────────────────────────────────────────────────────────────

  describe('sendEvent', () => {
    beforeEach(() => {
      engine.registerDefinition(makeSimpleDef());
    });

    it('returns null when workflow id is unknown', () => {
      const result = engine.sendEvent('no-such-id', makeEvent('session:started'));
      expect(result).toBeNull();
    });

    it('returns null when workflow is not active', () => {
      const instance = engine.create('simple');
      engine.cancel(instance.id, 'manual');
      const result = engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(result).toBeNull();
    });

    it('returns null when no matching transition is found', () => {
      const instance = engine.create('simple');
      const result = engine.sendEvent(instance.id, makeEvent('session:ended'));
      expect(result).toBeNull();
      expect(instance.current_state).toBe('idle');
    });

    it('transitions to target state on matching event', () => {
      const instance = engine.create('simple');
      const transition = engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(transition).not.toBeNull();
      expect(transition!.from_state).toBe('idle');
      expect(transition!.to_state).toBe('active');
      expect(instance.current_state).toBe('active');
    });

    it('records transition in history', () => {
      const instance = engine.create('simple');
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.history).toHaveLength(1);
      const t = instance.history[0]!;
      expect(t.from_state).toBe('idle');
      expect(t.to_state).toBe('active');
      expect(t.event).toBe('session:started');
    });

    it('marks instance as completed when reaching a terminal state', () => {
      const instance = engine.create('simple');
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.status).toBe('completed');
      expect(instance.completed_at).toBeDefined();
    });

    it('multi-step transition through multiple states', () => {
      engine.registerDefinition(makeLinearDef());
      const instance = engine.create('linear');
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.current_state).toBe('middle');
      expect(instance.status).toBe('active');
      engine.sendEvent(instance.id, makeEvent('session:ended'));
      expect(instance.current_state).toBe('done');
      expect(instance.status).toBe('completed');
    });

    it('emits workflow:state_changed via EventBus', () => {
      const emitFn = vi.fn();
      engine.setEventBus({ emit: emitFn });
      const instance = engine.create('simple');
      emitFn.mockClear(); // clear the workflow:created event
      engine.sendEvent(instance.id, makeEvent('session:started'));
      // Expect state_changed + completed (terminal state)
      const types = emitFn.mock.calls.map((c) => (c[0] as { type: string }).type);
      expect(types).toContain('workflow:state_changed');
      expect(types).toContain('workflow:completed');
    });

    it('halts and marks as failed when max_transitions exceeded', () => {
      const tinyEngine = makeEngine({ max_transitions_per_workflow: 1 });
      tinyEngine.registerDefinition(makeLinearDef());
      const instance = tinyEngine.create('linear');
      tinyEngine.sendEvent(instance.id, makeEvent('session:started'));
      // Next event would exceed the limit
      const result = tinyEngine.sendEvent(instance.id, makeEvent('session:ended'));
      expect(result).toBeNull();
      expect(instance.status).toBe('failed');
      expect(instance.error).toMatch(/max transitions/);
    });

    it('uses definition-level max_transitions when set', () => {
      const defWithLimit: WorkflowDefinition = {
        ...makeLinearDef('limited'),
        max_transitions: 1,
      };
      engine.registerDefinition(defWithLimit);
      const instance = engine.create('limited');
      engine.sendEvent(instance.id, makeEvent('session:started'));
      const result = engine.sendEvent(instance.id, makeEvent('session:ended'));
      expect(result).toBeNull();
      expect(instance.status).toBe('failed');
    });

    it('executes on_exit actions when leaving a state', async () => {
      const exitFn = vi.fn().mockResolvedValue(undefined);
      const def: WorkflowDefinition = {
        id: 'exit-test',
        name: 'ExitTest',
        version: 1,
        initial_state: 'start',
        terminal_states: ['end'],
        states: {
          start: {
            name: 'start',
            on_exit: [{ type: 'invoke_handler', config: { handler: 'exitHandler' } }],
            transitions: [{ event: 'session:started' as RuntimeEvent['type'], target: 'end' }],
          },
          end: { name: 'end', transitions: [] },
        },
      };
      engine.registerDefinition(def);
      engine.registerAction('exitHandler', exitFn);
      const instance = engine.create('exit-test');
      engine.sendEvent(instance.id, makeEvent('session:started'));
      await Promise.resolve();
      expect(exitFn).toHaveBeenCalledTimes(1);
    });

    it('executes update_context action and tracks context changes', async () => {
      const def: WorkflowDefinition = {
        id: 'ctx-test',
        name: 'CtxTest',
        version: 1,
        initial_state: 'start',
        terminal_states: ['end'],
        states: {
          start: {
            name: 'start',
            transitions: [
              {
                event: 'session:started' as RuntimeEvent['type'],
                target: 'end',
                actions: [{ type: 'update_context', config: { review_score: 9.5 } }],
              },
            ],
          },
          end: { name: 'end', transitions: [] },
        },
      };
      engine.registerDefinition(def);
      const instance = engine.create('ctx-test');
      engine.sendEvent(instance.id, makeEvent('session:started'));
      // Allow async actions to settle
      await Promise.resolve();
      expect(instance.context.review_score).toBe(9.5);
    });
  });

  // ── Guard Evaluation ────────────────────────────────────────────────────────

  describe('guard evaluation', () => {
    function makeGuardDef(guard: object): WorkflowDefinition {
      return {
        id: 'guard-test',
        name: 'GuardTest',
        version: 1,
        initial_state: 'start',
        terminal_states: ['pass', 'fail'],
        states: {
          start: {
            name: 'start',
            transitions: [
              {
                event: 'session:started' as RuntimeEvent['type'],
                target: 'pass',
                guard: guard as Parameters<WorkflowEngine['registerGuard']>[1] extends never ? never : object,
              } as WorkflowDefinition['states'][string]['transitions'][number],
              {
                event: 'session:started' as RuntimeEvent['type'],
                target: 'fail',
              },
            ],
          },
          pass: { name: 'pass', transitions: [] },
          fail: { name: 'fail', transitions: [] },
        },
      };
    }

    it('fires the first passing guarded transition', () => {
      const def = makeGuardDef({ type: 'expression', expression: 'context.score >= 9' });
      engine.registerDefinition(def);
      const instance = engine.create('guard-test', { score: 10 });
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.current_state).toBe('pass');
    });

    it('falls through to next transition when guard fails', () => {
      const def = makeGuardDef({ type: 'expression', expression: 'context.score >= 9' });
      engine.registerDefinition(def);
      const instance = engine.create('guard-test', { score: 5 });
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.current_state).toBe('fail');
    });

    it('evaluates expression: === operator', () => {
      const def = makeGuardDef({ type: 'expression', expression: 'context.status === active' });
      engine.registerDefinition(def);
      const instance = engine.create('guard-test', { status: 'active' });
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.current_state).toBe('pass');
    });

    it('evaluates expression: !== operator', () => {
      const def = makeGuardDef({ type: 'expression', expression: 'context.status !== active' });
      engine.registerDefinition(def);
      const instance = engine.create('guard-test', { status: 'idle' });
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.current_state).toBe('pass');
    });

    it('evaluates expression with boolean literal true', () => {
      const def = makeGuardDef({ type: 'expression', expression: 'context.enabled === true' });
      engine.registerDefinition(def);
      const instance = engine.create('guard-test', { enabled: true });
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.current_state).toBe('pass');
    });

    it('evaluates expression with null literal', () => {
      const def = makeGuardDef({ type: 'expression', expression: 'context.error === null' });
      engine.registerDefinition(def);
      const instance = engine.create('guard-test', { error: null });
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.current_state).toBe('pass');
    });

    it('evaluates expression comparing two context fields', () => {
      const def = makeGuardDef({
        type: 'expression',
        expression: 'context.fix_attempts < context.max_fix_attempts',
      });
      engine.registerDefinition(def);
      const instance = engine.create('guard-test', { fix_attempts: 1, max_fix_attempts: 3 });
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.current_state).toBe('pass');
    });

    it('returns false for unrecognised expression format and falls through', () => {
      // No operator in expression — evaluateExpression throws, guard returns false
      const def = makeGuardDef({ type: 'expression', expression: 'context.score' });
      engine.registerDefinition(def);
      const instance = engine.create('guard-test', { score: 10 });
      engine.sendEvent(instance.id, makeEvent('session:started'));
      // Guard throws → evaluateGuard catches → returns false → falls through to fail state
      expect(instance.current_state).toBe('fail');
    });

    it('evaluates <= operator correctly', () => {
      const def = makeGuardDef({ type: 'expression', expression: 'context.score <= 5' });
      engine.registerDefinition(def);
      const pass = engine.create('guard-test', { score: 5 });
      engine.sendEvent(pass.id, makeEvent('session:started'));
      expect(pass.current_state).toBe('pass');

      const fail = engine.create('guard-test', { score: 6 });
      engine.sendEvent(fail.id, makeEvent('session:started'));
      expect(fail.current_state).toBe('fail');
    });

    it('evaluates > operator correctly', () => {
      const def = makeGuardDef({ type: 'expression', expression: 'context.score > 5' });
      engine.registerDefinition(def);
      const pass = engine.create('guard-test', { score: 6 });
      engine.sendEvent(pass.id, makeEvent('session:started'));
      expect(pass.current_state).toBe('pass');

      const fail = engine.create('guard-test', { score: 5 });
      engine.sendEvent(fail.id, makeEvent('session:started'));
      expect(fail.current_state).toBe('fail');
    });

    it('handles multiple whitespace around operators', () => {
      const def = makeGuardDef({ type: 'expression', expression: 'context.score  >=  9' });
      engine.registerDefinition(def);
      const instance = engine.create('guard-test', { score: 10 });
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.current_state).toBe('pass');
    });

    it('evaluates function guard that returns true', () => {
      const def = makeGuardDef({ type: 'function', function: 'myGuard' });
      engine.registerDefinition(def);
      engine.registerGuard('myGuard', () => true);
      const instance = engine.create('guard-test');
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.current_state).toBe('pass');
    });

    it('evaluates function guard that returns false', () => {
      const def = makeGuardDef({ type: 'function', function: 'myGuard' });
      engine.registerDefinition(def);
      engine.registerGuard('myGuard', () => false);
      const instance = engine.create('guard-test');
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.current_state).toBe('fail');
    });

    it('returns false and falls through when guard function is not registered', () => {
      const def = makeGuardDef({ type: 'function', function: 'missingGuard' });
      engine.registerDefinition(def);
      const instance = engine.create('guard-test');
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.current_state).toBe('fail');
    });

    it('passes context and event to guard function', () => {
      const guardFn = vi.fn().mockReturnValue(true);
      const def = makeGuardDef({ type: 'function', function: 'spy' });
      engine.registerDefinition(def);
      engine.registerGuard('spy', guardFn);
      const instance = engine.create('guard-test', { score: 9.5 });
      const event = makeEvent('session:started');
      engine.sendEvent(instance.id, event);
      expect(guardFn).toHaveBeenCalledWith(expect.objectContaining({ score: 9.5 }), event);
    });
  });

  // ── cancel ─────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    beforeEach(() => {
      engine.registerDefinition(makeSimpleDef());
    });

    it('sets instance status to cancelled', () => {
      const instance = engine.create('simple');
      engine.cancel(instance.id, 'user request');
      expect(instance.status).toBe('cancelled');
      expect(instance.error).toBe('user request');
    });

    it('is a no-op for unknown workflow id', () => {
      expect(() => engine.cancel('ghost', 'reason')).not.toThrow();
    });

    it('is a no-op when workflow is already completed', () => {
      const instance = engine.create('simple');
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.status).toBe('completed');
      engine.cancel(instance.id, 'after completion');
      expect(instance.status).toBe('completed'); // unchanged
    });

    it('emits workflow:cancelled via EventBus', () => {
      const emitFn = vi.fn();
      engine.setEventBus({ emit: emitFn });
      const instance = engine.create('simple');
      emitFn.mockClear();
      engine.cancel(instance.id, 'test');
      expect(emitFn).toHaveBeenCalledOnce();
      expect((emitFn.mock.calls[0][0] as { type: string }).type).toBe('workflow:cancelled');
    });

    it('removes cancelled instance from listActive', () => {
      const instance = engine.create('simple');
      engine.cancel(instance.id, 'done');
      expect(engine.listActive()).toHaveLength(0);
    });
  });

  // ── registerGuard / registerAction ────────────────────────────────────────

  describe('registerGuard and registerAction', () => {
    it('overwrites an existing guard with the same name', () => {
      engine.registerDefinition(
        (() => {
          const def = makeGuardDef_inline();
          return def;
        })(),
      );
      const firstGuard = vi.fn().mockReturnValue(false);
      const secondGuard = vi.fn().mockReturnValue(true);
      engine.registerGuard('g', firstGuard);
      engine.registerGuard('g', secondGuard); // overwrites first

      function makeGuardDef_inline(): WorkflowDefinition {
        return {
          id: 'g-overwrite',
          name: 'G',
          version: 1,
          initial_state: 'start',
          terminal_states: ['pass'],
          states: {
            start: {
              name: 'start',
              transitions: [
                {
                  event: 'session:started' as RuntimeEvent['type'],
                  target: 'pass',
                  guard: { type: 'function', function: 'g' },
                },
              ],
            },
            pass: { name: 'pass', transitions: [] },
          },
        };
      }

      const instance = engine.create('g-overwrite');
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(firstGuard).not.toHaveBeenCalled();
      expect(secondGuard).toHaveBeenCalled();
    });

    it('registers an action handler that gets called', async () => {
      const actionFn = vi.fn().mockResolvedValue(undefined);
      const def: WorkflowDefinition = {
        id: 'action-test',
        name: 'ActionTest',
        version: 1,
        initial_state: 'start',
        terminal_states: ['end'],
        states: {
          start: {
            name: 'start',
            transitions: [
              {
                event: 'session:started' as RuntimeEvent['type'],
                target: 'end',
                actions: [{ type: 'invoke_handler', config: { handler: 'myAction' } }],
              },
            ],
          },
          end: { name: 'end', transitions: [] },
        },
      };
      engine.registerDefinition(def);
      engine.registerAction('myAction', actionFn);
      const instance = engine.create('action-test');
      engine.sendEvent(instance.id, makeEvent('session:started'));
      await Promise.resolve();
      expect(actionFn).toHaveBeenCalledTimes(1);
    });
  });

  // ── emit_event action ──────────────────────────────────────────────────────

  describe('emit_event action', () => {
    it('emits event via EventBus when configured', async () => {
      const emitFn = vi.fn();
      engine.setEventBus({ emit: emitFn });
      const def: WorkflowDefinition = {
        id: 'emit-action',
        name: 'EmitAction',
        version: 1,
        initial_state: 'start',
        terminal_states: ['end'],
        states: {
          start: {
            name: 'start',
            transitions: [
              {
                event: 'session:started' as RuntimeEvent['type'],
                target: 'end',
                actions: [
                  {
                    type: 'emit_event',
                    config: { event_type: 'system:error' },
                  },
                ],
              },
            ],
          },
          end: { name: 'end', transitions: [] },
        },
      };
      engine.registerDefinition(def);
      const instance = engine.create('emit-action');
      emitFn.mockClear();
      engine.sendEvent(instance.id, makeEvent('session:started'));
      await Promise.resolve();
      const types = emitFn.mock.calls.map((c) => (c[0] as { type: string }).type);
      expect(types).toContain('system:error');
    });

    it('skips emit when EventBus is not set', async () => {
      // No errors thrown, just a no-op
      const def: WorkflowDefinition = {
        id: 'emit-no-bus',
        name: 'EmitNoBus',
        version: 1,
        initial_state: 'start',
        terminal_states: ['end'],
        states: {
          start: {
            name: 'start',
            transitions: [
              {
                event: 'session:started' as RuntimeEvent['type'],
                target: 'end',
                actions: [{ type: 'emit_event', config: { event_type: 'system:error' } }],
              },
            ],
          },
          end: { name: 'end', transitions: [] },
        },
      };
      engine.registerDefinition(def);
      engine.create('emit-no-bus');
      await expect(
        engine.sendEvent(engine.listActive()[0]!.id, makeEvent('session:started')),
      ).not.toBeNull();
    });
  });

  // ── spawn_agent action ─────────────────────────────────────────────────────

  describe('spawn_agent action (placeholder)', () => {
    it('does not throw when spawn_agent action is encountered', async () => {
      const def: WorkflowDefinition = {
        id: 'spawn-test',
        name: 'SpawnTest',
        version: 1,
        initial_state: 'start',
        terminal_states: ['end'],
        states: {
          start: {
            name: 'start',
            transitions: [
              {
                event: 'session:started' as RuntimeEvent['type'],
                target: 'end',
                actions: [{ type: 'spawn_agent', config: {} }],
              },
            ],
          },
          end: { name: 'end', transitions: [] },
        },
      };
      engine.registerDefinition(def);
      const instance = engine.create('spawn-test');
      expect(() => engine.sendEvent(instance.id, makeEvent('session:started'))).not.toThrow();
      await Promise.resolve();
      expect(instance.current_state).toBe('end');
    });
  });

  // ── invoke_handler missing handler ─────────────────────────────────────────

  describe('invoke_handler edge cases', () => {
    it('logs warning but continues when handler name is missing from config', async () => {
      const def: WorkflowDefinition = {
        id: 'no-handler-name',
        name: 'NoHandlerName',
        version: 1,
        initial_state: 'start',
        terminal_states: ['end'],
        states: {
          start: {
            name: 'start',
            transitions: [
              {
                event: 'session:started' as RuntimeEvent['type'],
                target: 'end',
                actions: [{ type: 'invoke_handler', config: {} }], // no handler key
              },
            ],
          },
          end: { name: 'end', transitions: [] },
        },
      };
      engine.registerDefinition(def);
      const instance = engine.create('no-handler-name');
      expect(() => engine.sendEvent(instance.id, makeEvent('session:started'))).not.toThrow();
      await Promise.resolve();
      expect(instance.current_state).toBe('end');
    });

    it('continues after unregistered handler invocation', async () => {
      const def: WorkflowDefinition = {
        id: 'missing-handler',
        name: 'MissingHandler',
        version: 1,
        initial_state: 'start',
        terminal_states: ['end'],
        states: {
          start: {
            name: 'start',
            transitions: [
              {
                event: 'session:started' as RuntimeEvent['type'],
                target: 'end',
                actions: [{ type: 'invoke_handler', config: { handler: 'ghost' } }],
              },
            ],
          },
          end: { name: 'end', transitions: [] },
        },
      };
      engine.registerDefinition(def);
      const instance = engine.create('missing-handler');
      expect(() => engine.sendEvent(instance.id, makeEvent('session:started'))).not.toThrow();
      await Promise.resolve();
      expect(instance.current_state).toBe('end');
    });
  });

  // ── prune ──────────────────────────────────────────────────────────────────

  describe('prune', () => {
    beforeEach(() => {
      engine.registerDefinition(makeSimpleDef());
    });

    it('removes completed instances older than maxAge', () => {
      vi.useFakeTimers();
      const instance = engine.create('simple');
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.status).toBe('completed');

      // Advance time past the 1-hour default maxAge
      vi.advanceTimersByTime(3_600_001);
      const removed = engine.prune();
      expect(removed).toBe(1);
      expect(engine.get(instance.id)).toBeUndefined();
      vi.useRealTimers();
    });

    it('leaves active/running instances untouched', () => {
      vi.useFakeTimers();
      const instance = engine.create('simple'); // stays active (never transitions)
      vi.advanceTimersByTime(3_600_001);
      const removed = engine.prune();
      expect(removed).toBe(0);
      expect(engine.get(instance.id)).toBeDefined();
      vi.useRealTimers();
    });

    it('leaves recently-completed instances untouched (within maxAge)', () => {
      vi.useFakeTimers();
      const instance = engine.create('simple');
      engine.sendEvent(instance.id, makeEvent('session:started'));
      expect(instance.status).toBe('completed');

      // Only advance 30 minutes — within the 1-hour default maxAge
      vi.advanceTimersByTime(1_800_000);
      const removed = engine.prune();
      expect(removed).toBe(0);
      expect(engine.get(instance.id)).toBeDefined();
      vi.useRealTimers();
    });

    it('returns correct count of removed instances', () => {
      vi.useFakeTimers();
      // Complete two instances
      const a = engine.create('simple');
      const b = engine.create('simple');
      engine.sendEvent(a.id, makeEvent('session:started'));
      engine.sendEvent(b.id, makeEvent('session:started'));
      expect(a.status).toBe('completed');
      expect(b.status).toBe('completed');

      vi.advanceTimersByTime(3_600_001);
      const removed = engine.prune();
      expect(removed).toBe(2);
      vi.useRealTimers();
    });

    it('prune with default maxAge parameter works', () => {
      vi.useFakeTimers();
      const instance = engine.create('simple');
      engine.sendEvent(instance.id, makeEvent('session:started'));

      // Just under 1 hour — should NOT be pruned
      vi.advanceTimersByTime(3_599_999);
      expect(engine.prune()).toBe(0);

      // One more millisecond past 1 hour — should be pruned
      vi.advanceTimersByTime(2);
      expect(engine.prune()).toBe(1);
      vi.useRealTimers();
    });
  });

  // ── Multiple concurrent workflows ──────────────────────────────────────────

  describe('multiple concurrent workflows', () => {
    it('manages multiple independent instances simultaneously', () => {
      engine.registerDefinition(makeSimpleDef('def-x'));
      engine.registerDefinition(makeLinearDef('def-y'));

      const x = engine.create('def-x');
      const y = engine.create('def-y');

      engine.sendEvent(x.id, makeEvent('session:started'));
      expect(x.status).toBe('completed');
      expect(y.status).toBe('active'); // y unaffected

      engine.sendEvent(y.id, makeEvent('session:started'));
      expect(y.current_state).toBe('middle');
    });

    it('counts only active instances against max_active', () => {
      const limitEngine = makeEngine({ max_active: 2 });
      limitEngine.registerDefinition(makeSimpleDef());

      const a = limitEngine.create('simple');
      limitEngine.create('simple');

      // Complete one — should free a slot
      limitEngine.sendEvent(a.id, makeEvent('session:started'));
      expect(a.status).toBe('completed');

      // Now there's only 1 active; should be able to create another
      expect(() => limitEngine.create('simple')).not.toThrow();
    });
  });
});
