/**
 * Unit tests for Memory System
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Memory } from "../memory.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("Memory", () => {
  let memory: Memory;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "memory-test-"));
    memory = new Memory(tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Decision Storage", () => {
    it("should record a decision", async () => {
      const decision = await memory.recordDecision(
        "Use TypeScript for the project",
        "Better type safety and IDE support",
        "Starting new project",
        { tags: ["language", "typescript"] }
      );

      expect(decision.id).toBeDefined();
      expect(decision.decision).toBe("Use TypeScript for the project");
      expect(decision.rationale).toBe("Better type safety and IDE support");
      expect(decision.tags).toContain("typescript");
    });

    it("should retrieve a decision by ID", async () => {
      const created = await memory.recordDecision(
        "Decision 1",
        "Rationale 1",
        "Context 1"
      );

      const retrieved = memory.getDecision(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.decision).toBe("Decision 1");
    });

    it("should update decision outcome", async () => {
      const decision = await memory.recordDecision(
        "Try new approach",
        "Might work better",
        "Testing"
      );

      const updated = await memory.updateDecisionOutcome(decision.id, "success");
      expect(updated).toBe(true);

      const retrieved = memory.getDecision(decision.id);
      expect(retrieved?.outcome).toBe("success");
    });

    it("should search decisions by tags", async () => {
      await memory.recordDecision("Decision 1", "R1", "C1", { tags: ["api"] });
      await memory.recordDecision("Decision 2", "R2", "C2", { tags: ["frontend"] });
      await memory.recordDecision("Decision 3", "R3", "C3", { tags: ["api", "rest"] });

      const results = memory.searchDecisions({ tags: ["api"] });
      expect(results.length).toBe(2);
    });

    it("should search decisions by query", async () => {
      await memory.recordDecision("Use React", "Popular framework", "Frontend");
      await memory.recordDecision("Use Vue", "Easy learning curve", "Frontend");

      const results = memory.searchDecisions({ query: "React" });
      expect(results.length).toBe(1);
      expect(results[0].decision).toBe("Use React");
    });
  });

  describe("Pattern Storage", () => {
    it("should record a pattern", async () => {
      const pattern = await memory.recordPattern(
        "Singleton",
        "Ensures single instance",
        "class Singleton { private static instance; }",
        "When you need global state",
        { tags: ["design-pattern", "creational"] }
      );

      expect(pattern.id).toBeDefined();
      expect(pattern.name).toBe("Singleton");
      expect(pattern.usage_count).toBe(0);
    });

    it("should retrieve pattern by name", async () => {
      await memory.recordPattern(
        "Factory",
        "Creates objects",
        "interface Factory { create(): Product }",
        "When object creation is complex"
      );

      const pattern = memory.getPatternByName("Factory");
      expect(pattern).toBeDefined();
      expect(pattern?.description).toBe("Creates objects");
    });

    it("should increment usage count", async () => {
      const pattern = await memory.recordPattern(
        "Observer",
        "Subscribe to changes",
        "subject.subscribe(observer)",
        "When objects need to react to changes"
      );

      await memory.incrementPatternUsage(pattern.id);
      await memory.incrementPatternUsage(pattern.id);

      const updated = memory.getPattern(pattern.id);
      expect(updated?.usage_count).toBe(2);
    });

    it("should search patterns by tags", async () => {
      await memory.recordPattern("P1", "D1", "E1", "W1", { tags: ["structural"] });
      await memory.recordPattern("P2", "D2", "E2", "W2", { tags: ["behavioral"] });

      const results = memory.searchPatterns({ tags: ["structural"] });
      expect(results.length).toBe(1);
    });
  });

  describe("Failure Storage", () => {
    it("should record a failure", async () => {
      const failure = await memory.recordFailure(
        "type_error",
        "Cannot read property 'x' of undefined",
        "Running API tests",
        { tags: ["runtime", "null-reference"] }
      );

      expect(failure.id).toBeDefined();
      expect(failure.error_type).toBe("type_error");
      expect(failure.resolved).toBe(false);
    });

    it("should record attempted fixes", async () => {
      const failure = await memory.recordFailure(
        "build_error",
        "Module not found",
        "Building project"
      );

      await memory.recordAttemptedFix(failure.id, "Added missing import", false);
      await memory.recordAttemptedFix(failure.id, "Installed missing package", true);

      const updated = memory.getFailure(failure.id);
      expect(updated?.attempted_fixes.length).toBe(2);
      expect(updated?.resolved).toBe(true);
    });

    it("should resolve a failure", async () => {
      const failure = await memory.recordFailure(
        "test_failure",
        "Assertion failed",
        "Running unit tests"
      );

      await memory.resolveFailure(failure.id, "Fixed assertion condition");

      const updated = memory.getFailure(failure.id);
      expect(updated?.resolved).toBe(true);
      expect(updated?.resolution).toBe("Fixed assertion condition");
    });

    it("should find similar failures", async () => {
      await memory.recordFailure("type_error", "Cannot read property 'foo' of undefined", "C1");
      await memory.recordFailure("type_error", "Cannot read property 'bar' of undefined", "C2");
      await memory.recordFailure("runtime_error", "Stack overflow", "C3");

      const similar = memory.findSimilarFailures("type_error", "Cannot read property");
      expect(similar.length).toBe(2);
    });
  });

  describe("Persistence", () => {
    it("should save and load memory", async () => {
      await memory.recordDecision("Test decision", "Test rationale", "Test context");
      await memory.recordPattern("Test pattern", "Desc", "Example", "Use when");
      await memory.recordFailure("test_error", "Test message", "Test context");

      await memory.save();

      // Create new memory instance and load
      const memory2 = new Memory(tempDir);
      await memory2.load();

      expect(memory2.getStats().decisions).toBe(1);
      expect(memory2.getStats().patterns).toBe(1);
      expect(memory2.getStats().failures).toBe(1);
    });

    it("should handle missing files on load", async () => {
      // New memory with no existing files
      await memory.load();
      expect(memory.getStats().decisions).toBe(0);
    });
  });

  describe("Statistics", () => {
    it("should track statistics", async () => {
      await memory.recordDecision("D1", "R1", "C1");
      await memory.recordDecision("D2", "R2", "C2");
      await memory.recordPattern("P1", "D1", "E1", "W1");
      const failure = await memory.recordFailure("E1", "M1", "C1");
      await memory.resolveFailure(failure.id, "Fixed");

      const stats = memory.getStats();
      expect(stats.decisions).toBe(2);
      expect(stats.patterns).toBe(1);
      expect(stats.failures).toBe(1);
      expect(stats.resolved_failures).toBe(1);
    });
  });

  describe("Configuration", () => {
    it("should update configuration", () => {
      memory.updateConfig({ max_decisions: 500 });
      const config = memory.getConfig();
      expect(config.max_decisions).toBe(500);
    });

    it("should clear all memory", async () => {
      await memory.recordDecision("D1", "R1", "C1");
      await memory.recordPattern("P1", "D1", "E1", "W1");

      await memory.clear();

      const stats = memory.getStats();
      expect(stats.decisions).toBe(0);
      expect(stats.patterns).toBe(0);
    });
  });
});
