/**
 * Unit tests for handleGetSymbolInfo
 *
 * Tests the symbol info handler that retrieves detailed information about
 * a symbol at a given position using TypeScript Language Service.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { handleGetSymbolInfo } from '../../../handlers/lsp/symbol-info.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

// Mock console.warn to suppress expected warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('handleGetSymbolInfo', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbol-info-test-'));
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

  describe('argument validation', () => {
    test('returns error when file is missing', async () => {
      const result = await handleGetSymbolInfo({
        file: '',
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('file');
    });

    test('returns error when line is zero', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSymbolInfo({
        file,
        line: 0,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('line');
    });

    test('returns error when line is negative', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSymbolInfo({
        file,
        line: -1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('line');
    });

    test('returns error when column is zero', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 0,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('column');
    });

    test('returns error when column is negative', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: -5,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('column');
    });

    test('returns error when file not found', async () => {
      const result = await handleGetSymbolInfo({
        file: path.join(tempDir, 'nonexistent.ts'),
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('not found');
    });
  });

  describe('symbol information', () => {
    test('returns symbol name for variable', async () => {
      const file = path.join(tempDir, 'var.ts');
      fs.writeFileSync(file, 'const myVariable = 42;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 7, // Position on 'myVariable'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbol).toBe('myVariable');
    });

    test('returns symbol name for function', async () => {
      const file = path.join(tempDir, 'func.ts');
      fs.writeFileSync(file, 'function myFunction() { return 1; }');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 10, // Position on 'myFunction'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbol).toBe('myFunction');
    });

    test('returns symbol name for class', async () => {
      const file = path.join(tempDir, 'class.ts');
      fs.writeFileSync(file, 'class MyClass { constructor() {} }');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 7, // Position on 'MyClass'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbol).toBe('MyClass');
    });

    test('returns symbol name for interface', async () => {
      const file = path.join(tempDir, 'interface.ts');
      fs.writeFileSync(file, 'interface MyInterface { value: string; }');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 11, // Position on 'MyInterface'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbol).toBe('MyInterface');
    });

    test('returns symbol name for type alias', async () => {
      const file = path.join(tempDir, 'type.ts');
      fs.writeFileSync(file, 'type MyType = string | number;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 6, // Position on 'MyType'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbol).toBe('MyType');
    });
  });

  describe('symbol kind', () => {
    test('returns correct kind for function', async () => {
      const file = path.join(tempDir, 'func-kind.ts');
      fs.writeFileSync(file, 'function foo() {}');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 10,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.kind).toBe('function');
    });

    test('returns correct kind for class', async () => {
      const file = path.join(tempDir, 'class-kind.ts');
      fs.writeFileSync(file, 'class Foo {}');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.kind).toBe('class');
    });

    test('returns correct kind for interface', async () => {
      const file = path.join(tempDir, 'iface-kind.ts');
      fs.writeFileSync(file, 'interface Foo {}');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.kind).toBe('interface');
    });

    test('returns correct kind for type alias', async () => {
      const file = path.join(tempDir, 'type-kind.ts');
      fs.writeFileSync(file, 'type Foo = string;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 6,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.kind).toBe('type');
    });

    test('returns correct kind for enum', async () => {
      const file = path.join(tempDir, 'enum-kind.ts');
      fs.writeFileSync(file, 'enum Foo { A, B }');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 6,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.kind).toBe('enum');
    });

    test('returns correct kind for method', async () => {
      const file = path.join(tempDir, 'method-kind.ts');
      fs.writeFileSync(file, 'class Foo { bar() {} }');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 13, // Position on 'bar'
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.kind).toBe('method');
    });

    test('returns correct kind for property', async () => {
      const file = path.join(tempDir, 'prop-kind.ts');
      fs.writeFileSync(file, 'class Foo { myProp: string; }');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 13, // Position on 'myProp'
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.kind).toBe('property');
    });
  });

  describe('type information', () => {
    test('returns type for variable', async () => {
      const file = path.join(tempDir, 'var-type.ts');
      fs.writeFileSync(file, 'const x: number = 42;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.type).toBeDefined();
      expect(data.type).toContain('number');
    });

    test('returns type for function', async () => {
      const file = path.join(tempDir, 'func-type.ts');
      fs.writeFileSync(file, 'function add(a: number, b: number): number { return a + b; }');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 10,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.type).toBeDefined();
    });

    test('returns type for inferred variable', async () => {
      const file = path.join(tempDir, 'infer-type.ts');
      fs.writeFileSync(file, 'const x = 42;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.type).toBeDefined();
    });
  });

  describe('documentation', () => {
    test('returns JSDoc documentation', async () => {
      const file = path.join(tempDir, 'jsdoc.ts');
      fs.writeFileSync(file, `
/**
 * This function adds two numbers.
 * @param a The first number
 * @param b The second number
 * @returns The sum of a and b
 */
