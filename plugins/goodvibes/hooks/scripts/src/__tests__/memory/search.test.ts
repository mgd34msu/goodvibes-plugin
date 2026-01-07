/**
 * Tests for memory/search.ts
 *
 * Comprehensive test suite achieving 100% line and branch coverage for
 * memory search, summary, and formatting functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProjectMemory } from '../../types/memory.js';

// Mock all the dependencies before importing the module under test
vi.mock('../../memory/paths.js', () => ({
  getMemoryDir: vi.fn((cwd: string) => `${cwd}/.goodvibes/memory`),
}));

vi.mock('../../memory/directories.js', () => ({
  fileExists: vi.fn(),
}));

vi.mock('../../memory/decisions.js', () => ({
  readDecisions: vi.fn(),
}));

vi.mock('../../memory/patterns.js', () => ({
  readPatterns: vi.fn(),
}));

vi.mock('../../memory/failures.js', () => ({
  readFailures: vi.fn(),
}));

vi.mock('../../memory/preferences.js', () => ({
  readPreferences: vi.fn(),
}));

// Import the mocked modules and module under test
import { getMemoryDir } from '../../memory/paths.js';
import { fileExists } from '../../memory/directories.js';
import { readDecisions } from '../../memory/decisions.js';
import { readPatterns } from '../../memory/patterns.js';
import { readFailures } from '../../memory/failures.js';
import { readPreferences } from '../../memory/preferences.js';
import {
  loadProjectMemory,
  loadMemory,
  hasMemory,
  getMemorySummary,
  searchMemory,
  formatMemoryContext,
  getCurrentDate,
} from '../../memory/search.js';

describe('memory/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadProjectMemory', () => {
    it('should load all memory types in parallel', async () => {
      const mockDecisions = [
        {
          title: 'Use TypeScript',
          date: '2024-01-01',
          rationale: 'Type safety',
          alternatives: ['JavaScript'],
        },
      ];
      const mockPatterns = [
        {
          name: 'Repository Pattern',
          date: '2024-01-02',
          description: 'Data access abstraction',
        },
      ];
      const mockFailures = [
        {
          approach: 'Global state',
          date: '2024-01-03',
          reason: 'Hard to test',
        },
      ];
      const mockPreferences = [
        {
          key: 'code-style',
          value: 'functional',
          date: '2024-01-04',
        },
      ];

      vi.mocked(readDecisions).mockResolvedValue(mockDecisions);
      vi.mocked(readPatterns).mockResolvedValue(mockPatterns);
      vi.mocked(readFailures).mockResolvedValue(mockFailures);
      vi.mocked(readPreferences).mockResolvedValue(mockPreferences);

      const result = await loadProjectMemory('/test/project');

      expect(result).toEqual({
        decisions: mockDecisions,
        patterns: mockPatterns,
        failures: mockFailures,
        preferences: mockPreferences,
      });

      expect(readDecisions).toHaveBeenCalledWith('/test/project');
      expect(readPatterns).toHaveBeenCalledWith('/test/project');
      expect(readFailures).toHaveBeenCalledWith('/test/project');
      expect(readPreferences).toHaveBeenCalledWith('/test/project');
    });

    it('should return empty arrays when no memory files exist', async () => {
      vi.mocked(readDecisions).mockResolvedValue([]);
      vi.mocked(readPatterns).mockResolvedValue([]);
      vi.mocked(readFailures).mockResolvedValue([]);
      vi.mocked(readPreferences).mockResolvedValue([]);

      const result = await loadProjectMemory('/empty/project');

      expect(result).toEqual({
        decisions: [],
        patterns: [],
        failures: [],
        preferences: [],
      });
    });
  });

  describe('loadMemory', () => {
    it('should be an alias for loadProjectMemory', async () => {
      const mockDecisions = [
        {
          title: 'Test',
          date: '2024-01-01',
          rationale: 'Reason',
          alternatives: [],
        },
      ];

      vi.mocked(readDecisions).mockResolvedValue(mockDecisions);
      vi.mocked(readPatterns).mockResolvedValue([]);
      vi.mocked(readFailures).mockResolvedValue([]);
      vi.mocked(readPreferences).mockResolvedValue([]);

      const result = await loadMemory('/test/project');

      expect(result.decisions).toEqual(mockDecisions);
      expect(readDecisions).toHaveBeenCalledWith('/test/project');
    });
  });

  describe('hasMemory', () => {
    it('should return true when memory directory exists', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const result = await hasMemory('/test/project');

      expect(result).toBe(true);
      expect(getMemoryDir).toHaveBeenCalledWith('/test/project');
      expect(fileExists).toHaveBeenCalledWith(
        '/test/project/.goodvibes/memory'
      );
    });

    it('should return false when memory directory does not exist', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await hasMemory('/new/project');

      expect(result).toBe(false);
    });
  });

  describe('getMemorySummary', () => {
    it('should return zero counts when no memory exists', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await getMemorySummary('/new/project');

      expect(result).toEqual({
        hasMemory: false,
        decisionsCount: 0,
        patternsCount: 0,
        failuresCount: 0,
        preferencesCount: 0,
      });
    });

    it('should return counts when memory exists', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(readDecisions).mockResolvedValue([
        {
          title: 'D1',
          date: '2024-01-01',
          rationale: 'R1',
          alternatives: [],
        },
        {
          title: 'D2',
          date: '2024-01-02',
          rationale: 'R2',
          alternatives: [],
        },
      ]);
      vi.mocked(readPatterns).mockResolvedValue([
        { name: 'P1', date: '2024-01-01', description: 'Desc1' },
        { name: 'P2', date: '2024-01-02', description: 'Desc2' },
        { name: 'P3', date: '2024-01-03', description: 'Desc3' },
      ]);
      vi.mocked(readFailures).mockResolvedValue([
        { approach: 'F1', date: '2024-01-01', reason: 'Bad' },
      ]);
      vi.mocked(readPreferences).mockResolvedValue([
        { key: 'pref1', value: 'val1', date: '2024-01-01' },
        { key: 'pref2', value: 'val2', date: '2024-01-02' },
        { key: 'pref3', value: 'val3', date: '2024-01-03' },
        { key: 'pref4', value: 'val4', date: '2024-01-04' },
      ]);

      const result = await getMemorySummary('/test/project');

      expect(result).toEqual({
        hasMemory: true,
        decisionsCount: 2,
        patternsCount: 3,
        failuresCount: 1,
        preferencesCount: 4,
      });
    });

    it('should return zero counts for empty arrays when memory exists', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(readDecisions).mockResolvedValue([]);
      vi.mocked(readPatterns).mockResolvedValue([]);
      vi.mocked(readFailures).mockResolvedValue([]);
      vi.mocked(readPreferences).mockResolvedValue([]);

      const result = await getMemorySummary('/test/project');

      expect(result).toEqual({
        hasMemory: true,
        decisionsCount: 0,
        patternsCount: 0,
        failuresCount: 0,
        preferencesCount: 0,
      });
    });
  });

  describe('searchMemory', () => {
    beforeEach(() => {
      vi.mocked(readDecisions).mockResolvedValue([]);
      vi.mocked(readPatterns).mockResolvedValue([]);
      vi.mocked(readFailures).mockResolvedValue([]);
      vi.mocked(readPreferences).mockResolvedValue([]);
    });

    it('should return empty results when no memory exists', async () => {
      const result = await searchMemory('/test', ['test']);

      expect(result).toEqual({
        decisions: [],
        patterns: [],
        failures: [],
        preferences: [],
      });
    });

    it('should search decisions by title', async () => {
      const decisions = [
        {
          title: 'Use TypeScript',
          date: '2024-01-01',
          rationale: 'Type safety',
          alternatives: [],
        },
        {
          title: 'Use JavaScript',
          date: '2024-01-02',
          rationale: 'Simple',
          alternatives: [],
        },
      ];
      vi.mocked(readDecisions).mockResolvedValue(decisions);

      const result = await searchMemory('/test', ['typescript']);

      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0].title).toBe('Use TypeScript');
    });

    it('should search decisions by rationale', async () => {
      const decisions = [
        {
          title: 'Choice A',
          date: '2024-01-01',
          rationale: 'Performance optimization',
          alternatives: [],
        },
        {
          title: 'Choice B',
          date: '2024-01-02',
          rationale: 'Developer experience',
          alternatives: [],
        },
      ];
      vi.mocked(readDecisions).mockResolvedValue(decisions);

      const result = await searchMemory('/test', ['optimization']);

      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0].title).toBe('Choice A');
    });

    it('should search decisions by context (optional field)', async () => {
      const decisions = [
        {
          title: 'Decision 1',
          date: '2024-01-01',
          rationale: 'Reason',
          alternatives: [],
          context: 'During migration to new framework',
        },
        {
          title: 'Decision 2',
          date: '2024-01-02',
          rationale: 'Reason',
          alternatives: [],
        },
      ];
      vi.mocked(readDecisions).mockResolvedValue(decisions);

      const result = await searchMemory('/test', ['migration']);

      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0].title).toBe('Decision 1');
    });

    it('should search decisions by alternatives (optional array)', async () => {
      const decisions = [
        {
          title: 'Database Choice',
          date: '2024-01-01',
          rationale: 'Scalability',
          alternatives: ['PostgreSQL', 'MongoDB', 'MySQL'],
        },
        {
          title: 'Framework Choice',
          date: '2024-01-02',
          rationale: 'Productivity',
          alternatives: ['React', 'Vue'],
        },
      ];
      vi.mocked(readDecisions).mockResolvedValue(decisions);

      const result = await searchMemory('/test', ['mongodb']);

      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0].title).toBe('Database Choice');
    });

    it('should handle decisions without optional fields', async () => {
      const decisions = [
        {
          title: 'Simple Decision',
          date: '2024-01-01',
          rationale: 'Basic reason',
          alternatives: [],
          // No context, no alternatives
        },
      ];
      vi.mocked(readDecisions).mockResolvedValue(decisions);

      // Search should not match because no context or alternatives
      const result = await searchMemory('/test', ['nonexistent']);

      expect(result.decisions).toHaveLength(0);
    });

    it('should search patterns by name', async () => {
      const patterns = [
        {
          name: 'Repository Pattern',
          date: '2024-01-01',
          description: 'Data access',
        },
        {
          name: 'Factory Pattern',
          date: '2024-01-02',
          description: 'Object creation',
        },
      ];
      vi.mocked(readPatterns).mockResolvedValue(patterns);

      const result = await searchMemory('/test', ['repository']);

      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].name).toBe('Repository Pattern');
    });

    it('should search patterns by description', async () => {
      const patterns = [
        {
          name: 'Pattern A',
          date: '2024-01-01',
          description: 'Handles database transactions',
        },
        {
          name: 'Pattern B',
          date: '2024-01-02',
          description: 'UI component structure',
        },
      ];
      vi.mocked(readPatterns).mockResolvedValue(patterns);

      const result = await searchMemory('/test', ['database']);

      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].name).toBe('Pattern A');
    });

    it('should search patterns by example (optional field)', async () => {
      const patterns = [
        {
          name: 'Pattern A',
          date: '2024-01-01',
          description: 'Description',
          example: 'const repo = new UserRepository();',
        },
        { name: 'Pattern B', date: '2024-01-02', description: 'Description' },
      ];
      vi.mocked(readPatterns).mockResolvedValue(patterns);

      const result = await searchMemory('/test', ['userrepository']);

      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].name).toBe('Pattern A');
    });

    it('should search patterns by files (optional array)', async () => {
      const patterns = [
        {
          name: 'Pattern A',
          date: '2024-01-01',
          description: 'Description',
          files: ['src/repositories/user.ts', 'src/repositories/product.ts'],
        },
        { name: 'Pattern B', date: '2024-01-02', description: 'Description' },
      ];
      vi.mocked(readPatterns).mockResolvedValue(patterns);

      const result = await searchMemory('/test', ['product.ts']);

      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].name).toBe('Pattern A');
    });

    it('should handle patterns without optional fields', async () => {
      const patterns = [
        {
          name: 'Simple Pattern',
          date: '2024-01-01',
          description: 'Basic description',
          // No example, no files
        },
      ];
      vi.mocked(readPatterns).mockResolvedValue(patterns);

      const result = await searchMemory('/test', ['nonexistent']);

      expect(result.patterns).toHaveLength(0);
    });

    it('should search failures by approach', async () => {
      const failures = [
        {
          approach: 'Global state management',
          date: '2024-01-01',
          reason: 'Hard to debug',
        },
        {
          approach: 'Direct DOM manipulation',
          date: '2024-01-02',
          reason: 'React conflict',
        },
      ];
      vi.mocked(readFailures).mockResolvedValue(failures);

      const result = await searchMemory('/test', ['global']);

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].approach).toBe('Global state management');
    });

    it('should search failures by reason', async () => {
      const failures = [
        {
          approach: 'Approach A',
          date: '2024-01-01',
          reason: 'Performance degradation',
        },
        {
          approach: 'Approach B',
          date: '2024-01-02',
          reason: 'Security vulnerability',
        },
      ];
      vi.mocked(readFailures).mockResolvedValue(failures);

      const result = await searchMemory('/test', ['security']);

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].approach).toBe('Approach B');
    });

    it('should search failures by context (optional field)', async () => {
      const failures = [
        {
          approach: 'Failure A',
          date: '2024-01-01',
          reason: 'Bad',
          context: 'During production deployment',
        },
        { approach: 'Failure B', date: '2024-01-02', reason: 'Bad' },
      ];
      vi.mocked(readFailures).mockResolvedValue(failures);

      const result = await searchMemory('/test', ['deployment']);

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].approach).toBe('Failure A');
    });

    it('should search failures by suggestion (optional field)', async () => {
      const failures = [
        {
          approach: 'Failure A',
          date: '2024-01-01',
          reason: 'Bad',
          suggestion: 'Use caching instead',
        },
        { approach: 'Failure B', date: '2024-01-02', reason: 'Bad' },
      ];
      vi.mocked(readFailures).mockResolvedValue(failures);

      const result = await searchMemory('/test', ['caching']);

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].approach).toBe('Failure A');
    });

    it('should handle failures without optional fields', async () => {
      const failures = [
        {
          approach: 'Simple failure',
          date: '2024-01-01',
          reason: 'Basic reason',
          // No context, no suggestion
        },
      ];
      vi.mocked(readFailures).mockResolvedValue(failures);

      const result = await searchMemory('/test', ['nonexistent']);

      expect(result.failures).toHaveLength(0);
    });

    it('should search preferences by key', async () => {
      const preferences = [
        { key: 'code-style', value: 'functional', date: '2024-01-01' },
        { key: 'test-framework', value: 'vitest', date: '2024-01-02' },
      ];
      vi.mocked(readPreferences).mockResolvedValue(preferences);

      const result = await searchMemory('/test', ['code-style']);

      expect(result.preferences).toHaveLength(1);
      expect(result.preferences[0].key).toBe('code-style');
    });

    it('should search preferences by value', async () => {
      const preferences = [
        { key: 'framework', value: 'react', date: '2024-01-01' },
        { key: 'bundler', value: 'vite', date: '2024-01-02' },
      ];
      vi.mocked(readPreferences).mockResolvedValue(preferences);

      const result = await searchMemory('/test', ['react']);

      expect(result.preferences).toHaveLength(1);
      expect(result.preferences[0].key).toBe('framework');
    });

    it('should search preferences by notes (optional field)', async () => {
      const preferences = [
        {
          key: 'style',
          value: 'functional',
          date: '2024-01-01',
          notes: 'Prefer pure functions over classes',
        },
        { key: 'other', value: 'value', date: '2024-01-02' },
      ];
      vi.mocked(readPreferences).mockResolvedValue(preferences);

      const result = await searchMemory('/test', ['pure functions']);

      expect(result.preferences).toHaveLength(1);
      expect(result.preferences[0].key).toBe('style');
    });

    it('should handle preferences without optional fields', async () => {
      const preferences = [
        {
          key: 'simple',
          value: 'value',
          date: '2024-01-01',
          // No notes
        },
      ];
      vi.mocked(readPreferences).mockResolvedValue(preferences);

      const result = await searchMemory('/test', ['nonexistent']);

      expect(result.preferences).toHaveLength(0);
    });

    it('should be case insensitive', async () => {
      const decisions = [
        {
          title: 'Use TYPESCRIPT',
          date: '2024-01-01',
          rationale: 'Type safety',
          alternatives: [],
        },
      ];
      vi.mocked(readDecisions).mockResolvedValue(decisions);

      const result = await searchMemory('/test', ['typescript']);

      expect(result.decisions).toHaveLength(1);
    });

    it('should match multiple keywords (OR logic)', async () => {
      const decisions = [
        {
          title: 'Use TypeScript',
          date: '2024-01-01',
          rationale: 'Type safety',
          alternatives: [],
        },
        {
          title: 'Use React',
          date: '2024-01-02',
          rationale: 'Component model',
          alternatives: [],
        },
        {
          title: 'Use Node',
          date: '2024-01-03',
          rationale: 'Server runtime',
          alternatives: [],
        },
      ];
      vi.mocked(readDecisions).mockResolvedValue(decisions);

      const result = await searchMemory('/test', ['typescript', 'react']);

      expect(result.decisions).toHaveLength(2);
      expect(result.decisions.map((d) => d.title)).toContain('Use TypeScript');
      expect(result.decisions.map((d) => d.title)).toContain('Use React');
    });

    it('should search across all memory types simultaneously', async () => {
      vi.mocked(readDecisions).mockResolvedValue([
        {
          title: 'API Design',
          date: '2024-01-01',
          rationale: 'REST over GraphQL',
          alternatives: [],
        },
      ]);
      vi.mocked(readPatterns).mockResolvedValue([
        {
          name: 'API Pattern',
          date: '2024-01-01',
          description: 'Standard API structure',
        },
      ]);
      vi.mocked(readFailures).mockResolvedValue([
        { approach: 'Raw API calls', date: '2024-01-01', reason: 'No caching' },
      ]);
      vi.mocked(readPreferences).mockResolvedValue([
        { key: 'api-version', value: 'v2', date: '2024-01-01' },
      ]);

      const result = await searchMemory('/test', ['api']);

      expect(result.decisions).toHaveLength(1);
      expect(result.patterns).toHaveLength(1);
      expect(result.failures).toHaveLength(1);
      expect(result.preferences).toHaveLength(1);
    });
  });

  describe('formatMemoryContext', () => {
    it('should return empty string for empty memory', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [],
        preferences: [],
      };

      const result = formatMemoryContext(memory);

      expect(result).toBe('');
    });

    it('should format decisions with title and rationale', () => {
      const memory: ProjectMemory = {
        decisions: [
          {
            title: 'Use TypeScript',
            date: '2024-01-01',
            rationale: 'Type safety',
            alternatives: ['JavaScript'],
          },
        ],
        patterns: [],
        failures: [],
        preferences: [],
      };

      const result = formatMemoryContext(memory);

      expect(result).toContain('Previous Decisions:');
      expect(result).toContain('- Use TypeScript (Type safety)');
    });

    it('should limit decisions to last 5', () => {
      const memory: ProjectMemory = {
        decisions: [
          {
            title: 'D1',
            date: '2024-01-01',
            rationale: 'R1',
            alternatives: [],
          },
          {
            title: 'D2',
            date: '2024-01-02',
            rationale: 'R2',
            alternatives: [],
          },
          {
            title: 'D3',
            date: '2024-01-03',
            rationale: 'R3',
            alternatives: [],
          },
          {
            title: 'D4',
            date: '2024-01-04',
            rationale: 'R4',
            alternatives: [],
          },
          {
            title: 'D5',
            date: '2024-01-05',
            rationale: 'R5',
            alternatives: [],
          },
          {
            title: 'D6',
            date: '2024-01-06',
            rationale: 'R6',
            alternatives: [],
          },
          {
            title: 'D7',
            date: '2024-01-07',
            rationale: 'R7',
            alternatives: [],
          },
        ],
        patterns: [],
        failures: [],
        preferences: [],
      };

      const result = formatMemoryContext(memory);

      // Should contain last 5 (D3-D7), not D1 or D2
      expect(result).not.toContain('D1');
      expect(result).not.toContain('D2');
      expect(result).toContain('D3');
      expect(result).toContain('D4');
      expect(result).toContain('D5');
      expect(result).toContain('D6');
      expect(result).toContain('D7');
    });

    it('should format patterns with name and description', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [
          {
            name: 'Repository Pattern',
            date: '2024-01-01',
            description: 'Data access abstraction',
          },
        ],
        failures: [],
        preferences: [],
      };

      const result = formatMemoryContext(memory);

      expect(result).toContain('Established Patterns:');
      expect(result).toContain('- Repository Pattern: Data access abstraction');
    });

    it('should truncate long pattern descriptions to 60 characters', () => {
      const longDescription =
        'This is a very long description that should be truncated because it exceeds the 60 character limit';
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [
          { name: 'Pattern', date: '2024-01-01', description: longDescription },
        ],
        failures: [],
        preferences: [],
      };

      const result = formatMemoryContext(memory);

      expect(result).toContain('...');
      expect(result).toContain(
        'This is a very long description that should be truncated bec...'
      );
      expect(result).not.toContain(longDescription);
    });

    it('should not truncate pattern descriptions at exactly 60 characters', () => {
      const exactDescription =
        '123456789012345678901234567890123456789012345678901234567890'; // 60 chars
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [
          {
            name: 'Pattern',
            date: '2024-01-01',
            description: exactDescription,
          },
        ],
        failures: [],
        preferences: [],
      };

      const result = formatMemoryContext(memory);

      expect(result).toContain(exactDescription);
      expect(result).not.toContain('...');
    });

    it('should not truncate pattern descriptions shorter than 60 characters', () => {
      const shortDescription = 'Short description';
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [
          {
            name: 'Pattern',
            date: '2024-01-01',
            description: shortDescription,
          },
        ],
        failures: [],
        preferences: [],
      };

      const result = formatMemoryContext(memory);

      expect(result).toContain(shortDescription);
      expect(result).not.toContain('...');
    });

    it('should limit patterns to last 3', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [
          { name: 'P1', date: '2024-01-01', description: 'D1' },
          { name: 'P2', date: '2024-01-02', description: 'D2' },
          { name: 'P3', date: '2024-01-03', description: 'D3' },
          { name: 'P4', date: '2024-01-04', description: 'D4' },
          { name: 'P5', date: '2024-01-05', description: 'D5' },
        ],
        failures: [],
        preferences: [],
      };

      const result = formatMemoryContext(memory);

      // Should contain last 3 (P3-P5), not P1 or P2
      expect(result).not.toContain('P1');
      expect(result).not.toContain('P2');
      expect(result).toContain('P3');
      expect(result).toContain('P4');
      expect(result).toContain('P5');
    });

    it('should format failures with approach and reason', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [
          {
            approach: 'Global state',
            date: '2024-01-01',
            reason: 'Hard to test and maintain',
          },
        ],
        preferences: [],
      };

      const result = formatMemoryContext(memory);

      expect(result).toContain('Known Failures (avoid):');
      expect(result).toContain('- Global state: Hard to test and maintain');
    });

    it('should limit failures to last 3', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [
          { approach: 'F1', date: '2024-01-01', reason: 'R1' },
          { approach: 'F2', date: '2024-01-02', reason: 'R2' },
          { approach: 'F3', date: '2024-01-03', reason: 'R3' },
          { approach: 'F4', date: '2024-01-04', reason: 'R4' },
          { approach: 'F5', date: '2024-01-05', reason: 'R5' },
        ],
        preferences: [],
      };

      const result = formatMemoryContext(memory);

      // Should contain last 3 (F3-F5), not F1 or F2
      expect(result).not.toContain('F1');
      expect(result).not.toContain('F2');
      expect(result).toContain('F3');
      expect(result).toContain('F4');
      expect(result).toContain('F5');
    });

    it('should not include preferences in output', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [],
        preferences: [
          { key: 'style', value: 'functional', date: '2024-01-01' },
        ],
      };

      const result = formatMemoryContext(memory);

      // Preferences are not formatted in the context output
      expect(result).toBe('');
      expect(result).not.toContain('style');
      expect(result).not.toContain('functional');
    });

    it('should format all sections together', () => {
      const memory: ProjectMemory = {
        decisions: [
          {
            title: 'Decision 1',
            date: '2024-01-01',
            rationale: 'Rationale 1',
            alternatives: [],
          },
        ],
        patterns: [
          {
            name: 'Pattern 1',
            date: '2024-01-01',
            description: 'Description 1',
          },
        ],
        failures: [
          { approach: 'Failure 1', date: '2024-01-01', reason: 'Reason 1' },
        ],
        preferences: [{ key: 'pref', value: 'val', date: '2024-01-01' }],
      };

      const result = formatMemoryContext(memory);

      expect(result).toContain('Previous Decisions:');
      expect(result).toContain('Established Patterns:');
      expect(result).toContain('Known Failures (avoid):');
    });

    it('should add newline before patterns section', () => {
      const memory: ProjectMemory = {
        decisions: [
          {
            title: 'Decision',
            date: '2024-01-01',
            rationale: 'Rationale',
            alternatives: [],
          },
        ],
        patterns: [
          { name: 'Pattern', date: '2024-01-01', description: 'Description' },
        ],
        failures: [],
        preferences: [],
      };

      const result = formatMemoryContext(memory);

      expect(result).toContain('\nEstablished Patterns:');
    });

    it('should add newline before failures section', () => {
      const memory: ProjectMemory = {
        decisions: [
          {
            title: 'Decision',
            date: '2024-01-01',
            rationale: 'Rationale',
            alternatives: [],
          },
        ],
        patterns: [],
        failures: [
          { approach: 'Failure', date: '2024-01-01', reason: 'Reason' },
        ],
        preferences: [],
      };

      const result = formatMemoryContext(memory);

      expect(result).toContain('\nKnown Failures (avoid):');
    });

    it('should handle only patterns being present', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [
          { name: 'Pattern', date: '2024-01-01', description: 'Description' },
        ],
        failures: [],
        preferences: [],
      };

      const result = formatMemoryContext(memory);

      expect(result).toContain('Established Patterns:');
      expect(result).not.toContain('Previous Decisions:');
      expect(result).not.toContain('Known Failures');
    });

    it('should handle only failures being present', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [
          { approach: 'Failure', date: '2024-01-01', reason: 'Reason' },
        ],
        preferences: [],
      };

      const result = formatMemoryContext(memory);

      expect(result).toContain('Known Failures (avoid):');
      expect(result).not.toContain('Previous Decisions:');
      expect(result).not.toContain('Established Patterns');
    });
  });

  describe('getCurrentDate', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const result = getCurrentDate();

      // Should match ISO date format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return current date', () => {
      const expected = new Date().toISOString().split('T')[0];
      const result = getCurrentDate();

      expect(result).toBe(expected);
    });

    it('should return string without time component', () => {
      const result = getCurrentDate();

      expect(result).not.toContain('T');
      expect(result).not.toContain(':');
    });

    it('should return empty string when split returns array with undefined first element', () => {
      // Mock String.prototype.split to test the nullish coalescing fallback
      const originalSplit = String.prototype.split;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      String.prototype.split = function (separator: any): any {
        if (separator === 'T') {
          // Return array with undefined at index 0 to trigger ?? fallback
          const arr: (string | undefined)[] = [];
          arr[0] = undefined;
          return arr;
        }
        return originalSplit.call(this, separator);
      };

      try {
        const result = getCurrentDate();
        // The ?? '' fallback should trigger when split()[0] is undefined
        expect(result).toBe('');
      } finally {
        String.prototype.split = originalSplit;
      }
    });
  });
});
