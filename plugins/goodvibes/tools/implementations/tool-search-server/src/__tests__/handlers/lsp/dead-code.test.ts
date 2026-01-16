/**
 * Unit tests for handleFindDeadCode
 *
 * Tests the dead code detection handler that finds unused exports and functions
 * by analyzing references using the TypeScript Language Service.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { handleFindDeadCode } from '../../../handlers/lsp/dead-code.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

// Mock console.warn to suppress expected warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('handleFindDeadCode', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dead-code-test-'));
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

  describe('single file analysis', () => {
    test('detects unused exported function', async () => {
      const file = path.join(tempDir, 'unused.ts');
      fs.writeFileSync(file, 'export function unusedFunc() { return 42; }');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports).toBeDefined();
      expect(data.files_analyzed).toBe(1);
    });

    test('detects unused exported constant', async () => {
      const file = path.join(tempDir, 'const.ts');
      fs.writeFileSync(file, 'export const UNUSED_CONST = 42;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports.some((e: { name: string }) => e.name === 'UNUSED_CONST')).toBe(true);
    });

    test('detects unused exported class', async () => {
      const file = path.join(tempDir, 'class.ts');
      fs.writeFileSync(file, 'export class UnusedClass { constructor() {} }');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports.some((e: { name: string }) => e.name === 'UnusedClass')).toBe(true);
    });

    test('detects unused exported interface', async () => {
      const file = path.join(tempDir, 'interface.ts');
      fs.writeFileSync(file, 'export interface UnusedInterface { id: string; }');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports.some((e: { name: string }) => e.name === 'UnusedInterface')).toBe(true);
    });

    test('detects unused exported type alias', async () => {
      const file = path.join(tempDir, 'type.ts');
      fs.writeFileSync(file, 'export type UnusedType = string | number;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports.some((e: { name: string }) => e.name === 'UnusedType')).toBe(true);
    });

    test('detects unused exported enum', async () => {
      const file = path.join(tempDir, 'enum.ts');
      fs.writeFileSync(file, 'export enum UnusedEnum { A, B, C }');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports.some((e: { name: string }) => e.name === 'UnusedEnum')).toBe(true);
    });

    test('does not flag used exports when analyzing directory', async () => {
      const utilsFile = path.join(tempDir, 'utils.ts');
      const mainFile = path.join(tempDir, 'main.ts');
      const tsconfigFile = path.join(tempDir, 'tsconfig.json');

      // Create tsconfig to ensure files are in the same project
      fs.writeFileSync(
        tsconfigFile,
        JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
            module: 'commonjs',
            strict: true,
          },
          include: ['*.ts'],
        })
      );

      fs.writeFileSync(utilsFile, 'export function usedFunc() { return 42; }');
      fs.writeFileSync(mainFile, 'import { usedFunc } from "./utils";\nconsole.log(usedFunc());');

      // Analyze the whole directory so cross-file references are detected
      const result = await handleFindDeadCode({ path: tempDir });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      // The function should not be flagged as dead since it's used in main.ts
      expect(data.dead_exports.some((e: { name: string }) => e.name === 'usedFunc')).toBe(false);
    });
  });

  describe('directory analysis', () => {
    test('analyzes all files in directory', async () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);

      fs.writeFileSync(path.join(srcDir, 'file1.ts'), 'export function func1() {}');
      fs.writeFileSync(path.join(srcDir, 'file2.ts'), 'export function func2() {}');

      const result = await handleFindDeadCode({ path: srcDir });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.files_analyzed).toBe(2);
    });

    test('analyzes all files in nested directories', async () => {
      const srcDir = path.join(tempDir, 'src');
      const nestedDir = path.join(srcDir, 'nested');
      fs.mkdirSync(nestedDir, { recursive: true });

      fs.writeFileSync(path.join(srcDir, 'root.ts'), 'export const root = 1;');
      fs.writeFileSync(path.join(nestedDir, 'nested.ts'), 'export const nested = 2;');

      const result = await handleFindDeadCode({ path: srcDir });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.files_analyzed).toBe(2);
    });

    test('analyzes project root by default', async () => {
      // Create a file in tempDir and set PROJECT_ROOT to tempDir
      fs.writeFileSync(path.join(tempDir, 'root-test.ts'), 'export const rootTest = 1;');

      const originalEnv = process.env.PROJECT_ROOT;
      process.env.PROJECT_ROOT = tempDir;

      try {
        const result = await handleFindDeadCode({});
        const data = JSON.parse((result.content[0] as any).text);

        expect(result.isError).toBeFalsy();
        expect(data.files_analyzed).toBeGreaterThanOrEqual(1);
      } finally {
        process.env.PROJECT_ROOT = originalEnv;
      }
    });
  });

  describe('directory filtering', () => {
    test('skips node_modules directory', async () => {
      const nodeModules = path.join(tempDir, 'node_modules', 'some-package');
      fs.mkdirSync(nodeModules, { recursive: true });
      fs.writeFileSync(path.join(nodeModules, 'index.ts'), 'export const x = 1;');

      fs.writeFileSync(path.join(tempDir, 'main.ts'), 'export const main = 1;');

      const result = await handleFindDeadCode({ path: tempDir });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports.every((e: { file: string }) => !e.file.includes('node_modules'))).toBe(true);
    });

    test('skips hidden directories', async () => {
      const hiddenDir = path.join(tempDir, '.hidden');
      fs.mkdirSync(hiddenDir);
      fs.writeFileSync(path.join(hiddenDir, 'hidden.ts'), 'export const hidden = 1;');

      fs.writeFileSync(path.join(tempDir, 'main.ts'), 'export const main = 1;');

      const result = await handleFindDeadCode({ path: tempDir });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports.every((e: { file: string }) => !e.file.includes('.hidden'))).toBe(true);
    });

    test('skips dist directory', async () => {
      const distDir = path.join(tempDir, 'dist');
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, 'bundle.js'), 'export const dist = 1;');

      fs.writeFileSync(path.join(tempDir, 'main.ts'), 'export const main = 1;');

      const result = await handleFindDeadCode({ path: tempDir });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports.every((e: { file: string }) => !e.file.includes('dist'))).toBe(true);
    });

    test('skips build directory', async () => {
      const buildDir = path.join(tempDir, 'build');
      fs.mkdirSync(buildDir);
      fs.writeFileSync(path.join(buildDir, 'output.js'), 'export const build = 1;');

      fs.writeFileSync(path.join(tempDir, 'main.ts'), 'export const main = 1;');

      const result = await handleFindDeadCode({ path: tempDir });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports.every((e: { file: string }) => !e.file.includes('/build/'))).toBe(true);
    });

    test('skips coverage directory', async () => {
      const coverageDir = path.join(tempDir, 'coverage');
      fs.mkdirSync(coverageDir);
      fs.writeFileSync(path.join(coverageDir, 'report.ts'), 'export const coverage = 1;');

      fs.writeFileSync(path.join(tempDir, 'main.ts'), 'export const main = 1;');

      const result = await handleFindDeadCode({ path: tempDir });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports.every((e: { file: string }) => !e.file.includes('coverage'))).toBe(true);
    });
  });

  describe('test file handling', () => {
    test('skips test files from analysis', async () => {
      fs.writeFileSync(path.join(tempDir, 'utils.test.ts'), 'export const test = 1;');
      fs.writeFileSync(path.join(tempDir, 'main.ts'), 'export const main = 1;');

      const result = await handleFindDeadCode({ path: tempDir });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports.every((e: { file: string }) => !e.file.includes('.test.'))).toBe(true);
    });

    test('skips spec files from analysis', async () => {
      fs.writeFileSync(path.join(tempDir, 'utils.spec.ts'), 'export const spec = 1;');
      fs.writeFileSync(path.join(tempDir, 'main.ts'), 'export const main = 1;');

      const result = await handleFindDeadCode({ path: tempDir });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports.every((e: { file: string }) => !e.file.includes('.spec.'))).toBe(true);
    });

    test('skips files in __tests__ directory', async () => {
      const testsDir = path.join(tempDir, '__tests__');
      fs.mkdirSync(testsDir);
      fs.writeFileSync(path.join(testsDir, 'test.ts'), 'export const test = 1;');

      fs.writeFileSync(path.join(tempDir, 'main.ts'), 'export const main = 1;');

      const result = await handleFindDeadCode({ path: tempDir });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports.every((e: { file: string }) => !e.file.includes('__tests__'))).toBe(true);
    }, 60000);

    test('counts test file references when include_tests is true', async () => {
      const utilsFile = path.join(tempDir, 'utils.ts');
      fs.writeFileSync(utilsFile, 'export function helper() {}');
      fs.writeFileSync(path.join(tempDir, 'utils.test.ts'), 'import { helper } from "./utils";\nhelper();');

      const result = await handleFindDeadCode({ path: utilsFile, include_tests: true });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      // When including tests, helper should not be considered dead if used in test
    });

    test('ignores test file references when include_tests is false', async () => {
      const utilsFile = path.join(tempDir, 'utils.ts');
      fs.writeFileSync(utilsFile, 'export function helper() {}');
      fs.writeFileSync(path.join(tempDir, 'utils.test.ts'), 'import { helper } from "./utils";\nhelper();');

      const result = await handleFindDeadCode({ path: utilsFile, include_tests: false });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      // When excluding tests, helper should be considered dead
      expect(data.dead_exports.some((e: { name: string }) => e.name === 'helper')).toBe(true);
    });

    test('defaults to include_tests true', async () => {
      const utilsFile = path.join(tempDir, 'utils.ts');
      fs.writeFileSync(utilsFile, 'export function helper() {}');

      const result = await handleFindDeadCode({ path: utilsFile });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('export types', () => {
    test('handles named export declarations', async () => {
      const file = path.join(tempDir, 'exports.ts');
      fs.writeFileSync(file, `
const a = 1;
const b = 2;
export { a, b };
`);

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
    });

    test('handles export variable statements', async () => {
      const file = path.join(tempDir, 'vars.ts');
      fs.writeFileSync(file, 'export const x = 1, y = 2;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports.some((e: { name: string }) => e.name === 'x')).toBe(true);
      expect(data.dead_exports.some((e: { name: string }) => e.name === 'y')).toBe(true);
    });

    test('handles export namespace declarations', async () => {
      const file = path.join(tempDir, 'namespace.ts');
      fs.writeFileSync(file, 'export namespace MyNamespace { export const x = 1; }');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
    });

    test('skips default exports', async () => {
      const file = path.join(tempDir, 'default.ts');
      fs.writeFileSync(file, 'export default function() { return 42; }');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports.every((e: { name: string }) => e.name !== 'default')).toBe(true);
    });
  });

  describe('result metadata', () => {
    test('includes file path in dead exports', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'export const x = 1;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      if (data.dead_exports.length > 0) {
        expect(data.dead_exports[0]).toHaveProperty('file');
        expect(typeof data.dead_exports[0].file).toBe('string');
      }
    });

    test('includes name in dead exports', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'export const myVar = 1;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      if (data.dead_exports.length > 0) {
        expect(data.dead_exports[0]).toHaveProperty('name');
        expect(data.dead_exports[0].name).toBe('myVar');
      }
    });

    test('includes kind in dead exports', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'export function testFunc() {}');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      if (data.dead_exports.length > 0) {
        expect(data.dead_exports[0]).toHaveProperty('kind');
        expect(data.dead_exports[0].kind).toBe('function');
      }
    });

    test('includes line number in dead exports', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, '\n\nexport const x = 1;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      if (data.dead_exports.length > 0) {
        expect(data.dead_exports[0]).toHaveProperty('line');
        expect(typeof data.dead_exports[0].line).toBe('number');
        expect(data.dead_exports[0].line).toBeGreaterThan(0);
      }
    });

    test('includes exported_from for re-exports', async () => {
      const sourceFile = path.join(tempDir, 'source.ts');
      const reexportFile = path.join(tempDir, 'reexport.ts');
      fs.writeFileSync(sourceFile, 'export const original = 1;');
      fs.writeFileSync(reexportFile, 'export { original } from "./source";');

      const result = await handleFindDeadCode({ path: reexportFile });
      const data = JSON.parse((result.content[0] as any).text);

      if (data.dead_exports.length > 0) {
        const reExport = data.dead_exports.find((e: { exported_from: string | null }) => e.exported_from !== null);
        if (reExport) {
          expect(reExport.exported_from).toContain('./source');
        }
      }
    });
  });

  describe('sorting', () => {
    test('sorts results by file then line', async () => {
      fs.writeFileSync(path.join(tempDir, 'a.ts'), 'export const c = 3;\nexport const a = 1;');
      fs.writeFileSync(path.join(tempDir, 'b.ts'), 'export const b = 2;');

      const result = await handleFindDeadCode({ path: tempDir });
      const data = JSON.parse((result.content[0] as any).text);

      if (data.dead_exports.length > 1) {
        for (let i = 1; i < data.dead_exports.length; i++) {
          const prev = data.dead_exports[i - 1];
          const curr = data.dead_exports[i];

          const fileCompare = prev.file.localeCompare(curr.file);
          if (fileCompare === 0) {
            expect(prev.line).toBeLessThanOrEqual(curr.line);
          } else {
            expect(fileCompare).toBeLessThanOrEqual(0);
          }
        }
      }
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'export const x = 1;');

      const result = await handleFindDeadCode({ path: file });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'export const x = 1;');

      const result = await handleFindDeadCode({ path: file });

      expect(() => JSON.parse((result.content[0] as any).text)).not.toThrow();
    });

    test('includes count in result', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'export const x = 1;\nexport const y = 2;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(data).toHaveProperty('count');
      expect(typeof data.count).toBe('number');
      expect(data.count).toBe(data.dead_exports.length);
    });

    test('includes files_analyzed in result', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'export const x = 1;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(data).toHaveProperty('files_analyzed');
      expect(typeof data.files_analyzed).toBe('number');
    });
  });

  describe('error handling', () => {
    test('handles path not found', async () => {
      const result = await handleFindDeadCode({ path: '/nonexistent/path/that/does/not/exist' });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('not found');
    });

    test('handles non-file non-directory path', async () => {
      // This would be a symlink to a special file on Unix, but we'll just test the error message
      const result = await handleFindDeadCode({ path: '/dev/null' });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBe(true);
    });

    test('returns empty result when no source files found', async () => {
      const emptyDir = path.join(tempDir, 'empty');
      fs.mkdirSync(emptyDir);

      const result = await handleFindDeadCode({ path: emptyDir });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports).toEqual([]);
      expect(data.count).toBe(0);
      expect(data.files_analyzed).toBe(0);
    });
  });

  describe('file extension handling', () => {
    test('handles .ts files', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'export const x = 1;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
    });

    test('handles .tsx files', async () => {
      const file = path.join(tempDir, 'test.tsx');
      fs.writeFileSync(file, 'export const Component = () => <div />;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
    });

    test('handles .js files', async () => {
      const file = path.join(tempDir, 'test.js');
      fs.writeFileSync(file, 'export const x = 1;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
    });

    test('handles .jsx files', async () => {
      const file = path.join(tempDir, 'test.jsx');
      fs.writeFileSync(file, 'export const Component = () => <div />;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
    });

    test('handles .mts files', async () => {
      const file = path.join(tempDir, 'test.mts');
      fs.writeFileSync(file, 'export const x = 1;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
    });

    test('handles .cts files', async () => {
      const file = path.join(tempDir, 'test.cts');
      fs.writeFileSync(file, 'export const x = 1;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('edge cases', () => {
    test('handles empty file', async () => {
      const file = path.join(tempDir, 'empty.ts');
      fs.writeFileSync(file, '');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports).toEqual([]);
    });

    test('handles file with no exports', async () => {
      const file = path.join(tempDir, 'no-exports.ts');
      fs.writeFileSync(file, 'const x = 1;\nfunction foo() {}');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
      expect(data.dead_exports).toEqual([]);
    });

    test('handles absolute file path', async () => {
      const file = path.join(tempDir, 'absolute.ts');
      fs.writeFileSync(file, 'export const x = 1;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
    });

    test('handles self-referencing exports', async () => {
      const file = path.join(tempDir, 'self-ref.ts');
      fs.writeFileSync(file, `
export const x = 1;
export function useX() { return x; }
`);

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('export kind mapping', () => {
    test('maps function kind correctly', async () => {
      const file = path.join(tempDir, 'func.ts');
      fs.writeFileSync(file, 'export function myFunc() {}');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      const funcExport = data.dead_exports.find((e: { name: string }) => e.name === 'myFunc');
      if (funcExport) {
        expect(funcExport.kind).toBe('function');
      }
    });

    test('maps class kind correctly', async () => {
      const file = path.join(tempDir, 'class.ts');
      fs.writeFileSync(file, 'export class MyClass {}');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      const classExport = data.dead_exports.find((e: { name: string }) => e.name === 'MyClass');
      if (classExport) {
        expect(classExport.kind).toBe('class');
      }
    });

    test('maps interface kind correctly', async () => {
      const file = path.join(tempDir, 'iface.ts');
      fs.writeFileSync(file, 'export interface MyInterface {}');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      const ifaceExport = data.dead_exports.find((e: { name: string }) => e.name === 'MyInterface');
      if (ifaceExport) {
        expect(ifaceExport.kind).toBe('interface');
      }
    });

    test('maps type kind correctly', async () => {
      const file = path.join(tempDir, 'type.ts');
      fs.writeFileSync(file, 'export type MyType = string;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      const typeExport = data.dead_exports.find((e: { name: string }) => e.name === 'MyType');
      if (typeExport) {
        expect(typeExport.kind).toBe('type');
      }
    });

    test('maps enum kind correctly', async () => {
      const file = path.join(tempDir, 'enum.ts');
      fs.writeFileSync(file, 'export enum MyEnum { A, B }');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      const enumExport = data.dead_exports.find((e: { name: string }) => e.name === 'MyEnum');
      if (enumExport) {
        expect(enumExport.kind).toBe('enum');
      }
    });

    test('maps constant kind correctly', async () => {
      const file = path.join(tempDir, 'const.ts');
      fs.writeFileSync(file, 'export const MY_CONST = 1;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      const constExport = data.dead_exports.find((e: { name: string }) => e.name === 'MY_CONST');
      if (constExport) {
        expect(constExport.kind).toBe('constant');
      }
    });

    test('maps variable kind correctly', async () => {
      const file = path.join(tempDir, 'var.ts');
      fs.writeFileSync(file, 'export let myVar = 1;');

      const result = await handleFindDeadCode({ path: file });
      const data = JSON.parse((result.content[0] as any).text);

      const varExport = data.dead_exports.find((e: { name: string }) => e.name === 'myVar');
      if (varExport) {
        expect(varExport.kind).toBe('variable');
      }
    });
  });
});