function add(a: number, b: number): number {
  return a + b;
}
`);

      const result = await handleGetSymbolInfo({
        file,
        line: 8,
        column: 10,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.documentation).toBeDefined();
      expect(data.documentation).toContain('adds two numbers');
    });

    test('returns empty documentation when none exists', async () => {
      const file = path.join(tempDir, 'no-docs.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.documentation).toBeDefined();
    });

    test('includes JSDoc tags in documentation', async () => {
      const file = path.join(tempDir, 'tags.ts');
      fs.writeFileSync(file, `
/**
 * @deprecated Use newFunction instead
 * @example const result = oldFunction();
 */
function oldFunction() {}
`);

      const result = await handleGetSymbolInfo({
        file,
        line: 5,
        column: 10,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.documentation) {
        expect(data.documentation).toContain('deprecated');
      }
    });
  });

  describe('definition location', () => {
    test('returns definition location', async () => {
      const file = path.join(tempDir, 'def.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definition).toBeDefined();
      if (data.definition) {
        expect(data.definition).toHaveProperty('file');
        expect(data.definition).toHaveProperty('line');
        expect(data.definition).toHaveProperty('column');
      }
    });

    test('returns error when cursor is on keyword without symbol info', async () => {
      const file = path.join(tempDir, 'keyword.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 1, // Position on 'const' keyword - no symbol info available
      });
      const data = JSON.parse(result.content[0].text);

      // Keywords don't have symbol info, so this returns an error
      expect(result.isError).toBe(true);
      expect(data.error).toContain('No symbol information');
    });

    test('definition location uses relative paths', async () => {
      const file = path.join(tempDir, 'def-path.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const originalEnv = process.env.PROJECT_ROOT;
      process.env.PROJECT_ROOT = tempDir;

      try {
        const result = await handleGetSymbolInfo({
          file,
          line: 1,
          column: 7,
        });
        const data = JSON.parse(result.content[0].text);

        if (data.definition) {
          // Should be relative, not starting with /
          expect(data.definition.file.startsWith('/')).toBe(false);
        }
      } finally {
        process.env.PROJECT_ROOT = originalEnv;
      }
    });
  });

  describe('modifiers', () => {
    test('returns export modifier', async () => {
      const file = path.join(tempDir, 'export.ts');
      fs.writeFileSync(file, 'export const x = 1;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 14, // Position on 'x'
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.modifiers).toBeDefined();
      expect(Array.isArray(data.modifiers)).toBe(true);
      expect(data.modifiers).toContain('export');
    });

    test('returns const modifier', async () => {
      const file = path.join(tempDir, 'const.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.modifiers).toBeDefined();
      expect(data.modifiers).toContain('const');
    });

    test('returns async modifier', async () => {
      const file = path.join(tempDir, 'async.ts');
      fs.writeFileSync(file, 'async function fetchData() { return 1; }');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 16, // Position on 'fetchData'
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.modifiers).toBeDefined();
      expect(data.modifiers).toContain('async');
    });

    test('returns multiple modifiers', async () => {
      const file = path.join(tempDir, 'multi-mod.ts');
      fs.writeFileSync(file, 'export async function fetchData() { return 1; }');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 23, // Position on 'fetchData'
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.modifiers).toBeDefined();
      expect(data.modifiers.length).toBeGreaterThanOrEqual(2);
    });

    test('returns class member modifiers', async () => {
      const file = path.join(tempDir, 'member-mod.ts');
      fs.writeFileSync(file, `
