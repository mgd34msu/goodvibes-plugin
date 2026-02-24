/**
 * WRFC Handlers Tests
 *
 * Comprehensive unit tests for the three WRFC handler functions registered by
 * registerWRFCHandlers: wrfc_chain_next, wrfc_review_response, wrfc_fix_response.
 *
 * All tests use fully mocked dependencies — no real WorkflowEngine, TriggerRegistry,
 * or DirectiveQueue internals are exercised here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerWRFCHandlers, AUTO_COMPLETE_AGENT_TYPES } from '../wrfc-handlers.js';
import { DirectiveQueue } from '../directive-queue.js';
import { AgentWorkflowMap } from '../agent-workflow-map.js';

// ─── Mock Factories ───────────────────────────────────────────────────────────

/**
 * Creates a minimal TriggerRegistry mock that captures registered handler
 * functions so tests can invoke them directly.
 */
function createMockRegistry() {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  return {
    registerHandler: vi.fn((name: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(name, handler);
    }),
    /** Retrieve a registered handler by name for direct invocation in tests. */
    getHandler: (name: string) => handlers.get(name),
    handlers,
  };
}

/** Typed alias so tests can call handlers with typed args records. */
type HandlerArgs = Record<string, unknown>;

/**
 * Creates a mock WorkflowEngine.
 *
 * @param activeWorkflows - Array of workflow instances returned by listActive().
 */
function createMockWorkflowEngine(
  activeWorkflows: ReturnType<typeof createWorkflow>[] = [],
) {
  return {
    listActive: vi.fn(() => activeWorkflows),
    get: vi.fn((id: string) => activeWorkflows.find((w) => w.id === id) ?? null),
    sendEvent: vi.fn(),
    /** Simulates WorkflowEngine.create(); push to activeWorkflows so tests can inspect. */
    create: vi.fn((
      _definitionId: string,
      _context: Record<string, unknown> = {},
      instanceId?: string,
    ) => {
      const wf = createWorkflow('WRITING', _context);
      if (instanceId) (wf as Record<string, unknown>)['id'] = instanceId;
      activeWorkflows.push(wf);
      return wf;
    }),
  };
}

/**
 * Creates a minimal workflow instance for testing.
 *
 * @param state   - The current_state value (e.g. 'WRITING', 'REVIEWING', 'FIXING').
 * @param context - Additional context properties to merge into the workflow context.
 */
