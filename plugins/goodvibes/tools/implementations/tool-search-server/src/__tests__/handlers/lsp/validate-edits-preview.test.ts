/**
 * Unit tests for handleValidateEditsPreview
 *
 * Tests the edit validation handler that creates virtual snapshots with proposed
 * edits and runs TypeScript diagnostics to detect new errors before applying changes.
 *
 * These tests use mocked filesystem and TypeScript compiler operations.
 */

import { describe, test, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import * as path from 'path';
import ts from 'typescript';

// Mock fs before importing the handler
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock the config module
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project',
}));

// Now import after mocks are set up
import * as fs from 'fs';
import {
  handleValidateEditsPreview,
  type ProposedEdit,
  type ValidateEditsPreviewArgs,
} from '../../../handlers/lsp/validate-edits-preview.js';

// Type helpers for mocks
const mockFs = fs as unknown as {
  existsSync: Mock;
  readFileSync: Mock;
};

// Create a mock sys for TypeScript operations
const mockTsSys = {
  readFile: vi.fn(),
  fileExists: vi.fn(),
  readDirectory: vi.fn(),
  directoryExists: vi.fn(),
  getDirectories: vi.fn(),
  realpath: vi.fn(),
};

// Mock ts.sys
vi.spyOn(ts.sys, 'readFile').mockImplementation(mockTsSys.readFile);
vi.spyOn(ts.sys, 'fileExists').mockImplementation(mockTsSys.fileExists);
vi.spyOn(ts.sys, 'readDirectory').mockImplementation(mockTsSys.readDirectory);
vi.spyOn(ts.sys, 'directoryExists').mockImplementation(mockTsSys.directoryExists);
vi.spyOn(ts.sys, 'getDirectories').mockImplementation(mockTsSys.getDirectories);
if (ts.sys.realpath) {
  vi.spyOn(ts.sys, 'realpath').mockImplementation(mockTsSys.realpath);
}

