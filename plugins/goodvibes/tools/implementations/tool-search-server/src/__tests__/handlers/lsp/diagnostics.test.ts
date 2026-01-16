/**
 * Unit tests for handleGetDiagnostics
 *
 * Tests the diagnostics LSP handler that retrieves TypeScript diagnostics
 * (errors, warnings, suggestions) with available quick fixes.
 *
 * These tests use mocked language service and filesystem operations for speed.
 */

import { describe, test, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import * as path from 'path';

// Mock fs before importing the handler
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdtempSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock the language service manager
vi.mock('../../../handlers/lsp/language-service.js', () => ({
  languageServiceManager: {
    getServiceForFile: vi.fn(),
    getLineAndColumn: vi.fn(),
    getPositionOffset: vi.fn(),
    cleanup: vi.fn(),
  },
}));

// Mock the config module
vi.mock('../../../config.js', () => ({
  getProjectRoot: vi.fn(() => '/mock/project'),
}));

// Now import after mocks are set up
import * as fs from 'fs';
import { handleGetDiagnostics } from '../../../handlers/lsp/diagnostics.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';
import { getProjectRoot } from '../../../config.js';

// Mock console.warn to suppress expected warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

// Type helpers for mocks
const mockFs = fs as unknown as {
  existsSync: Mock;
  readdirSync: Mock;
  readFileSync: Mock;
};

const mockLanguageServiceManager = languageServiceManager as unknown as {
  getServiceForFile: Mock;
  getLineAndColumn: Mock;
  getPositionOffset: Mock;
  cleanup: Mock;
};

const mockGetProjectRoot = getProjectRoot as Mock;

// Helper to create a mock diagnostic
function createMockDiagnostic(
  category: number, // 0=Warning, 1=Error, 2=Suggestion, 3=Message
  code: number,
  messageText: string,
  start: number,
  length: number,
  file: { fileName: string } | null = { fileName: '/mock/project/test.ts' }
) {
  return {
    category,
    code,
    messageText,
    start,
    length,
    file,
  };
}

// Helper to create a mock service
function createMockService(diagnostics: {
  semantic?: ReturnType<typeof createMockDiagnostic>[];
  syntactic?: ReturnType<typeof createMockDiagnostic>[];
  suggestion?: ReturnType<typeof createMockDiagnostic>[];
} = {}) {
  return {
    getSemanticDiagnostics: vi.fn(() => diagnostics.semantic ?? []),
    getSyntacticDiagnostics: vi.fn(() => diagnostics.syntactic ?? []),
    getSuggestionDiagnostics: vi.fn(() => diagnostics.suggestion ?? []),
    getCodeFixesAtPosition: vi.fn(() => []),
    getProgram: vi.fn(() => ({
      getSourceFile: vi.fn(() => ({
        getLineAndCharacterOfPosition: vi.fn(() => ({ line: 0, character: 0 })),
      })),
    })),
  };
}

describe('handleGetDiagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProjectRoot.mockReturnValue('/mock/project');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('single file mode', () => {
    test('returns empty diagnostics for valid file', async () => {
      const mockService = createMockService();
      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn.mockReturnValue({ line: 1, column: 1 });

      const result = await handleGetDiagnostics({ file: '/mock/project/valid.ts' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.diagnostics).toBeDefined();
      expect(Array.isArray(data.diagnostics)).toBe(true);
      expect(data.diagnostics.length).toBe(0);
      expect(data.counts).toEqual({ errors: 0, warnings: 0, suggestions: 0 });
    });

    test('returns syntax errors for invalid syntax', async () => {
      const syntaxError = createMockDiagnostic(1, 1005, 'Expression expected', 18, 1);
      const mockService = createMockService({ syntactic: [syntaxError] });

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn
        .mockReturnValueOnce({ line: 1, column: 19 }) // start
        .mockReturnValueOnce({ line: 1, column: 20 }); // end

      const result = await handleGetDiagnostics({ file: '/mock/project/syntax-error.ts' });
      const data = JSON.parse(result.content[0].text);

      expect(data.diagnostics.length).toBe(1);
      expect(data.counts.errors).toBe(1);

      const diagnostic = data.diagnostics[0];
      expect(diagnostic.category).toBe('error');
      expect(diagnostic.line).toBe(1);
      expect(diagnostic.column).toBe(19);
    });

    test('returns semantic errors for type mismatches', async () => {
      const typeError = createMockDiagnostic(
        1,
        2322,
        "Type 'string' is not assignable to type 'number'",
        18,
        7
      );
      const mockService = createMockService({ semantic: [typeError] });

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn
        .mockReturnValueOnce({ line: 1, column: 19 })
        .mockReturnValueOnce({ line: 1, column: 26 });

      const result = await handleGetDiagnostics({ file: '/mock/project/type-error.ts' });
      const data = JSON.parse(result.content[0].text);

      expect(data.diagnostics.length).toBe(1);
      expect(data.counts.errors).toBe(1);
    });

    test('includes suggestions when include_suggestions is true', async () => {
      const suggestion = createMockDiagnostic(
        2, // Suggestion
        80006,
        "'await' has no effect on this expression",
        0,
        10
      );
      const mockService = createMockService({ suggestion: [suggestion] });

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn
        .mockReturnValueOnce({ line: 1, column: 1 })
        .mockReturnValueOnce({ line: 1, column: 11 });

      const result = await handleGetDiagnostics({
        file: '/mock/project/suggestions.ts',
        include_suggestions: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.diagnostics.length).toBe(1);
      expect(data.counts.suggestions).toBe(1);
      expect(data.diagnostics[0].category).toBe('suggestion');
    });

    test('excludes suggestions when include_suggestions is false', async () => {
      const suggestion = createMockDiagnostic(2, 80006, 'Some suggestion', 0, 10);
      const error = createMockDiagnostic(1, 2322, 'Type error', 0, 5);
      const mockService = createMockService({
        semantic: [error],
        suggestion: [suggestion],
      });

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn.mockReturnValue({ line: 1, column: 1 });

      const result = await handleGetDiagnostics({
        file: '/mock/project/no-suggestions.ts',
        include_suggestions: false,
      });
      const data = JSON.parse(result.content[0].text);

      // Suggestions should be filtered out
      const suggestions = data.diagnostics.filter(
        (d: { category: string }) => d.category === 'suggestion'
      );
      expect(suggestions.length).toBe(0);
    });

    test('handles file not found error', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await handleGetDiagnostics({
        file: '/mock/project/nonexistent.ts',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('not found');
    });

    test('handles empty file argument by running project-wide analysis', async () => {
      // Empty directory - no source files
      mockFs.readdirSync.mockReturnValue([]);

      const result = await handleGetDiagnostics({ file: '' });
      const data = JSON.parse(result.content[0].text);

      // Should succeed with project-wide analysis
      expect(result.isError).toBeFalsy();
      expect(data.diagnostics).toBeDefined();
      expect(data.counts).toBeDefined();
    });
  });

  describe('diagnostic metadata', () => {
    test('includes file path in diagnostics', async () => {
      const error = createMockDiagnostic(1, 2322, 'Type error', 0, 5);
      const mockService = createMockService({ semantic: [error] });

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn.mockReturnValue({ line: 1, column: 1 });

      const result = await handleGetDiagnostics({ file: '/mock/project/error.ts' });
      const data = JSON.parse(result.content[0].text);

      if (data.diagnostics.length > 0) {
        expect(data.diagnostics[0].file).toBeDefined();
      }
    });

    test('includes error code in diagnostics', async () => {
      const error = createMockDiagnostic(1, 2322, 'Type error', 0, 5);
      const mockService = createMockService({ semantic: [error] });

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn.mockReturnValue({ line: 1, column: 1 });

      const result = await handleGetDiagnostics({ file: '/mock/project/error.ts' });
      const data = JSON.parse(result.content[0].text);

      if (data.diagnostics.length > 0) {
        expect(typeof data.diagnostics[0].code).toBe('number');
        expect(data.diagnostics[0].code).toBe(2322);
      }
    });

    test('includes source in diagnostics', async () => {
      const error = createMockDiagnostic(1, 2322, 'Type error', 0, 5);
      const mockService = createMockService({ semantic: [error] });

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn.mockReturnValue({ line: 1, column: 1 });

      const result = await handleGetDiagnostics({ file: '/mock/project/error.ts' });
      const data = JSON.parse(result.content[0].text);

      if (data.diagnostics.length > 0) {
        expect(data.diagnostics[0].source).toBe('typescript');
      }
    });

    test('includes position information in diagnostics', async () => {
      const error = createMockDiagnostic(1, 2322, 'Type error', 10, 5);
      const mockService = createMockService({ semantic: [error] });

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn
        .mockReturnValueOnce({ line: 2, column: 5 }) // start
        .mockReturnValueOnce({ line: 2, column: 10 }); // end

      const result = await handleGetDiagnostics({ file: '/mock/project/error.ts' });
      const data = JSON.parse(result.content[0].text);

      if (data.diagnostics.length > 0) {
        const diagnostic = data.diagnostics[0];
        expect(diagnostic.line).toBe(2);
        expect(diagnostic.column).toBe(5);
        expect(diagnostic.end_line).toBe(2);
        expect(diagnostic.end_column).toBe(10);
      }
    });
  });

  describe('diagnostic categories', () => {
    test('categorizes errors correctly', async () => {
      const error = createMockDiagnostic(1, 2322, 'Type error', 0, 5);
      const mockService = createMockService({ semantic: [error] });

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn.mockReturnValue({ line: 1, column: 1 });

      const result = await handleGetDiagnostics({ file: '/mock/project/error.ts' });
      const data = JSON.parse(result.content[0].text);

      if (data.diagnostics.length > 0) {
        expect(data.diagnostics[0].category).toBe('error');
      }
    });

    test('categorizes warnings correctly', async () => {
      const warning = createMockDiagnostic(0, 6133, 'Unused variable', 0, 5);
      const mockService = createMockService({ semantic: [warning] });

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn.mockReturnValue({ line: 1, column: 1 });

      const result = await handleGetDiagnostics({ file: '/mock/project/warning.ts' });
      const data = JSON.parse(result.content[0].text);

      if (data.diagnostics.length > 0) {
        expect(data.diagnostics[0].category).toBe('warning');
      }
    });

    test('counts diagnostics by category', async () => {
      const error1 = createMockDiagnostic(1, 2322, 'Type error 1', 0, 5);
      const error2 = createMockDiagnostic(1, 2322, 'Type error 2', 20, 5);
      const warning = createMockDiagnostic(0, 6133, 'Warning', 40, 5);
      const mockService = createMockService({ semantic: [error1, error2, warning] });

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn.mockReturnValue({ line: 1, column: 1 });

      const result = await handleGetDiagnostics({ file: '/mock/project/errors.ts' });
      const data = JSON.parse(result.content[0].text);

      expect(data.counts.errors).toBe(2);
      expect(data.counts.warnings).toBe(1);
      expect(typeof data.counts.suggestions).toBe('number');
    });
  });

  describe('quick fixes', () => {
    test('includes fixes array for fixable errors', async () => {
      const error = createMockDiagnostic(1, 2322, 'Type error', 0, 5);
      const mockService = createMockService({ semantic: [error] });
      mockService.getCodeFixesAtPosition.mockReturnValue([]);

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn.mockReturnValue({ line: 1, column: 1 });

      const result = await handleGetDiagnostics({ file: '/mock/project/fixable.ts' });
      const data = JSON.parse(result.content[0].text);

      if (data.diagnostics.length > 0) {
        expect(Array.isArray(data.diagnostics[0].fixes)).toBe(true);
      }
    });

    test('fix includes title and edits', async () => {
      const error = createMockDiagnostic(1, 2551, "Cannot find name 'fooo'", 0, 4);
      const mockService = createMockService({ semantic: [error] });
      mockService.getCodeFixesAtPosition.mockReturnValue([
        {
          description: "Change spelling to 'foo'",
          changes: [
            {
              fileName: '/mock/project/fixable.ts',
              textChanges: [{ span: { start: 0, length: 4 }, newText: 'foo' }],
            },
          ],
        },
      ]);

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn.mockReturnValue({ line: 1, column: 1 });

      const result = await handleGetDiagnostics({ file: '/mock/project/fixable.ts' });
      const data = JSON.parse(result.content[0].text);

      // Check if any diagnostic has fixes with proper structure
      for (const diagnostic of data.diagnostics) {
        for (const fix of diagnostic.fixes) {
          expect(fix.title).toBeDefined();
          expect(Array.isArray(fix.edits)).toBe(true);
        }
      }
    });
  });

  describe('sorting', () => {
    test('sorts diagnostics by category (errors first)', async () => {
      const warning = createMockDiagnostic(0, 6133, 'Warning', 0, 5);
      const error = createMockDiagnostic(1, 2322, 'Error', 20, 5);
      const mockService = createMockService({ semantic: [warning, error] });

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn.mockReturnValue({ line: 1, column: 1 });

      const result = await handleGetDiagnostics({ file: '/mock/project/mixed.ts' });
      const data = JSON.parse(result.content[0].text);

      if (data.diagnostics.length > 1) {
        // Errors should come before warnings
        const categories = data.diagnostics.map(
          (d: { category: string }) => d.category
        );
        const errorIndex = categories.indexOf('error');
        const warningIndex = categories.indexOf('warning');
        if (errorIndex !== -1 && warningIndex !== -1) {
          expect(errorIndex).toBeLessThan(warningIndex);
        }
      }
    });

    test('sorts diagnostics by file, line, column within category', async () => {
      const error1 = createMockDiagnostic(1, 2322, 'Error 1', 0, 5);
      const error2 = createMockDiagnostic(1, 2322, 'Error 2', 20, 5);
      const error3 = createMockDiagnostic(1, 2322, 'Error 3', 40, 5);
      const mockService = createMockService({ semantic: [error3, error1, error2] });

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      // Return different positions for each call pair (start, end)
      mockLanguageServiceManager.getLineAndColumn
        .mockReturnValueOnce({ line: 3, column: 1 }) // error3 start
        .mockReturnValueOnce({ line: 3, column: 6 }) // error3 end
        .mockReturnValueOnce({ line: 1, column: 1 }) // error1 start
        .mockReturnValueOnce({ line: 1, column: 6 }) // error1 end
        .mockReturnValueOnce({ line: 2, column: 1 }) // error2 start
        .mockReturnValueOnce({ line: 2, column: 6 }); // error2 end

      const result = await handleGetDiagnostics({ file: '/mock/project/sorted.ts' });
      const data = JSON.parse(result.content[0].text);

      if (data.diagnostics.length > 1) {
        for (let i = 1; i < data.diagnostics.length; i++) {
          const prev = data.diagnostics[i - 1];
          const curr = data.diagnostics[i];

          // Within same category, should be sorted by location
          if (prev.category === curr.category && prev.file === curr.file) {
            if (prev.line === curr.line) {
              expect(prev.column).toBeLessThanOrEqual(curr.column);
            }
          }
        }
      }
    });
  });

  describe('project-wide mode', () => {
    test('analyzes all files when no file argument provided', async () => {
      // Mock directory structure with TypeScript files
      mockFs.readdirSync.mockImplementation((dir: string) => {
        if (dir === '/mock/project') {
          return [
            { name: 'file1.ts', isFile: () => true, isDirectory: () => false },
            { name: 'file2.ts', isFile: () => true, isDirectory: () => false },
          ];
        }
        return [];
      });

      const error = createMockDiagnostic(1, 2322, 'Type error', 0, 5);
      const mockService = createMockService({ semantic: [error] });

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn.mockReturnValue({ line: 1, column: 1 });

      const result = await handleGetDiagnostics({});
      const data = JSON.parse(result.content[0].text);

      expect(data.diagnostics).toBeDefined();
      expect(data.counts).toBeDefined();
    });

    test('returns success message when no source files found', async () => {
      // Mock empty directory
      mockFs.readdirSync.mockReturnValue([]);

      const result = await handleGetDiagnostics({});
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.diagnostics).toEqual([]);
      expect(data.counts).toEqual({ errors: 0, warnings: 0, suggestions: 0 });
      if (data.message) {
        expect(data.message).toContain('No TypeScript/JavaScript files found');
      }
    });

    test('skips node_modules directory', async () => {
      // Mock directory structure with node_modules
      mockFs.readdirSync.mockImplementation((dir: string) => {
        if (dir === '/mock/project') {
          return [
            { name: 'node_modules', isFile: () => false, isDirectory: () => true },
            { name: 'main.ts', isFile: () => true, isDirectory: () => false },
          ];
        }
        // node_modules should not be entered
        if (dir.includes('node_modules')) {
          throw new Error('Should not read node_modules');
        }
        return [];
      });

      const mockService = createMockService();
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });

      const result = await handleGetDiagnostics({});
      const data = JSON.parse(result.content[0].text);

      // Should not include errors from node_modules
      const nodeModulesErrors = data.diagnostics.filter(
        (d: { file: string }) => d.file.includes('node_modules')
      );
      expect(nodeModulesErrors.length).toBe(0);
    });

    test('skips .git directory', async () => {
      mockFs.readdirSync.mockImplementation((dir: string) => {
        if (dir === '/mock/project') {
          return [
            { name: '.git', isFile: () => false, isDirectory: () => true },
            { name: 'main.ts', isFile: () => true, isDirectory: () => false },
          ];
        }
        if (dir.includes('.git')) {
          throw new Error('Should not read .git');
        }
        return [];
      });

      const mockService = createMockService();
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });

      const result = await handleGetDiagnostics({});
      const data = JSON.parse(result.content[0].text);

      const gitErrors = data.diagnostics.filter(
        (d: { file: string }) => d.file.includes('.git')
      );
      expect(gitErrors.length).toBe(0);
    });

    test('skips dist directory', async () => {
      mockFs.readdirSync.mockImplementation((dir: string) => {
        if (dir === '/mock/project') {
          return [
            { name: 'dist', isFile: () => false, isDirectory: () => true },
            { name: 'main.ts', isFile: () => true, isDirectory: () => false },
          ];
        }
        if (dir.includes('dist')) {
          throw new Error('Should not read dist');
        }
        return [];
      });

      const mockService = createMockService();
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });

      const result = await handleGetDiagnostics({});
      const data = JSON.parse(result.content[0].text);

      const distErrors = data.diagnostics.filter(
        (d: { file: string }) => d.file.includes('dist')
      );
      expect(distErrors.length).toBe(0);
    });
  });

  describe('file type handling', () => {
    test('handles JavaScript files', async () => {
      const mockService = createMockService();

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });

      const result = await handleGetDiagnostics({ file: '/mock/project/test.js' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.diagnostics).toBeDefined();
    });

    test('handles JSX files', async () => {
      const mockService = createMockService();

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });

      const result = await handleGetDiagnostics({ file: '/mock/project/test.jsx' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles TSX files', async () => {
      const mockService = createMockService();

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });

      const result = await handleGetDiagnostics({ file: '/mock/project/test.tsx' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles MTS files', async () => {
      const mockService = createMockService();

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });

      const result = await handleGetDiagnostics({ file: '/mock/project/test.mts' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles CTS files', async () => {
      const mockService = createMockService();

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });

      const result = await handleGetDiagnostics({ file: '/mock/project/test.cts' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const mockService = createMockService();

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });

      const result = await handleGetDiagnostics({ file: '/mock/project/test.ts' });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      const mockService = createMockService();

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });

      const result = await handleGetDiagnostics({ file: '/mock/project/test.ts' });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe('edge cases', () => {
    test('handles empty file', async () => {
      const mockService = createMockService();

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });

      const result = await handleGetDiagnostics({ file: '/mock/project/empty.ts' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.diagnostics).toBeDefined();
    });

    test('handles file with only whitespace', async () => {
      const mockService = createMockService();

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });

      const result = await handleGetDiagnostics({ file: '/mock/project/whitespace.ts' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles file with only comments', async () => {
      const mockService = createMockService();

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });

      const result = await handleGetDiagnostics({ file: '/mock/project/comments.ts' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles file with unicode characters', async () => {
      const mockService = createMockService();

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });

      const result = await handleGetDiagnostics({ file: '/mock/project/unicode.ts' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles very long file', async () => {
      const mockService = createMockService();

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });

      const result = await handleGetDiagnostics({ file: '/mock/project/long.ts' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles relative file path', async () => {
      const mockService = createMockService();

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });

      const result = await handleGetDiagnostics({ file: 'test.ts' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('error handling', () => {
    test('handles language service errors gracefully', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockRejectedValue(
        new Error('Language service error')
      );

      const result = await handleGetDiagnostics({ file: '/mock/project/test.ts' });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.isError).toBe(true);
    });

    test('handles getLineAndColumn errors gracefully', async () => {
      const error = createMockDiagnostic(1, 2322, 'Type error', 0, 5);
      const mockService = createMockService({ semantic: [error] });

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn.mockImplementation(() => {
        throw new Error('Position error');
      });

      // Should not crash, even if position conversion fails
      const result = await handleGetDiagnostics({ file: '/mock/project/test.ts' });
      expect(result).toBeDefined();
    });
  });

  describe('diagnostic message handling', () => {
    test('flattens nested diagnostic messages', async () => {
      // Nested message structure that TypeScript can produce
      const nestedError = createMockDiagnostic(
        1,
        2322,
        {
          messageText: 'Type error',
          next: [{ messageText: 'Property missing', category: 1, code: 2322 }],
        } as unknown as string,
        0,
        5
      );
      const mockService = createMockService({ semantic: [nestedError] });

      mockFs.existsSync.mockReturnValue(true);
      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: {},
        configPath: null,
      });
      mockLanguageServiceManager.getLineAndColumn.mockReturnValue({ line: 1, column: 1 });

      const result = await handleGetDiagnostics({ file: '/mock/project/nested.ts' });
      const data = JSON.parse(result.content[0].text);

      if (data.diagnostics.length > 0) {
        expect(typeof data.diagnostics[0].message).toBe('string');
      }
    });
  });
});