function createWorkflow(
  state: string,
  context: Record<string, unknown> = {},
) {
  return {
    id: `wf_test_${Math.random().toString(36).slice(2)}`,
    current_state: state,
    status: 'active' as const,
    context: {
      max_fix_attempts: 3,
      min_review_score: 9.5,
      fix_attempts: 0,
      ...context,
    },
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('registerWRFCHandlers', () => {
  let registry: ReturnType<typeof createMockRegistry>;
  let directiveQueue: DirectiveQueue;

  beforeEach(() => {
    registry = createMockRegistry();
    directiveQueue = new DirectiveQueue();
  });

  // ─── Registration ──────────────────────────────────────────────────────────

  describe('registration', () => {
    it('registers exactly 4 handlers on the registry', () => {
      registerWRFCHandlers(registry as never, directiveQueue, null, null);
      expect(registry.registerHandler).toHaveBeenCalledTimes(4);
    });

    it('registers wrfc_agent_spawned', () => {
      registerWRFCHandlers(registry as never, directiveQueue, null, null);
      const names = registry.registerHandler.mock.calls.map((c) => c[0]);
      expect(names).toContain('wrfc_agent_spawned');
    });

    it('registers wrfc_chain_next', () => {
      registerWRFCHandlers(registry as never, directiveQueue, null, null);
      const names = registry.registerHandler.mock.calls.map((c) => c[0]);
      expect(names).toContain('wrfc_chain_next');
    });

    it('registers wrfc_review_response', () => {
      registerWRFCHandlers(registry as never, directiveQueue, null, null);
      const names = registry.registerHandler.mock.calls.map((c) => c[0]);
      expect(names).toContain('wrfc_review_response');
    });

    it('registers wrfc_fix_response', () => {
      registerWRFCHandlers(registry as never, directiveQueue, null, null);
      const names = registry.registerHandler.mock.calls.map((c) => c[0]);
      expect(names).toContain('wrfc_fix_response');
    });
  });

  // ─── wrfc_chain_next ───────────────────────────────────────────────────────

  describe('wrfc_chain_next', () => {
    it('does nothing when no workflowEngine is provided', async () => {
      registerWRFCHandlers(registry as never, directiveQueue, null, null);
      const handler = registry.getHandler('wrfc_chain_next')!;

      await handler({} as HandlerArgs);

      expect(directiveQueue.size()).toBe(0);
    });

    it('does nothing when there are no active workflows and no workflow_id', async () => {
      const engine = createMockWorkflowEngine([]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_chain_next')!;

      await handler({} as HandlerArgs);

      expect(directiveQueue.size()).toBe(0);
    });

    it('does nothing when workflow_id resolves to null and no active workflows', async () => {
      const engine = createMockWorkflowEngine([]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_chain_next')!;

      await handler({ workflow_id: 'wf_nonexistent' } as HandlerArgs);

      // listActive returns [] → still skips
      expect(directiveQueue.size()).toBe(0);
    });

    // ── WRITING state ────────────────────────────────────────────────────────

    describe('WRITING state', () => {
      it('enqueues a spawn-reviewer directive when workflow is in WRITING state', async () => {
        const workflow = createWorkflow('WRITING');
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({} as HandlerArgs);

        expect(directiveQueue.size('subagent_stop')).toBe(1);
        const [directive] = directiveQueue.drain('subagent_stop');
        expect(directive!.type).toBe('inject_system_message');
        expect(directive!.source).toBe('wrfc_chain_next');
        expect(directive!.content).toContain('reviewer');
      });

      it('calls sendEvent with wrfc:review_started to advance WRITING→REVIEWING state', async () => {
        const workflow = createWorkflow('WRITING');
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({} as HandlerArgs);

        expect(engine.sendEvent).toHaveBeenCalledOnce();
        const eventArg = engine.sendEvent.mock.calls[0]![1] as Record<string, unknown>;
        expect(eventArg.type).toBe('wrfc:review_started');
      });

      it('includes files_modified in the reviewer task when present', async () => {
        const workflow = createWorkflow('WRITING', {
          files_modified: ['src/foo.ts', 'src/bar.ts'],
        });
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({} as HandlerArgs);

        const [directive] = directiveQueue.drain('subagent_stop');
        expect(directive!.content).toContain('src/foo.ts');
        expect(directive!.content).toContain('src/bar.ts');
      });

      it('uses the explicit workflow_id from args when provided', async () => {
        const workflow = createWorkflow('WRITING');
        const engine = createMockWorkflowEngine([workflow]);
        engine.get.mockReturnValue(workflow as never);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({ workflow_id: workflow.id } as HandlerArgs);

        expect(directiveQueue.size('subagent_stop')).toBe(1);
      });

      it('treats non-string workflow_id as absent and falls back to listActive', async () => {
        const workflow = createWorkflow('WRITING');
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({ workflow_id: 42 } as HandlerArgs);

        expect(directiveQueue.size('subagent_stop')).toBe(1);
      });
    });

    // ── REVIEWING state ──────────────────────────────────────────────────────

    describe('REVIEWING state', () => {
      it('enqueues workflow-complete directive when reviewer score meets threshold', async () => {
        const workflow = createWorkflow('REVIEWING', { min_review_score: 9.5 });
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: {
            agent_type: 'reviewer',
            task_output: 'The code is excellent. SCORE: 9.5/10',
          },
        } as HandlerArgs);

        expect(directiveQueue.size('subagent_stop')).toBe(1);
        const [directive] = directiveQueue.drain('subagent_stop');
        expect(directive!.content).toContain('"action":"complete"');
      });

      it('enqueues workflow-complete when score is exactly the threshold', async () => {
        const workflow = createWorkflow('REVIEWING', { min_review_score: 9.5 });
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: {
            agent_type: 'reviewer',
            task_output: 'SCORE: 9.5/10',
          },
        } as HandlerArgs);

        const [directive] = directiveQueue.drain('subagent_stop');
        expect(directive!.content).toContain('"action":"complete"');
      });

      it('enqueues spawn-fixer directive when reviewer score is below threshold', async () => {
        const workflow = createWorkflow('REVIEWING', { min_review_score: 9.5 });
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: {
            agent_type: 'reviewer',
            task_output: 'Needs improvement. SCORE: 7.0/10',
          },
        } as HandlerArgs);

        expect(directiveQueue.size('subagent_stop')).toBe(1);
        const [directive] = directiveQueue.drain('subagent_stop');
        expect(directive!.content).toContain('engineer');
        expect(directive!.content).not.toContain('"action":"complete"');
      });

      it('calls sendEvent with wrfc:review_completed when score is parsed', async () => {
        const workflow = createWorkflow('REVIEWING', { min_review_score: 9.5 });
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: {
            agent_type: 'reviewer',
            task_output: 'SCORE: 9.5/10',
          },
        } as HandlerArgs);

        expect(engine.sendEvent).toHaveBeenCalledOnce();
        const eventArg = engine.sendEvent.mock.calls[0]![1] as Record<string, unknown>;
        expect(eventArg.type).toBe('wrfc:review_completed');
      });

      it('does not enqueue anything when agent type is not a reviewer', async () => {
        const workflow = createWorkflow('REVIEWING');
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: {
            agent_type: 'engineer',
            task_output: 'SCORE: 9.5/10',
          },
        } as HandlerArgs);

        expect(directiveQueue.size()).toBe(0);
      });

      it('does not enqueue anything when no review score is found in output', async () => {
        const workflow = createWorkflow('REVIEWING');
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: {
            agent_type: 'reviewer',
            task_output: 'The code looks okay but I cannot give a score.',
          },
        } as HandlerArgs);

        expect(directiveQueue.size()).toBe(0);
      });

      it('uses last_assistant_message as primary reviewer output source (FIX-TRACE-B)', async () => {
        const workflow = createWorkflow('REVIEWING', { min_review_score: 9.5 });
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        // last_assistant_message is the actual field SubagentStop populates
        await handler({
          hook_input: {
            agent_type: 'reviewer',
            last_assistant_message: 'Excellent work! SCORE: 10/10',
          },
        } as HandlerArgs);

        const [directive] = directiveQueue.drain('subagent_stop');
        expect(directive!.content).toContain('"action":"complete"');
      });

      it('falls back to hook_input.result when task_output is absent', async () => {
        const workflow = createWorkflow('REVIEWING', { min_review_score: 9.5 });
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: {
            agent_type: 'reviewer',
            result: 'Excellent work. SCORE: 10/10',
          },
        } as HandlerArgs);

        const [directive] = directiveQueue.drain('subagent_stop');
        expect(directive!.content).toContain('"action":"complete"');
      });

      it('uses subagent_type as agent type when agent_type is absent', async () => {
        const workflow = createWorkflow('REVIEWING');
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        // subagent_type contains 'reviewer' → should be treated as reviewer
        await handler({
          hook_input: {
            subagent_type: 'goodvibes:reviewer',
            task_output: 'SCORE: 9.5/10',
          },
        } as HandlerArgs);

        expect(directiveQueue.size('subagent_stop')).toBe(1);
      });

      it('uses default min_review_score of 9.5 when context does not specify it', async () => {
        const workflow = createWorkflow('REVIEWING');
        delete (workflow.context as Record<string, unknown>)['min_review_score'];
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        // Score of 9.5 should meet the default threshold of 9.5
        await handler({
          hook_input: {
            agent_type: 'reviewer',
            task_output: 'SCORE: 9.5/10',
          },
        } as HandlerArgs);

        const [directive] = directiveQueue.drain('subagent_stop');
        expect(directive!.content).toContain('"action":"complete"');
      });
    });

    // ── FIXING state ─────────────────────────────────────────────────────────

    describe('FIXING state', () => {
      it('enqueues spawn-reviewer directive when fix_attempts is below max', async () => {
        const workflow = createWorkflow('FIXING', {
          fix_attempts: 1,
          max_fix_attempts: 3,
        });
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: { agent_type: 'engineer' },
        } as HandlerArgs);

        expect(directiveQueue.size('subagent_stop')).toBe(1);
        const [directive] = directiveQueue.drain('subagent_stop');
        expect(directive!.content).toContain('reviewer');
        expect(directive!.content).not.toContain('"action":"escalate"');
      });

      it('increments fix_attempts in workflow context', async () => {
        const workflow = createWorkflow('FIXING', { fix_attempts: 1, max_fix_attempts: 3 });
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: { agent_type: 'engineer' },
        } as HandlerArgs);

        expect(workflow.context.fix_attempts).toBe(2);
      });

      it('calls sendEvent with wrfc:fix_completed when attempts remain', async () => {
        const workflow = createWorkflow('FIXING', { fix_attempts: 0, max_fix_attempts: 3 });
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: { agent_type: 'engineer' },
        } as HandlerArgs);

        expect(engine.sendEvent).toHaveBeenCalledOnce();
        const eventArg = engine.sendEvent.mock.calls[0]![1] as Record<string, unknown>;
        expect(eventArg.type).toBe('wrfc:fix_completed');
      });

      it('enqueues escalation directive when fix_attempts reaches max', async () => {
        const workflow = createWorkflow('FIXING', {
          fix_attempts: 2,
          max_fix_attempts: 3,
          review_score: 6.0,
        });
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: { agent_type: 'engineer' },
        } as HandlerArgs);

        expect(directiveQueue.size('subagent_stop')).toBe(1);
        const [directive] = directiveQueue.drain('subagent_stop');
        expect(directive!.content).toContain('"action":"escalate"');
        expect(directive!.priority).toBe(30);
      });

      it('uses default max_fix_attempts of 3 when context does not specify it', async () => {
        // fix_attempts starts at 2 (context), after increment → 3 which equals default max 3
        const workflow = createWorkflow('FIXING', { fix_attempts: 2 });
        delete (workflow.context as Record<string, unknown>)['max_fix_attempts'];
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: { agent_type: 'engineer' },
        } as HandlerArgs);

        const [directive] = directiveQueue.drain('subagent_stop');
        expect(directive!.content).toContain('"action":"escalate"');
      });

      it('does not enqueue anything when FIXING but agent is not an engineer', async () => {
        const workflow = createWorkflow('FIXING');
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: { agent_type: 'reviewer' },
        } as HandlerArgs);

        expect(directiveQueue.size()).toBe(0);
      });

      it('uses lastScore of 0 when context review_score is absent', async () => {
        const workflow = createWorkflow('FIXING', {
          fix_attempts: 2,
          max_fix_attempts: 3,
        });
        // Ensure no review_score in context
        delete (workflow.context as Record<string, unknown>)['review_score'];
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: { agent_type: 'engineer' },
        } as HandlerArgs);

        const [directive] = directiveQueue.drain('subagent_stop');
        // Escalation message should contain the score (0)
        expect(directive!.content).toContain('0/10');
      });

      it('calls sendEvent with wrfc:fix_completed when escalating (budget exhausted)', async () => {
        const workflow = createWorkflow('FIXING', { fix_attempts: 2, max_fix_attempts: 3 });
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: { agent_type: 'engineer' },
        } as HandlerArgs);

        // sendEvent MUST be called even on the escalation path so the state machine
        // advances to ESCALATED (via the wrfc:fix_completed event + budget-exhausted guard).
        expect(engine.sendEvent).toHaveBeenCalledWith(
          workflow.id,
          expect.objectContaining({ type: 'wrfc:fix_completed' }),
        );
      });
    });

    // ── Early states (safety-net recovery) ──────────────────────────────────────

    describe('early state recovery', () => {
      it.each(['IDLE', 'GATHERING', 'PLANNING'])(
        'treats %s as WRITING and enqueues a reviewer directive',
        async (state) => {
          const workflow = createWorkflow(state);
          const engine = createMockWorkflowEngine([workflow]);
          registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
          const handler = registry.getHandler('wrfc_chain_next')!;

          await handler({} as HandlerArgs);

          // Early states are treated as WRITING — a reviewer directive should be enqueued
          const directives = directiveQueue.drain('subagent_stop');
          expect(directives.length).toBeGreaterThan(0);
          expect(directives[0]!.content).toContain('"action":"spawn"');
          expect(directives[0]!.content).toContain('reviewer');
        },
      );

      it.each(['IDLE', 'GATHERING', 'PLANNING'])(
        'attempts to advance workflow state machine when in %s',
        async (state) => {
          const workflow = createWorkflow(state);
          const engine = createMockWorkflowEngine([workflow]);
          registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
          const handler = registry.getHandler('wrfc_chain_next')!;

          await handler({} as HandlerArgs);

          // Should have called sendEvent to try advancing the state
          expect(engine.sendEvent).toHaveBeenCalled();
        },
      );
    });

    // ── Terminal / unknown states ──────────────────────────────────────────────

    describe('unhandled states', () => {
      it.each(['COMPLETED', 'CANCELLED', 'ESCALATED'])(
        'does not enqueue anything when workflow state is %s',
        async (state) => {
          const workflow = createWorkflow(state);
          const engine = createMockWorkflowEngine([workflow]);
          registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
          const handler = registry.getHandler('wrfc_chain_next')!;

          await handler({} as HandlerArgs);

          expect(directiveQueue.size()).toBe(0);
        },
      );
    });

    // ── Score parsing ────────────────────────────────────────────────────────

    describe('score parsing', () => {
      it('parses integer score "SCORE: 10/10" as 10', async () => {
        const workflow = createWorkflow('REVIEWING', { min_review_score: 9.5 });
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: {
            agent_type: 'reviewer',
            task_output: 'SCORE: 10/10',
          },
        } as HandlerArgs);

        // Score 10 >= 9.5 → workflow complete
        const [directive] = directiveQueue.drain('subagent_stop');
        expect(directive!.content).toContain('"action":"complete"');
      });

      it('parses decimal score "SCORE: 9.5/10" as 9.5', async () => {
        const workflow = createWorkflow('REVIEWING', { min_review_score: 9.5 });
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: {
            agent_type: 'reviewer',
            task_output: 'SCORE: 9.5/10',
          },
        } as HandlerArgs);

        // Score 9.5 >= 9.5 threshold → workflow complete
        const [directive] = directiveQueue.drain('subagent_stop');
        expect(directive!.content).toContain('"action":"complete"');
      });

      it('returns null (skips) when no SCORE pattern found in output', async () => {
        const workflow = createWorkflow('REVIEWING');
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: {
            agent_type: 'reviewer',
            task_output: 'Looks great!',
          },
        } as HandlerArgs);

        expect(directiveQueue.size()).toBe(0);
      });

      it('returns null (skips) when task_output is undefined', async () => {
        const workflow = createWorkflow('REVIEWING');
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: {
            agent_type: 'reviewer',
          },
        } as HandlerArgs);

        expect(directiveQueue.size()).toBe(0);
      });

      it('is case-insensitive for SCORE pattern', async () => {
        const workflow = createWorkflow('REVIEWING', { min_review_score: 9.5 });
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: {
            agent_type: 'reviewer',
            task_output: 'score: 10/10',
          },
        } as HandlerArgs);

        const [directive] = directiveQueue.drain('subagent_stop');
        expect(directive!.content).toContain('"action":"complete"');
      });
    });
  });

  // ─── wrfc_review_response ──────────────────────────────────────────────────

  describe('wrfc_review_response', () => {
    it('enqueues workflow-complete when review_score >= 10', async () => {
      const workflow = createWorkflow('REVIEWING');
      const engine = createMockWorkflowEngine([workflow]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_review_response')!;

      await handler({
        review_score: 10,
        workflow_id: workflow.id,
      } as HandlerArgs);

      expect(directiveQueue.size('subagent_stop')).toBe(1);
      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('"action":"complete"');
      expect(directive!.source).toBe('wrfc_review_response');
    });

    it('enqueues workflow-complete for score > 10 (out of range but still passes)', async () => {
      const engine = createMockWorkflowEngine([]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_review_response')!;

      await handler({
        review_score: 12,
        workflow_id: 'wf_test',
      } as HandlerArgs);

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('"action":"complete"');
    });

    it('enqueues spawn-fixer when review_score < 10', async () => {
      const workflow = createWorkflow('REVIEWING');
      const engine = createMockWorkflowEngine([workflow]);
      engine.get.mockReturnValue(workflow as never);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_review_response')!;

      await handler({
        review_score: 7,
        workflow_id: workflow.id,
      } as HandlerArgs);

      expect(directiveQueue.size('subagent_stop')).toBe(1);
      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('engineer');
      expect(directive!.content).not.toContain('"action":"complete"');
    });

    it('includes issues summary in fixer task when review_issues is an array', async () => {
      const workflow = createWorkflow('REVIEWING');
      const engine = createMockWorkflowEngine([workflow]);
      engine.get.mockReturnValue(workflow as never);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_review_response')!;

      await handler({
        review_score: 6,
        workflow_id: workflow.id,
        review_issues: [
          { dimension: 'correctness', severity: 'critical', description: 'Bug in auth' },
        ],
      } as HandlerArgs);

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('correctness');
      expect(directive!.content).toContain('Bug in auth');
    });

    it('parses review_issues when provided as a JSON string', async () => {
      const workflow = createWorkflow('REVIEWING');
      const engine = createMockWorkflowEngine([workflow]);
      engine.get.mockReturnValue(workflow as never);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_review_response')!;

      const issuesJson = JSON.stringify([
        { dimension: 'performance', severity: 'major', description: 'Slow query' },
      ]);

      await handler({
        review_score: 5,
        workflow_id: workflow.id,
        review_issues: issuesJson,
      } as HandlerArgs);

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('performance');
      expect(directive!.content).toContain('Slow query');
    });

    it('handles invalid JSON string for review_issues gracefully', async () => {
      const workflow = createWorkflow('REVIEWING');
      const engine = createMockWorkflowEngine([workflow]);
      engine.get.mockReturnValue(workflow as never);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_review_response')!;

      // Should not throw; falls back to empty issues → generic summary
      await expect(
        handler({
          review_score: 5,
          workflow_id: workflow.id,
          review_issues: 'not valid json {{{',
        } as HandlerArgs),
      ).resolves.not.toThrow();

      // Directive should still be enqueued (with generic summary)
      expect(directiveQueue.size('subagent_stop')).toBe(1);
      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('See previous review output');
    });

    it('uses generic summary when review_issues is missing (undefined)', async () => {
      const workflow = createWorkflow('REVIEWING');
      const engine = createMockWorkflowEngine([workflow]);
      engine.get.mockReturnValue(workflow as never);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_review_response')!;

      await handler({
        review_score: 8,
        workflow_id: workflow.id,
      } as HandlerArgs);

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('See previous review output');
    });

    it('falls back to most recent active workflow_id when workflow_id arg is absent', async () => {
      const workflow = createWorkflow('REVIEWING');
      const engine = createMockWorkflowEngine([workflow]);
      engine.get.mockReturnValue(workflow as never);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_review_response')!;

      // No workflow_id provided; score < 10 to trigger spawn-fixer path
      await handler({ review_score: 7 } as HandlerArgs);

      // Should still produce a directive — workflow_id resolved from listActive
      expect(directiveQueue.size('subagent_stop')).toBe(1);
    });

    it('uses "unknown" workflow_id when no active workflows exist and workflow_id is absent', async () => {
      const engine = createMockWorkflowEngine([]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_review_response')!;

      // Score >= 10 to trigger complete path (simpler)
      await handler({ review_score: 10 } as HandlerArgs);

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('unknown');
    });

    it('handles files_modified as an array', async () => {
      const workflow = createWorkflow('REVIEWING');
      const engine = createMockWorkflowEngine([workflow]);
      engine.get.mockReturnValue(workflow as never);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_review_response')!;

      await handler({
        review_score: 6,
        workflow_id: workflow.id,
        files_modified: ['src/auth.ts', 'src/utils.ts'],
      } as HandlerArgs);

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('src/auth.ts');
    });

    it('handles files_modified as a JSON string', async () => {
      const workflow = createWorkflow('REVIEWING');
      const engine = createMockWorkflowEngine([workflow]);
      engine.get.mockReturnValue(workflow as never);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_review_response')!;

      await handler({
        review_score: 6,
        workflow_id: workflow.id,
        files_modified: JSON.stringify(['src/config.ts']),
      } as HandlerArgs);

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('src/config.ts');
    });

    it('handles files_modified as a plain string (non-JSON)', async () => {
      const workflow = createWorkflow('REVIEWING');
      const engine = createMockWorkflowEngine([workflow]);
      engine.get.mockReturnValue(workflow as never);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_review_response')!;

      await handler({
        review_score: 6,
        workflow_id: workflow.id,
        files_modified: 'src/index.ts',
      } as HandlerArgs);

      // Non-JSON string falls back to [rawFiles] (single element array)
      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('src/index.ts');
    });

    it('converts numeric review_score string to number', async () => {
      const engine = createMockWorkflowEngine([]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_review_response')!;

      // Pass score as string — should still be compared as number
      await handler({
        review_score: '10',
        workflow_id: 'wf_test',
      } as HandlerArgs);

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('"action":"complete"');
    });

    it('returns early and enqueues nothing when review_score is missing', async () => {
      const engine = createMockWorkflowEngine([]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_review_response')!;

      // No review_score → NaN guard triggers warn log + early return → no directive enqueued
      await handler({ workflow_id: 'wf_test' } as HandlerArgs);

      expect(directiveQueue.size('subagent_stop')).toBe(0);
    });
  });

  // ─── wrfc_fix_response ─────────────────────────────────────────────────────

  describe('wrfc_fix_response', () => {
    it('enqueues spawn-reviewer when fix_attempts < max_fix_attempts', async () => {
      const workflow = createWorkflow('FIXING');
      const engine = createMockWorkflowEngine([workflow]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_fix_response')!;

      await handler({
        fix_attempts: 1,
        max_fix_attempts: 3,
        workflow_id: workflow.id,
      } as HandlerArgs);

      expect(directiveQueue.size('subagent_stop')).toBe(1);
      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('reviewer');
      expect(directive!.source).toBe('wrfc_fix_response');
    });

    it('enqueues escalation directive when fix_attempts >= max_fix_attempts', async () => {
      const workflow = createWorkflow('FIXING', { review_score: 5.5 });
      const engine = createMockWorkflowEngine([workflow]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_fix_response')!;

      await handler({
        fix_attempts: 3,
        max_fix_attempts: 3,
        workflow_id: workflow.id,
      } as HandlerArgs);

      expect(directiveQueue.size('subagent_stop')).toBe(1);
      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('"action":"escalate"');
      expect(directive!.priority).toBe(30);
    });

    it('includes last review score in escalation message', async () => {
      const workflow = createWorkflow('FIXING', { review_score: 6.5 });
      const engine = createMockWorkflowEngine([workflow]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_fix_response')!;

      await handler({
        fix_attempts: 3,
        max_fix_attempts: 3,
        workflow_id: workflow.id,
      } as HandlerArgs);

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('6.5/10');
    });

    it('uses "unknown" workflow_id when no workflow found', async () => {
      const engine = createMockWorkflowEngine([]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_fix_response')!;

      await handler({
        fix_attempts: 1,
        max_fix_attempts: 3,
      } as HandlerArgs);

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('unknown');
    });

    it('falls back to most recent active workflow when workflow_id not in args', async () => {
      const workflow = createWorkflow('FIXING');
      const engine = createMockWorkflowEngine([workflow]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_fix_response')!;

      // No workflow_id in args
      await handler({
        fix_attempts: 1,
        max_fix_attempts: 3,
      } as HandlerArgs);

      expect(directiveQueue.size('subagent_stop')).toBe(1);
      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain(workflow.id);
    });

    it('includes files_modified in re-review task when present', async () => {
      const workflow = createWorkflow('FIXING', {
        files_modified: ['src/routes.ts'],
      });
      const engine = createMockWorkflowEngine([workflow]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_fix_response')!;

      await handler({
        fix_attempts: 1,
        max_fix_attempts: 3,
        workflow_id: workflow.id,
      } as HandlerArgs);

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('src/routes.ts');
    });

    it('uses default max_fix_attempts of 3 when max_fix_attempts is missing', async () => {
      const workflow = createWorkflow('FIXING');
      const engine = createMockWorkflowEngine([workflow]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_fix_response')!;

      // fix_attempts = 3 (string) should coerce and equal default max of 3 → escalate
      await handler({
        fix_attempts: '3',
        workflow_id: workflow.id,
      } as HandlerArgs);

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('"action":"escalate"');
    });

    it('converts string fix_attempts to number correctly', async () => {
      const workflow = createWorkflow('FIXING');
      const engine = createMockWorkflowEngine([workflow]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_fix_response')!;

      // String '1' < default max 3 → spawn-reviewer path
      await handler({
        fix_attempts: '1',
        max_fix_attempts: '3',
        workflow_id: workflow.id,
      } as HandlerArgs);

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('reviewer');
    });

    it('uses 0 for lastScore when workflow context has no review_score', async () => {
      const workflow = createWorkflow('FIXING');
      // No review_score in context
      delete (workflow.context as Record<string, unknown>)['review_score'];
      const engine = createMockWorkflowEngine([workflow]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_fix_response')!;

      await handler({
        fix_attempts: 3,
        max_fix_attempts: 3,
        workflow_id: workflow.id,
      } as HandlerArgs);

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('0/10');
    });

    it('works when workflowEngine is null (no workflow lookup)', async () => {
      registerWRFCHandlers(registry as never, directiveQueue, null, null);
      const handler = registry.getHandler('wrfc_fix_response')!;

      // Should not throw; workflow resolves to null → 'unknown'
      await expect(
        handler({
          fix_attempts: 1,
          max_fix_attempts: 3,
        } as HandlerArgs),
      ).resolves.not.toThrow();

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('unknown');
    });
  });

  // ─── wrfc_agent_spawned (Decision 2) ──────────────────────────────────────────────

  describe('wrfc_agent_spawned (Decision 2: agent-workflow binding)', () => {
    it('does nothing when agent_id is absent', async () => {
      const engine = createMockWorkflowEngine([]);
      const agentMap = new AgentWorkflowMap();
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null, agentMap);
      const handler = registry.getHandler('wrfc_agent_spawned')!;

      await handler({} as HandlerArgs);

      expect(agentMap.size()).toBe(0);
      expect(engine.create).not.toHaveBeenCalled();
    });

    it('creates a workflow with id wrfc_{agent_id} for a new originator agent', async () => {
      const engine = createMockWorkflowEngine([]);
      const agentMap = new AgentWorkflowMap();
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null, agentMap);
      const handler = registry.getHandler('wrfc_agent_spawned')!;

      await handler({ agent_id: 'agent_123', agent_type: 'goodvibes:engineer' } as HandlerArgs);

      expect(engine.create).toHaveBeenCalledOnce();
      const callArgs = engine.create.mock.calls[0]!;
      expect(callArgs[0]).toBe('wrfc_loop');
      expect(callArgs[2]).toBe('wrfc_agent_123');
    });

    it('stores the agent_id → wrfc_{agent_id} binding in the map', async () => {
      const engine = createMockWorkflowEngine([]);
      const agentMap = new AgentWorkflowMap();
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null, agentMap);
      const handler = registry.getHandler('wrfc_agent_spawned')!;

      await handler({ agent_id: 'agent_abc', agent_type: 'goodvibes:engineer' } as HandlerArgs);

      expect(agentMap.lookup('agent_abc')).toBe('wrfc_agent_abc');
    });

    it('binds a chain agent to an existing workflow_id without creating a new workflow', async () => {
      const engine = createMockWorkflowEngine([]);
      const agentMap = new AgentWorkflowMap();
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null, agentMap);
      const handler = registry.getHandler('wrfc_agent_spawned')!;

      // This agent is a reviewer in an existing chain (workflow_id provided)
      await handler({
        agent_id: 'reviewer_456',
        agent_type: 'goodvibes:reviewer',
        workflow_id: 'wrfc_originator_001',
      } as HandlerArgs);

      // Should NOT create a new workflow
      expect(engine.create).not.toHaveBeenCalled();
      // Should bind the reviewer to the existing workflow
      expect(agentMap.lookup('reviewer_456')).toBe('wrfc_originator_001');
    });

    it('unbinds the agent on workflow creation failure', async () => {
      const engine = createMockWorkflowEngine([]);
      engine.create.mockImplementationOnce(() => { throw new Error('max_active reached'); });
      const agentMap = new AgentWorkflowMap();
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null, agentMap);
      const handler = registry.getHandler('wrfc_agent_spawned')!;

      // Should not throw
      await expect(
        handler({ agent_id: 'agent_fail', agent_type: 'goodvibes:engineer' } as HandlerArgs),
      ).resolves.not.toThrow();

      // Binding should be cleaned up on failure
      expect(agentMap.has('agent_fail')).toBe(false);
    });

    it('works without agentWorkflowMap (still creates workflow)', async () => {
      const engine = createMockWorkflowEngine([]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null, null);
      const handler = registry.getHandler('wrfc_agent_spawned')!;

      await handler({ agent_id: 'agent_nomap', agent_type: 'goodvibes:engineer' } as HandlerArgs);

      // Workflow should be created even without a map
      expect(engine.create).toHaveBeenCalledOnce();
    });

    it('seeds min_review_score and max_fix_attempts from WRFC config into workflow context', async () => {
      const engine = createMockWorkflowEngine([]);
      const agentMap = new AgentWorkflowMap();
      directiveQueue.setWRFCConfig({ min_review_score: 8.0, max_fix_attempts: 5 });
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null, agentMap);
      const handler = registry.getHandler('wrfc_agent_spawned')!;

      await handler({ agent_id: 'agent_cfg', agent_type: 'goodvibes:engineer' } as HandlerArgs);

      expect(engine.create).toHaveBeenCalledOnce();
      const context = engine.create.mock.calls[0]![1] as Record<string, unknown>;
      expect(context['min_review_score']).toBe(8.0);
      expect(context['max_fix_attempts']).toBe(5);
    });

    it('does not seed min_review_score or max_fix_attempts when WRFC config is empty', async () => {
      const engine = createMockWorkflowEngine([]);
      const agentMap = new AgentWorkflowMap();
      // directiveQueue starts with empty WRFC config (default)
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null, agentMap);
      const handler = registry.getHandler('wrfc_agent_spawned')!;

      await handler({ agent_id: 'agent_nocfg', agent_type: 'goodvibes:engineer' } as HandlerArgs);

      expect(engine.create).toHaveBeenCalledOnce();
      const context = engine.create.mock.calls[0]![1] as Record<string, unknown>;
      expect(context['min_review_score']).toBeUndefined();
      expect(context['max_fix_attempts']).toBeUndefined();
    });

    // NOTE: min_review_score: 0 is valid per IPC validation (accepts 0-10).
    // max_fix_attempts: 0 is rejected by IPC validation (requires > 0).
    // This test verifies the seeding guard in isolation — Number.isFinite(0) === true.
    it('seeds min_review_score: 0 and max_fix_attempts: 0 from WRFC config (boundary test)', async () => {
      const engine = createMockWorkflowEngine([]);
      const agentMap = new AgentWorkflowMap();
      directiveQueue.setWRFCConfig({ min_review_score: 0, max_fix_attempts: 0 });
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null, agentMap);
      const handler = registry.getHandler('wrfc_agent_spawned')!;

      await handler({ agent_id: 'agent_zero', agent_type: 'goodvibes:engineer' } as HandlerArgs);

      expect(engine.create).toHaveBeenCalledOnce();
      const context = engine.create.mock.calls[0]![1] as Record<string, unknown>;
      // 0 is a valid finite number — must be seeded even though it's falsy
      expect(context['min_review_score']).toBe(0);
      expect(context['max_fix_attempts']).toBe(0);
    });

    it('falls back to defaults when WRFC config has not been loaded yet', async () => {
      // Do NOT call setWRFCConfig — simulates config:loaded not yet arrived
      const engine = createMockWorkflowEngine([]);
      const agentMap = new AgentWorkflowMap();
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null, agentMap);
      const handler = registry.getHandler('wrfc_agent_spawned')!;

      await handler({ agent_id: 'agent_unloaded', agent_type: 'goodvibes:engineer' } as HandlerArgs);

      expect(engine.create).toHaveBeenCalledOnce();
      const context = engine.create.mock.calls[0]![1] as Record<string, unknown>;
      // Config not loaded yet — context should NOT carry min_review_score or max_fix_attempts.
      // Downstream consumers will use DEFAULT_MIN_REVIEW_SCORE=9.5 and DEFAULT_MAX_FIX_ATTEMPTS=3.
      expect(context['min_review_score']).toBeUndefined();
      expect(context['max_fix_attempts']).toBeUndefined();
    });
  });

  // ─── Decision 2: agent_id-based workflow lookup in wrfc_chain_next ───────────────

  describe('wrfc_chain_next — Decision 2: agent_id-based workflow lookup', () => {
    it('looks up workflow via agent_id in the map, ignoring most-recent-active fallback', async () => {
      const workflowA = createWorkflow('WRITING', {});
      const workflowB = createWorkflow('WRITING', {});
      // workflowB is the most recent active, but we should route to workflowA via agent_id map
      const engine = createMockWorkflowEngine([workflowA, workflowB]);
      const agentMap = new AgentWorkflowMap();
      agentMap.bind('agent_correct', workflowA.id);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null, agentMap);
      const handler = registry.getHandler('wrfc_chain_next')!;

      await handler({
        hook_input: { agent_id: 'agent_correct', agent_type: 'goodvibes:engineer' },
      } as HandlerArgs);

      // The reviewer directive should reference workflowA's id
      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain(workflowA.id);
      expect(directive!.content).not.toContain(workflowB.id);
    });

    it('falls back to explicit workflow_id arg when agent_id is not in the map', async () => {
      const workflow = createWorkflow('WRITING', {});
      const engine = createMockWorkflowEngine([workflow]);
      engine.get.mockReturnValue(workflow as never);
      const agentMap = new AgentWorkflowMap(); // empty map
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null, agentMap);
      const handler = registry.getHandler('wrfc_chain_next')!;

      await handler({
        workflow_id: workflow.id,
        hook_input: { agent_id: 'agent_unknown', agent_type: 'goodvibes:engineer' },
      } as HandlerArgs);

      expect(directiveQueue.size('subagent_stop')).toBe(1);
    });
  });

  // ─── Decision 3: Auto-complete whitelist ──────────────────────────────────────────────────

  describe('wrfc_chain_next — Decision 3: auto-complete whitelist', () => {
    it.each([...AUTO_COMPLETE_AGENT_TYPES])(
      'auto-completes workflow for whitelisted agent type: %s',
      async (agentType) => {
        const workflow = createWorkflow('WRITING', {});
        const engine = createMockWorkflowEngine([workflow]);
        registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
        const handler = registry.getHandler('wrfc_chain_next')!;

        await handler({
          hook_input: { agent_type: agentType, agent_id: 'agent_test' },
        } as HandlerArgs);

        expect(directiveQueue.size('subagent_stop')).toBe(1);
        const [directive] = directiveQueue.drain('subagent_stop');
        // Auto-complete enqueues a 'complete' action, not a 'spawn' action
        expect(directive!.content).toContain('"action":"complete"');
      },
    );

    it('spawns a reviewer (does NOT auto-complete) for goodvibes:engineer', async () => {
      const workflow = createWorkflow('WRITING', {});
      const engine = createMockWorkflowEngine([workflow]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_chain_next')!;

      await handler({
        hook_input: { agent_type: 'goodvibes:engineer', agent_id: 'agent_eng' },
      } as HandlerArgs);

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('reviewer');
      expect(directive!.content).not.toContain('"action":"complete"');
    });

    it('spawns a reviewer (does NOT auto-complete) for goodvibes:reviewer', async () => {
      // A reviewer completing in WRITING state is unusual but should not auto-complete
      const workflow = createWorkflow('WRITING', {});
      const engine = createMockWorkflowEngine([workflow]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_chain_next')!;

      await handler({
        hook_input: { agent_type: 'goodvibes:reviewer', agent_id: 'agent_rev' },
      } as HandlerArgs);

      const [directive] = directiveQueue.drain('subagent_stop');
      expect(directive!.content).toContain('reviewer');
      expect(directive!.content).not.toContain('"action":"complete"');
    });

    it('unbinds the agent_id from the map on auto-complete', async () => {
      const workflow = createWorkflow('WRITING', {});
      const engine = createMockWorkflowEngine([workflow]);
      const agentMap = new AgentWorkflowMap();
      agentMap.bind('agent_bash', workflow.id);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null, agentMap);
      const handler = registry.getHandler('wrfc_chain_next')!;

      await handler({
        hook_input: { agent_type: 'Bash', agent_id: 'agent_bash' },
      } as HandlerArgs);

      // Binding should be cleaned up after auto-complete
      expect(agentMap.has('agent_bash')).toBe(false);
    });

    it('does not auto-complete when workflow state is REVIEWING (only applies to WRITING)', async () => {
      const workflow = createWorkflow('REVIEWING', { min_review_score: 9.5 });
      const engine = createMockWorkflowEngine([workflow]);
      registerWRFCHandlers(registry as never, directiveQueue, engine as never, null);
      const handler = registry.getHandler('wrfc_chain_next')!;

      // Bash agent completing in REVIEWING state: whitelist check is WRITING-only
      // so this skips (agent is not a reviewer)
      await handler({
        hook_input: { agent_type: 'Bash', agent_id: 'agent_bash' },
      } as HandlerArgs);

      // REVIEWING state + non-reviewer → skips (no directive, no auto-complete)
      expect(directiveQueue.size()).toBe(0);
    });

    it('AUTO_COMPLETE_AGENT_TYPES whitelist has expected entries', () => {
      expect(AUTO_COMPLETE_AGENT_TYPES.has('Explore')).toBe(true);
      expect(AUTO_COMPLETE_AGENT_TYPES.has('Plan')).toBe(true);
      expect(AUTO_COMPLETE_AGENT_TYPES.has('Bash')).toBe(true);
      expect(AUTO_COMPLETE_AGENT_TYPES.has('general-purpose')).toBe(true);
      // Goodvibes agents must NOT be in the whitelist
      expect(AUTO_COMPLETE_AGENT_TYPES.has('goodvibes:engineer')).toBe(false);
      expect(AUTO_COMPLETE_AGENT_TYPES.has('goodvibes:reviewer')).toBe(false);
    });
  });
});