describe('handleValidateEditsPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    mockTsSys.fileExists.mockReturnValue(true);
    mockTsSys.readDirectory.mockReturnValue([]);
    mockTsSys.directoryExists.mockReturnValue(true);
    mockTsSys.getDirectories.mockReturnValue([]);
    mockTsSys.realpath.mockImplementation((p: string) => p);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('input validation', () => {
    test('returns error for missing edits array', async () => {
      const result = await handleValidateEditsPreview({} as ValidateEditsPreviewArgs);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('edits');
    });

    test('returns error for null edits', async () => {
      const result = await handleValidateEditsPreview({ edits: null as unknown as ProposedEdit[] });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('edits');
    });

    test('returns error for empty edits array', async () => {
      const result = await handleValidateEditsPreview({ edits: [] });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('empty');
    });

    test('returns error for non-array edits', async () => {
      const result = await handleValidateEditsPreview({
        edits: 'not an array' as unknown as ProposedEdit[],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('edits');
    });

    test('returns error for edit missing file property', async () => {
      const result = await handleValidateEditsPreview({
        edits: [{ content: 'new content' } as ProposedEdit],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('file');
      expect(data.error).toContain('0');
    });

    test('returns error for edit with empty file property', async () => {
      const result = await handleValidateEditsPreview({
        edits: [{ file: '', content: 'new content' }],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('file');
    });
  });

  describe('full file replacement (content)', () => {
    test('accepts valid full file content replacement', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x: number = 1;');
      mockTsSys.readFile.mockReturnValue('const x: number = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          {
            file: 'test.ts',
            content: 'const x: number = 2;',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data).toHaveProperty('safe');
      expect(data).toHaveProperty('summary');
      expect(data).toHaveProperty('edit_results');
      expect(data.edit_results[0].applied).toBe(true);
    });

    test('handles new file creation with content', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      mockTsSys.readFile.mockReturnValue(undefined);
      mockTsSys.fileExists.mockReturnValue(false);

      const result = await handleValidateEditsPreview({
        edits: [
          {
            file: 'newfile.ts',
            content: 'export const newValue = 1;',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.edit_results[0].applied).toBe(true);
    });

    test('content property takes precedence over old_text/new_text', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          {
            file: 'test.ts',
            content: 'const y = 2;',
            old_text: 'const x',
            new_text: 'const z',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.edit_results[0].applied).toBe(true);
    });
  });

  describe('text replacement (old_text/new_text)', () => {
    test('accepts valid text replacement edit', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x: number = 1;');
      mockTsSys.readFile.mockReturnValue('const x: number = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          {
            file: 'test.ts',
            old_text: 'const x: number = 1;',
            new_text: 'const x: number = 2;',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.edit_results[0].applied).toBe(true);
    });

    test('fails when old_text not found in file', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          {
            file: 'test.ts',
            old_text: 'const y = 2;', // Not in file
            new_text: 'const y = 3;',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.edit_results[0].applied).toBe(false);
      expect(data.edit_results[0].error).toContain('not found');
    });

    test('fails when old_text matches multiple locations', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;\nconst x = 2;');
      mockTsSys.readFile.mockReturnValue('const x = 1;\nconst x = 2;');

      const result = await handleValidateEditsPreview({
        edits: [
          {
            file: 'test.ts',
            old_text: 'const x', // Matches twice
            new_text: 'const y',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.edit_results[0].applied).toBe(false);
      expect(data.edit_results[0].error).toContain('2 locations');
    });

    test('fails when file does not exist for text replacement', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      mockTsSys.readFile.mockReturnValue(undefined);

      const result = await handleValidateEditsPreview({
        edits: [
          {
            file: 'nonexistent.ts',
            old_text: 'const x = 1;',
            new_text: 'const x = 2;',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.edit_results[0].applied).toBe(false);
      expect(data.edit_results[0].error).toContain('does not exist');
    });
  });

  describe('invalid edit types', () => {
    test('fails for edit with only old_text (missing new_text)', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          {
            file: 'test.ts',
            old_text: 'const x = 1;',
          } as ProposedEdit,
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.edit_results[0].applied).toBe(false);
      expect(data.edit_results[0].error).toContain('Invalid edit');
    });

    test('fails for edit with only new_text (missing old_text)', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          {
            file: 'test.ts',
            new_text: 'const y = 2;',
          } as ProposedEdit,
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.edit_results[0].applied).toBe(false);
      expect(data.edit_results[0].error).toContain('Invalid edit');
    });

    test('fails for edit with no content, old_text, or new_text', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          {
            file: 'test.ts',
          } as ProposedEdit,
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.edit_results[0].applied).toBe(false);
      expect(data.edit_results[0].error).toContain('Invalid edit');
    });
  });

  describe('multiple edits', () => {
    test('validates multiple edits to different files', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('file1')) return 'const a = 1;';
        if (filePath.includes('file2')) return 'const b = 2;';
        return '';
      });
      mockTsSys.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('file1')) return 'const a = 1;';
        if (filePath.includes('file2')) return 'const b = 2;';
        return '';
      });

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'file1.ts', content: 'const a: number = 1;' },
          { file: 'file2.ts', content: 'const b: number = 2;' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.edit_results.length).toBe(2);
      expect(data.edit_results[0].applied).toBe(true);
      expect(data.edit_results[1].applied).toBe(true);
    });

    test('validates multiple edits to same file (sequential)', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const a = 1;\nconst b = 2;');
      mockTsSys.readFile.mockReturnValue('const a = 1;\nconst b = 2;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', old_text: 'const a = 1;', new_text: 'const a = 10;' },
          { file: 'test.ts', old_text: 'const b = 2;', new_text: 'const b = 20;' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.edit_results.length).toBe(2);
    });

    test('continues validation when some edits fail', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', content: 'const x: number = 1;' }, // Valid
          { file: 'test.ts', old_text: 'not found', new_text: 'new' }, // Invalid
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.edit_results[0].applied).toBe(true);
      expect(data.edit_results[1].applied).toBe(false);
    });
  });

  describe('error detection', () => {
    test('reports safe=true when no new errors introduced', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x: number = 1;');
      mockTsSys.readFile.mockReturnValue('const x: number = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', content: 'const x: number = 2;' },
        ],
      });
      const data = JSON.parse(result.content[0].text);
      if (result.isError) console.log('DEBUG ERROR:', data.error);

      expect(result.isError).toBeFalsy();
      expect(data.safe).toBe(true);
      expect(data.new_errors).toEqual([]);
    });

    test('reports safe=false when edits fail to apply', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', old_text: 'not found', new_text: 'replacement' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.safe).toBe(false);
    });
  });

  describe('summary generation', () => {
    test('generates success summary when all edits safe', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x: number = 1;');
      mockTsSys.readFile.mockReturnValue('const x: number = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', content: 'const x: number = 2;' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.summary).toContain('safe');
      expect(data.summary).toContain('1');
    });

    test('generates failure summary for failed edits', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', old_text: 'not found', new_text: 'replacement' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.summary).toContain('could not be applied');
    });

    test('generates combined summary for errors and failures', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', old_text: 'not found', new_text: 'replacement' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(typeof data.summary).toBe('string');
    });
  });

  describe('edit results', () => {
    test('includes file path in edit results', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'src/test.ts', content: 'const x = 2;' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.edit_results[0].file).toBeDefined();
      expect(typeof data.edit_results[0].file).toBe('string');
    });

    test('includes edit_index in edit results', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test1.ts', content: 'const a = 1;' },
          { file: 'test2.ts', content: 'const b = 2;' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.edit_results[0].edit_index).toBe(0);
      expect(data.edit_results[1].edit_index).toBe(1);
    });

    test('includes applied flag in edit results', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', content: 'const x = 2;' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(typeof data.edit_results[0].applied).toBe('boolean');
    });

    test('includes errors_introduced count in edit results', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', content: 'const x = 2;' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(typeof data.edit_results[0].errors_introduced).toBe('number');
    });

    test('includes error message for failed edits', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', old_text: 'not found', new_text: 'replacement' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.edit_results[0].error).toBeDefined();
      expect(typeof data.edit_results[0].error).toBe('string');
    });
  });

  describe('path handling', () => {
    test('handles relative file paths', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'src/test.ts', content: 'const x = 2;' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.edit_results[0].file).toBeDefined();
    });

    test('handles absolute file paths', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: '/mock/project/test.ts', content: 'const x = 2;' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('normalizes Windows-style paths', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'src\\test.ts', content: 'const x = 2;' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', content: 'const x = 2;' },
        ],
      });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', content: 'const x = 2;' },
        ],
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    test('includes all required fields in response', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', content: 'const x = 2;' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('safe');
      expect(data).toHaveProperty('summary');
      expect(data).toHaveProperty('new_errors');
      expect(data).toHaveProperty('edit_results');
    });
  });

  describe('new_errors structure', () => {
    test('new_errors is an array', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', content: 'const x = 2;' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(Array.isArray(data.new_errors)).toBe(true);
    });
  });

  describe('error handling', () => {
    test('handles unexpected errors gracefully', async () => {
      mockFs.existsSync.mockImplementation(() => {
        throw new Error('Unexpected filesystem error');
      });

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', content: 'const x = 2;' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toBeDefined();
    });
  });

  describe('edge cases', () => {
    test('handles empty string content', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', content: '' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.edit_results[0].applied).toBe(true);
    });

    test('handles whitespace-only content', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', content: '   \n\t\n   ' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles very long content', async () => {
      mockFs.existsSync.mockReturnValue(true);
      const longContent = 'const x = 1;\n'.repeat(10000);
      mockFs.readFileSync.mockReturnValue(longContent);
      mockTsSys.readFile.mockReturnValue(longContent);

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', content: longContent + 'const y = 2;' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles unicode content', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = "\u03B1\u03B2\u03B3";');
      mockTsSys.readFile.mockReturnValue('const x = "\u03B1\u03B2\u03B3";');

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', content: 'const x = "\u03B4\u03B5\u03B6";' },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles special regex characters in old_text', async () => {
      mockFs.existsSync.mockReturnValue(true);
      const specialContent = 'const regex = /[a-z]+.*?$/;';
      mockFs.readFileSync.mockReturnValue(specialContent);
      mockTsSys.readFile.mockReturnValue(specialContent);

      const result = await handleValidateEditsPreview({
        edits: [
          {
            file: 'test.ts',
            old_text: specialContent,
            new_text: 'const regex = /[A-Z]+.*?$/;',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles multiline old_text replacement', async () => {
      mockFs.existsSync.mockReturnValue(true);
      const multilineContent = 'const a = 1;\nconst b = 2;\nconst c = 3;';
      mockFs.readFileSync.mockReturnValue(multilineContent);
      mockTsSys.readFile.mockReturnValue(multilineContent);

      const result = await handleValidateEditsPreview({
        edits: [
          {
            file: 'test.ts',
            old_text: 'const a = 1;\nconst b = 2;',
            new_text: 'const a = 10;\nconst b = 20;',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.edit_results[0].applied).toBe(true);
    });
  });

  describe('old_text truncation in error messages', () => {
    test('truncates long old_text in error messages', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const longText = 'a'.repeat(100); // Longer than 50 chars
      const result = await handleValidateEditsPreview({
        edits: [
          {
            file: 'test.ts',
            old_text: longText,
            new_text: 'replacement',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.edit_results[0].error).toContain('...');
    });

    test('does not truncate short old_text in error messages', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('const x = 1;');
      mockTsSys.readFile.mockReturnValue('const x = 1;');

      const shortText = 'short text';
      const result = await handleValidateEditsPreview({
        edits: [
          {
            file: 'test.ts',
            old_text: shortText,
            new_text: 'replacement',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.edit_results[0].error).toContain(shortText);
      expect(data.edit_results[0].error).not.toContain('...');
    });
  });

  describe('tsconfig handling', () => {
    test('uses default compiler options when no tsconfig found', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('tsconfig.json')) return false;
        return true;
      });
      mockFs.readFileSync.mockReturnValue('const x: number = 1;');
      mockTsSys.readFile.mockImplementation((p: string) => {
        if (p.includes('tsconfig.json')) return undefined;
        return 'const x: number = 1;';
      });
      mockTsSys.fileExists.mockImplementation((p: string) => {
        return !p.includes('tsconfig.json');
      });

      const result = await handleValidateEditsPreview({
        edits: [
          { file: 'test.ts', content: 'const x: number = 2;' },
        ],
      });

      expect(result.isError).toBeFalsy();
    });
  });
});