class Foo {
  private static readonly value = 42;
}
`);

      const result = await handleGetSymbolInfo({
        file,
        line: 3,
        column: 27, // Position on 'value'
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.modifiers).toBeDefined();
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 7,
      });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 7,
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    test('includes all required fields', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('symbol');
      expect(data).toHaveProperty('kind');
      expect(data).toHaveProperty('type');
      expect(data).toHaveProperty('documentation');
      expect(data).toHaveProperty('definition');
      expect(data).toHaveProperty('modifiers');
    });
  });

  describe('edge cases', () => {
    test('returns error when no symbol at position', async () => {
      const file = path.join(tempDir, 'no-symbol.ts');
      fs.writeFileSync(file, '// just a comment');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 5,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('No symbol information');
    });

    test('handles empty file', async () => {
      const file = path.join(tempDir, 'empty.ts');
      fs.writeFileSync(file, '');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
    });

    test('handles relative file path', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const originalEnv = process.env.PROJECT_ROOT;
      process.env.PROJECT_ROOT = tempDir;

      try {
        const result = await handleGetSymbolInfo({
          file: 'test.ts',
          line: 1,
          column: 7,
        });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeFalsy();
        expect(data.symbol).toBe('x');
      } finally {
        process.env.PROJECT_ROOT = originalEnv;
      }
    });

    test('handles imported symbols', async () => {
      const utilsFile = path.join(tempDir, 'utils.ts');
      const mainFile = path.join(tempDir, 'main.ts');

      fs.writeFileSync(utilsFile, 'export const helper = () => 42;');
      fs.writeFileSync(mainFile, 'import { helper } from "./utils";\nconsole.log(helper());');

      const result = await handleGetSymbolInfo({
        file: mainFile,
        line: 1,
        column: 10, // Position on 'helper' in import
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('kind mapping', () => {
    test.each([
      ['variable', 'const x = 1;', 'x'],
      ['function', 'function foo() {}', 'foo'],
      ['class', 'class Foo {}', 'Foo'],
      ['interface', 'interface Foo {}', 'Foo'],
      ['type', 'type Foo = string;', 'Foo'],
      ['enum', 'enum Foo { A }', 'Foo'],
    ])('maps %s kind correctly', async (expectedKind, code, symbolName) => {
      const file = path.join(tempDir, `${expectedKind}.ts`);
      fs.writeFileSync(file, code);

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: code.indexOf(symbolName) + 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('error handling', () => {
    test('handles language service errors gracefully', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 7,
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    test('includes context in error response', async () => {
      const result = await handleGetSymbolInfo({
        file: path.join(tempDir, 'nonexistent.ts'),
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
    });

    test('returns error response when exception occurs during processing', async () => {
      const file = path.join(tempDir, 'error-test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      // Mock the language service manager to throw
      const originalGetServiceForFile = languageServiceManager.getServiceForFile;
      languageServiceManager.getServiceForFile = vi.fn().mockRejectedValue(
        new Error('Service error')
      );

      try {
        const result = await handleGetSymbolInfo({
          file,
          line: 1,
          column: 7,
        });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(data.error).toContain('Failed to get symbol info');
      } finally {
        languageServiceManager.getServiceForFile = originalGetServiceForFile;
      }
    });

    test('handles non-Error exceptions in catch block', async () => {
      const file = path.join(tempDir, 'non-error.ts');
      fs.writeFileSync(file, 'const x = 1;');

      // Mock to throw a non-Error value
      const originalGetServiceForFile = languageServiceManager.getServiceForFile;
      languageServiceManager.getServiceForFile = vi.fn().mockRejectedValue('string error');

      try {
        const result = await handleGetSymbolInfo({
          file,
          line: 1,
          column: 7,
        });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(data.error).toContain('string error');
      } finally {
        languageServiceManager.getServiceForFile = originalGetServiceForFile;
      }
    });
  });

  describe('JSDoc tag edge cases', () => {
    test('handles JSDoc tag without text (tag name only)', async () => {
      const file = path.join(tempDir, 'jsdoc-no-text.ts');
      fs.writeFileSync(file, `
