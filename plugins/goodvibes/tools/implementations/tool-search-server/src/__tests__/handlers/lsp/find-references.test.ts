/**
 * Unit tests for handleFindReferences
 *
 * Tests the find references LSP handler that locates all usages of a symbol
 * in TypeScript/JavaScript files.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { handleFindReferences } from '../../../handlers/lsp/find-references.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

describe('handleFindReferences', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-refs-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    languageServiceManager.cleanup();
  });

  describe('basic functionality', () => {
    test('returns empty array when no references found', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      // Position at a location with no symbol
      const result = await handleFindReferences({ file, line: 1, column: 1 });
      const data = JSON.parse(result.content[0].text);

      expect(data.references).toBeDefined();
      expect(Array.isArray(data.references)).toBe(true);
      expect(data.count).toBeDefined();
    });

    test('finds all references to a variable', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'const x = 1;\nconst y = x + 1;\nconsole.log(x);'
      );

      // Position on 'x' declaration at line 1, column 7
      const result = await handleFindReferences({
        file,
        line: 1,
        column: 7,
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThanOrEqual(3);
      expect(data.symbol).toBe('x');
    });

    test('respects include_definition flag', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = x;');

      // With definition
      const withDef = await handleFindReferences({
        file,
        line: 1,
        column: 7,
        include_definition: true,
      });
      const dataWith = JSON.parse(withDef.content[0].text);

      // Without definition
      const withoutDef = await handleFindReferences({
        file,
        line: 1,
        column: 7,
        include_definition: false,
      });
      const dataWithout = JSON.parse(withoutDef.content[0].text);

      expect(dataWith.count).toBeGreaterThanOrEqual(dataWithout.count);
    });

    test('includes symbol name in result', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const myVariable = 1;\nconst y = myVariable;');

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 7,
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.symbol).toBe('myVariable');
    });
  });

  describe('error handling', () => {
    test('handles invalid file path', async () => {
      const result = await handleFindReferences({
        file: path.join(tempDir, 'nonexistent.ts'),
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
      expect(result.isError).toBe(true);
    });

    test('handles missing file argument', async () => {
      const result = await handleFindReferences({
        file: '',
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
      expect(result.isError).toBe(true);
    });

    test('handles invalid line number (zero)', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleFindReferences({ file, line: 0, column: 1 });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
      expect(result.isError).toBe(true);
    });

    test('handles invalid line number (negative)', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleFindReferences({ file, line: -1, column: 1 });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
    });

    test('handles invalid column number (zero)', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleFindReferences({ file, line: 1, column: 0 });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
    });

    test('handles invalid column number (negative)', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleFindReferences({ file, line: 1, column: -1 });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
    });
  });

  describe('reference metadata', () => {
    test('includes file, line, column in references', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = x;');

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 7,
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.references.length > 0) {
        const ref = data.references[0];
        expect(ref).toHaveProperty('file');
        expect(ref).toHaveProperty('line');
        expect(ref).toHaveProperty('column');
        expect(typeof ref.line).toBe('number');
        expect(typeof ref.column).toBe('number');
      }
    });

    test('includes preview of reference line', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = x + 2;');

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 7,
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.references.length > 0) {
        const ref = data.references[0];
        expect(ref).toHaveProperty('preview');
        expect(typeof ref.preview).toBe('string');
      }
    });

    test('includes is_definition flag', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = x;');

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 7,
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.references.length > 0) {
        const ref = data.references[0];
        expect(ref).toHaveProperty('is_definition');
        expect(typeof ref.is_definition).toBe('boolean');
      }
    });

    test('includes is_write flag', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'let x = 1;\nx = 2;\nconst y = x;');

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 5,
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.references.length > 0) {
        const ref = data.references[0];
        expect(ref).toHaveProperty('is_write');
        expect(typeof ref.is_write).toBe('boolean');
      }
    });
  });

  describe('multi-file scenarios', () => {
    test('finds references across multiple files', async () => {
      const moduleFile = path.join(tempDir, 'module.ts');
      const mainFile = path.join(tempDir, 'main.ts');

      fs.writeFileSync(moduleFile, 'export const foo = 42;');
      fs.writeFileSync(
        mainFile,
        'import { foo } from "./module";\nconsole.log(foo);'
      );

      // First get service for main file to load both
      const result = await handleFindReferences({
        file: moduleFile,
        line: 1,
        column: 14, // Position on 'foo'
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      // Should find at least the definition
      expect(data.count).toBeGreaterThanOrEqual(1);
    });

    test('handles type references', async () => {
      const typesFile = path.join(tempDir, 'types.ts');
      const mainFile = path.join(tempDir, 'main.ts');

      fs.writeFileSync(
        typesFile,
        'export interface User {\n  id: string;\n  name: string;\n}'
      );
      fs.writeFileSync(
        mainFile,
        'import type { User } from "./types";\nconst user: User = { id: "1", name: "Test" };'
      );

      const result = await handleFindReferences({
        file: typesFile,
        line: 1,
        column: 18, // Position on 'User'
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('different symbol types', () => {
    test('finds function references', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'function greet(name: string) { return `Hello, ${name}`; }\ngreet("World");\ngreet("TypeScript");'
      );

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 10, // Position on 'greet'
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThanOrEqual(3);
      expect(data.symbol).toBe('greet');
    });

    test('finds class references', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'class MyClass { }\nconst a = new MyClass();\nconst b: MyClass = new MyClass();'
      );

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 7, // Position on 'MyClass'
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThanOrEqual(3);
      expect(data.symbol).toBe('MyClass');
    });

    test('finds interface references', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'interface User { name: string; }\nconst user: User = { name: "Test" };\nfunction getUser(): User { return user; }'
      );

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 11, // Position on 'User'
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThanOrEqual(3);
      expect(data.symbol).toBe('User');
    });

    test('finds parameter references', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'function process(input: string) {\n  console.log(input);\n  return input.toUpperCase();\n}'
      );

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 18, // Position on 'input'
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThanOrEqual(3);
      expect(data.symbol).toBe('input');
    });

    test('finds property references', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'const obj = { value: 1 };\nobj.value = 2;\nconsole.log(obj.value);'
      );

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 15, // Position on 'value'
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThanOrEqual(3);
    });

    test('finds type alias references', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'type ID = string | number;\nconst id1: ID = "abc";\nconst id2: ID = 123;'
      );

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 6, // Position on 'ID'
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThanOrEqual(3);
      expect(data.symbol).toBe('ID');
    });

    test('finds enum references', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'enum Color { Red, Green, Blue }\nconst c: Color = Color.Red;\nfunction paint(color: Color) { }'
      );

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 6, // Position on 'Color'
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThanOrEqual(3);
    });
  });

  describe('sorting and ordering', () => {
    test('sorts references by file, line, column', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'const x = 1;\nconst y = x;\nconst z = x;\nconst w = x;'
      );

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 7,
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.references.length > 1) {
        for (let i = 1; i < data.references.length; i++) {
          const prev = data.references[i - 1];
          const curr = data.references[i];

          // Compare file first
          const fileCompare = prev.file.localeCompare(curr.file);
          if (fileCompare === 0) {
            // Same file, compare line
            if (prev.line === curr.line) {
              // Same line, compare column
              expect(prev.column).toBeLessThanOrEqual(curr.column);
            } else {
              expect(prev.line).toBeLessThanOrEqual(curr.line);
            }
          } else {
            expect(fileCompare).toBeLessThanOrEqual(0);
          }
        }
      }
    });
  });

  describe('edge cases', () => {
    test('handles empty file', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, '');

      const result = await handleFindReferences({ file, line: 1, column: 1 });
      const data = JSON.parse(result.content[0].text);

      // Should either return empty or error, not crash
      expect(data).toBeDefined();
    });

    test('handles position at end of file', async () => {
      const file = path.join(tempDir, 'test.ts');
      const content = 'const x = 1;';
      fs.writeFileSync(file, content);

      const result = await handleFindReferences({
        file,
        line: 1,
        column: content.length + 1,
      });
      const data = JSON.parse(result.content[0].text);

      // Should handle gracefully
      expect(data).toBeDefined();
    });

    test('handles position past end of line', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleFindReferences({ file, line: 1, column: 100 });
      const data = JSON.parse(result.content[0].text);

      // Should handle gracefully, either with error or empty result
      expect(data).toBeDefined();
    });

    test('handles very long variable names', async () => {
      const file = path.join(tempDir, 'test.ts');
      const longName = 'x'.repeat(100);
      fs.writeFileSync(file, `const ${longName} = 1;\nconst y = ${longName};`);

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 7,
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.symbol).toBe(longName);
      expect(data.count).toBeGreaterThanOrEqual(2);
    });

    test('handles unicode identifiers', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const \u03B1 = 1;\nconst \u03B2 = \u03B1 + 1;');

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 7, // Position on alpha
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThanOrEqual(2);
    });

    test('handles file with only comments', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, '// This is a comment\n/* Multi-line comment */');

      const result = await handleFindReferences({ file, line: 1, column: 5 });
      const data = JSON.parse(result.content[0].text);

      // Should return empty references or handle gracefully
      expect(data).toBeDefined();
      expect(data.references).toBeDefined();
    });

    test('handles destructuring', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'const { a, b } = { a: 1, b: 2 };\nconsole.log(a, b);'
      );

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 9, // Position on 'a' in destructuring
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThanOrEqual(1);
    });

    test('handles arrow functions', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'const fn = (x: number) => x * 2;\nfn(5);\nfn(10);'
      );

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 7, // Position on 'fn'
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThanOrEqual(3);
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleFindReferences({ file, line: 1, column: 7 });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleFindReferences({ file, line: 1, column: 7 });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    test('includes count in response', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleFindReferences({
        file,
        line: 1,
        column: 7,
        include_definition: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('count');
      expect(typeof data.count).toBe('number');
      expect(data.count).toBe(data.references.length);
    });
  });
});
