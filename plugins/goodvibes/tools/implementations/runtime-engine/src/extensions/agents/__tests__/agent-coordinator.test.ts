import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentCoordinator } from '../agent-coordinator.js';
import { BudgetTracker } from '../budget-tracker.js';
import type { EventBus } from '../../events/event-bus.js';
import type { AgentsConfig } from '../../../shared/config.js';

// Mock logger to suppress output
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock shared utils — generateId returns incrementing values so IDs are deterministic
let _idCounter = 0;
vi.mock('../../../shared/utils.js', () => ({
  generateId: () => `id-${++_idCounter}`,
  generateEventId: () => `evt-${++_idCounter}`,
  timestamp: () => Date.now(),
  toErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<AgentsConfig> = {}): AgentsConfig {
  return {
    enabled: true,
    max_concurrent: 5,
    default_budget: 1000,
    session_budget: 0,
    max_review_iterations: 3,
    ...overrides,
  } as AgentsConfig;
}

function makeMockEventBus(): EventBus {
  return {
    emit: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  } as unknown as EventBus;
}

function makeMockBudgetTracker(hasBudget = true): BudgetTracker {
  return {
    hasBudget: vi.fn().mockReturnValue(hasBudget),
    registerAgent: vi.fn(),
    updateAgentStatus: vi.fn(),
    updateAgentBudget: vi.fn(),
    removeAgent: vi.fn(),
    getBudgetSummary: vi.fn().mockReturnValue({
      session: { total_tokens: { input: 0, output: 0, cache: 0 }, total_cost_usd: 0 },
      by_workflow: {},
      by_agent_type: {},
    }),
    updateConfig: vi.fn(),
  } as unknown as BudgetTracker;
}

function makeCoordinator(
  configOverrides: Partial<AgentsConfig> = {},
  hasBudget = true
): { coordinator: AgentCoordinator; eventBus: EventBus; budgetTracker: BudgetTracker } {
  const eventBus = makeMockEventBus();
  const budgetTracker = makeMockBudgetTracker(hasBudget);
  const config = makeConfig(configOverrides);
  const coordinator = new AgentCoordinator(eventBus, budgetTracker, config);
  return { coordinator, eventBus, budgetTracker };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AgentCoordinator', () => {

  beforeEach(() => {
    _idCounter = 0;
  });

  // ─── spawn ──────────────────────────────────────────────────────────────────

  describe('spawn', () => {
    it('registers a new agent and returns its ID', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'write feature' });
      expect(id).toMatch(/^agent_/);
      const agent = coordinator.getAgent(id);
      expect(agent).toBeDefined();
      expect(agent!.type).toBe('engineer');
      expect(agent!.task).toBe('write feature');
      expect(agent!.status).toBe('pending');
    });

    it('uses the provided budget when specified', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'reviewer', task: 'review', budget: 500 });
      const agent = coordinator.getAgent(id);
      expect(agent!.budget.allocated).toBe(500);
    });

    it('falls back to default_budget when budget is not specified', () => {
      const { coordinator } = makeCoordinator({ default_budget: 1234 });
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      const agent = coordinator.getAgent(id);
      expect(agent!.budget.allocated).toBe(1234);
    });

    it('throws when session budget is exhausted', () => {
      const { coordinator } = makeCoordinator({}, false);
      expect(() => coordinator.spawn({ type: 'engineer', task: 'task' })).toThrow(
        /Session budget exhausted/
      );
    });

    it('throws when concurrency limit is reached', () => {
      const { coordinator } = makeCoordinator({ max_concurrent: 1 });
      coordinator.spawn({ type: 'engineer', task: 'first' });
      expect(() => coordinator.spawn({ type: 'engineer', task: 'second' })).toThrow(
        /Concurrency limit reached/
      );
    });

    it('emits agent:spawned event on success', () => {
      const { coordinator, eventBus } = makeCoordinator();
      coordinator.spawn({ type: 'engineer', task: 'test task' });
      expect(eventBus.emit).toHaveBeenCalledTimes(1);
      const emittedEvent = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(emittedEvent.type).toBe('agent:spawned');
    });

    it('registers agent with budget tracker', () => {
      const { coordinator, budgetTracker } = makeCoordinator();
      coordinator.spawn({ type: 'engineer', task: 'task', workflow_id: 'wf-1' });
      expect(budgetTracker.registerAgent).toHaveBeenCalledWith(
        expect.stringMatching(/^agent_/),
        'engineer',
        'wf-1'
      );
    });

    it('creates a workflow chain when workflow_id and workflow_phase are provided', () => {
      const { coordinator } = makeCoordinator();
      coordinator.spawn({ type: 'engineer', task: 'write', workflow_id: 'wf-1', workflow_phase: 'write' });
      const chain = coordinator.getWorkflowChain('wf-1');
      expect(chain).toBeDefined();
      expect(chain!.workflow_id).toBe('wf-1');
      expect(chain!.phases).toHaveLength(1);
      expect(chain!.phases[0].name).toBe('write');
    });

    it('adds agent to existing workflow chain when workflow_id already exists', () => {
      const { coordinator } = makeCoordinator();
      coordinator.spawn({ type: 'engineer', task: 'write', workflow_id: 'wf-1', workflow_phase: 'write' });
      coordinator.spawn({ type: 'reviewer', task: 'review', workflow_id: 'wf-1', workflow_phase: 'review' });
      const chain = coordinator.getWorkflowChain('wf-1');
      expect(chain!.phases).toHaveLength(2);
    });

    it('wires reverse dependency edges', () => {
      const { coordinator } = makeCoordinator();
      const id1 = coordinator.spawn({ type: 'engineer', task: 'first' });
      const id2 = coordinator.spawn({ type: 'engineer', task: 'second', depends_on: [id1] });
      const agent1 = coordinator.getAgent(id1);
      expect(agent1!.depended_by).toContain(id2);
    });

    it('spawned agent has empty depends_on when not specified', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      expect(coordinator.getAgent(id)!.depends_on).toEqual([]);
    });
  });

  // ─── getAgent ────────────────────────────────────────────────────────────────

  describe('getAgent', () => {
    it('returns undefined for unknown agent ID', () => {
      const { coordinator } = makeCoordinator();
      expect(coordinator.getAgent('nonexistent')).toBeUndefined();
    });

    it('returns the agent for a known ID', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'reviewer', task: 'review' });
      expect(coordinator.getAgent(id)).toBeDefined();
    });
  });

  // ─── getAllAgents ─────────────────────────────────────────────────────────────

  describe('getAllAgents', () => {
    it('returns empty array when no agents are registered', () => {
      const { coordinator } = makeCoordinator();
      expect(coordinator.getAllAgents()).toEqual([]);
    });

    it('returns all agents regardless of status', () => {
      const { coordinator } = makeCoordinator();
      const id1 = coordinator.spawn({ type: 'engineer', task: 'task1' });
      const id2 = coordinator.spawn({ type: 'reviewer', task: 'task2' });
      coordinator.updateStatus(id1, 'running');
      coordinator.updateStatus(id1, 'completed');
      const agents = coordinator.getAllAgents();
      expect(agents).toHaveLength(2);
    });
  });

  // ─── listActive ───────────────────────────────────────────────────────────────

  describe('listActive', () => {
    it('returns empty array when no agents are registered', () => {
      const { coordinator } = makeCoordinator();
      expect(coordinator.listActive()).toEqual([]);
    });

    it('includes pending and running agents', () => {
      const { coordinator } = makeCoordinator();
      const id1 = coordinator.spawn({ type: 'engineer', task: 'task1' });
      const id2 = coordinator.spawn({ type: 'engineer', task: 'task2' });
      coordinator.updateStatus(id2, 'running');
      const active = coordinator.listActive();
      expect(active).toHaveLength(2);
    });

    it('excludes completed, failed, and cancelled agents', () => {
      const { coordinator } = makeCoordinator();
      const id1 = coordinator.spawn({ type: 'engineer', task: 'completed' });
      const id2 = coordinator.spawn({ type: 'engineer', task: 'failed' });
      const id3 = coordinator.spawn({ type: 'engineer', task: 'cancelled' });
      coordinator.updateStatus(id1, 'running');
      coordinator.updateStatus(id1, 'completed');
      coordinator.updateStatus(id2, 'running');
      coordinator.updateStatus(id2, 'failed');
      coordinator.updateStatus(id3, 'cancelled');
      expect(coordinator.listActive()).toHaveLength(0);
    });
  });

  // ─── updateStatus ─────────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('transitions from pending to running', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      coordinator.updateStatus(id, 'running');
      expect(coordinator.getAgent(id)!.status).toBe('running');
    });

    it('transitions from running to completed', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      coordinator.updateStatus(id, 'running');
      coordinator.updateStatus(id, 'completed');
      expect(coordinator.getAgent(id)!.status).toBe('completed');
    });

    it('transitions from running to failed', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      coordinator.updateStatus(id, 'running');
      coordinator.updateStatus(id, 'failed');
      expect(coordinator.getAgent(id)!.status).toBe('failed');
    });

    it('transitions from pending to cancelled', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      coordinator.updateStatus(id, 'cancelled');
      expect(coordinator.getAgent(id)!.status).toBe('cancelled');
    });

    it('ignores invalid transition and keeps current status', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      // completed → running is invalid
      coordinator.updateStatus(id, 'running');
      coordinator.updateStatus(id, 'completed');
      coordinator.updateStatus(id, 'running'); // invalid
      expect(coordinator.getAgent(id)!.status).toBe('completed');
    });

    it('ignores updateStatus for unknown agent ID', () => {
      const { coordinator } = makeCoordinator();
      // Should not throw
      expect(() => coordinator.updateStatus('unknown-id', 'running')).not.toThrow();
    });

    it('sets started_at when transitioning to running', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      coordinator.updateStatus(id, 'running');
      expect(coordinator.getAgent(id)!.started_at).toBeDefined();
    });

    it('sets completed_at and duration_ms when transitioning to completed', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      coordinator.updateStatus(id, 'running');
      coordinator.updateStatus(id, 'completed');
      const agent = coordinator.getAgent(id)!;
      expect(agent.completed_at).toBeDefined();
      expect(agent.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('sets completed_at when transitioning to failed', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      coordinator.updateStatus(id, 'running');
      coordinator.updateStatus(id, 'failed', { error: 'something went wrong' });
      expect(coordinator.getAgent(id)!.completed_at).toBeDefined();
    });

    it('updates files_modified and tools_called from details', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      coordinator.updateStatus(id, 'running');
      coordinator.updateStatus(id, 'completed', {
        files_modified: ['src/foo.ts'],
        tools_called: 5,
      });
      const agent = coordinator.getAgent(id)!;
      expect(agent.files_modified).toEqual(['src/foo.ts']);
      expect(agent.tools_called).toBe(5);
    });

    it('emits agent:started event when transitioning to running', () => {
      const { coordinator, eventBus } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      (eventBus.emit as ReturnType<typeof vi.fn>).mockClear();
      coordinator.updateStatus(id, 'running');
      const emitted = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(emitted.type).toBe('agent:started');
    });

    it('emits agent:completed event when transitioning to completed', () => {
      const { coordinator, eventBus } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      coordinator.updateStatus(id, 'running');
      (eventBus.emit as ReturnType<typeof vi.fn>).mockClear();
      coordinator.updateStatus(id, 'completed');
      const emitted = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(emitted.type).toBe('agent:completed');
    });

    it('emits agent:failed event when transitioning to failed', () => {
      const { coordinator, eventBus } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      coordinator.updateStatus(id, 'running');
      (eventBus.emit as ReturnType<typeof vi.fn>).mockClear();
      coordinator.updateStatus(id, 'failed');
      const emitted = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(emitted.type).toBe('agent:failed');
    });

    it('emits agent:cancelled event when transitioning to cancelled', () => {
      const { coordinator, eventBus } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      (eventBus.emit as ReturnType<typeof vi.fn>).mockClear();
      coordinator.updateStatus(id, 'cancelled');
      const emitted = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(emitted.type).toBe('agent:cancelled');
    });

    it('calls budgetTracker.updateAgentStatus on each transition', () => {
      const { coordinator, budgetTracker } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      coordinator.updateStatus(id, 'running');
      expect(budgetTracker.updateAgentStatus).toHaveBeenCalledWith(id, 'running');
    });

    it('resolves dependencies when an agent completes', () => {
      const { coordinator, eventBus } = makeCoordinator();
      const id1 = coordinator.spawn({ type: 'engineer', task: 'first' });
      const id2 = coordinator.spawn({ type: 'engineer', task: 'second', depends_on: [id1] });
      coordinator.updateStatus(id1, 'running');
      (eventBus.emit as ReturnType<typeof vi.fn>).mockClear();
      coordinator.updateStatus(id1, 'completed');
      // Should emit agent:dependency_resolved for id2
      const emittedTypes = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls.map(
        (call: any[]) => (call[0] as { type: string }).type
      );
      expect(emittedTypes).toContain('agent:dependency_resolved');
    });

    it('does not resolve dependencies when the dep agent has not completed', () => {
      const { coordinator, eventBus } = makeCoordinator();
      const id1 = coordinator.spawn({ type: 'engineer', task: 'first' });
      const id2 = coordinator.spawn({ type: 'engineer', task: 'second', depends_on: [id1] });
      coordinator.updateStatus(id1, 'running');
      coordinator.updateStatus(id1, 'failed');
      const emittedTypes = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls.map(
        (call: any[]) => (call[0] as { type: string }).type
      );
      // id1 failed, so id2 dependencies are NOT resolved
      expect(emittedTypes).not.toContain('agent:dependency_resolved');
    });
  });

  // ─── cancel ──────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('marks the agent as cancelled with a reason', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      coordinator.cancel(id, 'user requested');
      expect(coordinator.getAgent(id)!.status).toBe('cancelled');
    });
  });

  // ─── updateBudget ─────────────────────────────────────────────────────────────

  describe('updateBudget', () => {
    it('updates the agent budget snapshot', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      const newBudget = {
        allocated: 1000,
        spent: 200,
        remaining: 800,
        exhausted: false,
        usage_percent: 20,
        input_tokens: 100,
        output_tokens: 100,
        cache_tokens: 0,
        cost_usd: 0.0006,
      };
      coordinator.updateBudget(id, newBudget);
      expect(coordinator.getAgent(id)!.budget).toEqual(newBudget);
    });

    it('calls budgetTracker.updateAgentBudget', () => {
      const { coordinator, budgetTracker } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'task' });
      const newBudget = {
        allocated: 1000, spent: 100, remaining: 900, exhausted: false,
        usage_percent: 10, input_tokens: 50, output_tokens: 50, cache_tokens: 0, cost_usd: 0,
      };
      coordinator.updateBudget(id, newBudget);
      expect(budgetTracker.updateAgentBudget).toHaveBeenCalledWith(id, newBudget);
    });

    it('ignores updateBudget for unknown agent ID', () => {
      const { coordinator } = makeCoordinator();
      expect(() => coordinator.updateBudget('unknown', {
        allocated: 0, spent: 0, remaining: 0, exhausted: false,
        usage_percent: 0, input_tokens: 0, output_tokens: 0, cache_tokens: 0, cost_usd: 0,
      })).not.toThrow();
    });
  });

  // ─── getStats ─────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns zeroed stats when no agents exist', () => {
      const { coordinator } = makeCoordinator();
      const stats = coordinator.getStats();
      expect(stats.total_agents).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.running).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.cancelled).toBe(0);
      expect(stats.active_workflows).toBe(0);
      expect(stats.total_tokens_spent).toBe(0);
      expect(stats.total_cost_usd).toBe(0);
    });

    it('correctly counts agents by status', () => {
      const { coordinator } = makeCoordinator();
      // spawn 3: 1 stays pending, 1 goes running, 1 goes completed
      const id1 = coordinator.spawn({ type: 'engineer', task: 't1' });
      const id2 = coordinator.spawn({ type: 'engineer', task: 't2' });
      const id3 = coordinator.spawn({ type: 'engineer', task: 't3' });
      coordinator.updateStatus(id2, 'running');
      coordinator.updateStatus(id3, 'running');
      coordinator.updateStatus(id3, 'completed');
      const stats = coordinator.getStats();
      expect(stats.total_agents).toBe(3);
      expect(stats.pending).toBe(1);
      expect(stats.running).toBe(1);
      expect(stats.completed).toBe(1);
    });

    it('counts distinct workflow IDs', () => {
      const { coordinator } = makeCoordinator();
      coordinator.spawn({ type: 'engineer', task: 't1', workflow_id: 'wf-a' });
      coordinator.spawn({ type: 'engineer', task: 't2', workflow_id: 'wf-a' });
      coordinator.spawn({ type: 'engineer', task: 't3', workflow_id: 'wf-b' });
      expect(coordinator.getStats().active_workflows).toBe(2);
    });
  });

  // ─── getBudgetSummary ─────────────────────────────────────────────────────────

  describe('getBudgetSummary', () => {
    it('delegates to budgetTracker.getBudgetSummary', () => {
      const { coordinator, budgetTracker } = makeCoordinator();
      coordinator.getBudgetSummary();
      expect(budgetTracker.getBudgetSummary).toHaveBeenCalledTimes(1);
    });
  });

  // ─── updateConfig ─────────────────────────────────────────────────────────────

  describe('updateConfig', () => {
    it('updates coordinator config and delegates to budgetTracker', () => {
      const { coordinator, budgetTracker } = makeCoordinator();
      const newConfig = makeConfig({ max_concurrent: 10, default_budget: 2000 });
      coordinator.updateConfig(newConfig);
      expect(budgetTracker.updateConfig).toHaveBeenCalledWith(newConfig);
    });

    it('respects updated max_concurrent for subsequent spawns', () => {
      const { coordinator } = makeCoordinator({ max_concurrent: 1 });
      coordinator.spawn({ type: 'engineer', task: 'first' });
      // Updating to allow more
      coordinator.updateConfig(makeConfig({ max_concurrent: 10 }));
      expect(() => coordinator.spawn({ type: 'engineer', task: 'second' })).not.toThrow();
    });
  });

  // ─── listByWorkflow ───────────────────────────────────────────────────────────

  describe('listByWorkflow', () => {
    it('returns agents belonging to the given workflow', () => {
      const { coordinator } = makeCoordinator();
      coordinator.spawn({ type: 'engineer', task: 't1', workflow_id: 'wf-x' });
      coordinator.spawn({ type: 'engineer', task: 't2', workflow_id: 'wf-x' });
      coordinator.spawn({ type: 'engineer', task: 't3', workflow_id: 'wf-y' });
      expect(coordinator.listByWorkflow('wf-x')).toHaveLength(2);
      expect(coordinator.listByWorkflow('wf-y')).toHaveLength(1);
    });

    it('returns empty array for unknown workflow', () => {
      const { coordinator } = makeCoordinator();
      expect(coordinator.listByWorkflow('nonexistent')).toEqual([]);
    });
  });

  // ─── getWorkflowChain ─────────────────────────────────────────────────────────

  describe('getWorkflowChain', () => {
    it('returns undefined for unknown workflow', () => {
      const { coordinator } = makeCoordinator();
      expect(coordinator.getWorkflowChain('unknown')).toBeUndefined();
    });

    it('returns chain with initial review_iterations of 0', () => {
      const { coordinator } = makeCoordinator();
      coordinator.spawn({ type: 'engineer', task: 'write', workflow_id: 'wf-1', workflow_phase: 'write' });
      const chain = coordinator.getWorkflowChain('wf-1')!;
      expect(chain.review_iterations).toBe(0);
    });

    it('sets max_review_iterations from config', () => {
      const { coordinator } = makeCoordinator({ max_review_iterations: 5 });
      coordinator.spawn({ type: 'engineer', task: 'write', workflow_id: 'wf-1', workflow_phase: 'write' });
      const chain = coordinator.getWorkflowChain('wf-1')!;
      expect(chain.max_review_iterations).toBe(5);
    });
  });

  // ─── advanceWorkflowPhase ─────────────────────────────────────────────────────

  describe('advanceWorkflowPhase', () => {
    it('does nothing when no chain exists for the workflow', () => {
      const { coordinator } = makeCoordinator();
      // Should not throw
      expect(() => coordinator.advanceWorkflowPhase('nonexistent', 'review')).not.toThrow();
    });

    it('advances to the next phase', () => {
      const { coordinator } = makeCoordinator();
      coordinator.spawn({ type: 'engineer', task: 'write', workflow_id: 'wf-1', workflow_phase: 'write' });
      coordinator.advanceWorkflowPhase('wf-1', 'review');
      const chain = coordinator.getWorkflowChain('wf-1')!;
      const reviewPhase = chain.phases.find((p) => p.name === 'review');
      expect(reviewPhase).toBeDefined();
      expect(reviewPhase!.status).toBe('active');
    });

    it('increments review_iterations when advancing to review phase', () => {
      const { coordinator } = makeCoordinator();
      coordinator.spawn({ type: 'engineer', task: 'write', workflow_id: 'wf-1', workflow_phase: 'write' });
      coordinator.advanceWorkflowPhase('wf-1', 'review');
      expect(coordinator.getWorkflowChain('wf-1')!.review_iterations).toBe(1);
    });

    it('does not increment review_iterations when advancing to non-review phase', () => {
      const { coordinator } = makeCoordinator();
      coordinator.spawn({ type: 'engineer', task: 'write', workflow_id: 'wf-1', workflow_phase: 'write' });
      coordinator.advanceWorkflowPhase('wf-1', 'fix');
      expect(coordinator.getWorkflowChain('wf-1')!.review_iterations).toBe(0);
    });

    it('emits workflow:phase_changed event', () => {
      const { coordinator, eventBus } = makeCoordinator();
      coordinator.spawn({ type: 'engineer', task: 'write', workflow_id: 'wf-1', workflow_phase: 'write' });
      (eventBus.emit as ReturnType<typeof vi.fn>).mockClear();
      coordinator.advanceWorkflowPhase('wf-1', 'review');
      const emitted = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(emitted.type).toBe('workflow:phase_changed');
    });
  });

  // ─── prune ────────────────────────────────────────────────────────────────────

  describe('prune', () => {
    it('removes completed agents older than the threshold', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'old task' });
      coordinator.updateStatus(id, 'running');
      coordinator.updateStatus(id, 'completed');
      // Force completed_at to a very old date
      const agent = coordinator.getAgent(id)!;
      (agent as { completed_at: number }).completed_at = 0;
      const pruned = coordinator.prune(0);
      expect(pruned).toBe(1);
      expect(coordinator.getAgent(id)).toBeUndefined();
    });

    it('removes failed agents older than the threshold', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'failed task' });
      coordinator.updateStatus(id, 'running');
      coordinator.updateStatus(id, 'failed');
      const agent = coordinator.getAgent(id)!;
      (agent as { completed_at: number }).completed_at = 0;
      const pruned = coordinator.prune(0);
      expect(pruned).toBe(1);
    });

    it('preserves recent agents', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'recent' });
      coordinator.updateStatus(id, 'running');
      coordinator.updateStatus(id, 'completed');
      const pruned = coordinator.prune(3_600_000);
      expect(pruned).toBe(0);
      expect(coordinator.getAgent(id)).toBeDefined();
    });

    it('preserves pending and running agents regardless of age', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'running' });
      coordinator.updateStatus(id, 'running');
      const pruned = coordinator.prune(0);
      expect(pruned).toBe(0);
    });

    it('returns 0 when no agents match the threshold', () => {
      const { coordinator } = makeCoordinator();
      expect(coordinator.prune()).toBe(0);
    });

    it('calls budgetTracker.removeAgent for pruned agents', () => {
      const { coordinator, budgetTracker } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'old' });
      coordinator.updateStatus(id, 'running');
      coordinator.updateStatus(id, 'completed');
      const agent = coordinator.getAgent(id)!;
      (agent as { completed_at: number }).completed_at = 0;
      coordinator.prune(0);
      expect(budgetTracker.removeAgent).toHaveBeenCalledWith(id);
    });

    it('cleans up stale dependency references from remaining agents', () => {
      const { coordinator } = makeCoordinator();
      const id1 = coordinator.spawn({ type: 'engineer', task: 'first' });
      const id2 = coordinator.spawn({ type: 'engineer', task: 'second', depends_on: [id1] });
      coordinator.updateStatus(id1, 'running');
      coordinator.updateStatus(id1, 'completed');
      // Force completed_at to old date for id1
      coordinator.getAgent(id1)!.completed_at = 0;
      coordinator.prune(0);
      const agent2 = coordinator.getAgent(id2)!;
      expect(agent2.depends_on).not.toContain(id1);
    });
  });

  // ─── getExecutionPlan ─────────────────────────────────────────────────────────

  describe('getExecutionPlan', () => {
    it('returns an empty plan for a workflow with no agents', () => {
      const { coordinator } = makeCoordinator();
      const plan = coordinator.getExecutionPlan('empty-wf');
      expect(plan.workflow_id).toBe('empty-wf');
      expect(plan.phases).toHaveLength(0);
      expect(plan.critical_path).toEqual([]);
      expect(plan.estimated_tokens).toBe(0);
    });

    it('groups agents by workflow_phase', () => {
      const { coordinator } = makeCoordinator();
      coordinator.spawn({ type: 'engineer', task: 'write', workflow_id: 'wf-1', workflow_phase: 'write', budget: 100 });
      coordinator.spawn({ type: 'reviewer', task: 'review', workflow_id: 'wf-1', workflow_phase: 'review', budget: 50 });
      const plan = coordinator.getExecutionPlan('wf-1');
      expect(plan.phases).toHaveLength(2);
      expect(plan.estimated_tokens).toBe(150);
    });

    it('computes max_parallelism for independent agents', () => {
      const { coordinator } = makeCoordinator();
      coordinator.spawn({ type: 'engineer', task: 'a', workflow_id: 'wf-1', workflow_phase: 'write', budget: 100 });
      coordinator.spawn({ type: 'engineer', task: 'b', workflow_id: 'wf-1', workflow_phase: 'write', budget: 100 });
      const plan = coordinator.getExecutionPlan('wf-1');
      expect(plan.max_parallelism).toBeGreaterThanOrEqual(2);
    });

    it('includes estimated_cost_usd computed from total tokens', () => {
      const { coordinator } = makeCoordinator();
      coordinator.spawn({ type: 'engineer', task: 'write', workflow_id: 'wf-1', budget: 1_000_000 });
      const plan = coordinator.getExecutionPlan('wf-1');
      // ~$3 per 1M tokens
      expect(plan.estimated_cost_usd).toBeCloseTo(3.0, 1);
    });
  });

  // ─── WRFC phase auto-completion on agent completion ───────────────────────────

  describe('Workflow phase auto-completion', () => {
    it('marks the workflow phase as completed when all its agents are done', () => {
      const { coordinator } = makeCoordinator();
      const id = coordinator.spawn({ type: 'engineer', task: 'write', workflow_id: 'wf-1', workflow_phase: 'write' });
      coordinator.updateStatus(id, 'running');
      coordinator.updateStatus(id, 'completed');
      const chain = coordinator.getWorkflowChain('wf-1')!;
      const writePhase = chain.phases.find((p) => p.name === 'write');
      expect(writePhase!.status).toBe('completed');
    });

    it('does not mark phase completed when some agents are still pending', () => {
      const { coordinator } = makeCoordinator();
      const id1 = coordinator.spawn({ type: 'engineer', task: 'write-1', workflow_id: 'wf-1', workflow_phase: 'write' });
      const id2 = coordinator.spawn({ type: 'engineer', task: 'write-2', workflow_id: 'wf-1', workflow_phase: 'write' });
      coordinator.updateStatus(id1, 'running');
      coordinator.updateStatus(id1, 'completed');
      const chain = coordinator.getWorkflowChain('wf-1')!;
      const writePhase = chain.phases.find((p) => p.name === 'write');
      // id2 still pending
      expect(writePhase!.status).toBe('pending');
    });
  });

  // ─── concurrent agent management ──────────────────────────────────────────────

  describe('concurrent agent management', () => {
    it('tracks multiple concurrent agents correctly', () => {
      const { coordinator } = makeCoordinator({ max_concurrent: 10 });
      const ids = Array.from({ length: 5 }, (_, i) =>
        coordinator.spawn({ type: 'engineer', task: `task-${i}` })
      );
      expect(coordinator.getAllAgents()).toHaveLength(5);
      expect(coordinator.listActive()).toHaveLength(5);
      coordinator.updateStatus(ids[0], 'running');
      coordinator.updateStatus(ids[0], 'completed');
      expect(coordinator.listActive()).toHaveLength(4);
    });
  });
});