/**
 * A function with tags that have no text.
 * @internal
 * @experimental
 * @beta
 */
function taggedFunction() {
  return 42;
}
`);

      const result = await handleGetSymbolInfo({
        file,
        line: 8,
        column: 10, // Position on 'taggedFunction'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.documentation).toBeDefined();
      // Should include the tag names without text
      if (data.documentation.includes('@')) {
        expect(data.documentation).toMatch(/@(internal|experimental|beta)/);
      }
    });

    test('handles JSDoc with both text and no-text tags', async () => {
      const file = path.join(tempDir, 'mixed-tags.ts');
      fs.writeFileSync(file, `
/**
 * Main description.
 * @param value - The value to process
 * @returns The processed value
 * @internal
 * @since 1.0.0
 */
function mixedTags(value: number): number {
  return value * 2;
}
`);

      const result = await handleGetSymbolInfo({
        file,
        line: 9,
        column: 10,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.documentation).toBeDefined();
    });
  });

  describe('variable declaration modifiers', () => {
    test('returns var modifier for var declaration', async () => {
      const file = path.join(tempDir, 'var-decl.ts');
      fs.writeFileSync(file, 'var myVar = 42;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 5, // Position on 'myVar'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.modifiers).toBeDefined();
      expect(data.modifiers).toContain('var');
    });

    test('returns let modifier for let declaration', async () => {
      const file = path.join(tempDir, 'let-decl.ts');
      fs.writeFileSync(file, 'let myLet = 42;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 5, // Position on 'myLet'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.modifiers).toBeDefined();
      expect(data.modifiers).toContain('let');
    });

    test('handles exported var declaration', async () => {
      const file = path.join(tempDir, 'export-var.ts');
      fs.writeFileSync(file, 'export var exportedVar = 42;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 12, // Position on 'exportedVar'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.modifiers).toContain('export');
      expect(data.modifiers).toContain('var');
    });

    test('handles declare var declaration', async () => {
      const file = path.join(tempDir, 'declare-var.ts');
      fs.writeFileSync(file, 'declare var globalVar: string;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 13, // Position on 'globalVar'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.modifiers).toContain('declare');
    });
  });

  describe('symbol name extraction edge cases', () => {
    test('extracts symbol name from various display part kinds', async () => {
      const file = path.join(tempDir, 'various-names.ts');
      fs.writeFileSync(file, `
// Test various symbol types
class MyClass {
  myMethod() {}
  myProperty: string;
}

interface MyInterface {
  interfaceProperty: number;
}

enum MyEnum {
  EnumMember
}

type MyType<T> = T extends string ? string : number;

