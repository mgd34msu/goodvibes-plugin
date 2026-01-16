/**
 * Unit tests for LSP validation utilities
 *
 * Tests the shared validation functions used by LSP handlers for validating
 * position arguments, file paths, and line/column numbers.
 *
 * These tests use mocked filesystem operations.
 */

import { describe, test, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// Mock fs before importing the handler
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

// Mock the config module
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project',
}));

// Now import after mocks are set up
import * as fs from 'fs';
import {
  validatePositionArgs,
  validateFilePath,
  isValidLine,
  isValidColumn,
  type PositionArgs,
  type ValidationResult,
} from '../../../handlers/lsp/validation.js';

// Type helpers for mocks
const mockFs = fs as unknown as {
  existsSync: Mock;
};

describe('LSP Validation Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validatePositionArgs', () => {
    describe('valid arguments', () => {
      test('accepts valid file, line, and column', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'src/test.ts',
          line: 1,
          column: 1,
        });

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.filePath).toBeDefined();
          expect(result.filePath).toContain('src');
          expect(result.filePath).toContain('test.ts');
        }
      });

      test('accepts line 1 as minimum valid line', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'test.ts',
          line: 1,
          column: 1,
        });

        expect(result.valid).toBe(true);
      });

      test('accepts column 1 as minimum valid column', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'test.ts',
          line: 1,
          column: 1,
        });

        expect(result.valid).toBe(true);
      });

      test('accepts large line numbers', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'test.ts',
          line: 10000,
          column: 1,
        });

        expect(result.valid).toBe(true);
      });

      test('accepts large column numbers', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'test.ts',
          line: 1,
          column: 500,
        });

        expect(result.valid).toBe(true);
      });

      test('accepts nested file paths', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'src/handlers/lsp/test.ts',
          line: 5,
          column: 10,
        });

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.filePath).toContain('lsp');
        }
      });
    });

    describe('invalid arguments', () => {
      test('rejects null args', () => {
        const result = validatePositionArgs(null);

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.isError).toBe(true);
          expect(result.error.content[0].text).toContain('Invalid arguments');
        }
      });

      test('rejects undefined args', () => {
        const result = validatePositionArgs(undefined);

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.isError).toBe(true);
        }
      });

      test('rejects non-object args', () => {
        const result = validatePositionArgs('not an object');

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.isError).toBe(true);
        }
      });

      test('rejects missing file parameter', () => {
        const result = validatePositionArgs({
          line: 1,
          column: 1,
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.content[0].text).toContain('file');
        }
      });

      test('rejects empty file string', () => {
        const result = validatePositionArgs({
          file: '',
          line: 1,
          column: 1,
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.content[0].text).toContain('file');
        }
      });

      test('rejects non-string file', () => {
        const result = validatePositionArgs({
          file: 123,
          line: 1,
          column: 1,
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.content[0].text).toContain('file');
        }
      });

      test('rejects missing line parameter', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'test.ts',
          column: 1,
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.content[0].text).toContain('line');
        }
      });

      test('rejects line 0 (lines are 1-based)', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'test.ts',
          line: 0,
          column: 1,
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.content[0].text).toContain('line');
        }
      });

      test('rejects negative line', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'test.ts',
          line: -1,
          column: 1,
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.content[0].text).toContain('line');
        }
      });

      test('rejects non-integer line', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'test.ts',
          line: 1.5,
          column: 1,
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.content[0].text).toContain('line');
        }
      });

      test('rejects string line', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'test.ts',
          line: '1',
          column: 1,
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.content[0].text).toContain('line');
        }
      });

      test('rejects missing column parameter', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'test.ts',
          line: 1,
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.content[0].text).toContain('column');
        }
      });

      test('rejects column 0 (columns are 1-based)', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'test.ts',
          line: 1,
          column: 0,
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.content[0].text).toContain('column');
        }
      });

      test('rejects negative column', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'test.ts',
          line: 1,
          column: -5,
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.content[0].text).toContain('column');
        }
      });

      test('rejects non-integer column', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'test.ts',
          line: 1,
          column: 2.7,
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.content[0].text).toContain('column');
        }
      });

      test('rejects string column', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'test.ts',
          line: 1,
          column: '5',
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.content[0].text).toContain('column');
        }
      });

      test('rejects file that does not exist', () => {
        mockFs.existsSync.mockReturnValue(false);

        const result = validatePositionArgs({
          file: 'nonexistent.ts',
          line: 1,
          column: 1,
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.content[0].text).toContain('not found');
        }
      });
    });

    describe('path resolution', () => {
      test('resolves relative path to project root', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validatePositionArgs({
          file: 'src/test.ts',
          line: 1,
          column: 1,
        });

        expect(result.valid).toBe(true);
        if (result.valid) {
          // Should resolve relative to PROJECT_ROOT
          expect(result.filePath).toContain('mock');
          expect(result.filePath).toContain('project');
        }
      });
    });

    describe('error response format', () => {
      test('returns properly formatted error response', () => {
        const result = validatePositionArgs(null);

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toHaveProperty('content');
          expect(result.error.content).toHaveLength(1);
          expect(result.error.content[0]).toHaveProperty('type', 'text');
          expect(result.error.content[0]).toHaveProperty('text');
          expect(result.error.isError).toBe(true);
        }
      });

      test('error response contains valid JSON', () => {
        const result = validatePositionArgs({});

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(() => JSON.parse(result.error.content[0].text)).not.toThrow();
        }
      });
    });
  });

  describe('validateFilePath', () => {
    describe('valid paths', () => {
      test('accepts valid relative file path', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validateFilePath('src/test.ts');

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.filePath).toBeDefined();
        }
      });

      test('accepts valid absolute file path', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validateFilePath('/absolute/path/to/test.ts');

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.filePath).toBe('/absolute/path/to/test.ts');
        }
      });

      test('accepts nested relative path', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validateFilePath('src/handlers/lsp/test.ts');

        expect(result.valid).toBe(true);
      });

      test('accepts file path with special characters', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validateFilePath('src/my-component.test.ts');

        expect(result.valid).toBe(true);
      });
    });

    describe('invalid paths', () => {
      test('rejects null file path', () => {
        const result = validateFilePath(null);

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.isError).toBe(true);
          expect(result.error.content[0].text).toContain('file');
        }
      });

      test('rejects undefined file path', () => {
        const result = validateFilePath(undefined);

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.isError).toBe(true);
        }
      });

      test('rejects empty string file path', () => {
        const result = validateFilePath('');

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.content[0].text).toContain('file');
        }
      });

      test('rejects non-string file path', () => {
        const result = validateFilePath(123);

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.isError).toBe(true);
        }
      });

      test('rejects array file path', () => {
        const result = validateFilePath(['test.ts']);

        expect(result.valid).toBe(false);
      });

      test('rejects object file path', () => {
        const result = validateFilePath({ path: 'test.ts' });

        expect(result.valid).toBe(false);
      });

      test('rejects file that does not exist', () => {
        mockFs.existsSync.mockReturnValue(false);

        const result = validateFilePath('nonexistent.ts');

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.content[0].text).toContain('not found');
        }
      });
    });

    describe('path resolution', () => {
      test('resolves relative path to project root', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validateFilePath('test.ts');

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.filePath).toContain('mock');
        }
      });

      test('preserves absolute path', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = validateFilePath('/absolute/path/test.ts');

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.filePath).toBe('/absolute/path/test.ts');
        }
      });
    });

    describe('error response format', () => {
      test('returns properly formatted error response', () => {
        const result = validateFilePath(null);

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toHaveProperty('content');
          expect(result.error.content).toHaveLength(1);
          expect(result.error.content[0]).toHaveProperty('type', 'text');
          expect(result.error.isError).toBe(true);
        }
      });
    });
  });

  describe('isValidLine', () => {
    describe('valid lines', () => {
      test('accepts line 1 (minimum valid)', () => {
        expect(isValidLine(1)).toBe(true);
      });

      test('accepts line 10', () => {
        expect(isValidLine(10)).toBe(true);
      });

      test('accepts large line number', () => {
        expect(isValidLine(100000)).toBe(true);
      });

      test('accepts Number.MAX_SAFE_INTEGER', () => {
        expect(isValidLine(Number.MAX_SAFE_INTEGER)).toBe(true);
      });
    });

    describe('invalid lines', () => {
      test('rejects line 0', () => {
        expect(isValidLine(0)).toBe(false);
      });

      test('rejects negative line', () => {
        expect(isValidLine(-1)).toBe(false);
      });

      test('rejects negative large line', () => {
        expect(isValidLine(-1000)).toBe(false);
      });

      test('rejects non-integer line', () => {
        expect(isValidLine(1.5)).toBe(false);
      });

      test('rejects very small decimal', () => {
        expect(isValidLine(1.001)).toBe(false);
      });

      test('rejects string line', () => {
        expect(isValidLine('1')).toBe(false);
      });

      test('rejects null line', () => {
        expect(isValidLine(null)).toBe(false);
      });

      test('rejects undefined line', () => {
        expect(isValidLine(undefined)).toBe(false);
      });

      test('rejects NaN', () => {
        expect(isValidLine(NaN)).toBe(false);
      });

      test('rejects Infinity', () => {
        expect(isValidLine(Infinity)).toBe(false);
      });

      test('rejects negative Infinity', () => {
        expect(isValidLine(-Infinity)).toBe(false);
      });

      test('rejects object', () => {
        expect(isValidLine({ value: 1 })).toBe(false);
      });

      test('rejects array', () => {
        expect(isValidLine([1])).toBe(false);
      });

      test('rejects boolean', () => {
        expect(isValidLine(true)).toBe(false);
      });
    });

    describe('type guard behavior', () => {
      test('narrows type correctly for valid input', () => {
        const line: unknown = 5;
        if (isValidLine(line)) {
          // TypeScript should know line is number here
          const doubled: number = line * 2;
          expect(doubled).toBe(10);
        }
      });
    });
  });

  describe('isValidColumn', () => {
    describe('valid columns', () => {
      test('accepts column 1 (minimum valid)', () => {
        expect(isValidColumn(1)).toBe(true);
      });

      test('accepts column 10', () => {
        expect(isValidColumn(10)).toBe(true);
      });

      test('accepts large column number', () => {
        expect(isValidColumn(10000)).toBe(true);
      });

      test('accepts Number.MAX_SAFE_INTEGER', () => {
        expect(isValidColumn(Number.MAX_SAFE_INTEGER)).toBe(true);
      });
    });

    describe('invalid columns', () => {
      test('rejects column 0', () => {
        expect(isValidColumn(0)).toBe(false);
      });

      test('rejects negative column', () => {
        expect(isValidColumn(-1)).toBe(false);
      });

      test('rejects negative large column', () => {
        expect(isValidColumn(-500)).toBe(false);
      });

      test('rejects non-integer column', () => {
        expect(isValidColumn(2.5)).toBe(false);
      });

      test('rejects very small decimal', () => {
        expect(isValidColumn(3.0001)).toBe(false);
      });

      test('rejects string column', () => {
        expect(isValidColumn('5')).toBe(false);
      });

      test('rejects null column', () => {
        expect(isValidColumn(null)).toBe(false);
      });

      test('rejects undefined column', () => {
        expect(isValidColumn(undefined)).toBe(false);
      });

      test('rejects NaN', () => {
        expect(isValidColumn(NaN)).toBe(false);
      });

      test('rejects Infinity', () => {
        expect(isValidColumn(Infinity)).toBe(false);
      });

      test('rejects negative Infinity', () => {
        expect(isValidColumn(-Infinity)).toBe(false);
      });

      test('rejects object', () => {
        expect(isValidColumn({ value: 5 })).toBe(false);
      });

      test('rejects array', () => {
        expect(isValidColumn([5])).toBe(false);
      });

      test('rejects boolean', () => {
        expect(isValidColumn(false)).toBe(false);
      });
    });

    describe('type guard behavior', () => {
      test('narrows type correctly for valid input', () => {
        const column: unknown = 10;
        if (isValidColumn(column)) {
          // TypeScript should know column is number here
          const doubled: number = column * 2;
          expect(doubled).toBe(20);
        }
      });
    });
  });

  describe('ValidationResult type', () => {
    test('valid result has filePath property', () => {
      mockFs.existsSync.mockReturnValue(true);

      const result = validatePositionArgs({
        file: 'test.ts',
        line: 1,
        column: 1,
      });

      if (result.valid) {
        expect(typeof result.filePath).toBe('string');
      }
    });

    test('invalid result has error property', () => {
      const result = validatePositionArgs(null);

      if (!result.valid) {
        expect(result.error).toBeDefined();
        expect(result.error.content).toBeDefined();
      }
    });

    test('result is discriminated union based on valid flag', () => {
      mockFs.existsSync.mockReturnValue(true);

      const validResult = validatePositionArgs({
        file: 'test.ts',
        line: 1,
        column: 1,
      });

      const invalidResult = validatePositionArgs(null);

      // Both should have valid property
      expect(typeof validResult.valid).toBe('boolean');
      expect(typeof invalidResult.valid).toBe('boolean');

      // Only valid result should have filePath accessible
      expect(validResult.valid).toBe(true);
      expect(invalidResult.valid).toBe(false);
    });
  });

  describe('integration with PositionArgs interface', () => {
    test('accepts complete PositionArgs object', () => {
      mockFs.existsSync.mockReturnValue(true);

      const args: PositionArgs = {
        file: 'src/test.ts',
        line: 10,
        column: 5,
      };

      const result = validatePositionArgs(args);

      expect(result.valid).toBe(true);
    });

    test('validates all required properties of PositionArgs', () => {
      // Missing file
      expect(validatePositionArgs({ line: 1, column: 1 }).valid).toBe(false);

      // Missing line
      mockFs.existsSync.mockReturnValue(true);
      expect(validatePositionArgs({ file: 'test.ts', column: 1 }).valid).toBe(false);

      // Missing column
      expect(validatePositionArgs({ file: 'test.ts', line: 1 }).valid).toBe(false);
    });
  });
});
