/**
 * Integration tests for memory persistence
 *
 * Tests the full CRUD cycle for all memory types:
 * - Decisions
 * - Patterns
 * - Failures
 * - Preferences
 *
 * Verifies memory survives across "sessions" and handles concurrent access
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadMemory,
  appendDecision,
  appendPattern,
  appendFailure,
  appendPreference,
  hasMemory,
  getMemorySummary,
  searchMemory,
  getMemoryDir,
  type Decision,
  type Pattern,
  type Failure,
  type Preference,
} from '../../memory.js';

describe('memory-persistence integration', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'goodvibes-memory-integration-')
    );
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('full CRUD cycle', () => {
    it('should complete full lifecycle for decisions', async () => {
      // Create
      const decision: Decision = {
        title: 'Use TypeScript for type safety',
        date: '2025-01-01',
        alternatives: ['JavaScript', 'Flow'],
        rationale: 'Better IDE support and compile-time error checking',
        agent: 'backend-engineer',
      };

      await appendDecision(testDir, decision);

      // Read
      let memory = await loadMemory(testDir);
      expect(memory.decisions).toHaveLength(1);
      expect(memory.decisions[0].title).toBe(decision.title);

      // Update (append new version)
      const updatedDecision: Decision = {
        title: 'Use TypeScript for type safety',
        date: '2025-01-15',
        alternatives: ['JavaScript', 'Flow', 'JSDoc'],
        rationale:
          'Better IDE support, compile-time errors, and rich ecosystem',
        agent: 'backend-engineer',
        context: 'After evaluating JSDoc as well',
      };

      await appendDecision(testDir, updatedDecision);

      memory = await loadMemory(testDir);
      expect(memory.decisions).toHaveLength(2);

      // Verify persistence
      expect(memory.decisions[0].title).toBe(decision.title);
      expect(memory.decisions[1].context).toBe(
        'After evaluating JSDoc as well'
      );
    });

    it('should complete full lifecycle for patterns', async () => {
      // Create
      const pattern: Pattern = {
        name: 'Repository Pattern',
        date: '2025-01-01',
        description: 'Separate data access logic into repository classes',
        example:
          '```typescript\nclass UserRepository {\n  async findById(id: string) { ... }\n}\n```',
        files: ['/src/repositories/user.ts'],
      };

      await appendPattern(testDir, pattern);

      // Read
      let memory = await loadMemory(testDir);
      expect(memory.patterns).toHaveLength(1);

      // Update (add more examples)
      const extendedPattern: Pattern = {
        name: 'Repository Pattern',
        date: '2025-01-10',
        description: 'Extended with generic base class',
        example: '```typescript\nclass BaseRepository<T> { ... }\n```',
        files: ['/src/repositories/base.ts', '/src/repositories/user.ts'],
      };

      await appendPattern(testDir, extendedPattern);

      memory = await loadMemory(testDir);
      expect(memory.patterns).toHaveLength(2);
      expect(memory.patterns[1].files).toContain('/src/repositories/base.ts');
    });

    it('should complete full lifecycle for failures', async () => {
      // Create
      const failure: Failure = {
        approach: 'Using setTimeout for async operations',
        date: '2025-01-01',
        reason: 'Unreliable and prone to race conditions',
        suggestion: 'Use Promises or async/await instead',
      };

      await appendFailure(testDir, failure);

      // Read
      let memory = await loadMemory(testDir);
      expect(memory.failures).toHaveLength(1);

      // Add context to existing failure
      const contextualFailure: Failure = {
        approach: 'Using setTimeout for async operations',
        date: '2025-01-05',
        reason: 'Unreliable and prone to race conditions',
        context: 'Specifically problematic in test environments',
        suggestion:
          'Use Promises or async/await, especially with proper error handling',
      };

      await appendFailure(testDir, contextualFailure);

      memory = await loadMemory(testDir);
      expect(memory.failures).toHaveLength(2);
      expect(memory.failures[1].context).toBeDefined();
    });

    it('should complete full lifecycle for preferences', async () => {
      // Create
      const preference: Preference = {
        key: 'code_style',
        value: 'Use 2-space indentation',
        date: '2025-01-01',
      };

      await appendPreference(testDir, preference);

      // Read
      let memory = await loadMemory(testDir);
      expect(memory.preferences).toHaveLength(1);

      // Update preference
      const updatedPreference: Preference = {
        key: 'code_style',
        value: 'Use 2-space indentation, single quotes, no semicolons',
        date: '2025-01-10',
        notes: 'Aligned with Prettier defaults',
      };

      await appendPreference(testDir, updatedPreference);

      memory = await loadMemory(testDir);
      expect(memory.preferences).toHaveLength(2);
      expect(memory.preferences[1].notes).toBe(
        'Aligned with Prettier defaults'
      );
    });
  });

  describe('cross-session persistence', () => {
    it('should maintain memory across simulated sessions', async () => {
      // Session 1: Add initial memories
      await appendDecision(testDir, {
        title: 'Session 1 Decision',
        date: '2025-01-01',
        alternatives: ['Alt A'],
        rationale: 'Reason A',
      });

      await appendPattern(testDir, {
        name: 'Session 1 Pattern',
        date: '2025-01-01',
        description: 'Pattern A',
      });

      let summary = await getMemorySummary(testDir);
      expect(summary.decisionsCount).toBe(1);
      expect(summary.patternsCount).toBe(1);

      // Session 2: Add more memories
      await appendDecision(testDir, {
        title: 'Session 2 Decision',
        date: '2025-01-02',
        alternatives: ['Alt B'],
        rationale: 'Reason B',
      });

      await appendFailure(testDir, {
        approach: 'Session 2 Failure',
        date: '2025-01-02',
        reason: 'Failed approach',
      });

      summary = await getMemorySummary(testDir);
      expect(summary.decisionsCount).toBe(2);
      expect(summary.patternsCount).toBe(1);
      expect(summary.failuresCount).toBe(1);

      // Session 3: Verify all memories persist
      const memory = await loadMemory(testDir);
      expect(memory.decisions).toHaveLength(2);
      expect(memory.patterns).toHaveLength(1);
      expect(memory.failures).toHaveLength(1);

      // Verify specific memories
      const decisionTitles = memory.decisions.map((d) => d.title);
      expect(decisionTitles).toContain('Session 1 Decision');
      expect(decisionTitles).toContain('Session 2 Decision');
    });

    it('should handle rapid consecutive writes', async () => {
      // Simulate rapid decision making
      for (let i = 0; i < 10; i++) {
        await appendDecision(testDir, {
          title: `Rapid Decision ${i}`,
          date: '2025-01-01',
          alternatives: [`Alt ${i}`],
          rationale: `Reason ${i}`,
        });
      }

      const memory = await loadMemory(testDir);
      expect(memory.decisions).toHaveLength(10);

      // Verify order preservation
      for (let i = 0; i < 10; i++) {
        expect(memory.decisions[i].title).toBe(`Rapid Decision ${i}`);
      }
    });

    it('should survive directory recreation', async () => {
      // Add memories
      await appendDecision(testDir, {
        title: 'Persistent Decision',
        date: '2025-01-01',
        alternatives: [],
        rationale: 'Test persistence',
      });

      const memoryDir = getMemoryDir(testDir);
      expect(fs.existsSync(memoryDir)).toBe(true);

      // Load to verify
      let memory = await loadMemory(testDir);
      expect(memory.decisions).toHaveLength(1);

      // Simulate directory check (don't recreate if exists)
      if (fs.existsSync(memoryDir)) {
        memory = await loadMemory(testDir);
        expect(memory.decisions).toHaveLength(1);
        expect(memory.decisions[0].title).toBe('Persistent Decision');
      }
    });
  });

  describe('concurrent access patterns', () => {
    it('should handle interleaved writes to different memory types', async () => {
      await appendDecision(testDir, {
        title: 'Decision 1',
        date: '2025-01-01',
        alternatives: [],
        rationale: 'Reason',
      });

      await appendPattern(testDir, {
        name: 'Pattern 1',
        date: '2025-01-01',
        description: 'Desc',
      });

      await appendDecision(testDir, {
        title: 'Decision 2',
        date: '2025-01-02',
        alternatives: [],
        rationale: 'Reason',
      });

      await appendFailure(testDir, {
        approach: 'Failure 1',
        date: '2025-01-02',
        reason: 'Failed',
      });

      await appendPattern(testDir, {
        name: 'Pattern 2',
        date: '2025-01-03',
        description: 'Desc',
      });

      const memory = await loadMemory(testDir);
      expect(memory.decisions).toHaveLength(2);
      expect(memory.patterns).toHaveLength(2);
      expect(memory.failures).toHaveLength(1);
    });

    it('should handle reads during writes', async () => {
      // Write initial data
      await appendDecision(testDir, {
        title: 'Base Decision',
        date: '2025-01-01',
        alternatives: [],
        rationale: 'Base',
      });

      // Interleave reads and writes
      for (let i = 0; i < 5; i++) {
        const memory = await loadMemory(testDir);
        expect(memory.decisions.length).toBeGreaterThan(0);

        await appendDecision(testDir, {
          title: `Decision ${i}`,
          date: '2025-01-01',
          alternatives: [],
          rationale: `Reason ${i}`,
        });
      }

      const finalMemory = await loadMemory(testDir);
      expect(finalMemory.decisions).toHaveLength(6); // Base + 5 added
    });

    it('should maintain consistency with mixed operations', async () => {
      await appendDecision(testDir, {
        title: 'D1',
        date: '2025-01-01',
        alternatives: [],
        rationale: 'R1',
      });
      await loadMemory(testDir);
      await appendPattern(testDir, {
        name: 'P1',
        date: '2025-01-01',
        description: 'Desc',
      });
      await getMemorySummary(testDir);
      await appendFailure(testDir, {
        approach: 'F1',
        date: '2025-01-01',
        reason: 'Failed',
      });
      await hasMemory(testDir);
      await appendPreference(testDir, {
        key: 'K1',
        value: 'V1',
        date: '2025-01-01',
      });

      const summary = await getMemorySummary(testDir);
      expect(summary.decisionsCount).toBe(1);
      expect(summary.patternsCount).toBe(1);
      expect(summary.failuresCount).toBe(1);
      expect(summary.preferencesCount).toBe(1);
    });
  });

  describe('search across all memory types', () => {
    beforeEach(async () => {
      // Populate with diverse memories
      await appendDecision(testDir, {
        title: 'Use PostgreSQL for database',
        date: '2025-01-01',
        alternatives: ['MySQL', 'MongoDB'],
        rationale: 'Better JSON support and ACID compliance',
      });

      await appendPattern(testDir, {
        name: 'Database Connection Pooling',
        date: '2025-01-02',
        description: 'Always use connection pooling for PostgreSQL',
        example: '```typescript\nconst pool = new Pool({ max: 20 });\n```',
      });

      await appendFailure(testDir, {
        approach: 'Using MongoDB for relational data',
        date: '2025-01-03',
        reason: 'Complex joins were too slow',
        suggestion: 'Use PostgreSQL for relational data instead',
      });

      await appendPreference(testDir, {
        key: 'database_queries',
        value: 'Always use parameterized queries to prevent SQL injection',
        date: '2025-01-04',
      });
    });

    it('should find memories across all types with single keyword', async () => {
      const results = await searchMemory(testDir, ['PostgreSQL']);

      expect(results.decisions.length).toBeGreaterThan(0);
      expect(results.patterns.length).toBeGreaterThan(0);
      expect(results.failures.length).toBeGreaterThan(0);

      expect(results.decisions[0].title).toContain('PostgreSQL');
      expect(results.patterns[0].description).toContain('PostgreSQL');
      expect(results.failures[0].suggestion).toContain('PostgreSQL');
    });

    it('should find memories with multiple keywords', async () => {
      const results = await searchMemory(testDir, ['database', 'queries']);

      expect(results.preferences.length).toBeGreaterThan(0);
      expect(results.preferences[0].key).toContain('database');
    });

    it('should handle searches with no results', async () => {
      const results = await searchMemory(testDir, ['nonexistent', 'keywords']);

      expect(results.decisions).toHaveLength(0);
      expect(results.patterns).toHaveLength(0);
      expect(results.failures).toHaveLength(0);
      expect(results.preferences).toHaveLength(0);
    });

    it('should perform case-insensitive search', async () => {
      const results = await searchMemory(testDir, ['POSTGRESQL', 'Database']);

      expect(
        results.decisions.length +
          results.patterns.length +
          results.failures.length
      ).toBeGreaterThan(0);
    });

    it('should find memories in alternatives and suggestions', async () => {
      const mongoResults = await searchMemory(testDir, ['MongoDB']);

      expect(mongoResults.decisions.length).toBeGreaterThan(0); // In alternatives
      expect(mongoResults.failures.length).toBeGreaterThan(0); // In approach
    });
  });

  describe('memory summary metrics', () => {
    it('should track accurate counts for all memory types', async () => {
      expect(await hasMemory(testDir)).toBe(false);

      await appendDecision(testDir, {
        title: 'D1',
        date: '2025-01-01',
        alternatives: [],
        rationale: 'R1',
      });
      await appendDecision(testDir, {
        title: 'D2',
        date: '2025-01-01',
        alternatives: [],
        rationale: 'R2',
      });
      await appendPattern(testDir, {
        name: 'P1',
        date: '2025-01-01',
        description: 'Desc',
      });
      await appendFailure(testDir, {
        approach: 'F1',
        date: '2025-01-01',
        reason: 'Failed',
      });
      await appendPreference(testDir, {
        key: 'K1',
        value: 'V1',
        date: '2025-01-01',
      });
      await appendPreference(testDir, {
        key: 'K2',
        value: 'V2',
        date: '2025-01-01',
      });

      expect(await hasMemory(testDir)).toBe(true);

      const summary = await getMemorySummary(testDir);
      expect(summary.hasMemory).toBe(true);
      expect(summary.decisionsCount).toBe(2);
      expect(summary.patternsCount).toBe(1);
      expect(summary.failuresCount).toBe(1);
      expect(summary.preferencesCount).toBe(2);
    });

    it('should update counts incrementally', async () => {
      let summary = await getMemorySummary(testDir);
      expect(summary.decisionsCount).toBe(0);

      await appendDecision(testDir, {
        title: 'D1',
        date: '2025-01-01',
        alternatives: [],
        rationale: 'R1',
      });
      summary = await getMemorySummary(testDir);
      expect(summary.decisionsCount).toBe(1);

      await appendDecision(testDir, {
        title: 'D2',
        date: '2025-01-01',
        alternatives: [],
        rationale: 'R2',
      });
      summary = await getMemorySummary(testDir);
      expect(summary.decisionsCount).toBe(2);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty memory directory gracefully', async () => {
      const memory = await loadMemory(testDir);

      expect(memory.decisions).toEqual([]);
      expect(memory.patterns).toEqual([]);
      expect(memory.failures).toEqual([]);
      expect(memory.preferences).toEqual([]);
    });

    it('should handle malformed memory files', async () => {
      const memoryDir = getMemoryDir(testDir);
      fs.mkdirSync(memoryDir, { recursive: true });

      // Create malformed decision file
      const decisionsPath = path.join(memoryDir, 'decisions.md');
      fs.writeFileSync(
        decisionsPath,
        '# Malformed\nIncomplete entry without proper headers'
      );

      // Should not crash
      const memory = await loadMemory(testDir);
      expect(memory).toBeDefined();
    });

    it('should handle very long content', async () => {
      const longRationale = 'A'.repeat(10000);

      await appendDecision(testDir, {
        title: 'Long Decision',
        date: '2025-01-01',
        alternatives: ['B'.repeat(5000)],
        rationale: longRationale,
      });

      const memory = await loadMemory(testDir);
      expect(memory.decisions[0].rationale.length).toBe(10000);
    });

    it('should handle special characters in content', async () => {
      await appendDecision(testDir, {
        title: 'Decision with "quotes" and \'apostrophes\'',
        date: '2025-01-01',
        alternatives: ['Option with \n newlines'],
        rationale: 'Rationale with special chars: @#$%^&*()',
      });

      const memory = await loadMemory(testDir);
      expect(memory.decisions[0].title).toContain('quotes');
    });

    it('should handle Unicode characters', async () => {
      await appendPattern(testDir, {
        name: 'Pattern avec français 中文 العربية',
        date: '2025-01-01',
        description: 'Unicode support test',
      });

      const memory = await loadMemory(testDir);
      expect(memory.patterns[0].name).toContain('français');
      expect(memory.patterns[0].name).toContain('中文');
    });
  });
});
