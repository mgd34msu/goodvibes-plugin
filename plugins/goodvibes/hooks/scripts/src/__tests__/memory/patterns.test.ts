/**
 * Tests for memory/patterns.ts
 *
 * Comprehensive test suite achieving 100% line and branch coverage for
 * pattern reading, writing, and formatting functions.
 */

import * as path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { MemoryPattern } from '../../types/memory.js';

// Mock the parser module before importing the module under test
vi.mock('../../memory/parser.js', () => ({
  parseMemoryFile: vi.fn(),
  ensureMemoryFile: vi.fn(),
  appendMemoryEntry: vi.fn(),
}));

// Import the mocked modules and module under test
import {
  parseMemoryFile,
  ensureMemoryFile,
  appendMemoryEntry,
} from '../../memory/parser.js';
import { readPatterns, writePattern } from '../../memory/patterns.js';

import type { ProjectMemory } from '../../types/memory.js';

// Helper to construct platform-specific file paths
const getExpectedPath = (cwd: string): string =>
  path.join(cwd, '.goodvibes', 'memory', 'patterns.md');

describe('memory/patterns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readPatterns', () => {
    it('should call parseMemoryFile with correct file path', async () => {
      vi.mocked(parseMemoryFile).mockResolvedValue([]);

      const cwd = '/test/project';
      await readPatterns(cwd);

      expect(parseMemoryFile).toHaveBeenCalledWith(
        getExpectedPath(cwd),
        expect.any(Object)
      );
    });

    it('should return parsed patterns from the file', async () => {
      const mockPatterns: MemoryPattern[] = [
        {
          name: 'Repository Pattern',
          date: '2024-01-01',
          description: 'Data access abstraction',
        },
        {
          name: 'Factory Pattern',
          date: '2024-01-02',
          description: 'Object creation encapsulation',
          example: 'const user = UserFactory.create({ name: "John" });',
          files: ['src/factories/user.ts'],
        },
      ];

      vi.mocked(parseMemoryFile).mockResolvedValue(mockPatterns);

      const result = await readPatterns('/test/project');

      expect(result).toEqual(mockPatterns);
    });

    it('should return empty array when no patterns exist', async () => {
      vi.mocked(parseMemoryFile).mockResolvedValue([]);

      const result = await readPatterns('/empty/project');

      expect(result).toEqual([]);
    });

    it('should configure parser with correct primaryField', async () => {
      vi.mocked(parseMemoryFile).mockResolvedValue([]);

      await readPatterns('/test/project');

      expect(parseMemoryFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          primaryField: 'name',
        })
      );
    });

    it('should configure parser with correct field definitions', async () => {
      vi.mocked(parseMemoryFile).mockResolvedValue([]);

      await readPatterns('/test/project');

      expect(parseMemoryFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          fields: {
            date: 'inline',
            description: 'text',
            example: 'code',
            files: 'list',
          },
        })
      );
    });

    it('should have a validate function that requires name, date, and description', async () => {
      vi.mocked(parseMemoryFile).mockResolvedValue([]);

      await readPatterns('/test/project');

      const parserConfig = vi.mocked(parseMemoryFile).mock.calls[0][1];

      // Test validation function
      expect(
        parserConfig.validate?.({
          name: 'Test',
          date: '2024-01-01',
          description: 'Desc',
        })
      ).toBe(true);
      expect(
        parserConfig.validate?.({ name: 'Test', date: '2024-01-01' })
      ).toBe(false);
      expect(
        parserConfig.validate?.({ name: 'Test', description: 'Desc' })
      ).toBe(false);
      expect(
        parserConfig.validate?.({ date: '2024-01-01', description: 'Desc' })
      ).toBe(false);
      expect(parserConfig.validate?.({})).toBe(false);
    });

    it('should have a transform function that maps all fields correctly', async () => {
      vi.mocked(parseMemoryFile).mockResolvedValue([]);

      await readPatterns('/test/project');

      const parserConfig = vi.mocked(parseMemoryFile).mock.calls[0][1];

      // Test transform function with all fields
      const transformed = parserConfig.transform?.({
        name: 'Test Pattern',
        date: '2024-01-01',
        description: 'Test description',
        example: 'const x = 1;',
        files: ['file1.ts', 'file2.ts'],
      });

      expect(transformed).toEqual({
        name: 'Test Pattern',
        date: '2024-01-01',
        description: 'Test description',
        example: 'const x = 1;',
        files: ['file1.ts', 'file2.ts'],
      });
    });

    it('should have a transform function that handles optional fields as undefined', async () => {
      vi.mocked(parseMemoryFile).mockResolvedValue([]);

      await readPatterns('/test/project');

      const parserConfig = vi.mocked(parseMemoryFile).mock.calls[0][1];

      // Test transform function without optional fields
      const transformed = parserConfig.transform?.({
        name: 'Test Pattern',
        date: '2024-01-01',
        description: 'Test description',
      });

      expect(transformed).toEqual({
        name: 'Test Pattern',
        date: '2024-01-01',
        description: 'Test description',
        example: undefined,
        files: undefined,
      });
    });

    it('should handle Windows-style paths correctly', async () => {
      vi.mocked(parseMemoryFile).mockResolvedValue([]);

      await readPatterns('C:\\Users\\test\\project');

      // The path.join should handle platform-specific separators
      expect(parseMemoryFile).toHaveBeenCalledWith(
        expect.stringContaining('.goodvibes'),
        expect.any(Object)
      );
    });
  });

  describe('writePattern', () => {
    it('should ensure memory file exists with correct header', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const cwd = '/test/project';
      const pattern: MemoryPattern = {
        name: 'Test Pattern',
        date: '2024-01-01',
        description: 'Test description',
      };

      await writePattern(cwd, pattern);

      expect(ensureMemoryFile).toHaveBeenCalledWith(
        getExpectedPath(cwd),
        expect.stringContaining('# Project-Specific Patterns')
      );
    });

    it('should ensure memory file header contains documentation', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const pattern: MemoryPattern = {
        name: 'Test Pattern',
        date: '2024-01-01',
        description: 'Test description',
      };

      await writePattern('/test/project', pattern);

      const header = vi.mocked(ensureMemoryFile).mock.calls[0][1];
      expect(header).toContain(
        'This file documents code patterns specific to this project'
      );
      expect(header).toContain('maintain consistency across the codebase');
    });

    it('should append formatted pattern entry', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const cwd = '/test/project';
      const pattern: MemoryPattern = {
        name: 'Repository Pattern',
        date: '2024-01-04',
        description: 'Use repository classes for data access abstraction',
      };

      await writePattern(cwd, pattern);

      expect(appendMemoryEntry).toHaveBeenCalledWith(
        getExpectedPath(cwd),
        expect.any(String)
      );
    });

    it('should format pattern with name as heading', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const pattern: MemoryPattern = {
        name: 'Repository Pattern',
        date: '2024-01-04',
        description: 'Use repository classes for data access abstraction',
      };

      await writePattern('/test/project', pattern);

      const formattedEntry = vi.mocked(appendMemoryEntry).mock.calls[0][1];
      expect(formattedEntry).toContain('## Repository Pattern');
    });

    it('should format pattern with date field', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const pattern: MemoryPattern = {
        name: 'Test Pattern',
        date: '2024-01-04',
        description: 'Test description',
      };

      await writePattern('/test/project', pattern);

      const formattedEntry = vi.mocked(appendMemoryEntry).mock.calls[0][1];
      expect(formattedEntry).toContain('**Date:** 2024-01-04');
    });

    it('should format pattern with description section', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const pattern: MemoryPattern = {
        name: 'Test Pattern',
        date: '2024-01-04',
        description: 'This is a detailed description of the pattern.',
      };

      await writePattern('/test/project', pattern);

      const formattedEntry = vi.mocked(appendMemoryEntry).mock.calls[0][1];
      expect(formattedEntry).toContain('**Description:**');
      expect(formattedEntry).toContain(
        'This is a detailed description of the pattern.'
      );
    });

    it('should format pattern with example when provided', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const pattern: MemoryPattern = {
        name: 'Repository Pattern',
        date: '2024-01-04',
        description: 'Data access abstraction',
        example: 'class UserRepository { async findById(id) { ... } }',
      };

      await writePattern('/test/project', pattern);

      const formattedEntry = vi.mocked(appendMemoryEntry).mock.calls[0][1];
      expect(formattedEntry).toContain('**Example:**');
      expect(formattedEntry).toContain(
        'class UserRepository { async findById(id) { ... } }'
      );
    });

    it('should not include example section when example is not provided', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const pattern: MemoryPattern = {
        name: 'Test Pattern',
        date: '2024-01-04',
        description: 'Test description',
      };

      await writePattern('/test/project', pattern);

      const formattedEntry = vi.mocked(appendMemoryEntry).mock.calls[0][1];
      expect(formattedEntry).not.toContain('**Example:**');
    });

    it('should format pattern with files list when provided', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const pattern: MemoryPattern = {
        name: 'Repository Pattern',
        date: '2024-01-04',
        description: 'Data access abstraction',
        files: ['src/repositories/user.ts', 'src/repositories/product.ts'],
      };

      await writePattern('/test/project', pattern);

      const formattedEntry = vi.mocked(appendMemoryEntry).mock.calls[0][1];
      expect(formattedEntry).toContain('**Files:**');
      expect(formattedEntry).toContain('- src/repositories/user.ts');
      expect(formattedEntry).toContain('- src/repositories/product.ts');
    });

    it('should not include files section when files array is empty', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const pattern: MemoryPattern = {
        name: 'Test Pattern',
        date: '2024-01-04',
        description: 'Test description',
        files: [],
      };

      await writePattern('/test/project', pattern);

      const formattedEntry = vi.mocked(appendMemoryEntry).mock.calls[0][1];
      expect(formattedEntry).not.toContain('**Files:**');
    });

    it('should not include files section when files is undefined', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const pattern: MemoryPattern = {
        name: 'Test Pattern',
        date: '2024-01-04',
        description: 'Test description',
      };

      await writePattern('/test/project', pattern);

      const formattedEntry = vi.mocked(appendMemoryEntry).mock.calls[0][1];
      expect(formattedEntry).not.toContain('**Files:**');
    });

    it('should end pattern entry with separator', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const pattern: MemoryPattern = {
        name: 'Test Pattern',
        date: '2024-01-04',
        description: 'Test description',
      };

      await writePattern('/test/project', pattern);

      const formattedEntry = vi.mocked(appendMemoryEntry).mock.calls[0][1];
      expect(formattedEntry).toContain('\n---\n');
    });

    it('should format complete pattern with all fields in correct order', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const pattern: MemoryPattern = {
        name: 'Complete Pattern',
        date: '2024-01-04',
        description: 'A complete pattern with all fields.',
        example: 'const example = true;',
        files: ['file1.ts', 'file2.ts'],
      };

      await writePattern('/test/project', pattern);

      const formattedEntry = vi.mocked(appendMemoryEntry).mock.calls[0][1];

      // Verify ordering of sections
      const nameIndex = formattedEntry.indexOf('## Complete Pattern');
      const dateIndex = formattedEntry.indexOf('**Date:**');
      const descriptionIndex = formattedEntry.indexOf('**Description:**');
      const exampleIndex = formattedEntry.indexOf('**Example:**');
      const filesIndex = formattedEntry.indexOf('**Files:**');
      const separatorIndex = formattedEntry.lastIndexOf('---');

      expect(nameIndex).toBeLessThan(dateIndex);
      expect(dateIndex).toBeLessThan(descriptionIndex);
      expect(descriptionIndex).toBeLessThan(exampleIndex);
      expect(exampleIndex).toBeLessThan(filesIndex);
      expect(filesIndex).toBeLessThan(separatorIndex);
    });

    it('should format pattern starting with newline for proper markdown spacing', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const pattern: MemoryPattern = {
        name: 'Test Pattern',
        date: '2024-01-04',
        description: 'Test description',
      };

      await writePattern('/test/project', pattern);

      const formattedEntry = vi.mocked(appendMemoryEntry).mock.calls[0][1];
      expect(formattedEntry.startsWith('\n')).toBe(true);
    });

    it('should handle special characters in pattern content', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const pattern: MemoryPattern = {
        name: 'Pattern with *special* & <characters>',
        date: '2024-01-04',
        description: 'Description with "quotes" and `backticks`',
        example: '`const x = { key: "value" };`',
        files: ['path/to/file-with-dashes.ts'],
      };

      await writePattern('/test/project', pattern);

      const formattedEntry = vi.mocked(appendMemoryEntry).mock.calls[0][1];
      expect(formattedEntry).toContain(
        '## Pattern with *special* & <characters>'
      );
      expect(formattedEntry).toContain(
        'Description with "quotes" and `backticks`'
      );
      expect(formattedEntry).toContain('`const x = { key: "value" };`');
    });

    it('should handle multiline description', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const pattern: MemoryPattern = {
        name: 'Multiline Pattern',
        date: '2024-01-04',
        description: 'Line 1\nLine 2\nLine 3',
      };

      await writePattern('/test/project', pattern);

      const formattedEntry = vi.mocked(appendMemoryEntry).mock.calls[0][1];
      expect(formattedEntry).toContain('Line 1\nLine 2\nLine 3');
    });

    it('should handle multiline example', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const pattern: MemoryPattern = {
        name: 'Multiline Example Pattern',
        date: '2024-01-04',
        description: 'Test description',
        example: 'function test() {\n  return true;\n}',
      };

      await writePattern('/test/project', pattern);

      const formattedEntry = vi.mocked(appendMemoryEntry).mock.calls[0][1];
      expect(formattedEntry).toContain('function test() {\n  return true;\n}');
    });

    it('should handle single file in files array', async () => {
      vi.mocked(ensureMemoryFile).mockResolvedValue(undefined);
      vi.mocked(appendMemoryEntry).mockResolvedValue(undefined);

      const pattern: MemoryPattern = {
        name: 'Single File Pattern',
        date: '2024-01-04',
        description: 'Test description',
        files: ['src/single-file.ts'],
      };

      await writePattern('/test/project', pattern);

      const formattedEntry = vi.mocked(appendMemoryEntry).mock.calls[0][1];
      expect(formattedEntry).toContain('**Files:**');
      expect(formattedEntry).toContain('- src/single-file.ts');
      // Ensure only one file entry
      const fileMatches = formattedEntry.match(/- src\//g);
      expect(fileMatches?.length).toBe(1);
    });
  });
});
