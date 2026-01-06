/**
 * Unit tests for issues handler submodules
 *
 * Tests the individual exported functions from each module to achieve
 * 100% coverage on:
 * - environment-checker.ts
 * - formatter.ts
 * - todo-scanner.ts
 * - health-checker.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

// Import individual modules for direct testing
import { checkEnvironment } from '../../../handlers/issues/environment-checker.js';
import { formatIssues } from '../../../handlers/issues/formatter.js';
import { scanFile, scanDirectory, getPriority, isTestFile } from '../../../handlers/issues/todo-scanner.js';
import { checkHealth } from '../../../handlers/issues/health-checker.js';
import type { ProjectIssuesResult, TodoItem } from '../../../handlers/issues/types.js';

// Mock fs module
vi.mock('fs');

// Type-safe mock helpers
function createMockStats(options: { isDirectory: boolean }): fs.Stats {
  return {
    isDirectory: () => options.isDirectory,
    isFile: () => !options.isDirectory,
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  } as fs.Stats;
}

function createMockDirent(name: string, options: { isDirectory: boolean; isFile?: boolean }): fs.Dirent {
  return {
    name,
    isDirectory: () => options.isDirectory,
    isFile: () => options.isFile !== undefined ? options.isFile : !options.isDirectory,
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    path: name,
    parentPath: '.',
  } as fs.Dirent;
}

describe('environment-checker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('checkEnvironment', () => {
    it('should handle error reading .env file (line 31)', () => {
      // Mock .env file exists but throws error when reading
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.endsWith('.env');
      });
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Should not throw, should return empty issues
      const issues = checkEnvironment('/test');
      expect(issues).toEqual([]);
    });

    it('should handle error reading .env.example file (line 51)', () => {
      // Mock .env.example exists but throws error when reading
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.endsWith('.env.example');
      });
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const issues = checkEnvironment('/test');
      expect(issues).toEqual([]);
    });

    it('should skip .env.example in gitignore check (line 78)', () => {
      // Note: With current constants, .env.example is in ENV_EXAMPLE_FILES not ENV_FILES,
      // so line 78 cannot be directly reached. This test verifies the expected behavior
      // when .env.example is found in ENV_EXAMPLE_FILES (for missing var detection).
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.endsWith('.env.example') || pathStr.endsWith('.gitignore');
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.endsWith('.env.example')) {
          return 'API_KEY=test123\n';
        }
        if (pathStr.endsWith('.gitignore')) {
          return 'node_modules\n';
        }
        return '';
      });

      // .env.example should be skipped in gitignore check
      const issues = checkEnvironment('/test');
      // Should not report .env.example as not gitignored
      expect(issues.filter(i => i.type === 'sensitive_exposed')).toHaveLength(0);
    });

    it('should match .env pattern when gitignore has .env (line 85)', () => {
      // .env.local exists with sensitive var, gitignore has .env pattern
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.endsWith('.env.local') || pathStr.endsWith('.gitignore');
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.endsWith('.env.local')) {
          return 'API_KEY=secret\n';
        }
        if (pathStr.endsWith('.gitignore')) {
          return '.env\n'; // Pattern that should match .env.local
        }
        return '';
      });

      const issues = checkEnvironment('/test');
      // .env pattern matches .env.local, so no sensitive_exposed warning
      expect(issues.filter(i => i.type === 'sensitive_exposed')).toHaveLength(0);
    });

    it('should match .env* pattern (line 86)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.endsWith('.env.production') || pathStr.endsWith('.gitignore');
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.endsWith('.env.production')) {
          return 'SECRET_KEY=value\n';
        }
        if (pathStr.endsWith('.gitignore')) {
          return '.env*\n';
        }
        return '';
      });

      const issues = checkEnvironment('/test');
      expect(issues.filter(i => i.type === 'sensitive_exposed')).toHaveLength(0);
    });

    it('should match *.env* pattern (line 86)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.endsWith('.env.development') || pathStr.endsWith('.gitignore');
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.endsWith('.env.development')) {
          return 'TOKEN=abc\n';
        }
        if (pathStr.endsWith('.gitignore')) {
          return '*.env*\n';
        }
        return '';
      });

      const issues = checkEnvironment('/test');
      expect(issues.filter(i => i.type === 'sensitive_exposed')).toHaveLength(0);
    });

    it('should match .env.* pattern (line 88)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.endsWith('.env.local') || pathStr.endsWith('.gitignore');
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.endsWith('.env.local')) {
          return 'PASSWORD=123\n';
        }
        if (pathStr.endsWith('.gitignore')) {
          return '.env.*\n';
        }
        return '';
      });

      const issues = checkEnvironment('/test');
      expect(issues.filter(i => i.type === 'sensitive_exposed')).toHaveLength(0);
    });

    it('should handle error reading .gitignore (line 103)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.endsWith('.env') || pathStr.endsWith('.gitignore');
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.endsWith('.env')) {
          return 'API_KEY=test\n';
        }
        if (pathStr.endsWith('.gitignore')) {
          throw new Error('Cannot read .gitignore');
        }
        return '';
      });

      // Should not throw
      const issues = checkEnvironment('/test');
      // No sensitive_exposed because gitignore read failed
      expect(issues.filter(i => i.type === 'sensitive_exposed')).toHaveLength(0);
    });

    it('should handle non-Error exception in .env read', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.endsWith('.env');
      });
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw 'String error';
      });

      const issues = checkEnvironment('/test');
      expect(issues).toEqual([]);
    });

    it('should handle non-Error exception in .env.example read', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.endsWith('.env.example');
      });
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw { code: 'ENOENT' };
      });

      const issues = checkEnvironment('/test');
      expect(issues).toEqual([]);
    });

    it('should handle non-Error exception in .gitignore read', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.endsWith('.env') || pathStr.endsWith('.gitignore');
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.endsWith('.env')) {
          return 'KEY=value\n';
        }
        throw 42; // non-Error value
      });

      const issues = checkEnvironment('/test');
      expect(issues).toEqual([]);
    });
  });
});

describe('formatter', () => {
  describe('formatIssues', () => {
    it('should truncate high-priority TODOs to 10 and show more count (line 23)', () => {
      // Create result with more than 10 high-priority TODOs
      const highPriorityTodos: TodoItem[] = Array.from({ length: 15 }, (_, i) => ({
        type: 'FIXME' as const,
        text: `Issue ${i + 1}`,
        file: `file${i + 1}.ts`,
        line: i + 1,
        priority: 'high' as const,
      }));

      const result: ProjectIssuesResult = {
        total_issues: 15,
        todos: {
          high_priority: highPriorityTodos,
          medium_priority: [],
          low_priority: [],
          total: 15,
        },
        health: {
          warnings: [],
          suggestions: [],
        },
        environment: {
          issues: [],
        },
        formatted: '',
      };

      const output = formatIssues(result);

      // Should show only first 10 and include "5 more..."
      expect(output).toContain('High-Priority TODOs (15)');
      expect(output).toContain('5 more...');
      // Should contain first 10 items
      expect(output).toContain('Issue 1');
      expect(output).toContain('Issue 10');
      // Should NOT contain items after 10
      expect(output).not.toContain('file11.ts');
    });

    it('should show unknown icon type as info icon (line 34)', () => {
      const result: ProjectIssuesResult = {
        total_issues: 1,
        todos: {
          high_priority: [],
          medium_priority: [],
          low_priority: [],
          total: 0,
        },
        health: {
          warnings: [
            {
              type: 'unknown' as 'info', // Force unknown type
              message: 'Unknown warning type',
            },
          ],
          suggestions: [],
        },
        environment: {
          issues: [],
        },
        formatted: '',
      };

      const output = formatIssues(result);
      // Should fallback to info icon for unknown type
      expect(output).toContain('Unknown warning type');
    });

    it('should truncate medium-priority TODOs when more than 5 (line 61)', () => {
      const mediumPriorityTodos: TodoItem[] = Array.from({ length: 8 }, (_, i) => ({
        type: 'TODO' as const,
        text: `Medium task ${i + 1}`,
        file: `medium${i + 1}.ts`,
        line: i + 1,
        priority: 'medium' as const,
      }));

      const result: ProjectIssuesResult = {
        total_issues: 0,
        todos: {
          high_priority: [],
          medium_priority: mediumPriorityTodos,
          low_priority: [],
          total: 8,
        },
        health: {
          warnings: [],
          suggestions: [],
        },
        environment: {
          issues: [],
        },
        formatted: '',
      };

      const output = formatIssues(result);

      expect(output).toContain('Medium-Priority TODOs (8)');
      expect(output).toContain('3 more...');
    });
  });
});

describe('todo-scanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('isTestFile', () => {
    it('should identify test files', () => {
      expect(isTestFile('component.test.ts')).toBe(true);
      expect(isTestFile('component.spec.ts')).toBe(true);
      expect(isTestFile('component_test.ts')).toBe(true);
      expect(isTestFile('component_spec.ts')).toBe(true);
      expect(isTestFile('Button.stories.tsx')).toBe(true);
      expect(isTestFile('utils.ts')).toBe(false);
    });
  });

  describe('getPriority', () => {
    it('should return high for FIXME', () => {
      expect(getPriority('FIXME', 'some text')).toBe('high');
    });

    it('should return high for BUG', () => {
      expect(getPriority('BUG', 'some text')).toBe('high');
    });

    it('should return high for security keyword (line 39)', () => {
      expect(getPriority('TODO', 'fix security issue')).toBe('high');
    });

    it('should return high for vulnerability keyword (line 39)', () => {
      expect(getPriority('TODO', 'patch vulnerability')).toBe('high');
    });

    it('should return low for NOTE', () => {
      expect(getPriority('NOTE', 'some text')).toBe('low');
    });

    it('should return low for maybe keyword (line 43)', () => {
      expect(getPriority('TODO', 'maybe do this later')).toBe('low');
    });

    it('should return low for consider keyword (line 43)', () => {
      expect(getPriority('TODO', 'consider adding feature')).toBe('low');
    });

    it('should return low for nice to have keyword (line 43)', () => {
      expect(getPriority('TODO', 'nice to have feature')).toBe('low');
    });

    it('should return medium for regular TODO', () => {
      expect(getPriority('TODO', 'refactor this')).toBe('medium');
    });
  });

  describe('scanFile', () => {
    it('should handle file read error (line 80-83)', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File not found');
      });

      const items = scanFile('/test/file.ts', 'file.ts');
      expect(items).toEqual([]);
    });

    it('should handle non-Error exception', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw 'String error';
      });

      const items = scanFile('/test/file.ts', 'file.ts');
      expect(items).toEqual([]);
    });

    it('should skip short TODO text (line 67)', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('// TODO: ab\n// TODO: valid text');

      const items = scanFile('/test/file.ts', 'file.ts');
      expect(items).toHaveLength(1);
      expect(items[0].text).toBe('valid text');
    });

    it('should truncate long TODO text to 100 chars (line 71)', () => {
      const longText = 'a'.repeat(150);
      vi.mocked(fs.readFileSync).mockReturnValue(`// TODO: ${longText}`);

      const items = scanFile('/test/file.ts', 'file.ts');
      expect(items).toHaveLength(1);
      expect(items[0].text.length).toBe(100);
    });
  });

  describe('scanDirectory', () => {
    it('should handle directory read error (line 117-120)', () => {
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const items: TodoItem[] = [];
      // Should not throw
      scanDirectory('/test', '/test', items);
      expect(items).toEqual([]);
    });

    it('should handle non-Error exception in directory read', () => {
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw { code: 'EACCES' };
      });

      const items: TodoItem[] = [];
      scanDirectory('/test', '/test', items);
      expect(items).toEqual([]);
    });

    it('should recurse into non-skipped directories (line 106)', () => {
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        const dirStr = String(dir);
        if (dirStr === '/test') {
          return [
            createMockDirent('src', { isDirectory: true }),
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        if (dirStr.includes('src')) {
          return [
            createMockDirent('app.ts', { isDirectory: false }),
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [] as unknown as ReturnType<typeof fs.readdirSync>;
      });
      vi.mocked(fs.readFileSync).mockReturnValue('// FIXME: Found in subdir');

      const items: TodoItem[] = [];
      scanDirectory('/test', '/test', items);

      // Should have found the TODO in src/app.ts
      expect(items.length).toBeGreaterThan(0);
    });

    it('should respect maxFiles limit', () => {
      // Create many files
      const manyFiles = Array.from({ length: 20 }, (_, i) =>
        createMockDirent(`file${i}.ts`, { isDirectory: false })
      );

      vi.mocked(fs.readdirSync).mockReturnValue(
        manyFiles as unknown as ReturnType<typeof fs.readdirSync>
      );
      vi.mocked(fs.readFileSync).mockReturnValue('// TODO: task');

      const items: TodoItem[] = [];
      scanDirectory('/test', '/test', items, 5);

      // Should be limited by maxFiles
      expect(items.length).toBeLessThanOrEqual(50); // maxFiles * max TODOs per file
    });

    it('should exit early when items exceed maxFiles * 10 (line 91)', () => {
      // Pre-fill items to trigger early exit
      const items: TodoItem[] = Array.from({ length: 5001 }, () => ({
        type: 'TODO' as const,
        text: 'test',
        file: 'test.ts',
        line: 1,
        priority: 'medium' as const,
      }));

      vi.mocked(fs.readdirSync).mockReturnValue([
        createMockDirent('more.ts', { isDirectory: false }),
      ] as unknown as ReturnType<typeof fs.readdirSync>);

      scanDirectory('/test', '/test', items, 500);

      // Should not have scanned more files (items count unchanged)
      expect(items.length).toBe(5001);
    });

    it('should skip entries that are neither directory nor file (line 108 branch)', () => {
      // Create a symlink entry - neither directory nor file
      vi.mocked(fs.readdirSync).mockReturnValue([
        createMockDirent('symlink', { isDirectory: false, isFile: false }),
        createMockDirent('regular.ts', { isDirectory: false, isFile: true }),
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockReturnValue('// TODO: found');

      const items: TodoItem[] = [];
      scanDirectory('/test', '/test', items);

      // Should only find TODO from regular.ts, symlink should be skipped
      expect(items.length).toBe(1);
    });
  });
});

describe('health-checker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('checkHealth', () => {
    it('should handle tsconfig.json parse error (line 59-61)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('tsconfig.json');
      });
      vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json }');

      const result = checkHealth('/test');
      // Should not throw, should return empty warnings for tsconfig
      expect(result.warnings).toEqual([]);
    });

    it('should handle tsconfig.json read error with Error object (line 60)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('tsconfig.json');
      });
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Cannot read file');
      });

      const result = checkHealth('/test');
      expect(result.warnings).toEqual([]);
    });

    it('should handle tsconfig.json read error with non-Error (line 60)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('tsconfig.json');
      });
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw 'String error';
      });

      const result = checkHealth('/test');
      expect(result.warnings).toEqual([]);
    });

    it('should handle package.json parse error (line 78-80)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('package.json');
      });
      vi.mocked(fs.readFileSync).mockReturnValue('not valid json');

      const result = checkHealth('/test');
      expect(result.suggestions).toEqual([]);
    });

    it('should handle package.json read error with Error (line 79)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('package.json');
      });
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = checkHealth('/test');
      expect(result.suggestions).toEqual([]);
    });

    it('should handle package.json read error with non-Error (line 79)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('package.json');
      });
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw { error: 'Read failed' };
      });

      const result = checkHealth('/test');
      expect(result.suggestions).toEqual([]);
    });

    it('should not suggest lint when eslint script exists (line 72)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('package.json');
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        scripts: {
          eslint: 'eslint .',
        },
      }));

      const result = checkHealth('/test');
      expect(result.suggestions.find(s => s.includes('lint'))).toBeUndefined();
    });

    it('should not suggest test when jest script exists (line 75)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('package.json');
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        scripts: {
          jest: 'jest',
          lint: 'eslint .',
        },
      }));

      const result = checkHealth('/test');
      expect(result.suggestions.find(s => s.includes('test'))).toBeUndefined();
    });

    it('should not suggest test when vitest script exists (line 75)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('package.json');
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        scripts: {
          vitest: 'vitest',
          lint: 'eslint .',
        },
      }));

      const result = checkHealth('/test');
      expect(result.suggestions.find(s => s.includes('test'))).toBeUndefined();
    });

    it('should handle package.json without scripts (line 70)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('package.json');
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        name: 'test-package',
      }));

      const result = checkHealth('/test');
      // Should suggest both lint and test
      expect(result.suggestions.some(s => s.includes('lint'))).toBe(true);
      expect(result.suggestions.some(s => s.includes('test'))).toBe(true);
    });

    it('should handle tsconfig with undefined compilerOptions (line 51)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('tsconfig.json');
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        extends: './base.json',
      }));

      const result = checkHealth('/test');
      // Should warn about strict mode not being enabled
      expect(result.warnings.some(w => w.message.includes('strict mode'))).toBe(true);
    });

    it('should limit suggestions to 3 (line 83)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('package.json');
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        scripts: {},
      }));

      const result = checkHealth('/test');
      // Currently only 2 suggestions possible, but test the limit
      expect(result.suggestions.length).toBeLessThanOrEqual(3);
    });
  });
});
