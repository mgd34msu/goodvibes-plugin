/**
 * Unit tests for AgentPool
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentPool } from "../agent-pool.js";

describe("AgentPool", () => {
  let pool: AgentPool;

  beforeEach(() => {
    pool = new AgentPool({
      max_concurrent: 3,
      default_budget: 10000,
      total_budget: 100000,
    });
  });

  describe("Agent Spawning", () => {
    it("should spawn an agent", () => {
      const agentId = pool.spawn({
        type: "backend-engineer",
        task: "Build API",
        budget: 5000,
      });

      expect(agentId).toBeDefined();
      const agent = pool.getAgent(agentId);
      expect(agent).toBeDefined();
      expect(agent?.spec.type).toBe("backend-engineer");
      expect(agent?.budget.allocated).toBe(5000);
    });

    it("should use default budget if not specified", () => {
      const agentId = pool.spawn({
        type: "test-engineer",
        task: "Write tests",
        budget: 0, // Will use default
      });

      const agent = pool.getAgent(agentId);
      expect(agent?.budget.allocated).toBe(10000);
    });

    it("should auto-start agents if configured", () => {
      const agentId = pool.spawn({
        type: "backend-engineer",
        task: "Build API",
        budget: 5000,
      });

      const agent = pool.getAgent(agentId);
      expect(agent?.status).toBe("running");
    });

    it("should respect max concurrent limit", () => {
      // Spawn 4 agents with max_concurrent = 3
      pool.spawn({ type: "agent-1", task: "Task 1", budget: 1000 });
      pool.spawn({ type: "agent-2", task: "Task 2", budget: 1000 });
      pool.spawn({ type: "agent-3", task: "Task 3", budget: 1000 });
      pool.spawn({ type: "agent-4", task: "Task 4", budget: 1000 });

      const stats = pool.getStats();
      expect(stats.active).toBe(3);
      expect(stats.queued).toBe(1);
    });
  });

  describe("Agent Completion", () => {
    it("should complete an agent", () => {
      const agentId = pool.spawn({
        type: "backend-engineer",
        task: "Build API",
        budget: 5000,
      });

      pool.complete(agentId, "API built successfully", 3000);

      const agent = pool.getAgent(agentId);
      expect(agent?.status).toBe("completed");
      expect(agent?.result).toBe("API built successfully");
      expect(agent?.budget.spent).toBe(3000);
    });

    it("should start next queued agent on completion", () => {
      const id1 = pool.spawn({ type: "agent-1", task: "Task 1", budget: 1000 });
      pool.spawn({ type: "agent-2", task: "Task 2", budget: 1000 });
      pool.spawn({ type: "agent-3", task: "Task 3", budget: 1000 });
      const id4 = pool.spawn({ type: "agent-4", task: "Task 4", budget: 1000 });

      // Agent 4 should be queued
      let agent4 = pool.getAgent(id4);
      expect(agent4?.status).toBe("queued");

      // Complete agent 1
      pool.complete(id1, "done", 500);

      // Now agent 4 should be running
      agent4 = pool.getAgent(id4);
      expect(agent4?.status).toBe("running");
    });
  });

  describe("Agent Failure", () => {
    it("should fail an agent", () => {
      const agentId = pool.spawn({
        type: "backend-engineer",
        task: "Build API",
        budget: 5000,
      });

      pool.fail(agentId, "Out of budget", 5000);

      const agent = pool.getAgent(agentId);
      expect(agent?.status).toBe("failed");
      expect(agent?.error).toBe("Out of budget");
    });
  });

  describe("Budget Tracking", () => {
    it("should track budget usage", () => {
      const agentId = pool.spawn({
        type: "backend-engineer",
        task: "Build API",
        budget: 10000,
      });

      pool.updateBudget(agentId, 5000);

      const agent = pool.getAgent(agentId);
      expect(agent?.budget.spent).toBe(5000);
      expect(agent?.budget.remaining).toBe(5000);
      expect(agent?.budget.usage_percent).toBe(50);
    });

    it("should track detailed budget with input/output tokens", () => {
      const agentId = pool.spawn({
        type: "backend-engineer",
        task: "Build API",
        budget: 10000,
      });

      pool.updateBudgetDetailed(agentId, 2000, 3000);

      const agent = pool.getAgent(agentId);
      expect(agent?.budget.input_tokens).toBe(2000);
      expect(agent?.budget.output_tokens).toBe(3000);
      expect(agent?.budget.spent).toBe(5000);
      expect(agent?.budget.cost_usd).toBeGreaterThan(0);
    });

    it("should detect budget exhaustion", () => {
      const agentId = pool.spawn({
        type: "backend-engineer",
        task: "Build API",
        budget: 5000,
      });

      pool.updateBudget(agentId, 5000);

      const agent = pool.getAgent(agentId);
      expect(agent?.budget.exhausted).toBe(true);
    });

    it("should trigger warning callback at threshold", () => {
      const warningCallback = vi.fn();
      pool.onWarning(warningCallback);

      const agentId = pool.spawn({
        type: "backend-engineer",
        task: "Build API",
        budget: 10000,
      });

      // Use 80% of budget
      pool.updateBudget(agentId, 8000);

      expect(warningCallback).toHaveBeenCalled();
    });
  });

  describe("Budget Exhaustion Handling", () => {
    it("should pause agent on budget exhaustion", () => {
      const agentId = pool.spawn({
        type: "backend-engineer",
        task: "Build API",
        budget: 5000,
      });

      pool.updateBudget(agentId, 6000); // Over budget

      const agent = pool.getAgent(agentId);
      expect(agent?.status).toBe("paused");
    });

    it("should allow top-up", () => {
      const agentId = pool.spawn({
        type: "backend-engineer",
        task: "Build API",
        budget: 5000,
      });

      pool.updateBudget(agentId, 5000); // Exhausted
      pool.topUp(agentId, 5000);

      const agent = pool.getAgent(agentId);
      expect(agent?.budget.allocated).toBe(10000);
      expect(agent?.budget.remaining).toBe(5000);
      expect(agent?.budget.exhausted).toBe(false);
    });

    it("should auto-resume after top-up", () => {
      const agentId = pool.spawn({
        type: "backend-engineer",
        task: "Build API",
        budget: 5000,
      });

      pool.updateBudget(agentId, 6000); // Exhausted and paused
      expect(pool.getAgent(agentId)?.status).toBe("paused");

      pool.topUp(agentId, 5000); // Top up
      expect(pool.getAgent(agentId)?.status).toBe("running");
    });
  });

  describe("Dependency Management", () => {
    it("should wait for dependencies", () => {
      const agent1Id = pool.spawn({
        type: "agent-1",
        task: "Task 1",
        budget: 1000,
      });

      const agent2Id = pool.spawn({
        type: "agent-2",
        task: "Task 2",
        budget: 1000,
        depends_on: [agent1Id],
      });

      const agent2 = pool.getAgent(agent2Id);
      expect(agent2?.status).toBe("waiting");
    });

    it("should start dependent agent after dependency completes", () => {
      const agent1Id = pool.spawn({
        type: "agent-1",
        task: "Task 1",
        budget: 1000,
      });

      const agent2Id = pool.spawn({
        type: "agent-2",
        task: "Task 2",
        budget: 1000,
        depends_on: [agent1Id],
      });

      pool.complete(agent1Id, "done", 500);

      const agent2 = pool.getAgent(agent2Id);
      expect(agent2?.status).toBe("running");
    });
  });

  describe("Statistics", () => {
    it("should track statistics", () => {
      pool.spawn({ type: "agent-1", task: "Task 1", budget: 1000 });
      const agent2Id = pool.spawn({ type: "agent-2", task: "Task 2", budget: 1000 });
      pool.complete(agent2Id, "done", 500);

      const stats = pool.getStats();
      expect(stats.total_spawned).toBe(2);
      expect(stats.active).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.total_budget_spent).toBe(500);
    });

    it("should track cost", () => {
      const agentId = pool.spawn({
        type: "backend-engineer",
        task: "Build API",
        budget: 50000,
      });

      pool.updateBudgetDetailed(agentId, 10000, 5000);
      pool.complete(agentId, "done");

      const stats = pool.getStats();
      expect(stats.total_input_tokens).toBe(10000);
      expect(stats.total_output_tokens).toBe(5000);
      expect(stats.total_cost_usd).toBeGreaterThan(0);
    });
  });

  describe("Pool Management", () => {
    it("should check if budget is available", () => {
      expect(pool.hasBudget(50000)).toBe(true);
      expect(pool.hasBudget(200000)).toBe(false);
    });

    it("should prune completed agents", () => {
      const agent1Id = pool.spawn({ type: "agent-1", task: "Task 1", budget: 1000 });
      const agent2Id = pool.spawn({ type: "agent-2", task: "Task 2", budget: 1000 });

      pool.complete(agent1Id, "done", 500);
      pool.fail(agent2Id, "error", 500);

      const pruned = pool.prune();
      expect(pruned).toBe(2);
      expect(pool.getStats().total_spawned).toBe(0);
    });
  });
});