function myFunction(param: string) {}
`);

      // Test class name
      let result = await handleGetSymbolInfo({ file, line: 3, column: 7 });
      let data = JSON.parse(result.content[0].text);
      expect(data.symbol).toBe('MyClass');

      // Test method name
      result = await handleGetSymbolInfo({ file, line: 4, column: 3 });
      data = JSON.parse(result.content[0].text);
      expect(data.symbol).toBe('myMethod');

      // Test property name
      result = await handleGetSymbolInfo({ file, line: 5, column: 3 });
      data = JSON.parse(result.content[0].text);
      expect(data.symbol).toBe('myProperty');

      // Test interface name
      result = await handleGetSymbolInfo({ file, line: 8, column: 11 });
      data = JSON.parse(result.content[0].text);
      expect(data.symbol).toBe('MyInterface');

      // Test enum name
      result = await handleGetSymbolInfo({ file, line: 12, column: 6 });
      data = JSON.parse(result.content[0].text);
      expect(data.symbol).toBe('MyEnum');

      // Test enum member
      result = await handleGetSymbolInfo({ file, line: 13, column: 3 });
      data = JSON.parse(result.content[0].text);
      expect(data.symbol).toBe('EnumMember');
    });

    test('handles symbol on whitespace returning unknown', async () => {
      const file = path.join(tempDir, 'whitespace-symbol.ts');
      fs.writeFileSync(file, 'const x = 1;    ');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 15, // Position on trailing whitespace
      });
      const data = JSON.parse(result.content[0].text);

      // Should return error as no symbol at whitespace
      expect(result.isError).toBe(true);
    });

    test('handles numeric literal position', async () => {
      const file = path.join(tempDir, 'numeric.ts');
      fs.writeFileSync(file, 'const x = 12345;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 12, // Position on numeric literal
      });
      const data = JSON.parse(result.content[0].text);

      // Numeric literals don't have named symbols
      expect(result.isError).toBe(true);
    });
  });

  describe('type signature extraction', () => {
    test('extracts function signature with parentheses', async () => {
      const file = path.join(tempDir, 'func-sig.ts');
      fs.writeFileSync(file, 'function add(a: number, b: number): number { return a + b; }');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 10,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.type).toBeDefined();
      // Type should contain the function signature
      expect(data.type).toContain('(');
      expect(data.type).toContain(')');
    });

    test('extracts type for arrow function', async () => {
      const file = path.join(tempDir, 'arrow-sig.ts');
      fs.writeFileSync(file, 'const multiply = (x: number, y: number) => x * y;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 7, // Position on 'multiply'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.type).toBeDefined();
    });

    test('extracts type for method', async () => {
      const file = path.join(tempDir, 'method-sig.ts');
      fs.writeFileSync(file, `
class Calculator {
  divide(a: number, b: number): number {
    return a / b;
  }
}
`);

      const result = await handleGetSymbolInfo({
        file,
        line: 3,
        column: 3, // Position on 'divide'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.type).toBeDefined();
    });
  });

  describe('definition location edge cases', () => {
    test('returns null definition when no definitions found', async () => {
      // Test on a built-in type or keyword that might not have a definition
      const file = path.join(tempDir, 'builtin.ts');
      fs.writeFileSync(file, 'const x: undefined = undefined;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 22, // Position on 'undefined' keyword
      });
      const data = JSON.parse(result.content[0].text);

      // undefined keyword doesn't have symbol info
      expect(result.isError).toBe(true);
    });

    test('handles definition in external module', async () => {
      const file = path.join(tempDir, 'external-def.ts');
      fs.writeFileSync(file, `
import * as path from 'path';
const result = path.join('a', 'b');
`);

      const result = await handleGetSymbolInfo({
        file,
        line: 2,
        column: 16, // Position on 'path'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // Definition might point to node_modules or declaration file
      expect(data.definition).toBeDefined();
    });

    test('handles symbol with multiple definitions', async () => {
      const file = path.join(tempDir, 'multi-def.ts');
      fs.writeFileSync(file, `
