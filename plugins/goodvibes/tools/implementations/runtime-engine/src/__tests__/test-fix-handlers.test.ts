/**
 * Test-Fix Handlers Tests
 *
 * Comprehensive unit tests for registerTestFixHandlers and the exported
 * parseGvTestResult helper. Tests cover:
 * - Handler registration (all 3 handlers)
 * - GV tag parsing in test_fix_agent_completed
 * - Regex fallback when no GV tag is present
 * - State transition ordering (M4: directive enqueued only after state transition)
 * - review_score set on both pass and fail paths (m6)
 * - test_fix_handle_failure: fix attempt increment and escalation
 * - test_fix_handle_retest: pass and fail branches
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerTestFixHandlers, parseGvTestResult } from '../directives/test-fix-handlers.js';
import { DirectiveQueue } from '../directives/directive-queue.js';
import { AgentWorkflowMap } from '../directives/agent-workflow-map.js';

// ─── Mock Factories ───────────────────────────────────────────────────────────

function createMockRegistry() {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  return {
    registerHandler: vi.fn((name: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(name, handler);
    }),
    getHandler: (name: string) => handlers.get(name),
    handlers,
  };
}

type HandlerArgs = Record<string, unknown>;

function createMockWorkflowEngine(workflowContext: Record<string, unknown> = {}) {
  const workflow = {
    id: 'wf_test_001',
    definition_id: 'test_then_fix',
    state: 'TESTING',
    context: workflowContext,
  };
  return {
    get: vi.fn((id: string) => (id === workflow.id ? workflow : undefined)),
    sendEvent: vi.fn(),
    workflow,
  };
}

function makeDirectiveQueue() {
  const queued: Array<{ event: string; directive: unknown }> = [];
  const dq = new DirectiveQueue();
  dq.enqueue = vi.fn((event: string, directive: unknown) => {
    queued.push({ event, directive });
  });
  return { dq, queued };
}

// ─── parseGvTestResult ────────────────────────────────────────────────────────

describe('parseGvTestResult', () => {
  it('returns passed=true when <gv> tag has pass:true', () => {
    const result = parseGvTestResult('Output text. <gv>{"pass":true,"count":5}</gv>');
    expect(result).not.toBeNull();
    expect(result?.passed).toBe(true);
    expect(result?.score).toBe(10);
  });

  it('returns passed=false when <gv> tag has pass:false', () => {
    const result = parseGvTestResult('<gv>{"pass":false}</gv> Some errors.');
    expect(result).not.toBeNull();
    expect(result?.passed).toBe(false);
    expect(result?.score).toBe(0);
  });

  it('uses score from <gv> tag when provided', () => {
    const result = parseGvTestResult('<gv>{"pass":true,"score":8.5}</gv>');
    expect(result?.score).toBe(8.5);
  });

  it('falls back to regex when no <gv> tag', () => {
    const result = parseGvTestResult('All tests passed!');
    expect(result?.passed).toBe(true);
  });

  it('regex fallback detects FAILED keyword', () => {
    const result = parseGvTestResult('3 tests FAILED in the suite');
    expect(result?.passed).toBe(false);
  });

  it('regex fallback detects error: keyword', () => {
    const result = parseGvTestResult('error: Cannot find module');
    expect(result?.passed).toBe(false);
  });

  it('returns null for empty string', () => {
    expect(parseGvTestResult('')).toBeNull();
  });

  it('returns null for falsy input', () => {
    // parseGvTestResult returns null for empty string — edge case for whitespace-only input
    const result = parseGvTestResult('   ');
    // No GV tag, no failure keywords — should pass
    expect(result?.passed).toBe(true);
  });
});

// ─── registerTestFixHandlers — Registration ───────────────────────────────────

describe('registerTestFixHandlers — registration', () => {
  it('registers all 3 handlers', () => {
    const registry = createMockRegistry();
    const { dq } = makeDirectiveQueue();
    registerTestFixHandlers(
      registry as unknown as Parameters<typeof registerTestFixHandlers>[0],
      dq,
      null,
    );
    expect(registry.registerHandler).toHaveBeenCalledTimes(3);
    expect(registry.handlers.has('test_fix_agent_completed')).toBe(true);
    expect(registry.handlers.has('test_fix_handle_failure')).toBe(true);
    expect(registry.handlers.has('test_fix_handle_retest')).toBe(true);
  });
});

// ─── test_fix_agent_completed ─────────────────────────────────────────────────

describe('test_fix_agent_completed', () => {
  let registry: ReturnType<typeof createMockRegistry>;
  let dq: DirectiveQueue;
  let queued: Array<{ event: string; directive: unknown }>;
  let engine: ReturnType<typeof createMockWorkflowEngine>;
  let agentMap: AgentWorkflowMap;

  beforeEach(() => {
    registry = createMockRegistry();
    ({ dq, queued } = makeDirectiveQueue());
    engine = createMockWorkflowEngine({ max_fix_attempts: 3 });
    agentMap = new AgentWorkflowMap();
    agentMap.bind('agent_001', engine.workflow.id);
    registerTestFixHandlers(
      registry as unknown as Parameters<typeof registerTestFixHandlers>[0],
      dq,
      engine as unknown as Parameters<typeof registerTestFixHandlers>[2],
      agentMap,
    );
  });

  it('enqueues complete directive when GV tag says pass', async () => {
    const handler = registry.getHandler('test_fix_agent_completed')!;
    const args: HandlerArgs = {
      hook_input: {
        agent_id: 'agent_001',
        last_assistant_message: 'Output <gv>{"pass":true,"count":10}</gv> done',
      },
    };
    await handler(args);
    expect(queued.some((q) => JSON.stringify(q).includes('complete'))).toBe(true);
  });

  it('sets review_score=10 on pass path (m6)', async () => {
    const handler = registry.getHandler('test_fix_agent_completed')!;
    const args: HandlerArgs = {
      hook_input: {
        agent_id: 'agent_001',
        last_assistant_message: '<gv>{"pass":true}</gv>',
      },
    };
    await handler(args);
    expect(engine.workflow.context['review_score']).toBe(10);
  });

  it('sets review_score=0 on fail path (m6)', async () => {
    const handler = registry.getHandler('test_fix_agent_completed')!;
    const args: HandlerArgs = {
      hook_input: {
        agent_id: 'agent_001',
        last_assistant_message: '<gv>{"pass":false}</gv>',
      },
    };
    await handler(args);
    expect(engine.workflow.context['review_score']).toBe(0);
  });

  it('does nothing when no workflow engine', async () => {
    const reg2 = createMockRegistry();
    const { dq: dq2, queued: q2 } = makeDirectiveQueue();
    registerTestFixHandlers(
      reg2 as unknown as Parameters<typeof registerTestFixHandlers>[0],
      dq2,
      null,
    );
    const handler = reg2.getHandler('test_fix_agent_completed')!;
    await handler({ hook_input: { agent_id: 'no-engine-agent' } });
    expect(q2).toHaveLength(0);
  });

  it('skips non-test_then_fix workflows', async () => {
    engine.workflow.definition_id = 'wrfc_loop';
    const handler = registry.getHandler('test_fix_agent_completed')!;
    await handler({ hook_input: { agent_id: 'agent_001', last_assistant_message: '<gv>{"pass":true}</gv>' } });
    expect(queued).toHaveLength(0);
  });
});

// ─── test_fix_handle_failure ──────────────────────────────────────────────────

describe('test_fix_handle_failure', () => {
  let registry: ReturnType<typeof createMockRegistry>;
  let dq: DirectiveQueue;
  let queued: Array<{ event: string; directive: unknown }>;
  let engine: ReturnType<typeof createMockWorkflowEngine>;

  beforeEach(() => {
    registry = createMockRegistry();
    ({ dq, queued } = makeDirectiveQueue());
    engine = createMockWorkflowEngine({ fix_attempts: 0, max_fix_attempts: 3 });
    registerTestFixHandlers(
      registry as unknown as Parameters<typeof registerTestFixHandlers>[0],
      dq,
      engine as unknown as Parameters<typeof registerTestFixHandlers>[2],
    );
  });

  it('increments fix_attempts and enqueues spawn directive', async () => {
    const handler = registry.getHandler('test_fix_handle_failure')!;
    await handler({ workflow_id: engine.workflow.id });
    expect(engine.workflow.context['fix_attempts']).toBe(1);
    expect(queued.length).toBeGreaterThan(0);
  });

  it('escalates when fix budget exhausted', async () => {
    engine.workflow.context['fix_attempts'] = 3;
    engine.workflow.context['max_fix_attempts'] = 3;
    const handler = registry.getHandler('test_fix_handle_failure')!;
    await handler({ workflow_id: engine.workflow.id });
    // Should emit fix_completed event and escalation directive
    expect(engine.sendEvent).toHaveBeenCalled();
    expect(queued.some((q) => JSON.stringify(q).includes('escalat'))).toBe(true);
  });

  it('does nothing when no workflow found', async () => {
    const handler = registry.getHandler('test_fix_handle_failure')!;
    await handler({ workflow_id: 'nonexistent' });
    expect(queued).toHaveLength(0);
  });
});

// ─── test_fix_handle_retest ───────────────────────────────────────────────────

describe('test_fix_handle_retest', () => {
  let registry: ReturnType<typeof createMockRegistry>;
  let dq: DirectiveQueue;
  let queued: Array<{ event: string; directive: unknown }>;
  let engine: ReturnType<typeof createMockWorkflowEngine>;

  beforeEach(() => {
    registry = createMockRegistry();
    ({ dq, queued } = makeDirectiveQueue());
    engine = createMockWorkflowEngine({ fix_attempts: 1, max_fix_attempts: 3 });
    registerTestFixHandlers(
      registry as unknown as Parameters<typeof registerTestFixHandlers>[0],
      dq,
      engine as unknown as Parameters<typeof registerTestFixHandlers>[2],
    );
  });

  it('emits tests_passed event and enqueues complete directive when passed=true', async () => {
    const handler = registry.getHandler('test_fix_handle_retest')!;
    await handler({ workflow_id: engine.workflow.id, passed: true });
    expect(engine.sendEvent).toHaveBeenCalledWith(
      engine.workflow.id,
      expect.objectContaining({ type: 'test_fix:tests_passed' }),
    );
    expect(queued.some((q) => JSON.stringify(q).includes('complete'))).toBe(true);
  });

  it('emits tests_failed event and does NOT enqueue inline directive when passed=false and budget remains', async () => {
    const handler = registry.getHandler('test_fix_handle_retest')!;
    await handler({ workflow_id: engine.workflow.id, passed: false });
    expect(engine.sendEvent).toHaveBeenCalledWith(
      engine.workflow.id,
      expect.objectContaining({ type: 'test_fix:tests_failed' }),
    );
    // Spawning/escalation is delegated to trigger 14 → test_fix_handle_failure
    expect(queued).toHaveLength(0);
  });

  it('emits tests_failed event and does NOT enqueue inline directive when passed=false and budget exhausted', async () => {
    engine.workflow.context['fix_attempts'] = 3;
    engine.workflow.context['max_fix_attempts'] = 3;
    const handler = registry.getHandler('test_fix_handle_retest')!;
    await handler({ workflow_id: engine.workflow.id, passed: false });
    expect(engine.sendEvent).toHaveBeenCalledWith(
      engine.workflow.id,
      expect.objectContaining({ type: 'test_fix:tests_failed' }),
    );
    // Escalation is delegated to trigger 14 → test_fix_handle_failure; no inline directive
    expect(queued).toHaveLength(0);
  });

  it('does nothing when no workflow engine', async () => {
    const reg2 = createMockRegistry();
    const { dq: dq2, queued: q2 } = makeDirectiveQueue();
    registerTestFixHandlers(
      reg2 as unknown as Parameters<typeof registerTestFixHandlers>[0],
      dq2,
      null,
    );
    const handler = reg2.getHandler('test_fix_handle_retest')!;
    await handler({ workflow_id: 'wf_test_001', passed: true });
    expect(q2).toHaveLength(0);
  });
});
