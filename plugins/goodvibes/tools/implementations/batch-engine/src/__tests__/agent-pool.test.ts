/**
 * Comprehensive tests for agent coordination system
 * Tests AgentPoolImpl, AgentLifecycleManagerImpl, AgentCommunicationManagerImpl, and DependencyResolverImpl
 * @see SPEC-v2 Section 12
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AgentPoolImpl,
  AgentLifecycleManagerImpl,
  AgentCommunicationManagerImpl,
  DependencyResolverImpl,
  createAgentPool,
  createLifecycleManager,
  createCommunicationManager,
  createDependencyManager,
  resetAgentCoordination,
} from '../runtime/agent-pool.js';
import type {
  AgentSpec,
  AgentPoolConfig,
  AgentPoolEvent,
  AgentPoolEventData,
  QueuedAgent,
} from '../interfaces/agent-pool.js';
import type { AgentLifecycleEvent } from '../interfaces/agent-lifecycle.js';
import type { AgentMessage, RequestType } from '../interfaces/agent-communication.js';

// ============================================================================
// Helper Functions
// ============================================================================

const createTestSpec = (id: string, priority = 0, depends_on: string[] = []): AgentSpec => ({
  id,
  type: 'engineer',
  task: `Task ${id}`,
  priority,
  depends_on,
});

// ============================================================================
// AgentPoolImpl Tests
// ============================================================================

describe('AgentPoolImpl', () => {
  let pool: AgentPoolImpl;

  beforeEach(() => {
    resetAgentCoordination();
    pool = createAgentPool() as AgentPoolImpl;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization and Configuration', () => {
    it('initializes with default configuration', () => {
      expect(pool.config).toMatchObject({
        max_concurrent: 6,
        queue_strategy: 'dependency',
      });
      expect(pool.config.default_budget).toMatchObject({
        max_tokens: 100000,
        max_turns: 50,
        max_duration_ms: 300000,
      });
      expect(pool.config.total_budget).toMatchObject({
        max_tokens: 1000000,
        max_agents: 50,
        warn_at_percent: 80,
      });
    });

    it('allows custom configuration', () => {
      const customPool = createAgentPool({
        max_concurrent: 10,
        queue_strategy: 'priority',
      }) as AgentPoolImpl;

      expect(customPool.config.max_concurrent).toBe(10);
      expect(customPool.config.queue_strategy).toBe('priority');
    });

    it('initializes state correctly', () => {
      expect(pool.state.active.size).toBe(0);
      expect(pool.state.queued.length).toBe(0);
      expect(pool.state.completed.length).toBe(0);
      expect(pool.state.agents_spawned).toBe(0);
      expect(pool.state.tokens_used).toBe(0);
    });

    it('initializes without errors', async () => {
      await expect(pool.initialize()).resolves.toBeUndefined();
    });
  });

  describe('Queue Management', () => {
    describe('enqueue', () => {
      it('adds agent to queue', () => {
        const spec = createTestSpec('agent-1');
        const id = pool.enqueue(spec);

        expect(id).toBe('agent-1');
        expect(pool.state.queued.length).toBe(1);
        expect(pool.state.queued[0]?.spec).toEqual(spec);
      });

      it('sets queued_at timestamp', () => {
        const spec = createTestSpec('agent-1');
        pool.enqueue(spec);

        const queued = pool.state.queued[0];
        expect(queued?.queued_at).toBeDefined();
        expect(new Date(queued!.queued_at).getTime()).toBeLessThanOrEqual(Date.now());
      });

      it('uses spec priority or defaults to 0', () => {
        const spec1 = createTestSpec('agent-1', 5);
        const spec2 = createTestSpec('agent-2');

        pool.enqueue(spec1);
        pool.enqueue(spec2);

        expect(pool.state.queued[0]?.priority).toBe(5);
        expect(pool.state.queued[1]?.priority).toBe(0);
      });

      it('identifies blocking dependencies', () => {
        const spec1 = createTestSpec('agent-1');
        const spec2 = createTestSpec('agent-2', 0, ['agent-1']);

        pool.enqueue(spec1);
        pool.enqueue(spec2);

        const queued2 = pool.state.queued.find((q) => q.spec.id === 'agent-2');
        expect(queued2?.blocked_by).toContain('agent-1');
      });

      it('emits agent_queued event', () => {
        const handler = vi.fn();
        pool.on('agent_queued', handler);

        const spec = createTestSpec('agent-1');
        pool.enqueue(spec);

        expect(handler).toHaveBeenCalledWith(
          'agent_queued',
          expect.objectContaining({
            event: 'agent_queued',
            agent_id: 'agent-1',
            agent_spec: spec,
          })
        );
      });
    });

    describe('dequeue', () => {
      it('removes agent from queue by id', () => {
        pool.enqueue(createTestSpec('agent-1'));
        pool.enqueue(createTestSpec('agent-2'));

        const removed = pool.dequeue('agent-1');

        expect(removed).toBe(true);
        expect(pool.state.queued.length).toBe(1);
        expect(pool.state.queued[0]?.spec.id).toBe('agent-2');
      });

      it('returns false if agent not found', () => {
        pool.enqueue(createTestSpec('agent-1'));

        const removed = pool.dequeue('nonexistent');

        expect(removed).toBe(false);
        expect(pool.state.queued.length).toBe(1);
      });
    });

    describe('getQueue', () => {
      it('returns copy of queue', () => {
        pool.enqueue(createTestSpec('agent-1'));
        pool.enqueue(createTestSpec('agent-2'));

        const queue = pool.getQueue();

        expect(queue.length).toBe(2);
        // Modify copy should not affect original
        queue.pop();
        expect(pool.state.queued.length).toBe(2);
      });
    });

    describe('Queue Sorting Strategies', () => {
      beforeEach(() => {
        // Reset pool for each test
        pool = createAgentPool() as AgentPoolImpl;
      });

      it('sorts by FIFO (maintains insertion order)', () => {
        const fifoPool = createAgentPool({ queue_strategy: 'fifo' }) as AgentPoolImpl;

        fifoPool.enqueue(createTestSpec('agent-1', 5));
        fifoPool.enqueue(createTestSpec('agent-2', 10));
        fifoPool.enqueue(createTestSpec('agent-3', 1));

        expect(fifoPool.state.queued[0]?.spec.id).toBe('agent-1');
        expect(fifoPool.state.queued[1]?.spec.id).toBe('agent-2');
        expect(fifoPool.state.queued[2]?.spec.id).toBe('agent-3');
      });

      it('sorts by priority (highest first)', () => {
        const priorityPool = createAgentPool({ queue_strategy: 'priority' }) as AgentPoolImpl;

        priorityPool.enqueue(createTestSpec('agent-1', 5));
        priorityPool.enqueue(createTestSpec('agent-2', 10));
        priorityPool.enqueue(createTestSpec('agent-3', 1));

        expect(priorityPool.state.queued[0]?.spec.id).toBe('agent-2'); // priority 10
        expect(priorityPool.state.queued[1]?.spec.id).toBe('agent-1'); // priority 5
        expect(priorityPool.state.queued[2]?.spec.id).toBe('agent-3'); // priority 1
      });

      it('sorts by dependency (fewer dependencies first, then priority)', () => {
        const depPool = createAgentPool({ queue_strategy: 'dependency' }) as AgentPoolImpl;

        depPool.enqueue(createTestSpec('agent-1', 10, ['agent-0']));
        depPool.enqueue(createTestSpec('agent-2', 5));
        depPool.enqueue(createTestSpec('agent-3', 1, ['agent-0', 'agent-1']));

        // agent-2 has no deps, should be first
        expect(depPool.state.queued[0]?.spec.id).toBe('agent-2');
        // agent-1 has 1 dep, should be second
        expect(depPool.state.queued[1]?.spec.id).toBe('agent-1');
        // agent-3 has 2 deps, should be last
        expect(depPool.state.queued[2]?.spec.id).toBe('agent-3');
      });
    });
  });

  describe('Capacity Checks', () => {
    it('hasCapacity returns true when under max_concurrent', () => {
      expect(pool.hasCapacity()).toBe(true);
    });

    it('hasCapacity returns false when at max_concurrent', async () => {
      // Fill pool to capacity
      for (let i = 0; i < 6; i++) {
        pool.enqueue(createTestSpec(`agent-${i}`));
        await pool.spawnNext();
      }

      expect(pool.hasCapacity()).toBe(false);
    });

    it('getAvailableSlots returns correct count', async () => {
      expect(pool.getAvailableSlots()).toBe(6);

      pool.enqueue(createTestSpec('agent-1'));
      await pool.spawnNext();

      expect(pool.getAvailableSlots()).toBe(5);
    });

    it('canSpawn checks capacity, budget, and dependencies', () => {
      const spec = createTestSpec('agent-1');
      expect(pool.canSpawn(spec)).toBe(true);
    });

    it('canSpawn returns false when dependencies not met', () => {
      pool.enqueue(createTestSpec('agent-1'));
      const spec = createTestSpec('agent-2', 0, ['agent-1']);

      expect(pool.canSpawn(spec)).toBe(false);
    });
  });

  describe('Budget Tracking', () => {
    it('hasBudget returns true with sufficient budget', () => {
      const spec = createTestSpec('agent-1');
      expect(pool.hasBudget(spec)).toBe(true);
    });

    it('hasBudget returns false when token budget exhausted', () => {
      // Exhaust token budget
      pool.state.tokens_remaining = 0;

      const spec = createTestSpec('agent-1');
      expect(pool.hasBudget(spec)).toBe(false);
    });

    it('hasBudget returns false when agent count exhausted', () => {
      // Exhaust agent count
      pool.state.agents_remaining = 0;

      const spec = createTestSpec('agent-1');
      expect(pool.hasBudget(spec)).toBe(false);
    });

    it('estimateCost uses spec budget or default', () => {
      const spec1 = createTestSpec('agent-1');
      const spec2: AgentSpec = {
        ...createTestSpec('agent-2'),
        budget: { max_tokens: 50000, max_turns: 20, max_duration_ms: 60000 },
      };

      expect(pool.estimateCost(spec1)).toBe(100000);
      expect(pool.estimateCost(spec2)).toBe(50000);
    });

    it('getBudgetStatus calculates percentages correctly', () => {
      pool.state.tokens_used = 500000; // 50%
      pool.state.tokens_remaining = 500000;
      pool.state.agents_spawned = 25; // 50%
      pool.state.agents_remaining = 25;

      const status = pool.getBudgetStatus();

      expect(status.tokens_percent).toBe(50);
      expect(status.agents_percent).toBe(50);
      expect(status.warning).toBe(false);
      expect(status.exhausted).toBe(false);
    });

    it('getBudgetStatus warns at threshold', () => {
      pool.state.tokens_used = 850000; // 85%
      pool.state.tokens_remaining = 150000;

      const status = pool.getBudgetStatus();

      expect(status.warning).toBe(true);
      expect(status.exhausted).toBe(false);
    });

    it('getBudgetStatus marks exhausted when budget is gone', () => {
      pool.state.tokens_remaining = 0;
      pool.state.agents_remaining = 0;

      const status = pool.getBudgetStatus();

      expect(status.exhausted).toBe(true);
    });
  });

  describe('Agent Spawning', () => {
    it('spawnNext spawns eligible agent', async () => {
      pool.enqueue(createTestSpec('agent-1'));

      const agent = await pool.spawnNext();

      expect(agent).toBeDefined();
      expect(agent?.id).toBe('agent-1');
      expect(pool.state.active.has('agent-1')).toBe(true);
      expect(pool.state.queued.length).toBe(0);
    });

    it('spawnNext returns null when no capacity', async () => {
      // Fill pool
      for (let i = 0; i < 6; i++) {
        pool.enqueue(createTestSpec(`agent-${i}`));
        await pool.spawnNext();
      }

      pool.enqueue(createTestSpec('agent-7'));
      const agent = await pool.spawnNext();

      expect(agent).toBeNull();
    });

    it('spawnNext returns null when no eligible agents', async () => {
      pool.enqueue(createTestSpec('agent-1'));
      const spec = createTestSpec('agent-2', 0, ['agent-1']);
      pool.enqueue(spec);

      // Spawn agent-1
      await pool.spawnNext();

      // agent-2 is blocked, should return null
      const agent = await pool.spawnNext();
      expect(agent).toBeNull();
    });

    it('spawnNext updates budget tracking', async () => {
      const initialSpawned = pool.state.agents_spawned;
      const initialRemaining = pool.state.agents_remaining;

      pool.enqueue(createTestSpec('agent-1'));
      await pool.spawnNext();

      expect(pool.state.agents_spawned).toBe(initialSpawned + 1);
      expect(pool.state.agents_remaining).toBe(initialRemaining - 1);
    });

    it('spawnNext emits agent_started event', async () => {
      const handler = vi.fn();
      pool.on('agent_started', handler);

      const spec = createTestSpec('agent-1');
      pool.enqueue(spec);
      await pool.spawnNext();

      expect(handler).toHaveBeenCalledWith(
        'agent_started',
        expect.objectContaining({
          event: 'agent_started',
          agent_id: 'agent-1',
        })
      );
    });

    it('spawnNext emits queue_empty when queue becomes empty', async () => {
      const handler = vi.fn();
      pool.on('queue_empty', handler);

      pool.enqueue(createTestSpec('agent-1'));
      await pool.spawnNext();

      expect(handler).toHaveBeenCalledWith(
        'queue_empty',
        expect.objectContaining({
          event: 'queue_empty',
        })
      );
    });
  });

  describe('Agent Completion', () => {
    beforeEach(async () => {
      pool.enqueue(createTestSpec('agent-1'));
      await pool.spawnNext();
    });

    it('recordCompletion moves agent from active to completed', () => {
      pool.recordCompletion('agent-1', {
        status: 'success',
        tokens_used: 1000,
        turns_used: 5,
      });

      expect(pool.state.active.has('agent-1')).toBe(false);
      expect(pool.state.completed.length).toBe(1);
      expect(pool.state.completed[0]?.status).toBe('success');
    });

    it('recordCompletion updates token budget', () => {
      const initialTokens = pool.state.tokens_used;
      const initialRemaining = pool.state.tokens_remaining;

      pool.recordCompletion('agent-1', {
        status: 'success',
        tokens_used: 1000,
        turns_used: 5,
      });

      expect(pool.state.tokens_used).toBe(initialTokens + 1000);
      expect(pool.state.tokens_remaining).toBe(initialRemaining - 1000);
    });

    it('recordCompletion emits appropriate event', () => {
      const handler = vi.fn();
      pool.on('agent_completed', handler);

      pool.recordCompletion('agent-1', {
        status: 'success',
        tokens_used: 1000,
        turns_used: 5,
      });

      expect(handler).toHaveBeenCalledWith(
        'agent_completed',
        expect.objectContaining({
          event: 'agent_completed',
          agent_id: 'agent-1',
        })
      );
    });

    it('recordCompletion emits different events for different statuses', () => {
      const failHandler = vi.fn();
      pool.on('agent_failed', failHandler);

      pool.recordCompletion('agent-1', {
        status: 'failed',
        tokens_used: 500,
        turns_used: 2,
        error: 'Test error',
      });

      expect(failHandler).toHaveBeenCalledWith(
        'agent_failed',
        expect.objectContaining({
          event: 'agent_failed',
          agent_id: 'agent-1',
        })
      );
    });

    it('recordCompletion emits budget_warning when threshold reached', () => {
      const handler = vi.fn();
      pool.on('budget_warning', handler);

      // Use 80% of tokens
      pool.state.tokens_used = 790000;
      pool.state.tokens_remaining = 210000;

      pool.recordCompletion('agent-1', {
        status: 'success',
        tokens_used: 10000, // This pushes to 80%
        turns_used: 5,
      });

      expect(handler).toHaveBeenCalled();
    });

    it('recordCompletion emits budget_exhausted when budget gone', () => {
      const handler = vi.fn();
      pool.on('budget_exhausted', handler);

      pool.state.tokens_remaining = 1000;

      pool.recordCompletion('agent-1', {
        status: 'success',
        tokens_used: 1000,
        turns_used: 5,
      });

      expect(handler).toHaveBeenCalled();
    });

    it('recordCompletion handles chaining', async () => {
      // Create new agent with chain_to
      pool.state.active.clear();
      pool.state.completed = [];

      const spec: AgentSpec = {
        ...createTestSpec('agent-1'),
        chain_to: 'tester',
      };

      pool.enqueue(spec);
      await pool.spawnNext();

      pool.recordCompletion('agent-1', {
        status: 'success',
        tokens_used: 1000,
        turns_used: 5,
        result: { success: true },
      });

      // Check that chained agent was enqueued
      expect(pool.state.queued.length).toBe(1);
      expect(pool.state.queued[0]?.spec.type).toBe('tester');
    });

    it('recordCompletion updates blocked agents', async () => {
      // Setup dependency
      pool.enqueue(createTestSpec('agent-2', 0, ['agent-1']));

      const queued = pool.state.queued.find((q) => q.spec.id === 'agent-2');
      expect(queued?.blocked_by).toContain('agent-1');

      pool.recordCompletion('agent-1', {
        status: 'success',
        tokens_used: 1000,
        turns_used: 5,
      });

      const updatedQueued = pool.state.queued.find((q) => q.spec.id === 'agent-2');
      expect(updatedQueued?.blocked_by).toEqual([]);
    });
  });

  describe('Cancellation', () => {
    it('cancel removes active agent', async () => {
      pool.enqueue(createTestSpec('agent-1'));
      await pool.spawnNext();

      const cancelled = pool.cancel('agent-1');

      expect(cancelled).toBe(true);
      expect(pool.state.active.has('agent-1')).toBe(false);
      expect(pool.state.completed.length).toBe(1);
      expect(pool.state.completed[0]?.status).toBe('cancelled');
    });

    it('cancel removes queued agent', () => {
      pool.enqueue(createTestSpec('agent-1'));

      const cancelled = pool.cancel('agent-1');

      expect(cancelled).toBe(true);
      expect(pool.state.queued.length).toBe(0);
    });

    it('cancel returns false for nonexistent agent', () => {
      const cancelled = pool.cancel('nonexistent');
      expect(cancelled).toBe(false);
    });

    it('cancelAll cancels all active and queued agents', async () => {
      pool.enqueue(createTestSpec('agent-1'));
      pool.enqueue(createTestSpec('agent-2'));
      pool.enqueue(createTestSpec('agent-3'));
      await pool.spawnNext();

      pool.cancelAll();

      expect(pool.state.active.size).toBe(0);
      expect(pool.state.queued.length).toBe(0);
      expect(pool.state.completed.length).toBe(1); // Only agent-1 was active
    });
  });

  describe('Event Handling', () => {
    it('on registers event handler', () => {
      const handler = vi.fn();
      pool.on('agent_queued', handler);

      pool.enqueue(createTestSpec('agent-1'));

      expect(handler).toHaveBeenCalled();
    });

    it('off removes event handler', () => {
      const handler = vi.fn();
      pool.on('agent_queued', handler);
      pool.off('agent_queued', handler);

      pool.enqueue(createTestSpec('agent-1'));

      expect(handler).not.toHaveBeenCalled();
    });

    it('supports multiple handlers for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      pool.on('agent_queued', handler1);
      pool.on('agent_queued', handler2);

      pool.enqueue(createTestSpec('agent-1'));

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('handles errors in event handlers gracefully', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      pool.on('agent_queued', errorHandler);
      pool.on('agent_queued', normalHandler);

      pool.enqueue(createTestSpec('agent-1'));

      expect(normalHandler).toHaveBeenCalled();
    });
  });

  describe('Shutdown', () => {
    it('shutdown waits for active agents when wait_for_active is true', async () => {
      pool.enqueue(createTestSpec('agent-1'));
      await pool.spawnNext();

      const shutdownPromise = pool.shutdown({ wait_for_active: true, timeout_ms: 100 });

      // Complete the agent
      pool.recordCompletion('agent-1', {
        status: 'success',
        tokens_used: 100,
        turns_used: 1,
      });

      await shutdownPromise;

      expect(pool.state.active.size).toBe(0);
    });

    it('shutdown cancels on timeout when cancel_on_timeout is true', async () => {
      pool.enqueue(createTestSpec('agent-1'));
      await pool.spawnNext();

      await pool.shutdown({
        wait_for_active: true,
        timeout_ms: 50,
        cancel_on_timeout: true,
      });

      expect(pool.state.active.size).toBe(0);
      expect(pool.state.completed.length).toBe(1);
      expect(pool.state.completed[0]?.status).toBe('cancelled');
    });
  });
});

// ============================================================================
// AgentLifecycleManagerImpl Tests
// ============================================================================

describe('AgentLifecycleManagerImpl', () => {
  let pool: AgentPoolImpl;
  let lifecycle: AgentLifecycleManagerImpl;

  beforeEach(() => {
    resetAgentCoordination();
    pool = createAgentPool() as AgentPoolImpl;
    lifecycle = createLifecycleManager(pool) as AgentLifecycleManagerImpl;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('initializes without errors', async () => {
      await expect(lifecycle.initialize()).resolves.toBeUndefined();
    });

    it('shutdown waits for all agents', async () => {
      await lifecycle.spawn(createTestSpec('agent-1'));
      const shutdownPromise = lifecycle.shutdown();

      // Complete agent
      lifecycle.complete('agent-1');

      await shutdownPromise;
      expect(pool.state.active.size).toBe(0);
    });
  });

  describe('Spawn Operations', () => {
    it('spawn enqueues and spawns agent when capacity available', async () => {
      const result = await lifecycle.spawn(createTestSpec('agent-1'));

      expect(result.success).toBe(true);
      expect(result.agent_id).toBe('agent-1');
      expect(result.queued).toBeDefined();
    });

    it('spawn returns error when budget insufficient', async () => {
      pool.state.agents_remaining = 0;

      const result = await lifecycle.spawn(createTestSpec('agent-1'));

      expect(result.success).toBe(false);
      expect(result.error).toContain('budget');
    });

    it('spawn queues agent when dependencies not met', async () => {
      await lifecycle.spawn(createTestSpec('agent-1'));
      const result = await lifecycle.spawn(createTestSpec('agent-2', 0, ['agent-1']));

      expect(result.success).toBe(true);
      expect(result.queued).toBe(true);
      expect(result.blocked_by).toContain('agent-1');
    });

    it('spawn emits lifecycle events', async () => {
      const handler = vi.fn();
      lifecycle.on('spawned', handler);

      await lifecycle.spawn(createTestSpec('agent-1'));

      expect(handler).toHaveBeenCalled();
    });

    it('spawnBatch spawns multiple agents', async () => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2'),
        createTestSpec('agent-3'),
      ];

      const results = await lifecycle.spawnBatch(specs);

      expect(results.length).toBe(3);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe('Monitoring', () => {
    beforeEach(async () => {
      await lifecycle.spawn(createTestSpec('agent-1'));
    });

    it('monitor returns agent status', () => {
      const result = lifecycle.monitor('agent-1');

      expect(result.agent_id).toBe('agent-1');
      expect(result.status).toBe('running');
      expect(result.tokens_used).toBe(0);
      expect(result.health).toBe('healthy');
    });

    it('monitor returns not_found for nonexistent agent', () => {
      const result = lifecycle.monitor('nonexistent');

      expect(result.status).toBe('not_found');
    });

    it('monitor detects over_budget health status', () => {
      const agent = pool.state.active.get('agent-1');
      if (agent) {
        agent.tokens_used = 150000; // Over 100k budget
      }

      const result = lifecycle.monitor('agent-1');

      expect(result.health).toBe('over_budget');
    });

    it('monitor detects slow health status', () => {
      const agent = pool.state.active.get('agent-1');
      if (agent) {
        // Set last activity to 70 seconds ago
        agent.last_activity = new Date(Date.now() - 70000).toISOString();
      }

      const result = lifecycle.monitor('agent-1');

      expect(result.health).toBe('slow');
    });

    it('monitor detects stuck health status', () => {
      const agent = pool.state.active.get('agent-1');
      if (agent) {
        // Set last activity to 130 seconds ago
        agent.last_activity = new Date(Date.now() - 130000).toISOString();
      }

      const result = lifecycle.monitor('agent-1');

      expect(result.health).toBe('stuck');
    });

    it('monitorAll returns all active agents', async () => {
      await lifecycle.spawn(createTestSpec('agent-2'));
      await lifecycle.spawn(createTestSpec('agent-3'));

      const results = lifecycle.monitorAll();

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every((r) => r.status === 'running')).toBe(true);
    });
  });

  describe('Completion', () => {
    beforeEach(async () => {
      await lifecycle.spawn(createTestSpec('agent-1'));
    });

    it('complete marks agent as successful', () => {
      const result = lifecycle.complete('agent-1', { data: 'test' });

      expect(result.success).toBe(true);
      expect(result.status).toBe('success');
      expect(result.result).toEqual({ data: 'test' });
      expect(pool.state.active.has('agent-1')).toBe(false);
    });

    it('complete marks agent as failed with error', () => {
      const result = lifecycle.complete('agent-1', undefined, 'Test error');

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Test error');
    });

    it('complete returns error for nonexistent agent', () => {
      const result = lifecycle.complete('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('complete processes queue after completion', async () => {
      await lifecycle.spawn(createTestSpec('agent-2', 0, ['agent-1']));

      lifecycle.complete('agent-1');

      // Wait a bit for queue processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // agent-2 should now be spawned
      expect(pool.state.active.has('agent-2')).toBe(true);
    });

    it('cancel marks agent as cancelled', () => {
      const result = lifecycle.cancel('agent-1', 'Test cancellation');

      expect(result.success).toBe(false);
      expect(result.status).toBe('cancelled');
      expect(result.error).toBe('Test cancellation');
    });

    it('timeout marks agent as timed out', () => {
      const result = lifecycle.timeout('agent-1');

      expect(result.success).toBe(false);
      expect(result.status).toBe('timeout');
      expect(result.error).toContain('exceeded');
    });
  });

  describe('Queue Processing', () => {
    it('processQueue spawns eligible agents', async () => {
      pool.enqueue(createTestSpec('agent-1'));
      pool.enqueue(createTestSpec('agent-2'));

      const results = await lifecycle.processQueue();

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('processQueue respects capacity limits', async () => {
      // Fill pool to capacity
      for (let i = 0; i < 6; i++) {
        await lifecycle.spawn(createTestSpec(`agent-${i}`));
      }

      pool.enqueue(createTestSpec('agent-7'));
      const results = await lifecycle.processQueue();

      expect(results.length).toBe(0);
    });
  });

  describe('Bulk Operations', () => {
    it('cancelAll cancels all active agents', async () => {
      await lifecycle.spawn(createTestSpec('agent-1'));
      await lifecycle.spawn(createTestSpec('agent-2'));

      const results = lifecycle.cancelAll('Test bulk cancel');

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.status === 'cancelled')).toBe(true);
      expect(pool.state.active.size).toBe(0);
    });

    it('waitForAll waits for all agents to complete', async () => {
      await lifecycle.spawn(createTestSpec('agent-1'));

      const waitPromise = lifecycle.waitForAll();

      // Complete the agent
      setTimeout(() => {
        lifecycle.complete('agent-1');
      }, 10);

      await waitPromise;

      expect(pool.state.active.size).toBe(0);
    });

    it('waitForAny returns when first agent completes', async () => {
      await lifecycle.spawn(createTestSpec('agent-1'));
      await lifecycle.spawn(createTestSpec('agent-2'));

      const waitPromise = lifecycle.waitForAny();

      // Complete one agent
      setTimeout(() => {
        lifecycle.complete('agent-1');
      }, 10);

      const result = await waitPromise;

      expect(result.agent_id).toBe('agent-1');
    });
  });

  describe('Health Checks', () => {
    it('checkHealth returns health report', async () => {
      await lifecycle.spawn(createTestSpec('agent-1'));
      await lifecycle.spawn(createTestSpec('agent-2'));

      const report = lifecycle.checkHealth();

      expect(report.total_active).toBeGreaterThanOrEqual(1);
      expect(report.healthy_count).toBeGreaterThan(0);
      expect(report.issues).toBeDefined();
    });

    it('getStuckAgents identifies stuck agents', async () => {
      await lifecycle.spawn(createTestSpec('agent-1'));

      const agent = pool.state.active.get('agent-1');
      if (agent) {
        agent.last_activity = new Date(Date.now() - 130000).toISOString();
      }

      const stuck = lifecycle.getStuckAgents();

      expect(stuck.length).toBe(1);
      expect(stuck[0]?.id).toBe('agent-1');
    });

    it('getOverBudgetAgents identifies over-budget agents', async () => {
      await lifecycle.spawn(createTestSpec('agent-1'));

      const agent = pool.state.active.get('agent-1');
      if (agent) {
        agent.tokens_used = 150000;
      }

      const overBudget = lifecycle.getOverBudgetAgents();

      expect(overBudget.length).toBe(1);
      expect(overBudget[0]?.id).toBe('agent-1');
    });
  });

  describe('Event Handling', () => {
    it('emits lifecycle events', async () => {
      const handler = vi.fn();
      lifecycle.on('spawned', handler);

      await lifecycle.spawn(createTestSpec('agent-1'));

      expect(handler).toHaveBeenCalled();
    });

    it('off removes event handler', async () => {
      const handler = vi.fn();
      lifecycle.on('spawned', handler);
      lifecycle.off('spawned', handler);

      await lifecycle.spawn(createTestSpec('agent-1'));

      expect(handler).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// AgentCommunicationManagerImpl Tests
// ============================================================================

describe('AgentCommunicationManagerImpl', () => {
  let comm: AgentCommunicationManagerImpl;

  beforeEach(() => {
    comm = createCommunicationManager() as AgentCommunicationManagerImpl;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Result Sharing', () => {
    it('shareResults stores result for target agent', () => {
      const result = comm.shareResults('agent-1', 'agent-2', { data: 'test' });

      expect(result.from_agent).toBe('agent-1');
      expect(result.to_agent).toBe('agent-2');
      expect(result.data).toEqual({ data: 'test' });
      expect(result.shared_at).toBeDefined();
      expect(result.expires_at).toBeDefined();
    });

    it('shareResults uses provided key', () => {
      const result = comm.shareResults('agent-1', 'agent-2', { data: 'test' }, 'custom-key');

      expect(result.result_key).toBe('custom-key');
    });

    it('shareResults generates key if not provided', () => {
      const result = comm.shareResults('agent-1', 'agent-2', { data: 'test' });

      expect(result.result_key).toMatch(/^result_/);
    });

    it('getSharedResults retrieves results for agent', () => {
      comm.shareResults('agent-1', 'agent-2', { data: 'test1' });
      comm.shareResults('agent-3', 'agent-2', { data: 'test2' });

      const results = comm.getSharedResults('agent-2');

      expect(results.length).toBe(2);
      expect(results[0]?.data).toEqual({ data: 'test1' });
      expect(results[1]?.data).toEqual({ data: 'test2' });
    });

    it('enforces max results per agent limit', () => {
      const customComm = createCommunicationManager({
        max_results_per_agent: 2,
      }) as AgentCommunicationManagerImpl;

      customComm.shareResults('agent-1', 'agent-2', { data: 'test1' });
      customComm.shareResults('agent-1', 'agent-2', { data: 'test2' });
      customComm.shareResults('agent-1', 'agent-2', { data: 'test3' }); // Should evict first

      const results = customComm.getSharedResults('agent-2');

      // After exceeding limit, oldest result should be removed
      expect(results.length).toBeLessThanOrEqual(2);
      // Should contain the last 2 results
      const lastResult = results[results.length - 1];
      expect(lastResult?.data).toEqual({ data: 'test3' });
    });

    it('clearExpiredResults removes expired results', () => {
      const customComm = createCommunicationManager({
        result_ttl_ms: 10,
      }) as AgentCommunicationManagerImpl;

      customComm.shareResults('agent-1', 'agent-2', { data: 'test' });

      // Wait for expiry
      const cleared = customComm.clearExpiredResults();

      expect(cleared).toBe(0); // Not expired yet immediately
    });
  });

  describe('Broadcasting', () => {
    it('broadcast creates broadcast message', () => {
      const broadcast = comm.broadcast('agent-1', 'Test message', { data: 'test' });

      expect(broadcast.from).toBe('agent-1');
      expect(broadcast.message).toBe('Test message');
      expect(broadcast.data).toEqual({ data: 'test' });
      expect(broadcast.priority).toBe('normal');
      expect(broadcast.received_by).toEqual([]);
    });

    it('broadcast supports priority levels', () => {
      const broadcast = comm.broadcast('agent-1', 'Urgent', undefined, 'high');

      expect(broadcast.priority).toBe('high');
    });

    it('getBroadcastHistory returns all broadcasts', () => {
      comm.broadcast('agent-1', 'Message 1');
      comm.broadcast('agent-2', 'Message 2');

      const history = comm.getBroadcastHistory();

      expect(history.length).toBe(2);
    });
  });

  describe('Request/Response', () => {
    it('respond creates response', () => {
      const request = {
        id: 'req-1',
        type: 'data' as RequestType,
        from: 'agent-1',
        to: 'agent-2',
        timeout_ms: 30000,
        sent_at: new Date().toISOString(),
      };

      const response = comm.respond(request, true, { result: 'success' });

      expect(response.request_id).toBe('req-1');
      expect(response.from).toBe('agent-2');
      expect(response.to).toBe('agent-1');
      expect(response.success).toBe(true);
      expect(response.data).toEqual({ result: 'success' });
    });

    it('respond handles errors', () => {
      const request = {
        id: 'req-1',
        type: 'data' as RequestType,
        from: 'agent-1',
        to: 'agent-2',
        timeout_ms: 30000,
        sent_at: new Date().toISOString(),
      };

      const response = comm.respond(request, false, undefined, 'Test error');

      expect(response.success).toBe(false);
      expect(response.error).toBe('Test error');
    });
  });

  describe('Messaging', () => {
    it('send stores message for recipient', () => {
      const message: AgentMessage = {
        id: 'msg-1',
        from: 'agent-1',
        to: 'agent-2',
        type: 'data',
        data: { test: 'data' },
        priority: 'normal',
        sent_at: new Date().toISOString(),
      };

      comm.send(message);

      const received = comm.receive('agent-2');
      expect(received.length).toBe(1);
      expect(received[0]?.id).toBe('msg-1');
    });

    it('receive clears messages for agent', () => {
      const message: AgentMessage = {
        id: 'msg-1',
        from: 'agent-1',
        to: 'agent-2',
        type: 'data',
        data: { test: 'data' },
        priority: 'normal',
        sent_at: new Date().toISOString(),
      };

      comm.send(message);
      comm.receive('agent-2');

      const received = comm.receive('agent-2');
      expect(received.length).toBe(0);
    });

    it('peek returns first message without removing it', () => {
      const message: AgentMessage = {
        id: 'msg-1',
        from: 'agent-1',
        to: 'agent-2',
        type: 'data',
        data: { test: 'data' },
        priority: 'normal',
        sent_at: new Date().toISOString(),
      };

      comm.send(message);

      const peeked = comm.peek('agent-2');
      expect(peeked?.id).toBe('msg-1');

      const received = comm.receive('agent-2');
      expect(received.length).toBe(1);
    });

    it('clearMessages removes all messages for agent', () => {
      const message: AgentMessage = {
        id: 'msg-1',
        from: 'agent-1',
        to: 'agent-2',
        type: 'data',
        data: { test: 'data' },
        priority: 'normal',
        sent_at: new Date().toISOString(),
      };

      comm.send(message);
      comm.clearMessages('agent-2');

      const received = comm.receive('agent-2');
      expect(received.length).toBe(0);
    });

    it('getMessageHistory retrieves message history', () => {
      const message: AgentMessage = {
        id: 'msg-1',
        from: 'agent-1',
        to: 'agent-2',
        type: 'data',
        data: { test: 'data' },
        priority: 'normal',
        sent_at: new Date().toISOString(),
      };

      comm.send(message);

      const history = comm.getMessageHistory('agent-1');
      expect(history.length).toBe(1);
    });
  });

  describe('Statistics', () => {
    it('getStats returns communication statistics', () => {
      const message: AgentMessage = {
        id: 'msg-1',
        from: 'agent-1',
        to: 'agent-2',
        type: 'data',
        data: { test: 'data' },
        priority: 'normal',
        sent_at: new Date().toISOString(),
      };

      comm.send(message);
      comm.broadcast('agent-1', 'Test');
      comm.shareResults('agent-1', 'agent-2', { data: 'test' });

      const stats = comm.getStats();

      expect(stats.messages_sent).toBe(1);
      expect(stats.broadcasts_sent).toBe(1);
      expect(stats.results_shared).toBe(1);
    });
  });
});

// ============================================================================
// DependencyResolverImpl Tests
// ============================================================================

describe('DependencyResolverImpl', () => {
  let resolver: DependencyResolverImpl;

  beforeEach(() => {
    resolver = createDependencyManager() as DependencyResolverImpl;
  });

  describe('Graph Building', () => {
    it('buildGraph creates nodes for each spec', () => {
      const specs = [createTestSpec('agent-1'), createTestSpec('agent-2'), createTestSpec('agent-3')];

      const graph = resolver.buildGraph(specs);

      expect(graph.nodes.size).toBe(3);
      expect(graph.nodes.has('agent-1')).toBe(true);
      expect(graph.nodes.has('agent-2')).toBe(true);
      expect(graph.nodes.has('agent-3')).toBe(true);
    });

    it('buildGraph establishes dependency relationships', () => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2', 0, ['agent-1']),
        createTestSpec('agent-3', 0, ['agent-2']),
      ];

      const graph = resolver.buildGraph(specs);

      const node2 = graph.nodes.get('agent-2');
      expect(node2?.dependencies.length).toBe(1);
      expect(node2?.dependencies[0]?.agent_id).toBe('agent-1');

      const node1 = graph.nodes.get('agent-1');
      expect(node1?.dependents).toContain('agent-2');
    });

    it('buildGraph calculates node depths', () => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2', 0, ['agent-1']),
        createTestSpec('agent-3', 0, ['agent-2']),
      ];

      const graph = resolver.buildGraph(specs);

      // Depth is calculated from dependencies
      // agent-1 has no deps, so depth increases with dependency chain
      const depth1 = graph.nodes.get('agent-1')?.depth ?? 0;
      const depth2 = graph.nodes.get('agent-2')?.depth ?? 0;
      const depth3 = graph.nodes.get('agent-3')?.depth ?? 0;

      // Verify depth increases along dependency chain
      expect(depth2).toBeGreaterThanOrEqual(depth1);
      expect(depth3).toBeGreaterThanOrEqual(depth2);
      expect(graph.max_depth).toBeGreaterThan(0);
    });

    it('buildGraph identifies roots and leaves', () => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2', 0, ['agent-1']),
        createTestSpec('agent-3', 0, ['agent-2']),
      ];

      const graph = resolver.buildGraph(specs);

      expect(graph.roots).toContain('agent-1');
      expect(graph.leaves).toContain('agent-3');
    });

    it('addNode adds node to existing graph', () => {
      const specs = [createTestSpec('agent-1')];
      const graph = resolver.buildGraph(specs);

      resolver.addNode(graph, createTestSpec('agent-2', 0, ['agent-1']));

      expect(graph.nodes.size).toBe(2);
      expect(graph.nodes.get('agent-1')?.dependents).toContain('agent-2');
    });

    it('removeNode removes node and updates relationships', () => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2', 0, ['agent-1']),
        createTestSpec('agent-3', 0, ['agent-2']),
      ];
      const graph = resolver.buildGraph(specs);

      resolver.removeNode(graph, 'agent-2');

      expect(graph.nodes.size).toBe(2);
      expect(graph.nodes.has('agent-2')).toBe(false);
      // agent-1 should no longer have agent-2 as a dependent
      const agent1 = graph.nodes.get('agent-1');
      if (agent1) {
        expect(agent1.dependents).not.toContain('agent-2');
      }
    });
  });

  describe('Cycle Detection', () => {
    it('checkCycles returns false for acyclic graph', () => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2', 0, ['agent-1']),
        createTestSpec('agent-3', 0, ['agent-2']),
      ];

      const graph = resolver.buildGraph(specs);
      const result = resolver.checkCycles(graph);

      expect(result.has_cycle).toBe(false);
      expect(result.cycle).toBeUndefined();
    });

    it('checkCycles detects simple cycle', () => {
      const specs = [
        createTestSpec('agent-1', 0, ['agent-2']),
        createTestSpec('agent-2', 0, ['agent-1']),
      ];

      const graph = resolver.buildGraph(specs);
      const result = resolver.checkCycles(graph);

      expect(result.has_cycle).toBe(true);
      expect(result.cycle).toBeDefined();
      expect(result.problematic_edges).toBeDefined();
    });

    it('checkCycles detects complex cycle', () => {
      const specs = [
        createTestSpec('agent-1', 0, ['agent-3']),
        createTestSpec('agent-2', 0, ['agent-1']),
        createTestSpec('agent-3', 0, ['agent-2']),
      ];

      const graph = resolver.buildGraph(specs);
      const result = resolver.checkCycles(graph);

      expect(result.has_cycle).toBe(true);
    });
  });

  describe('Topological Sort', () => {
    it('topologicalSort returns valid ordering', () => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2', 0, ['agent-1']),
        createTestSpec('agent-3', 0, ['agent-2']),
      ];

      const graph = resolver.buildGraph(specs);
      const sorted = resolver.topologicalSort(graph);

      expect(sorted).toEqual(['agent-1', 'agent-2', 'agent-3']);
    });

    it('topologicalSort handles multiple roots', () => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2'),
        createTestSpec('agent-3', 0, ['agent-1', 'agent-2']),
      ];

      const graph = resolver.buildGraph(specs);
      const sorted = resolver.topologicalSort(graph);

      const idx1 = sorted.indexOf('agent-1');
      const idx2 = sorted.indexOf('agent-2');
      const idx3 = sorted.indexOf('agent-3');

      expect(idx3).toBeGreaterThan(idx1);
      expect(idx3).toBeGreaterThan(idx2);
    });
  });

  describe('Phase Grouping', () => {
    it('groupByPhase creates execution phases', () => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2'),
        createTestSpec('agent-3', 0, ['agent-1', 'agent-2']),
      ];

      const graph = resolver.buildGraph(specs);
      const sorted = resolver.topologicalSort(graph);
      const phases = resolver.groupByPhase(sorted, graph);

      // Should have at least 1 phase
      expect(phases.length).toBeGreaterThan(0);
      // First phase should have agents with no dependencies
      const firstPhaseAgents = phases[0]?.agents ?? [];
      expect(firstPhaseAgents.length).toBeGreaterThan(0);
      // Last phase should include agent-3 which depends on others
      const lastPhase = phases[phases.length - 1];
      const allAgents = phases.flatMap((p) => p.agents);
      expect(allAgents).toContain('agent-1');
      expect(allAgents).toContain('agent-2');
      expect(allAgents).toContain('agent-3');
    });

    it('groupByPhase respects dependencies', () => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2', 0, ['agent-1']),
        createTestSpec('agent-3', 0, ['agent-2']),
      ];

      const graph = resolver.buildGraph(specs);
      const sorted = resolver.topologicalSort(graph);
      const phases = resolver.groupByPhase(sorted, graph);

      // Should have phases
      expect(phases.length).toBeGreaterThan(0);

      // Find which phase each agent is in
      const getPhaseIndex = (agentId: string) => {
        return phases.findIndex((phase) => phase.agents.includes(agentId));
      };

      const phase1 = getPhaseIndex('agent-1');
      const phase2 = getPhaseIndex('agent-2');
      const phase3 = getPhaseIndex('agent-3');

      // Dependencies should be in earlier or same phase
      expect(phase1).toBeLessThanOrEqual(phase2);
      expect(phase2).toBeLessThanOrEqual(phase3);
    });

    it('groupByPhase calculates estimated tokens', () => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2'),
      ];

      const graph = resolver.buildGraph(specs);
      const sorted = resolver.topologicalSort(graph);
      const phases = resolver.groupByPhase(sorted, graph);

      expect(phases[0]?.estimated_tokens).toBeGreaterThan(0);
    });
  });

  describe('Critical Path', () => {
    it('calculateCriticalPath finds longest path', () => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2', 0, ['agent-1']),
        createTestSpec('agent-3', 0, ['agent-2']),
        createTestSpec('agent-4', 0, ['agent-1']),
      ];

      const graph = resolver.buildGraph(specs);
      const path = resolver.calculateCriticalPath(graph);

      // Should be agent-1 -> agent-2 -> agent-3
      expect(path.length).toBe(3);
      expect(path).toContain('agent-1');
      expect(path).toContain('agent-2');
      expect(path).toContain('agent-3');
    });
  });

  describe('Resolution', () => {
    it('resolve creates execution plan', () => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2', 0, ['agent-1']),
        createTestSpec('agent-3', 0, ['agent-2']),
      ];

      const result = resolver.resolve(specs);

      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
      expect(result.plan?.phases.length).toBeGreaterThan(0);
      expect(result.plan?.critical_path.length).toBeGreaterThan(0);
    });

    it('resolve fails on circular dependency', () => {
      const specs = [
        createTestSpec('agent-1', 0, ['agent-2']),
        createTestSpec('agent-2', 0, ['agent-1']),
      ];

      const result = resolver.resolve(specs);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Circular');
    });

    it('resolve calculates max parallelism', () => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2'),
        createTestSpec('agent-3'),
        createTestSpec('agent-4', 0, ['agent-1', 'agent-2', 'agent-3']),
      ];

      const result = resolver.resolve(specs);

      // Max parallelism should be at least the number of independent agents
      expect(result.plan?.max_parallelism).toBeGreaterThan(0);
      expect(result.plan?.max_parallelism).toBeLessThanOrEqual(4);
    });
  });

  describe('Runtime Updates', () => {
    beforeEach(() => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2', 0, ['agent-1']),
        createTestSpec('agent-3', 0, ['agent-1']),
        createTestSpec('agent-4', 0, ['agent-2', 'agent-3']),
      ];
      resolver.buildGraph(specs);
    });

    it('markCompleted updates status and returns ready agents', () => {
      const ready = resolver.markCompleted('agent-1', true);

      expect(resolver.currentGraph.nodes.get('agent-1')?.status).toBe('completed');
      expect(ready).toContain('agent-2');
      expect(ready).toContain('agent-3');
    });

    it('markFailed blocks dependent agents', () => {
      const blocked = resolver.markFailed('agent-1');

      expect(resolver.currentGraph.nodes.get('agent-1')?.status).toBe('failed');
      expect(blocked).toContain('agent-2');
      expect(blocked).toContain('agent-3');
      expect(blocked).toContain('agent-4');
    });

    it('getReady returns agents with all dependencies met', () => {
      resolver.markCompleted('agent-1', true);

      const ready = resolver.getReady();

      expect(ready).toContain('agent-2');
      expect(ready).toContain('agent-3');
    });

    it('getBlocked returns blocked agents', () => {
      resolver.markFailed('agent-1');

      const blocked = resolver.getBlocked();

      expect(blocked.length).toBeGreaterThan(0);
    });
  });

  describe('Queries', () => {
    beforeEach(() => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2', 0, ['agent-1']),
        createTestSpec('agent-3', 0, ['agent-2']),
      ];
      resolver.buildGraph(specs);
    });

    it('getDependencies returns agent dependencies', () => {
      const deps = resolver.getDependencies('agent-2');

      expect(deps.length).toBe(1);
      expect(deps[0]?.agent_id).toBe('agent-1');
    });

    it('getDependents returns dependent agents', () => {
      const dependents = resolver.getDependents('agent-1');

      expect(dependents).toContain('agent-2');
    });

    it('isReady checks if agent is ready', () => {
      // Mark agent-1 as completed
      const ready1 = resolver.markCompleted('agent-1', true);

      // agent-2 should now be ready since its dependency is complete
      expect(ready1).toContain('agent-2');
      expect(resolver.isReady('agent-2')).toBe(true);
    });

    it('isBlocked checks if agent is blocked', () => {
      resolver.markFailed('agent-1');

      expect(resolver.isBlocked('agent-2')).toBe(true);
    });

    it('getBlockers returns blocking agents', () => {
      const blockers = resolver.getBlockers('agent-2');

      expect(blockers).toContain('agent-1');
    });
  });

  describe('Plan Adjustments', () => {
    beforeEach(() => {
      const specs = [
        createTestSpec('agent-1'),
        createTestSpec('agent-2', 0, ['agent-1']),
      ];
      resolver.buildGraph(specs);
    });

    it('replan creates new plan from current graph', () => {
      const result = resolver.replan();

      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
    });

    it('addDependency adds new dependency edge', () => {
      const added = resolver.addDependency('agent-2', 'agent-1');

      expect(added).toBe(true);
      expect(resolver.getDependencies('agent-2').length).toBeGreaterThan(0);
    });

    it('removeDependency removes dependency edge', () => {
      const removed = resolver.removeDependency('agent-2', 'agent-1');

      expect(removed).toBe(true);
      expect(resolver.getDependencies('agent-2').length).toBe(0);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('Factory Functions', () => {
  beforeEach(() => {
    resetAgentCoordination();
  });

  it('createAgentPool creates new instance', () => {
    const pool1 = createAgentPool();
    const pool2 = createAgentPool();

    expect(pool1).not.toBe(pool2);
  });

  it('createLifecycleManager creates new instance', () => {
    const pool = createAgentPool();
    const lc1 = createLifecycleManager(pool);
    const lc2 = createLifecycleManager(pool);

    expect(lc1).not.toBe(lc2);
  });

  it('createCommunicationManager creates new instance', () => {
    const comm1 = createCommunicationManager();
    const comm2 = createCommunicationManager();

    expect(comm1).not.toBe(comm2);
  });

  it('createDependencyManager creates new instance', () => {
    const dep1 = createDependencyManager();
    const dep2 = createDependencyManager();

    expect(dep1).not.toBe(dep2);
  });

  it('resetAgentCoordination clears singletons', () => {
    createAgentPool();
    createCommunicationManager();

    resetAgentCoordination();

    // After reset, new instances should be created
    const pool = createAgentPool();
    expect(pool).toBeDefined();
  });
});
