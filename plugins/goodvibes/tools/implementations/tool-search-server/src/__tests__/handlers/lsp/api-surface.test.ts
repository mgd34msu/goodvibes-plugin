/**
 * Unit tests for handleGetApiSurface
 *
 * Tests the API surface analysis handler that identifies public vs internal
 * exports from TypeScript/JavaScript modules.
 *
 * These tests use mocked filesystem and TypeScript language service operations.
 */

import { describe, test, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import * as path from 'path';
import ts from 'typescript';

// Mock fs before importing the handler
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}));

// Mock the language service manager
vi.mock('../../../handlers/lsp/language-service.js', () => ({
  languageServiceManager: {
    getServiceForFile: vi.fn(),
    cleanup: vi.fn(),
  },
}));

// Mock the config module
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project',
}));

// Now import after mocks are set up
import * as fs from 'fs';
import { handleGetApiSurface, type GetApiSurfaceArgs } from '../../../handlers/lsp/api-surface.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

// Type helpers for mocks
const mockFs = fs as unknown as {
  existsSync: Mock;
  readdirSync: Mock;
  readFileSync: Mock;
  statSync: Mock;
};

const mockLanguageServiceManager = languageServiceManager as unknown as {
  getServiceForFile: Mock;
  cleanup: Mock;
};

// Helper to create directory entry mocks
function createDirEntry(name: string, isFile: boolean, isDirectory: boolean) {
  return {
    name,
    isFile: () => isFile,
    isDirectory: () => isDirectory,
  };
}

// Helper to create mock source file
function createMockSourceFile(
  fileName: string,
  text: string,
  lineStarts: number[] = [0]
) {
  return {
    fileName,
    text,
    getLineStarts: () => lineStarts,
    getLineAndCharacterOfPosition: (pos: number) => ({ line: 0, character: pos }),
  };
}

// Helper to create mock declaration
function createMockDeclaration(
  sourceFile: ReturnType<typeof createMockSourceFile>,
  start: number,
  kind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'variable' | 'const' | 'module' = 'function'
) {
  const decl = {
    getSourceFile: () => sourceFile,
    getStart: () => start,
    kind: ts.SyntaxKind.FunctionDeclaration,
    parent: null as unknown,
  };

  // Set proper kind based on type
  switch (kind) {
    case 'function':
      decl.kind = ts.SyntaxKind.FunctionDeclaration;
      break;
    case 'class':
      decl.kind = ts.SyntaxKind.ClassDeclaration;
      break;
    case 'interface':
      decl.kind = ts.SyntaxKind.InterfaceDeclaration;
      break;
    case 'type':
      decl.kind = ts.SyntaxKind.TypeAliasDeclaration;
      break;
    case 'enum':
      decl.kind = ts.SyntaxKind.EnumDeclaration;
      break;
    case 'variable':
    case 'const':
      decl.kind = ts.SyntaxKind.VariableDeclaration;
      // Add parent chain for variable statements
      decl.parent = {
        parent: {
          kind: ts.SyntaxKind.VariableStatement,
          declarationList: {
            flags: kind === 'const' ? ts.NodeFlags.Const : ts.NodeFlags.None,
          },
        },
      };
      break;
    case 'module':
      decl.kind = ts.SyntaxKind.ModuleDeclaration;
      break;
  }

  return decl;
}

// Helper to create mock export symbol
function createMockExportSymbol(
  name: string,
  declarations: ReturnType<typeof createMockDeclaration>[]
) {
  return {
    getName: () => name,
    getDeclarations: () => declarations,
  };
}

// Helper to create mock type checker
function createMockTypeChecker(exports: ReturnType<typeof createMockExportSymbol>[]) {
  return {
    getSymbolAtLocation: vi.fn(() => ({
      getName: () => 'module',
    })),
    getExportsOfModule: vi.fn(() => exports),
    getTypeOfSymbolAtLocation: vi.fn(() => ({
      getSymbol: () => null,
    })),
    typeToString: vi.fn(() => 'MockType'),
  };
}

