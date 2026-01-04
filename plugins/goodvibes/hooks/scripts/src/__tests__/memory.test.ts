/**
 * Tests for the Persistent Memory System
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
  ensureGoodVibesDir,
  hasMemory,
  getMemorySummary,
  searchMemory,
  getCurrentDate,
  getGoodVibesDir,
  getMemoryDir,
  getMemoryFilePath,
  Decision,
  Pattern,
  Failure,
  Preference,
} from '../memory.js';

describe('memory', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a fresh temp directory for each test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goodvibes-memory-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('path utilities', () => {
    it('should return correct .goodvibes directory path', () => {
      const result = getGoodVibesDir(testDir);
      expect(result).toBe(path.join(testDir, '.goodvibes'));
    });

    it('should return correct memory directory path', () => {
      const result = getMemoryDir(testDir);
      expect(result).toBe(path.join(testDir, '.goodvibes', 'memory'));
    });

    it('should return correct memory file paths', () => {
      expect(getMemoryFilePath(testDir, 'decisions')).toBe(
        path.join(testDir, '.goodvibes', 'memory', 'decisions.md')
      );
      expect(getMemoryFilePath(testDir, 'patterns')).toBe(
        path.join(testDir, '.goodvibes', 'memory', 'patterns.md')
      );
      expect(getMemoryFilePath(testDir, 'failures')).toBe(
        path.join(testDir, '.goodvibes', 'memory', 'failures.md')
      );
      expect(getMemoryFilePath(testDir, 'preferences')).toBe(
        path.join(testDir, '.goodvibes', 'memory', 'preferences.md')
      );
    });
  });

  describe('ensureGoodVibesDir', () => {
    it('should create .goodvibes directory if it does not exist', () => {
      ensureGoodVibesDir(testDir);
      expect(fs.existsSync(getGoodVibesDir(testDir))).toBe(true);
    });

    it('should create .gitignore with security patterns', () => {
      ensureGoodVibesDir(testDir);
      const gitignorePath = path.join(testDir, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);

      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('.env');
      expect(content).toContain('.goodvibes/');
      expect(content).toContain('*.key');
      expect(content).toContain('*.tfstate');
    });

    it('should append to existing .gitignore without duplicating patterns', () => {
      // Create existing .gitignore
      const gitignorePath = path.join(testDir, '.gitignore');
      fs.writeFileSync(gitignorePath, 'node_modules/\n*.log\n');

      ensureGoodVibesDir(testDir);

      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('node_modules/');
      expect(content).toContain('.env');
      expect(content).toContain('.goodvibes/');
    });

    it('should be idempotent', () => {
      ensureGoodVibesDir(testDir);
      ensureGoodVibesDir(testDir);
      expect(fs.existsSync(getGoodVibesDir(testDir))).toBe(true);
    });
  });

  describe('hasMemory', () => {
    it('should return false when memory directory does not exist', () => {
      expect(hasMemory(testDir)).toBe(false);
    });

    it('should return true when memory directory exists', () => {
      fs.mkdirSync(getMemoryDir(testDir), { recursive: true });
      expect(hasMemory(testDir)).toBe(true);
    });
  });

  describe('loadMemory', () => {
    it('should return empty memory when directory does not exist', () => {
      const memory = loadMemory(testDir);
      expect(memory.decisions).toEqual([]);
      expect(memory.patterns).toEqual([]);
      expect(memory.failures).toEqual([]);
      expect(memory.preferences).toEqual([]);
    });

    it('should return empty memory when files do not exist', () => {
      fs.mkdirSync(getMemoryDir(testDir), { recursive: true });
      const memory = loadMemory(testDir);
      expect(memory.decisions).toEqual([]);
      expect(memory.patterns).toEqual([]);
      expect(memory.failures).toEqual([]);
      expect(memory.preferences).toEqual([]);
    });
  });

  describe('appendDecision', () => {
    it('should create decisions.md and append decision', () => {
      const decision: Decision = {
        title: 'Use TypeScript',
        date: '2024-01-15',
        alternatives: ['JavaScript', 'Flow'],
        rationale: 'Type safety and better IDE support',
        agent: 'backend-engineer',
      };

      appendDecision(testDir, decision);

      const filePath = getMemoryFilePath(testDir, 'decisions');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('Use TypeScript');
      expect(content).toContain('2024-01-15');
      expect(content).toContain('JavaScript');
      expect(content).toContain('Flow');
      expect(content).toContain('Type safety and better IDE support');
      expect(content).toContain('backend-engineer');
    });

    it('should append multiple decisions', () => {
      appendDecision(testDir, {
        title: 'Decision 1',
        date: '2024-01-01',
        alternatives: ['Alt A'],
        rationale: 'Reason 1',
      });

      appendDecision(testDir, {
        title: 'Decision 2',
        date: '2024-01-02',
        alternatives: ['Alt B'],
        rationale: 'Reason 2',
      });

      const memory = loadMemory(testDir);
      expect(memory.decisions).toHaveLength(2);
      expect(memory.decisions[0].title).toBe('Decision 1');
      expect(memory.decisions[1].title).toBe('Decision 2');
    });

    it('should include optional context', () => {
      appendDecision(testDir, {
        title: 'Database Choice',
        date: '2024-01-15',
        alternatives: ['MySQL', 'MongoDB'],
        rationale: 'Relational data model fits better',
        context: 'Building an e-commerce platform with complex relationships',
      });

      const content = fs.readFileSync(
        getMemoryFilePath(testDir, 'decisions'),
        'utf-8'
      );
      expect(content).toContain('Building an e-commerce platform');
    });
  });

  describe('appendPattern', () => {
    it('should create patterns.md and append pattern', () => {
      const pattern: Pattern = {
        name: 'Repository Pattern',
        date: '2024-01-15',
        description: 'Use repository pattern for data access',
        example: '```typescript\nclass UserRepository { ... }\n```',
        files: ['src/repositories/user.ts', 'src/repositories/post.ts'],
      };

      appendPattern(testDir, pattern);

      const filePath = getMemoryFilePath(testDir, 'patterns');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('Repository Pattern');
      expect(content).toContain('Use repository pattern');
      expect(content).toContain('UserRepository');
      expect(content).toContain('src/repositories/user.ts');
    });

    it('should work without optional fields', () => {
      appendPattern(testDir, {
        name: 'Simple Pattern',
        date: '2024-01-15',
        description: 'A basic pattern',
      });

      const memory = loadMemory(testDir);
      expect(memory.patterns).toHaveLength(1);
      expect(memory.patterns[0].name).toBe('Simple Pattern');
      expect(memory.patterns[0].example).toBeUndefined();
      expect(memory.patterns[0].files).toBeUndefined();
    });
  });

  describe('appendFailure', () => {
    it('should create failures.md and append failure', () => {
      const failure: Failure = {
        approach: 'Using raw SQL queries',
        date: '2024-01-15',
        reason: 'Prone to SQL injection and hard to maintain',
        context: 'Tried to optimize query performance',
        suggestion: 'Use parameterized queries with an ORM',
      };

      appendFailure(testDir, failure);

      const filePath = getMemoryFilePath(testDir, 'failures');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('Using raw SQL queries');
      expect(content).toContain('Prone to SQL injection');
      expect(content).toContain('Tried to optimize query');
      expect(content).toContain('Use parameterized queries');
    });

    it('should work without optional fields', () => {
      appendFailure(testDir, {
        approach: 'Approach X',
        date: '2024-01-15',
        reason: 'Did not work',
      });

      const memory = loadMemory(testDir);
      expect(memory.failures).toHaveLength(1);
      expect(memory.failures[0].approach).toBe('Approach X');
    });
  });

  describe('appendPreference', () => {
    it('should create preferences.md and append preference', () => {
      const preference: Preference = {
        key: 'code_style',
        value: 'Use 2-space indentation',
        date: '2024-01-15',
        notes: 'Matches the prettier config',
      };

      appendPreference(testDir, preference);

      const filePath = getMemoryFilePath(testDir, 'preferences');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('code_style');
      expect(content).toContain('2-space indentation');
      expect(content).toContain('prettier config');
    });

    it('should work without notes', () => {
      appendPreference(testDir, {
        key: 'testing',
        value: 'Always write unit tests',
        date: '2024-01-15',
      });

      const memory = loadMemory(testDir);
      expect(memory.preferences).toHaveLength(1);
      expect(memory.preferences[0].key).toBe('testing');
    });
  });

  describe('getMemorySummary', () => {
    it('should return zeros when no memory exists', () => {
      const summary = getMemorySummary(testDir);
      expect(summary.hasMemory).toBe(false);
      expect(summary.decisionsCount).toBe(0);
      expect(summary.patternsCount).toBe(0);
      expect(summary.failuresCount).toBe(0);
      expect(summary.preferencesCount).toBe(0);
    });

    it('should return correct counts', () => {
      appendDecision(testDir, {
        title: 'D1',
        date: '2024-01-01',
        alternatives: [],
        rationale: 'R1',
      });
      appendDecision(testDir, {
        title: 'D2',
        date: '2024-01-02',
        alternatives: [],
        rationale: 'R2',
      });
      appendPattern(testDir, {
        name: 'P1',
        date: '2024-01-01',
        description: 'Desc',
      });
      appendFailure(testDir, {
        approach: 'F1',
        date: '2024-01-01',
        reason: 'Failed',
      });
      appendPreference(testDir, {
        key: 'K1',
        value: 'V1',
        date: '2024-01-01',
      });
      appendPreference(testDir, {
        key: 'K2',
        value: 'V2',
        date: '2024-01-02',
      });
      appendPreference(testDir, {
        key: 'K3',
        value: 'V3',
        date: '2024-01-03',
      });

      const summary = getMemorySummary(testDir);
      expect(summary.hasMemory).toBe(true);
      expect(summary.decisionsCount).toBe(2);
      expect(summary.patternsCount).toBe(1);
      expect(summary.failuresCount).toBe(1);
      expect(summary.preferencesCount).toBe(3);
    });
  });

  describe('searchMemory', () => {
    beforeEach(() => {
      appendDecision(testDir, {
        title: 'Use PostgreSQL for database',
        date: '2024-01-01',
        alternatives: ['MySQL', 'MongoDB'],
        rationale: 'Better JSON support and performance',
      });
      appendPattern(testDir, {
        name: 'API Error Handling',
        date: '2024-01-02',
        description: 'Always return structured error responses',
      });
      appendFailure(testDir, {
        approach: 'Using MongoDB for relational data',
        date: '2024-01-03',
        reason: 'Complex joins were too slow',
      });
      appendPreference(testDir, {
        key: 'database_pooling',
        value: 'Use connection pooling',
        date: '2024-01-04',
      });
    });

    it('should find matching decisions', () => {
      const results = searchMemory(testDir, ['PostgreSQL']);
      expect(results.decisions).toHaveLength(1);
      expect(results.decisions[0].title).toContain('PostgreSQL');
    });

    it('should find matching patterns', () => {
      const results = searchMemory(testDir, ['error']);
      expect(results.patterns).toHaveLength(1);
      expect(results.patterns[0].name).toContain('Error');
    });

    it('should find matching failures', () => {
      const results = searchMemory(testDir, ['MongoDB']);
      expect(results.decisions).toHaveLength(1); // In alternatives
      expect(results.failures).toHaveLength(1);
    });

    it('should find matching preferences', () => {
      const results = searchMemory(testDir, ['database']);
      expect(results.decisions).toHaveLength(1);
      expect(results.preferences).toHaveLength(1);
    });

    it('should be case-insensitive', () => {
      const results = searchMemory(testDir, ['POSTGRESQL']);
      expect(results.decisions).toHaveLength(1);
    });

    it('should match multiple keywords', () => {
      const results = searchMemory(testDir, ['database', 'error']);
      expect(results.decisions).toHaveLength(1);
      expect(results.patterns).toHaveLength(1);
      expect(results.preferences).toHaveLength(1);
    });

    it('should return empty arrays when no matches', () => {
      const results = searchMemory(testDir, ['nonexistent']);
      expect(results.decisions).toHaveLength(0);
      expect(results.patterns).toHaveLength(0);
      expect(results.failures).toHaveLength(0);
      expect(results.preferences).toHaveLength(0);
    });
  });

  describe('getCurrentDate', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const date = getCurrentDate();
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('round-trip parsing', () => {
    it('should correctly round-trip decisions', () => {
      const original: Decision = {
        title: 'Complex Decision',
        date: '2024-01-15',
        alternatives: ['Option A', 'Option B', 'Option C'],
        rationale:
          'This is a multi-line rationale that explains the decision in detail.',
        agent: 'test-agent',
        context: 'Additional context about why this decision was made.',
      };

      appendDecision(testDir, original);
      const memory = loadMemory(testDir);

      expect(memory.decisions).toHaveLength(1);
      const loaded = memory.decisions[0];
      expect(loaded.title).toBe(original.title);
      expect(loaded.date).toBe(original.date);
      expect(loaded.alternatives).toEqual(original.alternatives);
      expect(loaded.rationale).toContain('multi-line rationale');
      expect(loaded.agent).toBe(original.agent);
      expect(loaded.context).toContain('Additional context');
    });

    it('should correctly round-trip patterns with code examples', () => {
      const original: Pattern = {
        name: 'Code Pattern',
        date: '2024-01-15',
        description: 'A pattern with code',
        example: '```typescript\nfunction example() {\n  return 42;\n}\n```',
        files: ['file1.ts', 'file2.ts'],
      };

      appendPattern(testDir, original);
      const memory = loadMemory(testDir);

      expect(memory.patterns).toHaveLength(1);
      const loaded = memory.patterns[0];
      expect(loaded.name).toBe(original.name);
      expect(loaded.description).toContain('pattern with code');
      expect(loaded.example).toContain('function example()');
      expect(loaded.files).toEqual(original.files);
    });
  });
});
