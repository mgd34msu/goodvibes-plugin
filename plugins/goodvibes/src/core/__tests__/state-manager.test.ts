/**
 * Unit tests for StateManager
 */
import { describe, it, expect, beforeEach } from "vitest";
import { StateManager } from "../state-manager.js";

describe("StateManager", () => {
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager("/test/project", "vibecoding");
  });

  describe("Session Management", () => {
    it("should initialize with a session", () => {
      const session = stateManager.getSession();
      expect(session.id).toBeDefined();
      expect(session.mode).toBe("vibecoding");
      expect(session.started_at).toBeDefined();
    });

    it("should return the session ID", () => {
      const sessionId = stateManager.getSessionId();
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe("string");
    });

    it("should get and set mode", () => {
      expect(stateManager.getMode()).toBe("vibecoding");
      stateManager.setMode("justvibes");
      expect(stateManager.getMode()).toBe("justvibes");
    });

    it("should track session duration", () => {
      const duration = stateManager.getSessionDuration();
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Agent Management", () => {
    it("should spawn an agent", () => {
      const agentId = stateManager.spawnAgent("backend-engineer", "Build API", 50000);
      expect(agentId).toBeDefined();

      const agent = stateManager.getAgent(agentId);
      expect(agent).toBeDefined();
      expect(agent?.type).toBe("backend-engineer");
      expect(agent?.task).toBe("Build API");
      expect(agent?.status).toBe("queued");
    });

    it("should complete an agent", () => {
      const agentId = stateManager.spawnAgent("test-engineer", "Write tests", 50000);
      stateManager.completeAgent(agentId, 10000);

      const agent = stateManager.getAgent(agentId);
      expect(agent?.status).toBe("completed");
      expect(agent?.budget.spent).toBe(10000);
    });

    it("should fail an agent", () => {
      const agentId = stateManager.spawnAgent("frontend-architect", "Build UI", 50000);
      stateManager.failAgent(agentId, "Out of budget");

      const agent = stateManager.getAgent(agentId);
      expect(agent?.status).toBe("failed");
      expect(agent?.error).toBe("Out of budget");
    });

    it("should get active agents", () => {
      stateManager.spawnAgent("backend-engineer", "Task 1", 50000);
      stateManager.spawnAgent("frontend-architect", "Task 2", 50000);
      const agent3Id = stateManager.spawnAgent("test-engineer", "Task 3", 50000);
      stateManager.completeAgent(agent3Id, 5000);

      const active = stateManager.getActiveAgents();
      expect(active.length).toBe(2);
    });

    it("should get agents by status", () => {
      const agent1Id = stateManager.spawnAgent("backend-engineer", "Task 1", 50000);
      stateManager.spawnAgent("frontend-architect", "Task 2", 50000);
      stateManager.completeAgent(agent1Id, 5000);

      const completed = stateManager.getAgentsByStatus("completed");
      expect(completed.length).toBe(1);

      const running = stateManager.getAgentsByStatus("queued");
      expect(running.length).toBe(1);
    });
  });

  describe("File Locking", () => {
    it("should acquire a lock", () => {
      const acquired = stateManager.acquireLock("/test/file.ts", "agent-1", "editing");
      expect(acquired).toBe(true);
    });

    it("should prevent double locking", () => {
      stateManager.acquireLock("/test/file.ts", "agent-1", "editing");
      const secondAcquire = stateManager.acquireLock("/test/file.ts", "agent-2", "editing");
      expect(secondAcquire).toBe(false);
    });

    it("should allow same holder to re-acquire", () => {
      stateManager.acquireLock("/test/file.ts", "agent-1", "editing");
      const reAcquire = stateManager.acquireLock("/test/file.ts", "agent-1", "editing");
      expect(reAcquire).toBe(true);
    });

    it("should release a lock", () => {
      stateManager.acquireLock("/test/file.ts", "agent-1", "editing");
      const released = stateManager.releaseLock("/test/file.ts", "agent-1");
      expect(released).toBe(true);

      // Now another agent can acquire
      const acquired = stateManager.acquireLock("/test/file.ts", "agent-2", "editing");
      expect(acquired).toBe(true);
    });

    it("should check if file is locked", () => {
      expect(stateManager.isLocked("/test/file.ts")).toBe(false);
      stateManager.acquireLock("/test/file.ts", "agent-1", "editing");
      expect(stateManager.isLocked("/test/file.ts")).toBe(true);
    });

    it("should get lock holder", () => {
      stateManager.acquireLock("/test/file.ts", "agent-1", "editing");
      expect(stateManager.getLockHolder("/test/file.ts")).toBe("agent-1");
    });

    it("should get all locks for a holder", () => {
      stateManager.acquireLock("/test/file1.ts", "agent-1", "editing");
      stateManager.acquireLock("/test/file2.ts", "agent-1", "editing");
      stateManager.acquireLock("/test/file3.ts", "agent-2", "editing");

      const locks = stateManager.getLocksForHolder("agent-1");
      expect(locks.length).toBe(2);
    });

    it("should release all locks for a holder", () => {
      stateManager.acquireLock("/test/file1.ts", "agent-1", "editing");
      stateManager.acquireLock("/test/file2.ts", "agent-1", "editing");

      const released = stateManager.releaseAllLocks("agent-1");
      expect(released).toBe(2);
      expect(stateManager.isLocked("/test/file1.ts")).toBe(false);
    });
  });

  describe("Dirty File Tracking", () => {
    it("should mark a file as dirty", () => {
      stateManager.markDirty("/test/file.ts", "agent-1");
      expect(stateManager.isDirty("/test/file.ts")).toBe(true);
    });

    it("should clear dirty status", () => {
      stateManager.markDirty("/test/file.ts", "agent-1");
      stateManager.clearDirty("/test/file.ts");
      expect(stateManager.isDirty("/test/file.ts")).toBe(false);
    });

    it("should get all dirty files", () => {
      stateManager.markDirty("/test/file1.ts", "agent-1");
      stateManager.markDirty("/test/file2.ts", "agent-1");

      const dirty = stateManager.getDirtyFiles();
      expect(dirty.length).toBe(2);
    });

    it("should get dirty files by agent", () => {
      stateManager.markDirty("/test/file1.ts", "agent-1");
      stateManager.markDirty("/test/file2.ts", "agent-2");

      const dirty = stateManager.getDirtyFilesByAgent("agent-1");
      expect(dirty.length).toBe(1);
    });

    it("should clear all dirty files", () => {
      stateManager.markDirty("/test/file1.ts", "agent-1");
      stateManager.markDirty("/test/file2.ts", "agent-1");

      const cleared = stateManager.clearAllDirty();
      expect(cleared).toBe(2);
      expect(stateManager.getDirtyCount()).toBe(0);
    });
  });
});
