/**
 * Tests for memory/index.ts
 *
 * Validates that all exports are properly re-exported from the barrel file.
 * This file contains only re-exports, no executable code.
 */

import { describe, it, expect } from 'vitest';

import {
  // Path utilities
  GOODVIBES_DIR,
  MEMORY_DIR,
  MEMORY_FILES,
  getGoodVibesDir,
  getMemoryDir,
  getMemoryFilePath,
  type MemoryFileType,
  // Directory management
  fileExists,
  ensureMemoryDir,
  ensureSecurityGitignore,
  // Re-exported from shared
  ensureGoodVibesDir,
  // CRUD modules - decisions
  readDecisions,
  writeDecision,
  // CRUD modules - patterns
  readPatterns,
  writePattern,
  // CRUD modules - failures
  readFailures,
  writeFailure,
  // CRUD modules - preferences
  readPreferences,
  writePreference,
  // Search and utilities
  loadProjectMemory,
  loadMemory,
  hasMemory,
  getMemorySummary,
  searchMemory,
  formatMemoryContext,
  getCurrentDate,
  // Types
  type ProjectMemory,
  // Type aliases for backward compatibility
  type Decision,
  type Pattern,
  type Failure,
  type Preference,
  // Security patterns
  SECURITY_GITIGNORE_PATTERNS,
  // Backward compatibility wrappers
  appendDecision,
  appendPattern,
  appendFailure,
  appendPreference,
} from '../../memory/index.js';

