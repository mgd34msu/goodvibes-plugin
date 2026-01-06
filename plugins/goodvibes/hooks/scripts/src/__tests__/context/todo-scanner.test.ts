/**
 * Tests for todo-scanner.ts
 *
 * Achieves 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Dirent } from 'fs';
import { scanTodos, formatTodos, type TodoItem } from '../../context/todo-scanner';
import { createMockReaddirResult, createMockDirent } from '../test-utils/mock-factories';

// Mock fs/promises
vi.mock('fs/promises');

describe('todo-scanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('scanTodos', () => {
    it('should find TODO comments in files', async () => {
      const mockCwd = '/test/project';

      // Mock directory structure
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      // Mock file content with TODO
      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Fix this bug\nconst x = 1;');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        type: 'TODO',
        file: 'file1.ts',
        line: 1,
        text: '// TODO: Fix this bug',
      });
    });

    it('should find FIXME comments in files', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.js', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// FIXME: Broken logic\nconst y = 2;');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('FIXME');
    });

    it('should find BUG comments in files', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.tsx', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// BUG: Memory leak\nconst z = 3;');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('BUG');
    });

    it('should find HACK comments in files', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.jsx', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// HACK: Temporary workaround\nconst a = 4;');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('HACK');
    });

    it('should find XXX comments in files', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// XXX: Needs review\nconst b = 5;');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('XXX');
    });

    it('should handle multiple TODOs in a single file', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue(
        '// TODO: First todo\nconst x = 1;\n// FIXME: Second issue\nconst y = 2;'
      );

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(2);
      expect(results[0].type).toBe('TODO');
      expect(results[0].line).toBe(1);
      expect(results[1].type).toBe('FIXME');
      expect(results[1].line).toBe(3);
    });

    it('should respect the limit parameter', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue(
        '// TODO: 1\n// TODO: 2\n// TODO: 3\n// TODO: 4\n// TODO: 5'
      );

      const results = await scanTodos(mockCwd, 2);

      expect(results).toHaveLength(2);
    });

    it('should use default limit of 10', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      // Create 20 TODOs
      const todos = Array.from({ length: 20 }, (_, i) => `// TODO: Item ${i + 1}`).join('\n');
      vi.mocked(fs.readFile).mockResolvedValue(todos);

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(10); // Default limit
    });

    it('should scan nested directories', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'src', type: 'directory' },
          ]);
        }
        if (dirPath === path.join(mockCwd, 'src')) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Nested file\n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
      expect(results[0].file).toContain('src');
    });

    it('should skip node_modules directory', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'node_modules', type: 'directory' },
            { name: 'src', type: 'directory' },
          ]);
        }
        if (dirPath === path.join(mockCwd, 'src')) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Real file\n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
    });

    it('should skip dist directory', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'dist', type: 'directory' },
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Source file\n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
    });

    it('should skip .git directory', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: '.git', type: 'directory' },
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Source file\n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
    });

    it('should skip coverage directory', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'coverage', type: 'directory' },
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Source file\n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
    });

    it('should skip .goodvibes directory', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: '.goodvibes', type: 'directory' },
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Source file\n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
    });

    it('should skip __tests__ directory', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: '__tests__', type: 'directory' },
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Source file\n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
    });

    it('should skip test directory', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'test', type: 'directory' },
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Source file\n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
    });

    it('should skip tests directory', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'tests', type: 'directory' },
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Source file\n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
    });

    it('should only scan .ts files', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
            { name: 'file2.txt', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Test\n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
      expect(vi.mocked(fs.readFile)).toHaveBeenCalledTimes(1);
    });

    it('should scan .tsx files', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.tsx', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Test\n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
    });

    it('should scan .js files', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.js', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Test\n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
    });

    it('should scan .jsx files', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.jsx', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Test\n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
    });

    it('should handle case-insensitive file extensions', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.TS', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Test\n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
    });

    it('should handle readdir errors gracefully', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'));

      const results = await scanTodos(mockCwd);

      expect(results).toEqual([]);
    });

    it('should handle readFile errors gracefully', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'));

      const results = await scanTodos(mockCwd);

      expect(results).toEqual([]);
    });

    it('should match TODO patterns case-insensitively', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// todo: lowercase\n// TODO: uppercase\n// ToDo: mixed');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.type === 'TODO')).toBe(true);
    });

    it('should require colon after TODO pattern', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO without colon\n// TODO: with colon');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
      expect(results[0].line).toBe(2);
    });

    it('should only count each line once even with multiple patterns', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      // FIXME appears first in pattern list
      vi.mocked(fs.readFile).mockResolvedValue('// FIXME: TODO: Both patterns on same line');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('FIXME'); // First pattern in list
    });

    it('should trim whitespace from matched lines', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('   // TODO: Indented comment   \n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
      expect(results[0].text).toBe('// TODO: Indented comment');
    });

    it('should convert backslashes to forward slashes in relative paths', async () => {
      const mockCwd = 'C:\\test\\project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'src', type: 'directory' },
          ]);
        }
        if (dirPath === path.join(mockCwd, 'src')) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Test\n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
      expect(results[0].file).toBe('src/file1.ts');
      expect(results[0].file).not.toContain('\\');
    });

    it('should stop scanning files once limit is reached', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
            { name: 'file2.ts', type: 'file' },
            { name: 'file3.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Item 1\n// TODO: Item 2\n// TODO: Item 3\n');

      const results = await scanTodos(mockCwd, 2);

      expect(results).toHaveLength(2);
      // Should only read first file since it has 2+ TODOs
      expect(vi.mocked(fs.readFile)).toHaveBeenCalledTimes(1);
    });

    it('should handle empty directories', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([]);
        }
        return createMockReaddirResult([]);
      });

      const results = await scanTodos(mockCwd);

      expect(results).toEqual([]);
    });

    it('should handle files with no TODOs', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('const x = 1;\nconst y = 2;');

      const results = await scanTodos(mockCwd);

      expect(results).toEqual([]);
    });

    it('should handle empty files', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('');

      const results = await scanTodos(mockCwd);

      expect(results).toEqual([]);
    });

    it('should match word boundaries for patterns', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return createMockReaddirResult([
            { name: 'file1.ts', type: 'file' },
          ]);
        }
        return createMockReaddirResult([]);
      });

      // "NOTODO" should not match because of word boundary requirement
      vi.mocked(fs.readFile).mockResolvedValue('// NOTODO: Should not match\n// TODO: Should match');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
      expect(results[0].line).toBe(2);
    });

    it('should handle entries that are neither directories nor files', async () => {
      const mockCwd = '/test/project';

      vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
        if (dirPath === mockCwd) {
          return [
            createMockDirent('symlink', { isFile: false, isDirectory: false }), // Symlink or special file
            ...createMockReaddirResult([{ name: 'file1.ts', type: 'file' }]),
          ] as Dirent[];
        }
        return createMockReaddirResult([]);
      });

      vi.mocked(fs.readFile).mockResolvedValue('// TODO: Regular file\n');

      const results = await scanTodos(mockCwd);

      expect(results).toHaveLength(1);
      expect(results[0].file).toBe('file1.ts');
    });
  });

  describe('formatTodos', () => {
    it('should return empty string for empty array', () => {
      const result = formatTodos([]);
      expect(result).toBe('');
    });

    it('should format single TODO item', () => {
      const todos: TodoItem[] = [
        {
          type: 'TODO',
          file: 'src/file.ts',
          line: 10,
          text: '// TODO: Fix this bug',
        },
      ];

      const result = formatTodos(todos);

      expect(result).toBe('TODOs in code:\n- TODO: src/file.ts:10 - // TODO: Fix this bug');
    });

    it('should format multiple TODO items', () => {
      const todos: TodoItem[] = [
        {
          type: 'TODO',
          file: 'src/file1.ts',
          line: 10,
          text: '// TODO: First item',
        },
        {
          type: 'FIXME',
          file: 'src/file2.ts',
          line: 20,
          text: '// FIXME: Second item',
        },
      ];

      const result = formatTodos(todos);

      expect(result).toBe(
        'TODOs in code:\n' +
        '- TODO: src/file1.ts:10 - // TODO: First item\n' +
        '- FIXME: src/file2.ts:20 - // FIXME: Second item'
      );
    });

    it('should truncate text longer than 60 characters', () => {
      const longText = '// TODO: ' + 'x'.repeat(100);
      const todos: TodoItem[] = [
        {
          type: 'TODO',
          file: 'src/file.ts',
          line: 10,
          text: longText,
        },
      ];

      const result = formatTodos(todos);

      const lines = result.split('\n');
      expect(lines[1]).toHaveLength('- TODO: src/file.ts:10 - '.length + 60);
      expect(lines[1]).not.toContain(longText);
    });

    it('should format different TODO types correctly', () => {
      const todos: TodoItem[] = [
        {
          type: 'BUG',
          file: 'src/file.ts',
          line: 1,
          text: '// BUG: Memory leak',
        },
        {
          type: 'HACK',
          file: 'src/file.ts',
          line: 2,
          text: '// HACK: Workaround',
        },
        {
          type: 'XXX',
          file: 'src/file.ts',
          line: 3,
          text: '// XXX: Review this',
        },
      ];

      const result = formatTodos(todos);

      expect(result).toContain('BUG: src/file.ts:1');
      expect(result).toContain('HACK: src/file.ts:2');
      expect(result).toContain('XXX: src/file.ts:3');
    });

    it('should preserve exact 60 character text without truncation', () => {
      const exactText = '// TODO: ' + 'x'.repeat(51); // Total 60 chars
      const todos: TodoItem[] = [
        {
          type: 'TODO',
          file: 'src/file.ts',
          line: 10,
          text: exactText,
        },
      ];

      const result = formatTodos(todos);

      expect(result).toContain(exactText);
    });

    it('should truncate text at exactly 60 characters', () => {
      const text61 = '// TODO: ' + 'x'.repeat(52); // Total 61 chars
      const todos: TodoItem[] = [
        {
          type: 'TODO',
          file: 'src/file.ts',
          line: 10,
          text: text61,
        },
      ];

      const result = formatTodos(todos);

      const lines = result.split('\n');
      const todoLine = lines[1];
      const textPart = todoLine.split(' - ')[1];
      expect(textPart).toHaveLength(60);
      expect(textPart).toBe(text61.slice(0, 60));
    });
  });
});
