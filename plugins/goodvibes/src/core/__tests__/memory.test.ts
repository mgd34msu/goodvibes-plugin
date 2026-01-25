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
    await memory.load();
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
        "library",
        { scope: ["src/"], confidence: "high" }
      );

      expect(decision.id).toBeDefined();
      expect(decision.id).toMatch(/^dec_\d{8}_\d{12}$/);
      expect(decision.what).toBe("Use TypeScript for the project");
      expect(decision.why).toBe("Better type safety and IDE support");
      expect(decision.category).toBe("library");
      expect(decision.confidence).toBe("high");
    });

    it("should retrieve a decision by ID", async () => {
      const created = await memory.recordDecision(
        "Decision 1",
        "Rationale 1",
        "pattern"
      );

      const retrieved = memory.getDecision(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.what).toBe("Decision 1");
    });

    it("should update decision status", async () => {
      const decision = await memory.recordDecision(
        "Try new approach",
        "Might work better",
        "architecture"
      );

      const updated = await memory.updateDecisionStatus(decision.id, "superseded");
      expect(updated).toBe(true);

      const retrieved = memory.getDecision(decision.id);
      expect(retrieved?.status).toBe("superseded");
    });

    it("should search decisions by file scope", async () => {
      await memory.recordDecision("Decision 1", "R1", "library", { scope: ["src/api/"] });
      await memory.recordDecision("Decision 2", "R2", "library", { scope: ["src/frontend/"] });
      await memory.recordDecision("Decision 3", "R3", "library", { scope: ["src/api/", "src/utils/"] });

      const results = memory.searchDecisions({ file: "src/api/" });
      expect(results.length).toBe(2);
    });

    it("should search decisions by query", async () => {
      await memory.recordDecision("Use React", "Popular framework", "library");
      await memory.recordDecision("Use Vue", "Easy learning curve", "library");

      const results = memory.searchDecisions({ query: "React" });
      expect(results.length).toBe(1);
      expect(results[0].what).toBe("Use React");
    });
  });

  describe("Pattern Storage", () => {
    it("should record a pattern", async () => {
      const pattern = await memory.recordPattern(
        "Singleton",
        "Ensures single instance",
        "When you need global state",
        { example_files: ["src/singleton.ts"], keywords: ["design-pattern", "creational"] }
      );

      expect(pattern.id).toBeDefined();
      expect(pattern.id).toMatch(/^pat_\d{8}_\d{12}$/);
      expect(pattern.name).toBe("Singleton");
      expect(pattern.keywords).toContain("creational");
    });

    it("should retrieve pattern by name", async () => {
      await memory.recordPattern(
        "Factory",
        "Creates objects",
        "When object creation is complex"
      );

      const pattern = memory.getPatternByName("Factory");
      expect(pattern).toBeDefined();
      expect(pattern?.description).toBe("Creates objects");
    });

    it("should search patterns by keywords", async () => {
      await memory.recordPattern("P1", "D1", "W1", { keywords: ["structural"] });
      await memory.recordPattern("P2", "D2", "W2", { keywords: ["behavioral"] });

      const results = memory.searchPatterns({ tags: ["structural"] });
      expect(results.length).toBe(1);
    });
  });

  describe("Failure Storage", () => {
    it("should record a failure", async () => {
      const failure = await memory.recordFailure(
        "Cannot read property 'x' of undefined",
        "Running API tests",
        "Null reference in API handler",
        "Added null check before accessing property",
        "Always validate objects before property access",
        { keywords: ["runtime", "null-reference"] }
      );

      expect(failure.id).toBeDefined();
      expect(failure.id).toMatch(/^fail_\d{8}_\d{12}$/);
      expect(failure.error).toBe("Cannot read property 'x' of undefined");
      expect(failure.root_cause).toBe("Null reference in API handler");
    });

    it("should find similar failures", async () => {
      await memory.recordFailure("Cannot read property 'foo' of undefined", "C1", "RC1", "Res1", "Prev1");
      await memory.recordFailure("Cannot read property 'bar' of undefined", "C2", "RC2", "Res2", "Prev2");
      await memory.recordFailure("Stack overflow", "C3", "RC3", "Res3", "Prev3");

      const similar = memory.findSimilarFailures("Cannot read property");
      expect(similar.length).toBe(2);
    });
  });

  describe("Persistence", () => {
    it("should save and load memory", async () => {
      await memory.recordDecision("Test decision", "Test rationale", "library");
      await memory.recordPattern("Test pattern", "Desc", "Use when");
      await memory.recordFailure("Test error", "Test context", "Root cause", "Resolution", "Prevention");

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
      await memory.recordDecision("D1", "R1", "library");
      await memory.recordDecision("D2", "R2", "pattern", { status: "superseded" });
      await memory.recordPattern("P1", "D1", "W1");
      await memory.recordFailure("E1", "C1", "RC1", "Res1", "Prev1");

      const stats = memory.getStats();
      expect(stats.decisions).toBe(2);
      expect(stats.patterns).toBe(1);
      expect(stats.failures).toBe(1);
      expect(stats.active_decisions).toBe(1);
      expect(stats.superseded_decisions).toBe(1);
    });
  });

  describe("Configuration", () => {
    it("should update configuration", () => {
      memory.updateConfig({ max_decisions: 500 });
      const config = memory.getConfig();
      expect(config.max_decisions).toBe(500);
    });

    it("should clear all memory", async () => {
      await memory.recordDecision("D1", "R1", "library");
      await memory.recordPattern("P1", "D1", "W1");

      await memory.clear();

      const stats = memory.getStats();
      expect(stats.decisions).toBe(0);
      expect(stats.patterns).toBe(0);
    });
  });
});