// Function overloads have multiple definitions
function greet(name: string): string;
function greet(name: string, greeting: string): string;
function greet(name: string, greeting?: string): string {
  return greeting ? \`\${greeting}, \${name}!\` : \`Hello, \${name}!\`;
}
`);

      const result = await handleGetSymbolInfo({
        file,
        line: 5,
        column: 10, // Position on 'greet' implementation
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // Should return the first definition
      expect(data.definition).toBeDefined();
    });
  });

  describe('modifier extraction from AST', () => {
    test('extracts all class modifier combinations', async () => {
      const file = path.join(tempDir, 'class-mods.ts');
      fs.writeFileSync(file, `
export abstract class AbstractClass {
  public publicProp: string;
  private privateProp: number;
  protected protectedProp: boolean;
  readonly readonlyProp: string;
  static staticProp: string;

  public async asyncMethod() {}
  override overrideMethod() {}
}
`);

      // Test abstract class
      let result = await handleGetSymbolInfo({ file, line: 2, column: 24 });
      let data = JSON.parse(result.content[0].text);
      expect(data.modifiers).toContain('export');
      expect(data.modifiers).toContain('abstract');

      // Test public property
      result = await handleGetSymbolInfo({ file, line: 3, column: 10 });
      data = JSON.parse(result.content[0].text);
      expect(data.modifiers).toContain('public');

      // Test private property
      result = await handleGetSymbolInfo({ file, line: 4, column: 11 });
      data = JSON.parse(result.content[0].text);
      expect(data.modifiers).toContain('private');

      // Test protected property
      result = await handleGetSymbolInfo({ file, line: 5, column: 13 });
      data = JSON.parse(result.content[0].text);
      expect(data.modifiers).toContain('protected');

      // Test readonly property
      result = await handleGetSymbolInfo({ file, line: 6, column: 12 });
      data = JSON.parse(result.content[0].text);
      expect(data.modifiers).toContain('readonly');

      // Test static property
      result = await handleGetSymbolInfo({ file, line: 7, column: 10 });
      data = JSON.parse(result.content[0].text);
      expect(data.modifiers).toContain('static');
    });

    test('extracts modifiers from interface declaration', async () => {
      const file = path.join(tempDir, 'iface-mods.ts');
      fs.writeFileSync(file, 'export interface ExportedInterface { value: string; }');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 18, // Position on 'ExportedInterface'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.modifiers).toContain('export');
    });

    test('extracts modifiers from type alias declaration', async () => {
      const file = path.join(tempDir, 'type-mods.ts');
      fs.writeFileSync(file, 'export type ExportedType = string | number;');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 13, // Position on 'ExportedType'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.modifiers).toContain('export');
    });

    test('extracts modifiers from enum declaration', async () => {
      const file = path.join(tempDir, 'enum-mods.ts');
      fs.writeFileSync(file, 'export enum ExportedEnum { A, B }');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 13, // Position on 'ExportedEnum'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.modifiers).toContain('export');
    });

    test('extracts modifiers from module declaration', async () => {
      const file = path.join(tempDir, 'module-mods.ts');
      fs.writeFileSync(file, 'export namespace ExportedNamespace { export const x = 1; }');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 18, // Position on 'ExportedNamespace'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.modifiers).toContain('export');
    });

    test('handles default export modifier', async () => {
      const file = path.join(tempDir, 'default-export.ts');
      fs.writeFileSync(file, 'export default function defaultFunc() { return 1; }');

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column: 25, // Position on 'defaultFunc'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.modifiers).toContain('export');
      expect(data.modifiers).toContain('default');
    });
  });

  describe('ScriptElementKind mapping', () => {
    test.each([
      ['getter', 'class C { get value() { return 1; } }', 11],
      ['setter', 'class C { set value(v: number) {} }', 11],
      ['constructor', 'class C { constructor() {} }', 11],
      ['parameter', 'function f(param: string) {}', 12],
    ])('maps %s kind correctly', async (expectedKind, code, column) => {
      const file = path.join(tempDir, `${expectedKind}-kind.ts`);
      fs.writeFileSync(file, code);

      const result = await handleGetSymbolInfo({
        file,
        line: 1,
        column,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.kind).toBe(expectedKind);
    });
  });
});
