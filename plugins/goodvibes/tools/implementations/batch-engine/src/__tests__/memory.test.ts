/**
 * Integration tests for memory system
 * Tests decision recording, pattern tracking, failure recording, and search
 * @see SPEC-v2 Section 8
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  Memory,
  Decision,
  Pattern,
  Failure,
  Preference,
  DecisionCategory,
} from '../interfaces/memory.js';

describe('Memory System Integration', () => {
  let memorySystem: MockMemorySystem;

  beforeEach(() => {
    memorySystem = new MockMemorySystem();
  });

  describe('Decision Recording and Retrieval', () => {
    it('records architectural decision', async () => {
      // Arrange
      const decision: Omit<Decision, 'id' | 'timestamp'> = {
        what: 'Use React Server Components',
        why: 'Better performance and reduced client bundle size',
        category: 'architecture',
        confidence: 'high',
        files: ['app/layout.tsx', 'app/page.tsx'],
        symbols: ['RootLayout', 'HomePage'],
        status: 'active',
        batch_id: 'batch-001',
      };

      // Act
      const recorded = await memorySystem.recordDecision(decision);

      // Assert
      expect(recorded.id).toBeDefined();
      expect(recorded.timestamp).toBeDefined();
      expect(recorded.what).toBe(decision.what);
      expect(recorded.category).toBe('architecture');
    });

    it('retrieves decision by ID', async () => {
      // Arrange
      const decision = await memorySystem.recordDecision({
        what: 'Use Vitest for testing',
        why: 'Native ESM support and better performance',
        category: 'testing',
        confidence: 'high',
        status: 'active',
      });

      // Act
      const retrieved = await memorySystem.getDecision(decision.id);

      // Assert
      expect(retrieved).toEqual(decision);
    });

    it('supersedes old decision with new one', async () => {
      // Arrange
      const oldDecision = await memorySystem.recordDecision({
        what: 'Use Jest for testing',
        why: 'Standard in the ecosystem',
        category: 'testing',
        confidence: 'medium',
        status: 'active',
      });

      // Act
      const newDecision = await memorySystem.recordDecision({
        what: 'Use Vitest for testing',
        why: 'Better performance and Vite integration',
        category: 'testing',
        confidence: 'high',
        status: 'active',
      });

      await memorySystem.supersedeDecision(oldDecision.id, newDecision.id);

      // Assert
      const updated = await memorySystem.getDecision(oldDecision.id);
      expect(updated.status).toBe('superseded');
      expect(updated.superseded_by).toBe(newDecision.id);
    });

    it('reverts decision', async () => {
      // Arrange
      const decision = await memorySystem.recordDecision({
        what: 'Migrate to TypeScript 5.0',
        why: 'Access to new features',
        category: 'architecture',
        confidence: 'high',
        status: 'active',
      });

      // Act
      await memorySystem.revertDecision(decision.id);

      // Assert
      const reverted = await memorySystem.getDecision(decision.id);
      expect(reverted.status).toBe('reverted');
    });

    it('searches decisions by category', async () => {
      // Arrange
      await memorySystem.recordDecision({
        what: 'Use PostgreSQL',
        why: 'ACID compliance',
        category: 'architecture',
        confidence: 'high',
        status: 'active',
      });
      await memorySystem.recordDecision({
        what: 'Use Redis for caching',
        why: 'Fast in-memory storage',
        category: 'performance',
        confidence: 'high',
        status: 'active',
      });
      await memorySystem.recordDecision({
        what: 'Use Prisma ORM',
        why: 'Type-safe database access',
        category: 'architecture',
        confidence: 'medium',
        status: 'active',
      });

      // Act
      const archDecisions = await memorySystem.searchDecisions({
        category: 'architecture',
      });

      // Assert
      expect(archDecisions).toHaveLength(2);
      expect(archDecisions.every((d) => d.category === 'architecture')).toBe(true);
    });

    it('searches decisions by status', async () => {
      // Arrange
      const active1 = await memorySystem.recordDecision({
        what: 'Decision 1',
        why: 'Reason 1',
        category: 'architecture',
        confidence: 'high',
        status: 'active',
      });
      const active2 = await memorySystem.recordDecision({
        what: 'Decision 2',
        why: 'Reason 2',
        category: 'architecture',
        confidence: 'high',
        status: 'active',
      });
      await memorySystem.revertDecision(active2.id);

      // Act
      const activeDecisions = await memorySystem.searchDecisions({
        status: 'active',
      });

      // Assert
      expect(activeDecisions).toHaveLength(1);
      expect(activeDecisions[0].id).toBe(active1.id);
    });
  });

  describe('Pattern Recording and Usage Tracking', () => {
    it('records code pattern', async () => {
      // Arrange
      const pattern: Omit<Pattern, 'id' | 'timestamp' | 'usage_count'> = {
        name: 'Repository Pattern',
        description: 'Encapsulate data access logic',
        examples: [
          {
            file: 'src/repositories/UserRepository.ts',
            lines: [1, 50],
            code: 'export class UserRepository { ... }',
          },
        ],
        when_to_use: 'When you need to abstract database operations',
        when_not_to_use: 'For simple CRUD with no business logic',
        discovered_in: 'batch-001',
      };

      // Act
      const recorded = await memorySystem.recordPattern(pattern);

      // Assert
      expect(recorded.id).toBeDefined();
      expect(recorded.timestamp).toBeDefined();
      expect(recorded.usage_count).toBe(0);
      expect(recorded.name).toBe(pattern.name);
    });

    it('increments pattern usage count', async () => {
      // Arrange
      const pattern = await memorySystem.recordPattern({
        name: 'Factory Pattern',
        description: 'Create objects without specifying exact class',
        examples: [],
        when_to_use: 'When object creation is complex',
        usage_count: 0,
      });

      // Act
      await memorySystem.incrementPatternUsage(pattern.id);
      await memorySystem.incrementPatternUsage(pattern.id);
      await memorySystem.incrementPatternUsage(pattern.id);

      // Assert
      const updated = await memorySystem.getPattern(pattern.id);
      expect(updated.usage_count).toBe(3);
    });

    it('searches patterns by keyword', async () => {
      // Arrange
      await memorySystem.recordPattern({
        name: 'Repository Pattern',
        description: 'Data access abstraction',
        examples: [],
        when_to_use: 'For database operations',
        usage_count: 0,
      });
      await memorySystem.recordPattern({
        name: 'Factory Pattern',
        description: 'Object creation pattern',
        examples: [],
        when_to_use: 'For complex object creation',
        usage_count: 0,
      });

      // Act
      const results = await memorySystem.searchPatterns('repository');

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Repository Pattern');
    });

    it('gets most used patterns', async () => {
      // Arrange
      const p1 = await memorySystem.recordPattern({
        name: 'Pattern A',
        description: 'Description A',
        examples: [],
        when_to_use: 'When A',
        usage_count: 0,
      });
      const p2 = await memorySystem.recordPattern({
        name: 'Pattern B',
        description: 'Description B',
        examples: [],
        when_to_use: 'When B',
        usage_count: 0,
      });
      const p3 = await memorySystem.recordPattern({
        name: 'Pattern C',
        description: 'Description C',
        examples: [],
        when_to_use: 'When C',
        usage_count: 0,
      });

      // Set different usage counts
      for (let i = 0; i < 5; i++) await memorySystem.incrementPatternUsage(p2.id);
      for (let i = 0; i < 3; i++) await memorySystem.incrementPatternUsage(p1.id);
      await memorySystem.incrementPatternUsage(p3.id);

      // Act
      const topPatterns = await memorySystem.getMostUsedPatterns(2);

      // Assert
      expect(topPatterns).toHaveLength(2);
      expect(topPatterns[0].id).toBe(p2.id); // Most used
      expect(topPatterns[1].id).toBe(p1.id); // Second most
    });
  });

  describe('Failure Recording and Resolution', () => {
    it('records failure with stack trace', async () => {
      // Arrange
      const failure: Omit<Failure, 'id' | 'timestamp'> = {
        error_type: 'TypeError',
        error_message: 'Cannot read property "x" of undefined',
        stack_trace: 'at main (app.ts:42:5)',
        operation: 'read-file',
        files: ['app.ts'],
        resolved: false,
      };

      // Act
      const recorded = await memorySystem.recordFailure(failure);

      // Assert
      expect(recorded.id).toBeDefined();
      expect(recorded.timestamp).toBeDefined();
      expect(recorded.error_type).toBe('TypeError');
      expect(recorded.resolved).toBe(false);
    });

    it('marks failure as resolved with resolution details', async () => {
      // Arrange
      const failure = await memorySystem.recordFailure({
        error_type: 'ValidationError',
        error_message: 'Email format invalid',
        operation: 'validate-user',
        resolved: false,
      });

      // Act
      await memorySystem.resolveFailure(failure.id, {
        resolution: 'Added email validation regex',
        resolution_batch: 'batch-fix-001',
        root_cause: 'Missing input validation',
        prevention: 'Add validation schema at API boundary',
      });

      // Assert
      const resolved = await memorySystem.getFailure(failure.id);
      expect(resolved.resolved).toBe(true);
      expect(resolved.resolution).toBe('Added email validation regex');
      expect(resolved.root_cause).toBe('Missing input validation');
    });

    it('searches unresolved failures', async () => {
      // Arrange
      await memorySystem.recordFailure({
        error_type: 'Error1',
        error_message: 'Message 1',
        resolved: false,
      });
      const f2 = await memorySystem.recordFailure({
        error_type: 'Error2',
        error_message: 'Message 2',
        resolved: false,
      });
      await memorySystem.recordFailure({
        error_type: 'Error3',
        error_message: 'Message 3',
        resolved: false,
      });

      // Resolve one
      await memorySystem.resolveFailure(f2.id, {
        resolution: 'Fixed',
      });

      // Act
      const unresolved = await memorySystem.searchFailures({ resolved: false });

      // Assert
      expect(unresolved).toHaveLength(2);
      expect(unresolved.every((f) => !f.resolved)).toBe(true);
    });

    it('searches failures by error type', async () => {
      // Arrange
      await memorySystem.recordFailure({
        error_type: 'TypeError',
        error_message: 'Type error 1',
        resolved: false,
      });
      await memorySystem.recordFailure({
        error_type: 'ValidationError',
        error_message: 'Validation error 1',
        resolved: false,
      });
      await memorySystem.recordFailure({
        error_type: 'TypeError',
        error_message: 'Type error 2',
        resolved: false,
      });

      // Act
      const typeErrors = await memorySystem.searchFailures({
        error_type: 'TypeError',
      });

      // Assert
      expect(typeErrors).toHaveLength(2);
      expect(typeErrors.every((f) => f.error_type === 'TypeError')).toBe(true);
    });
  });

  describe('Search Functionality', () => {
    it('searches across all memory types', async () => {
      // Arrange
      await memorySystem.recordDecision({
        what: 'Use GraphQL',
        why: 'Flexible data fetching',
        category: 'architecture',
        confidence: 'high',
        status: 'active',
      });
      await memorySystem.recordPattern({
        name: 'GraphQL Resolver Pattern',
        description: 'Structure GraphQL resolvers',
        examples: [],
        when_to_use: 'In GraphQL APIs',
        usage_count: 0,
      });
      await memorySystem.recordFailure({
        error_type: 'GraphQL Error',
        error_message: 'Invalid query',
        resolved: true,
      });

      // Act
      const results = await memorySystem.searchAll('GraphQL');

      // Assert
      expect(results.decisions).toHaveLength(1);
      expect(results.patterns).toHaveLength(1);
      expect(results.failures).toHaveLength(1);
    });

    it('filters search by date range', async () => {
      // Arrange
      const oldDecision = await memorySystem.recordDecision({
        what: 'Old decision',
        why: 'Reason',
        category: 'architecture',
        confidence: 'high',
        status: 'active',
      });

      // Modify timestamp to be older
      oldDecision.timestamp = '2024-01-01T00:00:00Z';
      await memorySystem.updateDecisionTimestamp(oldDecision.id, oldDecision.timestamp);

      const recentDecision = await memorySystem.recordDecision({
        what: 'Recent decision',
        why: 'Reason',
        category: 'architecture',
        confidence: 'high',
        status: 'active',
      });

      // Act
      const recentResults = await memorySystem.searchDecisions({
        since: '2024-06-01T00:00:00Z',
      });

      // Assert
      expect(recentResults).toHaveLength(1);
      expect(recentResults[0].id).toBe(recentDecision.id);
    });

    it('limits search results', async () => {
      // Arrange
      for (let i = 0; i < 10; i++) {
        await memorySystem.recordDecision({
          what: `Decision ${i}`,
          why: 'Reason',
          category: 'architecture',
          confidence: 'high',
          status: 'active',
        });
      }

      // Act
      const limited = await memorySystem.searchDecisions({ limit: 5 });

      // Assert
      expect(limited).toHaveLength(5);
    });

    it('searches by file reference', async () => {
      // Arrange
      await memorySystem.recordDecision({
        what: 'Decision 1',
        why: 'Reason',
        category: 'architecture',
        confidence: 'high',
        status: 'active',
        files: ['src/app.ts', 'src/config.ts'],
      });
      await memorySystem.recordDecision({
        what: 'Decision 2',
        why: 'Reason',
        category: 'architecture',
        confidence: 'high',
        status: 'active',
        files: ['src/utils.ts'],
      });

      // Act
      const results = await memorySystem.searchDecisions({
        file: 'src/app.ts',
      });

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].what).toBe('Decision 1');
    });
  });

  describe('Memory Export and Import', () => {
    it('exports all memory to JSON', async () => {
      // Arrange
      await memorySystem.recordDecision({
        what: 'Test decision',
        why: 'Test reason',
        category: 'testing',
        confidence: 'high',
        status: 'active',
      });
      await memorySystem.recordPattern({
        name: 'Test pattern',
        description: 'Test description',
        examples: [],
        when_to_use: 'Always',
        usage_count: 0,
      });

      // Act
      const exported = await memorySystem.export();

      // Assert
      expect(exported.decisions).toHaveLength(1);
      expect(exported.patterns).toHaveLength(1);
      expect(exported.failures).toHaveLength(0);
      expect(exported.preferences).toHaveLength(0);
    });

    it('imports memory from JSON', async () => {
      // Arrange
      const importData: Memory = {
        decisions: [
          {
            id: 'dec-001',
            timestamp: '2024-01-01T00:00:00Z',
            what: 'Imported decision',
            why: 'Test',
            category: 'architecture',
            confidence: 'high',
            status: 'active',
          },
        ],
        patterns: [],
        failures: [],
        preferences: [],
      };

      // Act
      await memorySystem.import(importData);

      // Assert
      const decision = await memorySystem.getDecision('dec-001');
      expect(decision).toBeDefined();
      expect(decision.what).toBe('Imported decision');
    });
  });
});

// ============================================================================
// Mock Implementation
// ============================================================================

class MockMemorySystem {
  private decisions: Map<string, Decision> = new Map();
  private patterns: Map<string, Pattern> = new Map();
  private failures: Map<string, Failure> = new Map();
  private preferences: Map<string, Preference> = new Map();
  private counter = 0;

  async recordDecision(
    data: Omit<Decision, 'id' | 'timestamp'>
  ): Promise<Decision> {
    const decision: Decision = {
      id: `dec-${++this.counter}`,
      timestamp: new Date().toISOString(),
      ...data,
    };
    this.decisions.set(decision.id, decision);
    return decision;
  }

  async getDecision(id: string): Promise<Decision> {
    return this.decisions.get(id)!;
  }

  async supersedeDecision(oldId: string, newId: string): Promise<void> {
    const old = this.decisions.get(oldId);
    if (old) {
      old.status = 'superseded';
      old.superseded_by = newId;
    }
  }

  async revertDecision(id: string): Promise<void> {
    const decision = this.decisions.get(id);
    if (decision) {
      decision.status = 'reverted';
    }
  }

  async updateDecisionTimestamp(id: string, timestamp: string): Promise<void> {
    const decision = this.decisions.get(id);
    if (decision) {
      decision.timestamp = timestamp;
    }
  }

  async searchDecisions(filters: {
    category?: DecisionCategory;
    status?: Decision['status'];
    since?: string;
    limit?: number;
    file?: string;
  }): Promise<Decision[]> {
    let results = Array.from(this.decisions.values());

    if (filters.category) {
      results = results.filter((d) => d.category === filters.category);
    }

    if (filters.status) {
      results = results.filter((d) => d.status === filters.status);
    }

    if (filters.since) {
      results = results.filter((d) => d.timestamp >= filters.since!);
    }

    if (filters.file) {
      results = results.filter((d) => d.files?.includes(filters.file!));
    }

    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  async recordPattern(data: Omit<Pattern, 'id' | 'timestamp'>): Promise<Pattern> {
    const pattern: Pattern = {
      id: `pat-${++this.counter}`,
      timestamp: new Date().toISOString(),
      usage_count: data.usage_count ?? 0,
      ...data,
    };
    this.patterns.set(pattern.id, pattern);
    return pattern;
  }

  async getPattern(id: string): Promise<Pattern> {
    return this.patterns.get(id)!;
  }

  async incrementPatternUsage(id: string): Promise<void> {
    const pattern = this.patterns.get(id);
    if (pattern) {
      pattern.usage_count++;
    }
  }

  async searchPatterns(keyword: string): Promise<Pattern[]> {
    return Array.from(this.patterns.values()).filter(
      (p) =>
        p.name.toLowerCase().includes(keyword.toLowerCase()) ||
        p.description.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  async getMostUsedPatterns(limit: number): Promise<Pattern[]> {
    return Array.from(this.patterns.values())
      .sort((a, b) => b.usage_count - a.usage_count)
      .slice(0, limit);
  }

  async recordFailure(data: Omit<Failure, 'id' | 'timestamp'>): Promise<Failure> {
    const failure: Failure = {
      id: `fail-${++this.counter}`,
      timestamp: new Date().toISOString(),
      ...data,
    };
    this.failures.set(failure.id, failure);
    return failure;
  }

  async getFailure(id: string): Promise<Failure> {
    return this.failures.get(id)!;
  }

  async resolveFailure(
    id: string,
    resolution: {
      resolution?: string;
      resolution_batch?: string;
      root_cause?: string;
      prevention?: string;
    }
  ): Promise<void> {
    const failure = this.failures.get(id);
    if (failure) {
      failure.resolved = true;
      failure.resolution = resolution.resolution;
      failure.resolution_batch = resolution.resolution_batch;
      failure.root_cause = resolution.root_cause;
      failure.prevention = resolution.prevention;
    }
  }

  async searchFailures(filters: {
    resolved?: boolean;
    error_type?: string;
  }): Promise<Failure[]> {
    let results = Array.from(this.failures.values());

    if (filters.resolved !== undefined) {
      results = results.filter((f) => f.resolved === filters.resolved);
    }

    if (filters.error_type) {
      results = results.filter((f) => f.error_type === filters.error_type);
    }

    return results;
  }

  async searchAll(keyword: string): Promise<{
    decisions: Decision[];
    patterns: Pattern[];
    failures: Failure[];
  }> {
    const lowerKeyword = keyword.toLowerCase();

    return {
      decisions: Array.from(this.decisions.values()).filter(
        (d) =>
          d.what.toLowerCase().includes(lowerKeyword) ||
          d.why.toLowerCase().includes(lowerKeyword)
      ),
      patterns: Array.from(this.patterns.values()).filter(
        (p) =>
          p.name.toLowerCase().includes(lowerKeyword) ||
          p.description.toLowerCase().includes(lowerKeyword)
      ),
      failures: Array.from(this.failures.values()).filter(
        (f) =>
          f.error_type.toLowerCase().includes(lowerKeyword) ||
          f.error_message.toLowerCase().includes(lowerKeyword)
      ),
    };
  }

  async export(): Promise<Memory> {
    return {
      decisions: Array.from(this.decisions.values()),
      patterns: Array.from(this.patterns.values()),
      failures: Array.from(this.failures.values()),
      preferences: Array.from(this.preferences.values()),
    };
  }

  async import(data: Memory): Promise<void> {
    data.decisions.forEach((d) => this.decisions.set(d.id, d));
    data.patterns.forEach((p) => this.patterns.set(p.id, p));
    data.failures.forEach((f) => this.failures.set(f.id, f));
    data.preferences.forEach((p) => this.preferences.set(p.id, p));
  }
}