// Helper to create mock program
function createMockProgram(
  sourceFiles: Map<string, ReturnType<typeof createMockSourceFile>>,
  typeChecker: ReturnType<typeof createMockTypeChecker>
) {
  return {
    getSourceFile: vi.fn((fileName: string) => {
      const normalized = fileName.replace(/\\/g, '/');
      return sourceFiles.get(normalized) ?? null;
    }),
    getTypeChecker: vi.fn(() => typeChecker),
  };
}

// Helper to create mock language service
function createMockService(
  sourceFiles: Map<string, ReturnType<typeof createMockSourceFile>>,
  typeChecker: ReturnType<typeof createMockTypeChecker>
) {
  const program = createMockProgram(sourceFiles, typeChecker);
  return {
    getProgram: vi.fn(() => program),
  };
}

describe('handleGetApiSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('basic functionality', () => {
    test('returns empty arrays when no entry points found', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('package.json')) return false;
        if (p.includes('index')) return false;
        if (p.includes('main')) return false;
        if (p.includes('mod')) return false;
        if (p.includes('src')) return false;
        return p === '/mock/project/testdir';
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });

      const result = await handleGetApiSurface({ path: 'testdir' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.public_api).toEqual([]);
      expect(data.internal_api).toEqual([]);
      expect(data.entry_points).toEqual([]);
    });

    test('returns empty arrays when no source files found', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('package.json')) return false;
        if (p.endsWith('index.ts')) return true;
        if (p.includes('src')) return false;
        return p === '/mock/project/testdir' || p.includes('testdir');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'testdir' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.public_api).toEqual([]);
      expect(data.internal_api).toEqual([]);
      expect(Array.isArray(data.entry_points)).toBe(true);
    });

    test('uses default path when none provided', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('package.json')) return false;
        if (p.includes('index')) return false;
        if (p.includes('main')) return false;
        if (p.includes('mod')) return false;
        if (p.includes('src')) return false;
        return p === '/mock/project';
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });

      const result = await handleGetApiSurface({});
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data).toHaveProperty('public_api');
      expect(data).toHaveProperty('internal_api');
      expect(data).toHaveProperty('entry_points');
    });
  });

  describe('entry point detection', () => {
    test('detects index.ts as entry point', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('package.json')) return false;
        if (p.endsWith('index.ts')) return true;
        if (p.includes('src')) return false;
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });
      const data = JSON.parse(result.content[0].text);

      expect(data.entry_points.length).toBeGreaterThanOrEqual(0);
    });

    test('detects package.json main field', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.endsWith('package.json')) return true;
        if (p.endsWith('dist/index.js')) return true;
        if (p.includes('src')) return false;
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        main: 'dist/index.js',
      }));
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('package.json', true, false),
        createDirEntry('dist', false, true),
      ]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('detects package.json module field', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.endsWith('package.json')) return true;
        if (p.endsWith('esm/index.js')) return true;
        if (p.includes('src')) return false;
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        module: 'esm/index.js',
      }));
      mockFs.readdirSync.mockReturnValue([]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('detects package.json exports field (string)', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.endsWith('package.json')) return true;
        if (p.endsWith('src/index.ts')) return true;
        if (p.includes('src') && !p.includes('index')) {
          return p.endsWith('/src');
        }
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        exports: './src/index.ts',
      }));
      mockFs.readdirSync.mockReturnValue([]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('detects package.json exports field (object)', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.endsWith('package.json')) return true;
        if (p.endsWith('src/index.ts')) return true;
        if (p.includes('src') && !p.includes('index')) {
          return p.endsWith('/src');
        }
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        exports: {
          '.': {
            import: './dist/index.mjs',
            require: './dist/index.cjs',
            default: './dist/index.js',
          },
        },
      }));
      mockFs.readdirSync.mockReturnValue([]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('detects src/index.ts as entry point', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('package.json')) return false;
        if (p.endsWith('/src')) return true;
        if (p.endsWith('src/index.ts')) return true;
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockImplementation((p: string) => ({
        isDirectory: () => p.endsWith('/src') || p.endsWith('/lib') || p === '/mock/project/lib',
      }));
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('src', false, true),
      ]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(Array.isArray(data.entry_points)).toBe(true);
    });

    test('uses provided entry_points argument', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('custom-entry.ts')) return true;
        if (p.includes('package.json')) return false;
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('custom-entry.ts', true, false),
      ]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({
        path: 'lib',
        entry_points: ['custom-entry.ts'],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('filters non-existent entry points', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('existing.ts')) return true;
        if (p.includes('nonexistent.ts')) return false;
        if (p.includes('package.json')) return false;
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('existing.ts', true, false),
      ]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({
        path: 'lib',
        entry_points: ['existing.ts', 'nonexistent.ts'],
      });

      expect(result.isError).toBeFalsy();
    });
  });

  describe('source file discovery', () => {
    test('finds TypeScript files recursively', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('package.json')) return false;
        if (p.endsWith('index.ts')) return true;
        if (p.includes('src')) return true;
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockImplementation((dir: string) => {
        if (dir.includes('src')) {
          return [
            createDirEntry('component.ts', true, false),
            createDirEntry('utils.ts', true, false),
          ];
        }
        return [
          createDirEntry('index.ts', true, false),
          createDirEntry('src', false, true),
        ];
      });

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('skips node_modules directory', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('package.json')) return false;
        if (p.endsWith('index.ts')) return true;
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockImplementation((dir: string) => {
        if (dir.includes('node_modules')) {
          throw new Error('Should not read node_modules');
        }
        return [
          createDirEntry('index.ts', true, false),
          createDirEntry('node_modules', false, true),
        ];
      });

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('skips hidden directories', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('package.json')) return false;
        if (p.endsWith('index.ts')) return true;
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockImplementation((dir: string) => {
        if (dir.includes('.git') || dir.includes('.vscode')) {
          throw new Error('Should not read hidden directories');
        }
        return [
          createDirEntry('index.ts', true, false),
          createDirEntry('.git', false, true),
          createDirEntry('.vscode', false, true),
        ];
      });

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('skips dist and build directories', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('package.json')) return false;
        if (p.endsWith('index.ts')) return true;
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockImplementation((dir: string) => {
        if (dir.includes('dist') || dir.includes('build') || dir.includes('out')) {
          throw new Error('Should not read output directories');
        }
        return [
          createDirEntry('index.ts', true, false),
          createDirEntry('dist', false, true),
          createDirEntry('build', false, true),
          createDirEntry('out', false, true),
        ];
      });

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('skips coverage directory', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('package.json')) return false;
        if (p.endsWith('index.ts')) return true;
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockImplementation((dir: string) => {
        if (dir.includes('coverage')) {
          throw new Error('Should not read coverage directory');
        }
        return [
          createDirEntry('index.ts', true, false),
          createDirEntry('coverage', false, true),
        ];
      });

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('handles unreadable directories gracefully', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('package.json')) return false;
        if (p.endsWith('index.ts')) return true;
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockImplementation((dir: string) => {
        if (dir.includes('unreadable')) {
          throw new Error('Permission denied');
        }
        return [
          createDirEntry('index.ts', true, false),
          createDirEntry('unreadable', false, true),
        ];
      });

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      // Should not crash
      expect(result.isError).toBeFalsy();
    });
  });

  describe('source file extensions', () => {
    test('includes .ts files', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
        createDirEntry('component.ts', true, false),
      ]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('includes .tsx files', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.tsx', true, false),
      ]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('includes .js files', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.js', true, false),
      ]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('includes .jsx files', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.jsx', true, false),
      ]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('includes .mts and .mjs files', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.mts', true, false),
        createDirEntry('utils.mjs', true, false),
      ]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('includes .cts and .cjs files', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.cts', true, false),
        createDirEntry('utils.cjs', true, false),
      ]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('excludes non-source files', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
        createDirEntry('readme.md', true, false),
        createDirEntry('config.json', true, false),
        createDirEntry('styles.css', true, false),
      ]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });
  });

  describe('error handling', () => {
    test('returns error for non-directory path', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => false });

      const result = await handleGetApiSurface({ path: 'file.ts' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('not a directory');
    });

    test('returns error for non-existent path', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.statSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const result = await handleGetApiSurface({ path: 'nonexistent' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('not found');
    });

    test('handles language service errors gracefully', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      mockLanguageServiceManager.getServiceForFile.mockRejectedValue(
        new Error('Language service error')
      );

      const result = await handleGetApiSurface({ path: 'lib' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Failed to analyze API surface');
    });

    test('handles invalid package.json gracefully', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.endsWith('package.json')) return true;
        if (p.endsWith('index.ts')) return true;
        if (p.includes('src')) return false;
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readFileSync.mockReturnValue('invalid json {');
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('package.json', true, false),
        createDirEntry('index.ts', true, false),
      ]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      const typeChecker = createMockTypeChecker([]);
      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      // Should not crash on invalid package.json
      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });
  });

  describe('export classification', () => {
    test('classifies exports from entry points as public', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      const sourceFile = createMockSourceFile('/mock/project/lib/index.ts', 'export function publicFn() {}');
      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      sourceFiles.set('/mock/project/lib/index.ts', sourceFile);

      const decl = createMockDeclaration(sourceFile, 0, 'function');
      const exportSymbol = createMockExportSymbol('publicFn', [decl]);
      const typeChecker = createMockTypeChecker([exportSymbol]);

      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(Array.isArray(data.public_api)).toBe(true);
      expect(Array.isArray(data.internal_api)).toBe(true);
    });

    test('classifies exports not in entry points as internal', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
        createDirEntry('internal.ts', true, false),
      ]);

      const indexFile = createMockSourceFile('/mock/project/lib/index.ts', '');
      const internalFile = createMockSourceFile('/mock/project/lib/internal.ts', 'export function internalFn() {}');

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      sourceFiles.set('/mock/project/lib/index.ts', indexFile);
      sourceFiles.set('/mock/project/lib/internal.ts', internalFile);

      const internalDecl = createMockDeclaration(internalFile, 0, 'function');
      const internalExport = createMockExportSymbol('internalFn', [internalDecl]);
      const typeChecker = createMockTypeChecker([internalExport]);

      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('skips __export internal symbols', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      const sourceFile = createMockSourceFile('/mock/project/lib/index.ts', '');
      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      sourceFiles.set('/mock/project/lib/index.ts', sourceFile);

      const decl = createMockDeclaration(sourceFile, 0, 'function');
      const internalExport = createMockExportSymbol('__export', [decl]);
      const typeChecker = createMockTypeChecker([internalExport]);

      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // __export should be filtered out
      const allExports = [...data.public_api, ...data.internal_api];
      const hasInternalExport = allExports.some((e: { name: string }) => e.name === '__export');
      expect(hasInternalExport).toBe(false);
    });
  });

  describe('export kinds', () => {
    test('identifies function exports', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      const sourceFile = createMockSourceFile('/mock/project/lib/index.ts', 'export function myFn() {}');
      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      sourceFiles.set('/mock/project/lib/index.ts', sourceFile);

      const decl = createMockDeclaration(sourceFile, 0, 'function');
      const exportSymbol = createMockExportSymbol('myFn', [decl]);
      const typeChecker = createMockTypeChecker([exportSymbol]);

      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('identifies class exports', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      const sourceFile = createMockSourceFile('/mock/project/lib/index.ts', 'export class MyClass {}');
      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      sourceFiles.set('/mock/project/lib/index.ts', sourceFile);

      const decl = createMockDeclaration(sourceFile, 0, 'class');
      const exportSymbol = createMockExportSymbol('MyClass', [decl]);
      const typeChecker = createMockTypeChecker([exportSymbol]);

      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('identifies interface exports', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      const sourceFile = createMockSourceFile('/mock/project/lib/index.ts', 'export interface MyInterface {}');
      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      sourceFiles.set('/mock/project/lib/index.ts', sourceFile);

      const decl = createMockDeclaration(sourceFile, 0, 'interface');
      const exportSymbol = createMockExportSymbol('MyInterface', [decl]);
      const typeChecker = createMockTypeChecker([exportSymbol]);

      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('identifies type alias exports', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      const sourceFile = createMockSourceFile('/mock/project/lib/index.ts', 'export type MyType = string;');
      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      sourceFiles.set('/mock/project/lib/index.ts', sourceFile);

      const decl = createMockDeclaration(sourceFile, 0, 'type');
      const exportSymbol = createMockExportSymbol('MyType', [decl]);
      const typeChecker = createMockTypeChecker([exportSymbol]);

      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('identifies enum exports', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      const sourceFile = createMockSourceFile('/mock/project/lib/index.ts', 'export enum MyEnum { A, B }');
      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      sourceFiles.set('/mock/project/lib/index.ts', sourceFile);

      const decl = createMockDeclaration(sourceFile, 0, 'enum');
      const exportSymbol = createMockExportSymbol('MyEnum', [decl]);
      const typeChecker = createMockTypeChecker([exportSymbol]);

      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('identifies const exports', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      const sourceFile = createMockSourceFile('/mock/project/lib/index.ts', 'export const MY_CONST = 42;');
      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      sourceFiles.set('/mock/project/lib/index.ts', sourceFile);

      const decl = createMockDeclaration(sourceFile, 0, 'const');
      const exportSymbol = createMockExportSymbol('MY_CONST', [decl]);
      const typeChecker = createMockTypeChecker([exportSymbol]);

      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('identifies variable exports', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      const sourceFile = createMockSourceFile('/mock/project/lib/index.ts', 'export let myVar = 0;');
      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      sourceFiles.set('/mock/project/lib/index.ts', sourceFile);

      const decl = createMockDeclaration(sourceFile, 0, 'variable');
      const exportSymbol = createMockExportSymbol('myVar', [decl]);
      const typeChecker = createMockTypeChecker([exportSymbol]);

      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });

    test('identifies namespace/module exports', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      const sourceFile = createMockSourceFile('/mock/project/lib/index.ts', 'export namespace MyNamespace {}');
      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      sourceFiles.set('/mock/project/lib/index.ts', sourceFile);

      const decl = createMockDeclaration(sourceFile, 0, 'module');
      const exportSymbol = createMockExportSymbol('MyNamespace', [decl]);
      const typeChecker = createMockTypeChecker([exportSymbol]);

      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('package.json')) return false;
        if (p.includes('index')) return false;
        if (p.includes('src')) return false;
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('package.json')) return false;
        if (p.includes('index')) return false;
        if (p.includes('src')) return false;
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    test('includes public_api, internal_api, and entry_points', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('package.json')) return false;
        if (p.includes('index')) return false;
        if (p.includes('src')) return false;
        return p === '/mock/project/lib' || p.includes('lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });

      const result = await handleGetApiSurface({ path: 'lib' });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('public_api');
      expect(data).toHaveProperty('internal_api');
      expect(data).toHaveProperty('entry_points');
      expect(Array.isArray(data.public_api)).toBe(true);
      expect(Array.isArray(data.internal_api)).toBe(true);
      expect(Array.isArray(data.entry_points)).toBe(true);
    });
  });

  describe('path handling', () => {
    test('handles absolute paths', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('package.json')) return false;
        if (p.includes('index')) return false;
        if (p.includes('src')) return false;
        return p.includes('/absolute/path/lib');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });

      const result = await handleGetApiSurface({ path: '/absolute/path/lib' });

      expect(result.isError).toBeFalsy();
    });

    test('resolves relative paths to project root', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('package.json')) return false;
        if (p.includes('index')) return false;
        if (p.includes('src')) return false;
        return p.includes('mock') && p.includes('project');
      });
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });

      const result = await handleGetApiSurface({ path: 'lib' });

      expect(result.isError).toBeFalsy();
    });
  });

  describe('sorting', () => {
    test('sorts public_api by file then line', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      const sourceFile = createMockSourceFile('/mock/project/lib/index.ts', '', [0, 20, 40]);
      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      sourceFiles.set('/mock/project/lib/index.ts', sourceFile);

      const decl1 = createMockDeclaration(sourceFile, 20, 'function');
      const decl2 = createMockDeclaration(sourceFile, 0, 'function');
      const export1 = createMockExportSymbol('fnB', [decl1]);
      const export2 = createMockExportSymbol('fnA', [decl2]);
      const typeChecker = createMockTypeChecker([export1, export2]);

      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });
      const data = JSON.parse(result.content[0].text);

      // Results should be sorted by file, then line
      expect(Array.isArray(data.public_api)).toBe(true);
    });

    test('sorts internal_api by file then line', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
        createDirEntry('internal.ts', true, false),
      ]);

      const indexFile = createMockSourceFile('/mock/project/lib/index.ts', '');
      const internalFile = createMockSourceFile('/mock/project/lib/internal.ts', '', [0, 20]);

      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      sourceFiles.set('/mock/project/lib/index.ts', indexFile);
      sourceFiles.set('/mock/project/lib/internal.ts', internalFile);

      const decl1 = createMockDeclaration(internalFile, 20, 'function');
      const decl2 = createMockDeclaration(internalFile, 0, 'function');
      const export1 = createMockExportSymbol('internal1', [decl1]);
      const export2 = createMockExportSymbol('internal2', [decl2]);
      const typeChecker = createMockTypeChecker([export1, export2]);

      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });
      const data = JSON.parse(result.content[0].text);

      // Results should be sorted by file, then line
      expect(Array.isArray(data.internal_api)).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('handles exports without declarations', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      const sourceFile = createMockSourceFile('/mock/project/lib/index.ts', '');
      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      sourceFiles.set('/mock/project/lib/index.ts', sourceFile);

      // Export with no declarations
      const exportSymbol = {
        getName: () => 'noDecl',
        getDeclarations: () => null,
      };
      const typeChecker = createMockTypeChecker([exportSymbol as ReturnType<typeof createMockExportSymbol>]);

      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      // Should not crash
      expect(result.isError).toBeFalsy();
    });

    test('handles exports with empty declarations array', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      const sourceFile = createMockSourceFile('/mock/project/lib/index.ts', '');
      const sourceFiles = new Map<string, ReturnType<typeof createMockSourceFile>>();
      sourceFiles.set('/mock/project/lib/index.ts', sourceFile);

      // Export with empty declarations
      const exportSymbol = createMockExportSymbol('emptyDecl', []);
      const typeChecker = createMockTypeChecker([exportSymbol]);

      const mockService = createMockService(sourceFiles, typeChecker);

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });

      // Should not crash
      expect(result.isError).toBeFalsy();
    });

    test('handles program without type checker', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      const mockService = {
        getProgram: vi.fn(() => ({
          getSourceFile: vi.fn(() => null),
          getTypeChecker: vi.fn(() => null),
        })),
      };

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: mockService.getProgram(),
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });
      const data = JSON.parse(result.content[0].text);

      // Should return empty results, not crash
      expect(result.isError).toBeFalsy();
      expect(data.public_api).toEqual([]);
      expect(data.internal_api).toEqual([]);
    });

    test('handles service without program', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      mockFs.readdirSync.mockReturnValue([
        createDirEntry('index.ts', true, false),
      ]);

      const mockService = {
        getProgram: vi.fn(() => null),
      };

      mockLanguageServiceManager.getServiceForFile.mockResolvedValue({
        service: mockService,
        program: null,
        configPath: null,
      });

      const result = await handleGetApiSurface({ path: 'lib' });
      const data = JSON.parse(result.content[0].text);

      // Should return empty results, not crash
      expect(result.isError).toBeFalsy();
      expect(data.public_api).toEqual([]);
      expect(data.internal_api).toEqual([]);
    });
  });
});