describe('memory/index', () => {
  describe('re-exports from paths.ts', () => {
    it('should export GOODVIBES_DIR constant', () => {
      expect(GOODVIBES_DIR).toBeDefined();
      expect(typeof GOODVIBES_DIR).toBe('string');
      expect(GOODVIBES_DIR).toBe('.goodvibes');
    });

    it('should export MEMORY_DIR constant', () => {
      expect(MEMORY_DIR).toBeDefined();
      expect(typeof MEMORY_DIR).toBe('string');
      expect(MEMORY_DIR).toBe('memory');
    });

    it('should export MEMORY_FILES constant', () => {
      expect(MEMORY_FILES).toBeDefined();
      expect(typeof MEMORY_FILES).toBe('object');
      expect(MEMORY_FILES.decisions).toBe('decisions.md');
      expect(MEMORY_FILES.patterns).toBe('patterns.md');
      expect(MEMORY_FILES.failures).toBe('failures.md');
      expect(MEMORY_FILES.preferences).toBe('preferences.md');
    });

    it('should export getGoodVibesDir', () => {
      expect(getGoodVibesDir).toBeDefined();
      expect(typeof getGoodVibesDir).toBe('function');
    });

    it('should export getMemoryDir', () => {
      expect(getMemoryDir).toBeDefined();
      expect(typeof getMemoryDir).toBe('function');
    });

    it('should export getMemoryFilePath', () => {
      expect(getMemoryFilePath).toBeDefined();
      expect(typeof getMemoryFilePath).toBe('function');
    });

    it('should export MemoryFileType type (via object)', () => {
      const fileType: MemoryFileType = 'decisions';
      expect(fileType).toBe('decisions');
      // Verify all valid types work
      const validTypes: MemoryFileType[] = [
        'decisions',
        'patterns',
        'failures',
        'preferences',
      ];
      expect(validTypes).toHaveLength(4);
    });
  });

  describe('re-exports from directories.ts', () => {
    it('should export fileExists', () => {
      expect(fileExists).toBeDefined();
      expect(typeof fileExists).toBe('function');
    });

    it('should export ensureMemoryDir', () => {
      expect(ensureMemoryDir).toBeDefined();
      expect(typeof ensureMemoryDir).toBe('function');
    });

    it('should export ensureSecurityGitignore', () => {
      expect(ensureSecurityGitignore).toBeDefined();
      expect(typeof ensureSecurityGitignore).toBe('function');
    });
  });

  describe('re-exports from shared/index.js', () => {
    it('should export ensureGoodVibesDir', () => {
      expect(ensureGoodVibesDir).toBeDefined();
      expect(typeof ensureGoodVibesDir).toBe('function');
    });
  });

  describe('re-exports from decisions.ts', () => {
    it('should export readDecisions', () => {
      expect(readDecisions).toBeDefined();
      expect(typeof readDecisions).toBe('function');
    });

    it('should export writeDecision', () => {
      expect(writeDecision).toBeDefined();
      expect(typeof writeDecision).toBe('function');
    });
  });

  describe('re-exports from patterns.ts', () => {
    it('should export readPatterns', () => {
      expect(readPatterns).toBeDefined();
      expect(typeof readPatterns).toBe('function');
    });

    it('should export writePattern', () => {
      expect(writePattern).toBeDefined();
      expect(typeof writePattern).toBe('function');
    });
  });

  describe('re-exports from failures.ts', () => {
    it('should export readFailures', () => {
      expect(readFailures).toBeDefined();
      expect(typeof readFailures).toBe('function');
    });

    it('should export writeFailure', () => {
      expect(writeFailure).toBeDefined();
      expect(typeof writeFailure).toBe('function');
    });
  });

  describe('re-exports from preferences.ts', () => {
    it('should export readPreferences', () => {
      expect(readPreferences).toBeDefined();
      expect(typeof readPreferences).toBe('function');
    });

    it('should export writePreference', () => {
      expect(writePreference).toBeDefined();
      expect(typeof writePreference).toBe('function');
    });
  });

  describe('re-exports from search.ts', () => {
    it('should export loadProjectMemory', () => {
      expect(loadProjectMemory).toBeDefined();
      expect(typeof loadProjectMemory).toBe('function');
    });

    it('should export loadMemory', () => {
      expect(loadMemory).toBeDefined();
      expect(typeof loadMemory).toBe('function');
    });

    it('should export hasMemory', () => {
      expect(hasMemory).toBeDefined();
      expect(typeof hasMemory).toBe('function');
    });

    it('should export getMemorySummary', () => {
      expect(getMemorySummary).toBeDefined();
      expect(typeof getMemorySummary).toBe('function');
    });

    it('should export searchMemory', () => {
      expect(searchMemory).toBeDefined();
      expect(typeof searchMemory).toBe('function');
    });

    it('should export formatMemoryContext', () => {
      expect(formatMemoryContext).toBeDefined();
      expect(typeof formatMemoryContext).toBe('function');
    });

    it('should export getCurrentDate', () => {
      expect(getCurrentDate).toBeDefined();
      expect(typeof getCurrentDate).toBe('function');
    });
  });

  describe('re-exports from types/memory.ts', () => {
    it('should export ProjectMemory type (via object)', () => {
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

    it('should export Decision type alias (via object)', () => {
      const decision: Decision = {
        title: 'Test Decision',
        date: '2024-01-01',
        alternatives: ['Option A'],
        rationale: 'Because testing',
      };
      expect(decision.title).toBe('Test Decision');
      expect(decision.date).toBe('2024-01-01');
      expect(decision.alternatives).toEqual(['Option A']);
      expect(decision.rationale).toBe('Because testing');
    });

    it('should export Pattern type alias (via object)', () => {
      const pattern: Pattern = {
        name: 'Test Pattern',
        date: '2024-01-01',
        description: 'A test pattern',
      };
      expect(pattern.name).toBe('Test Pattern');
      expect(pattern.date).toBe('2024-01-01');
      expect(pattern.description).toBe('A test pattern');
    });

    it('should export Failure type alias (via object)', () => {
      const failure: Failure = {
        approach: 'Failed Approach',
        date: '2024-01-01',
        reason: 'Did not work',
      };
      expect(failure.approach).toBe('Failed Approach');
      expect(failure.date).toBe('2024-01-01');
      expect(failure.reason).toBe('Did not work');
    });

    it('should export Preference type alias (via object)', () => {
      const preference: Preference = {
        key: 'theme',
        value: 'dark',
        date: '2024-01-01',
      };
      expect(preference.key).toBe('theme');
      expect(preference.value).toBe('dark');
      expect(preference.date).toBe('2024-01-01');
    });
  });

  describe('re-exports from security-patterns.ts', () => {
    it('should export SECURITY_GITIGNORE_PATTERNS', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toBeDefined();
      expect(typeof SECURITY_GITIGNORE_PATTERNS).toBe('string');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.env');
    });
  });

  describe('re-exports from wrappers.ts', () => {
    it('should export appendDecision', () => {
      expect(appendDecision).toBeDefined();
      expect(typeof appendDecision).toBe('function');
    });

    it('should export appendPattern', () => {
      expect(appendPattern).toBeDefined();
      expect(typeof appendPattern).toBe('function');
    });

    it('should export appendFailure', () => {
      expect(appendFailure).toBeDefined();
      expect(typeof appendFailure).toBe('function');
    });

    it('should export appendPreference', () => {
      expect(appendPreference).toBeDefined();
      expect(typeof appendPreference).toBe('function');
    });
  });

  describe('circular dependency check', () => {
    it('should load all exports without circular dependency errors', () => {
      // If we got here, imports succeeded without circular dependency errors
      // Verify a sampling of exports work correctly together
      const cwd = '/test/project';
      const goodvibesDir = getGoodVibesDir(cwd);
      const memoryDir = getMemoryDir(cwd);

      expect(goodvibesDir).toContain(GOODVIBES_DIR);
      expect(memoryDir).toContain(MEMORY_DIR);
      expect(memoryDir).toContain(goodvibesDir);
    });

    it('should have consistent path utilities across exports', () => {
      const cwd = '/test/project';

      // Verify path functions produce consistent results
      const decisionsPath = getMemoryFilePath(cwd, 'decisions');
      const memoryDir = getMemoryDir(cwd);

      expect(decisionsPath).toContain(memoryDir);
      expect(decisionsPath).toContain(MEMORY_FILES.decisions);
    });
  });

  describe('type alias backward compatibility', () => {
    it('should have Decision alias that matches MemoryDecision shape', () => {
      // Decision type should have all required MemoryDecision fields
      const decision: Decision = {
        title: 'Backward Compat Test',
        date: '2024-01-01',
        alternatives: [],
        rationale: 'Testing backward compatibility',
        agent: 'test-agent',
        context: 'test context',
      };
      expect(decision.title).toBeDefined();
      expect(decision.date).toBeDefined();
      expect(decision.alternatives).toBeDefined();
      expect(decision.rationale).toBeDefined();
      // Optional fields
      expect(decision.agent).toBe('test-agent');
      expect(decision.context).toBe('test context');
    });

    it('should have Pattern alias that matches MemoryPattern shape', () => {
      const pattern: Pattern = {
        name: 'Backward Compat Pattern',
        date: '2024-01-01',
        description: 'Testing backward compatibility',
        example: 'Example code',
        files: ['file1.ts', 'file2.ts'],
      };
      expect(pattern.name).toBeDefined();
      expect(pattern.date).toBeDefined();
      expect(pattern.description).toBeDefined();
      // Optional fields
      expect(pattern.example).toBe('Example code');
      expect(pattern.files).toEqual(['file1.ts', 'file2.ts']);
    });

    it('should have Failure alias that matches MemoryFailure shape', () => {
      const failure: Failure = {
        approach: 'Backward Compat Failure',
        date: '2024-01-01',
        reason: 'Testing backward compatibility',
        context: 'test context',
        suggestion: 'Try something else',
      };
      expect(failure.approach).toBeDefined();
      expect(failure.date).toBeDefined();
      expect(failure.reason).toBeDefined();
      // Optional fields
      expect(failure.context).toBe('test context');
      expect(failure.suggestion).toBe('Try something else');
    });

    it('should have Preference alias that matches MemoryPreference shape', () => {
      const preference: Preference = {
        key: 'backward-compat-key',
        value: 'backward-compat-value',
        date: '2024-01-01',
        notes: 'test notes',
      };
      expect(preference.key).toBeDefined();
      expect(preference.value).toBeDefined();
      expect(preference.date).toBeDefined();
      // Optional fields
      expect(preference.notes).toBe('test notes');
    });
  });

  describe('export completeness', () => {
    it('should export all path-related constants', () => {
      const pathExports = [GOODVIBES_DIR, MEMORY_DIR, MEMORY_FILES];
      pathExports.forEach((exp) => expect(exp).toBeDefined());
    });

    it('should export all path utility functions', () => {
      const pathFunctions = [getGoodVibesDir, getMemoryDir, getMemoryFilePath];
      pathFunctions.forEach((fn) => {
        expect(fn).toBeDefined();
        expect(typeof fn).toBe('function');
      });
    });

    it('should export all directory management functions', () => {
      const dirFunctions = [
        fileExists,
        ensureMemoryDir,
        ensureSecurityGitignore,
        ensureGoodVibesDir,
      ];
      dirFunctions.forEach((fn) => {
        expect(fn).toBeDefined();
        expect(typeof fn).toBe('function');
      });
    });

    it('should export all CRUD functions', () => {
      const crudFunctions = [
        readDecisions,
        writeDecision,
        readPatterns,
        writePattern,
        readFailures,
        writeFailure,
        readPreferences,
        writePreference,
      ];
      crudFunctions.forEach((fn) => {
        expect(fn).toBeDefined();
        expect(typeof fn).toBe('function');
      });
    });

    it('should export all search and utility functions', () => {
      const searchFunctions = [
        loadProjectMemory,
        loadMemory,
        hasMemory,
        getMemorySummary,
        searchMemory,
        formatMemoryContext,
        getCurrentDate,
      ];
      searchFunctions.forEach((fn) => {
        expect(fn).toBeDefined();
        expect(typeof fn).toBe('function');
      });
    });

    it('should export all wrapper functions', () => {
      const wrapperFunctions = [
        appendDecision,
        appendPattern,
        appendFailure,
        appendPreference,
      ];
      wrapperFunctions.forEach((fn) => {
        expect(fn).toBeDefined();
        expect(typeof fn).toBe('function');
      });
    });
  });
});
