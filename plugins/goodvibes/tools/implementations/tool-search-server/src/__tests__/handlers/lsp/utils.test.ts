/**
 * Unit tests for LSP utility functions
 *
 * Tests cover:
 * - normalizeFilePath
 * - makeRelativePath
 * - resolveFilePath
 * - getLinePreview
 * - getPreviewFromSourceFile
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import ts from 'typescript';

import {
  normalizeFilePath,
  makeRelativePath,
  resolveFilePath,
  getLinePreview,
  getPreviewFromSourceFile,
} from '../../../handlers/lsp/utils.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

// Mock console.warn to suppress expected warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('LSP utils', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-utils-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    languageServiceManager.cleanup();
    vi.clearAllMocks();
  });

  describe('normalizeFilePath', () => {
    test('converts backslashes to forward slashes', () => {
      const result = normalizeFilePath('C:\\Users\\test\\file.ts');
      expect(result).toBe('C:/Users/test/file.ts');
    });

    test('leaves forward slashes unchanged', () => {
      const result = normalizeFilePath('/home/user/file.ts');
      expect(result).toBe('/home/user/file.ts');
    });

    test('handles mixed slashes', () => {
      const result = normalizeFilePath('C:\\Users/test\\nested/file.ts');
      expect(result).toBe('C:/Users/test/nested/file.ts');
    });

    test('handles empty string', () => {
      const result = normalizeFilePath('');
      expect(result).toBe('');
    });

    test('handles path with multiple consecutive backslashes', () => {
      const result = normalizeFilePath('C:\\\\Users\\\\file.ts');
      expect(result).toBe('C://Users//file.ts');
    });
  });

  describe('makeRelativePath', () => {
    test('creates relative path from absolute path', () => {
      const result = makeRelativePath('/project/src/file.ts', '/project');
      expect(result).toBe('src/file.ts');
    });

    test('normalizes Windows paths', () => {
      const result = makeRelativePath('C:\\project\\src\\file.ts', 'C:\\project');
      expect(result).toBe('src/file.ts');
    });

    test('handles same directory', () => {
      const result = makeRelativePath('/project/file.ts', '/project');
      expect(result).toBe('file.ts');
    });

    test('handles parent directory traversal', () => {
      const result = makeRelativePath('/other/file.ts', '/project');
      expect(result).toContain('..');
    });
  });

  describe('resolveFilePath', () => {
    test('returns absolute path unchanged', () => {
      const absolutePath = path.resolve('/absolute/path/file.ts');
      const result = resolveFilePath(absolutePath, '/project');
      expect(result).toBe(absolutePath);
    });

    test('resolves relative path against project root', () => {
      const result = resolveFilePath('src/file.ts', '/project');
      expect(result).toBe(path.resolve('/project', 'src/file.ts'));
    });

    test('handles empty relative path', () => {
      const result = resolveFilePath('', '/project');
      expect(result).toBe(path.resolve('/project', ''));
    });
  });

  describe('getLinePreview', () => {
    test('returns line content for valid line', async () => {
      const file = path.join(tempDir, 'preview.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = 2;\nconst z = 3;');

      const { service } = await languageServiceManager.getServiceForFile(file);
      const result = getLinePreview(service, file, 2);

      expect(result).toBe('const y = 2;');
    });

    test('returns empty string when source file not found', async () => {
      const file = path.join(tempDir, 'existing.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const { service } = await languageServiceManager.getServiceForFile(file);

      // Try to get preview for a file that is not in the program
      const result = getLinePreview(service, '/nonexistent/file.ts', 1);

      expect(result).toBe('');
    });

    test('returns empty string for line number less than 1', async () => {
      const file = path.join(tempDir, 'preview.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const { service } = await languageServiceManager.getServiceForFile(file);
      const result = getLinePreview(service, file, 0);

      expect(result).toBe('');
    });

    test('returns empty string for line number greater than total lines', async () => {
      const file = path.join(tempDir, 'preview.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const { service } = await languageServiceManager.getServiceForFile(file);
      const result = getLinePreview(service, file, 999);

      expect(result).toBe('');
    });

    test('truncates long lines with ellipsis', async () => {
      const file = path.join(tempDir, 'long-line.ts');
      const longLine = 'const x = "' + 'a'.repeat(200) + '";';
      fs.writeFileSync(file, longLine);

      const { service } = await languageServiceManager.getServiceForFile(file);
      const result = getLinePreview(service, file, 1);

      expect(result.length).toBeLessThanOrEqual(123); // 120 + '...'
      expect(result).toContain('...');
    });

    test('trims whitespace from preview', async () => {
      const file = path.join(tempDir, 'whitespace.ts');
      fs.writeFileSync(file, '   const x = 1;   ');

      const { service } = await languageServiceManager.getServiceForFile(file);
      const result = getLinePreview(service, file, 1);

      expect(result).toBe('const x = 1;');
    });

    test('handles last line correctly', async () => {
      const file = path.join(tempDir, 'lastline.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = 2;');

      const { service } = await languageServiceManager.getServiceForFile(file);
      const result = getLinePreview(service, file, 2);

      expect(result).toBe('const y = 2;');
    });

    test('returns empty string when program is null', async () => {
      // Create a mock service with null program
      const mockService = {
        getProgram: () => null,
      } as unknown as ts.LanguageService;

      const result = getLinePreview(mockService, '/any/file.ts', 1);

      expect(result).toBe('');
    });

    test('returns empty string when getProgram throws', () => {
      // Create a mock service that throws
      const mockService = {
        getProgram: () => {
          throw new Error('Program error');
        },
      } as unknown as ts.LanguageService;

      const result = getLinePreview(mockService, '/any/file.ts', 1);

      expect(result).toBe('');
    });

    test('returns empty string when accessing line content throws', async () => {
      // Create a mock source file that will throw when accessing text
      const mockSourceFile = {
        getLineStarts: () => [0, 10],
        text: {
          slice: () => {
            throw new Error('Slice error');
          },
        },
      };

      const mockProgram = {
        getSourceFile: () => mockSourceFile,
      };

      const mockService = {
        getProgram: () => mockProgram,
      } as unknown as ts.LanguageService;

      const result = getLinePreview(mockService, '/any/file.ts', 1);

      expect(result).toBe('');
    });
  });

  describe('getPreviewFromSourceFile', () => {
    test('returns line content for valid line', async () => {
      const file = path.join(tempDir, 'source.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = 2;\nconst z = 3;');

      const { program } = await languageServiceManager.getServiceForFile(file);
      const sourceFile = program.getSourceFile(file.replace(/\\/g, '/'));

      expect(sourceFile).toBeDefined();
      const result = getPreviewFromSourceFile(sourceFile!, 2);

      expect(result).toBe('const y = 2;');
    });

    test('truncates long lines with ellipsis', async () => {
      const file = path.join(tempDir, 'long-source.ts');
      const longLine = 'const x = "' + 'a'.repeat(200) + '";';
      fs.writeFileSync(file, longLine);

      const { program } = await languageServiceManager.getServiceForFile(file);
      const sourceFile = program.getSourceFile(file.replace(/\\/g, '/'));

      expect(sourceFile).toBeDefined();
      const result = getPreviewFromSourceFile(sourceFile!, 1);

      expect(result.length).toBeLessThanOrEqual(123); // 120 + '...'
      expect(result).toContain('...');
    });

    test('trims whitespace from preview', async () => {
      const file = path.join(tempDir, 'whitespace-source.ts');
      fs.writeFileSync(file, '   const x = 1;   ');

      const { program } = await languageServiceManager.getServiceForFile(file);
      const sourceFile = program.getSourceFile(file.replace(/\\/g, '/'));

      expect(sourceFile).toBeDefined();
      const result = getPreviewFromSourceFile(sourceFile!, 1);

      expect(result).toBe('const x = 1;');
    });

    test('handles last line correctly when no newline at end', async () => {
      const file = path.join(tempDir, 'no-newline.ts');
      fs.writeFileSync(file, 'const a = 1;\nconst b = 2;');

      const { program } = await languageServiceManager.getServiceForFile(file);
      const sourceFile = program.getSourceFile(file.replace(/\\/g, '/'));

      expect(sourceFile).toBeDefined();
      const result = getPreviewFromSourceFile(sourceFile!, 2);

      expect(result).toBe('const b = 2;');
    });

    test('returns empty string when getPositionOfLineAndCharacter throws', () => {
      // Create a mock source file that throws
      const mockSourceFile = {
        getPositionOfLineAndCharacter: () => {
          throw new Error('Position error');
        },
        getLineStarts: () => [0, 10],
        text: 'const x = 1;',
      } as unknown as ts.SourceFile;

      const result = getPreviewFromSourceFile(mockSourceFile, 1);

      expect(result).toBe('');
    });

    test('returns empty string when line is out of range (too high)', () => {
      // Create a mock source file with limited lines
      const mockSourceFile = {
        getPositionOfLineAndCharacter: (line: number) => {
          if (line > 1) {
            throw new RangeError('Line number out of range');
          }
          return 0;
        },
        getLineStarts: () => [0],
        text: 'const x = 1;',
      } as unknown as ts.SourceFile;

      const result = getPreviewFromSourceFile(mockSourceFile, 999);

      expect(result).toBe('');
    });

    test('returns empty string when accessing text slice throws', () => {
      // Create a mock source file that throws on text access
      const mockSourceFile = {
        getPositionOfLineAndCharacter: () => 0,
        getLineStarts: () => [0, 10],
        text: {
          slice: () => {
            throw new Error('Slice error');
          },
          length: 100,
        },
      } as unknown as ts.SourceFile;

      const result = getPreviewFromSourceFile(mockSourceFile, 1);

      expect(result).toBe('');
    });

    test('handles empty file', async () => {
      const file = path.join(tempDir, 'empty.ts');
      fs.writeFileSync(file, '');

      const { program } = await languageServiceManager.getServiceForFile(file);
      const sourceFile = program.getSourceFile(file.replace(/\\/g, '/'));

      expect(sourceFile).toBeDefined();
      const result = getPreviewFromSourceFile(sourceFile!, 1);

      expect(result).toBe('');
    });
  });
});
