/**
 * Tests for types/memory.ts
 *
 * This file contains only TypeScript interface definitions.
 * These tests verify that all interfaces are properly exported
 * and can be used for type checking.
 */

import { describe, it, expect } from 'vitest';
import type {
  MemoryDecision,
  MemoryPattern,
  MemoryFailure,
  MemoryPreference,
  ProjectMemory,
} from '../../types/memory.js';

describe('types/memory', () => {
  describe('MemoryDecision interface', () => {
    it('should accept valid MemoryDecision with required fields', () => {
      const decision: MemoryDecision = {
        title: 'Use TypeScript for type safety',
        date: '2025-01-15',
        alternatives: ['JavaScript', 'Flow'],
        rationale:
          'Better developer experience and catch errors at compile time',
      };

      expect(decision.title).toBe('Use TypeScript for type safety');
      expect(decision.date).toBe('2025-01-15');
      expect(decision.alternatives).toEqual(['JavaScript', 'Flow']);
      expect(decision.rationale).toBe(
        'Better developer experience and catch errors at compile time'
      );
    });

    it('should accept MemoryDecision with optional agent field', () => {
      const decision: MemoryDecision = {
        title: 'Use Vitest for testing',
        date: '2025-01-15',
        alternatives: ['Jest', 'Mocha'],
        rationale: 'Native ESM support and faster execution',
        agent: 'test-engineer',
      };

      expect(decision.agent).toBe('test-engineer');
    });

    it('should accept MemoryDecision with optional context field', () => {
      const decision: MemoryDecision = {
        title: 'Use Prisma for database',
        date: '2025-01-15',
        alternatives: ['Drizzle', 'TypeORM'],
        rationale: 'Better type generation and migration support',
        context: 'Evaluated during initial project setup',
      };

      expect(decision.context).toBe('Evaluated during initial project setup');
    });

    it('should accept MemoryDecision with all optional fields', () => {
      const decision: MemoryDecision = {
        title: 'Adopt microservices architecture',
        date: '2025-01-15',
        alternatives: ['Monolith', 'Modular monolith'],
        rationale: 'Better scalability for team growth',
        agent: 'architect',
        context: 'Team scaling discussion',
      };

      expect(decision.agent).toBe('architect');
      expect(decision.context).toBe('Team scaling discussion');
    });

    it('should accept empty alternatives array', () => {
      const decision: MemoryDecision = {
        title: 'Use React',
        date: '2025-01-15',
        alternatives: [],
        rationale: 'Team expertise',
      };

      expect(decision.alternatives).toEqual([]);
    });
  });

  describe('MemoryPattern interface', () => {
    it('should accept valid MemoryPattern with required fields', () => {
      const pattern: MemoryPattern = {
        name: 'Repository Pattern',
        date: '2025-01-15',
        description: 'Abstraction layer for data access operations',
      };

      expect(pattern.name).toBe('Repository Pattern');
      expect(pattern.date).toBe('2025-01-15');
      expect(pattern.description).toBe(
        'Abstraction layer for data access operations'
      );
    });

    it('should accept MemoryPattern with optional example field', () => {
      const pattern: MemoryPattern = {
        name: 'Factory Pattern',
        date: '2025-01-15',
        description: 'Create objects without specifying exact class',
        example: 'const user = UserFactory.create({ name: "John" })',
      };

      expect(pattern.example).toBe(
        'const user = UserFactory.create({ name: "John" })'
      );
    });

    it('should accept MemoryPattern with optional files field', () => {
      const pattern: MemoryPattern = {
        name: 'Service Layer',
        date: '2025-01-15',
        description: 'Business logic encapsulation',
        files: ['src/services/UserService.ts', 'src/services/OrderService.ts'],
      };

      expect(pattern.files).toEqual([
        'src/services/UserService.ts',
        'src/services/OrderService.ts',
      ]);
    });

    it('should accept MemoryPattern with all optional fields', () => {
      const pattern: MemoryPattern = {
        name: 'Error Boundary',
        date: '2025-01-15',
        description: 'React error handling component',
        example:
          '<ErrorBoundary fallback={<Error />}>{children}</ErrorBoundary>',
        files: ['src/components/ErrorBoundary.tsx'],
      };

      expect(pattern.example).toBeDefined();
      expect(pattern.files).toHaveLength(1);
    });

    it('should accept empty files array', () => {
      const pattern: MemoryPattern = {
        name: 'Singleton',
        date: '2025-01-15',
        description: 'Single instance pattern',
        files: [],
      };

      expect(pattern.files).toEqual([]);
    });
  });

  describe('MemoryFailure interface', () => {
    it('should accept valid MemoryFailure with required fields', () => {
      const failure: MemoryFailure = {
        approach: 'Using global state for form management',
        date: '2025-01-15',
        reason: 'Caused race conditions and made testing difficult',
      };

      expect(failure.approach).toBe('Using global state for form management');
      expect(failure.date).toBe('2025-01-15');
      expect(failure.reason).toBe(
        'Caused race conditions and made testing difficult'
      );
    });

    it('should accept MemoryFailure with optional context field', () => {
      const failure: MemoryFailure = {
        approach: 'Direct database calls in components',
        date: '2025-01-15',
        reason: 'Violated separation of concerns',
        context: 'User profile feature development',
      };

      expect(failure.context).toBe('User profile feature development');
    });

    it('should accept MemoryFailure with optional suggestion field', () => {
      const failure: MemoryFailure = {
        approach: 'Inline CSS styles',
        date: '2025-01-15',
        reason: 'Hard to maintain and no reusability',
        suggestion: 'Use CSS modules or Tailwind CSS instead',
      };

      expect(failure.suggestion).toBe(
        'Use CSS modules or Tailwind CSS instead'
      );
    });

    it('should accept MemoryFailure with all optional fields', () => {
      const failure: MemoryFailure = {
        approach: 'Manual DOM manipulation in React',
        date: '2025-01-15',
        reason: 'Conflicted with React virtual DOM',
        context: 'Animation feature implementation',
        suggestion: 'Use React refs or animation libraries like Framer Motion',
      };

      expect(failure.context).toBe('Animation feature implementation');
      expect(failure.suggestion).toBe(
        'Use React refs or animation libraries like Framer Motion'
      );
    });
  });

  describe('MemoryPreference interface', () => {
    it('should accept valid MemoryPreference with required fields', () => {
      const preference: MemoryPreference = {
        key: 'indentation',
        value: '2 spaces',
        date: '2025-01-15',
      };

      expect(preference.key).toBe('indentation');
      expect(preference.value).toBe('2 spaces');
      expect(preference.date).toBe('2025-01-15');
    });

    it('should accept MemoryPreference with optional notes field', () => {
      const preference: MemoryPreference = {
        key: 'test_framework',
        value: 'vitest',
        date: '2025-01-15',
        notes: 'User prefers Vitest over Jest for new projects',
      };

      expect(preference.notes).toBe(
        'User prefers Vitest over Jest for new projects'
      );
    });

    it('should accept various preference keys and values', () => {
      const preferences: MemoryPreference[] = [
        { key: 'commit_style', value: 'conventional', date: '2025-01-15' },
        { key: 'branch_prefix', value: 'feature/', date: '2025-01-15' },
        { key: 'code_style', value: 'functional', date: '2025-01-15' },
      ];

      expect(preferences).toHaveLength(3);
      expect(preferences[0].key).toBe('commit_style');
      expect(preferences[1].value).toBe('feature/');
      expect(preferences[2].value).toBe('functional');
    });
  });

  describe('ProjectMemory interface', () => {
    it('should accept valid ProjectMemory with empty arrays', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [],
        preferences: [],
      };

      expect(memory.decisions).toEqual([]);
      expect(memory.patterns).toEqual([]);
      expect(memory.failures).toEqual([]);
      expect(memory.preferences).toEqual([]);
    });

    it('should accept ProjectMemory with populated arrays', () => {
      const memory: ProjectMemory = {
        decisions: [
          {
            title: 'Use TypeScript',
            date: '2025-01-15',
            alternatives: ['JavaScript'],
            rationale: 'Type safety',
          },
        ],
        patterns: [
          {
            name: 'Repository',
            date: '2025-01-15',
            description: 'Data access layer',
          },
        ],
        failures: [
          {
            approach: 'Global state',
            date: '2025-01-15',
            reason: 'Hard to test',
          },
        ],
        preferences: [
          {
            key: 'style',
            value: 'functional',
            date: '2025-01-15',
          },
        ],
      };

      expect(memory.decisions).toHaveLength(1);
      expect(memory.patterns).toHaveLength(1);
      expect(memory.failures).toHaveLength(1);
      expect(memory.preferences).toHaveLength(1);
    });

    it('should accept ProjectMemory with multiple items in each array', () => {
      const memory: ProjectMemory = {
        decisions: [
          {
            title: 'Decision 1',
            date: '2025-01-15',
            alternatives: [],
            rationale: 'Reason 1',
          },
          {
            title: 'Decision 2',
            date: '2025-01-16',
            alternatives: ['Alt A'],
            rationale: 'Reason 2',
          },
        ],
        patterns: [
          { name: 'Pattern 1', date: '2025-01-15', description: 'Desc 1' },
          { name: 'Pattern 2', date: '2025-01-16', description: 'Desc 2' },
        ],
        failures: [
          { approach: 'Approach 1', date: '2025-01-15', reason: 'Reason 1' },
          { approach: 'Approach 2', date: '2025-01-16', reason: 'Reason 2' },
        ],
        preferences: [
          { key: 'key1', value: 'value1', date: '2025-01-15' },
          { key: 'key2', value: 'value2', date: '2025-01-16' },
        ],
      };

      expect(memory.decisions).toHaveLength(2);
      expect(memory.patterns).toHaveLength(2);
      expect(memory.failures).toHaveLength(2);
      expect(memory.preferences).toHaveLength(2);
    });
  });
});
