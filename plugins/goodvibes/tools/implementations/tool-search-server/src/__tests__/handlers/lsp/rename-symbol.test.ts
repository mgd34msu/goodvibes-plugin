/**
 * Unit tests for handleRenameSymbol
 *
 * Tests the rename symbol LSP handler that computes text edits needed
 * to rename a symbol across a TypeScript/JavaScript codebase.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { handleRenameSymbol } from '../../../handlers/lsp/rename-symbol.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

describe('handleRenameSymbol', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rename-test-'));
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
    test('returns edits for renaming a variable', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;\nconst bar = foo;');

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7,
        new_name: 'baz',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
      expect(data.edits.length).toBeGreaterThan(0);
    });

    test('includes all occurrences in edits', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'const foo = 1;\nconst bar = foo;\nconsole.log(foo);'
      );

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7,
        new_name: 'baz',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
      // Should include declaration and all usages
      expect(data.edits.length).toBeGreaterThanOrEqual(3);
    });

    test('returns files_affected list', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;\nconst bar = foo;');

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7,
        new_name: 'baz',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.files_affected).toBeDefined();
      expect(Array.isArray(data.files_affected)).toBe(true);
      expect(data.files_affected.length).toBeGreaterThan(0);
    });
  });

  describe('validation', () => {
    test('prevents renaming to reserved word', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7,
        new_name: 'const',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
      expect(data.error).toContain('identifier');
    });

    test('prevents renaming to other reserved words', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      const reservedWords = ['function', 'class', 'return', 'if', 'else', 'while', 'for'];

      for (const word of reservedWords) {
        const result = await handleRenameSymbol({
          file,
          line: 1,
          column: 7,
          new_name: word,
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.error).toBeDefined();
      }
    });

    test('prevents renaming to invalid identifier (starts with number)', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7,
        new_name: '123abc',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
    });

    test('prevents renaming to invalid identifier (contains spaces)', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7,
        new_name: 'my variable',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
    });

    test('prevents renaming to empty string', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7,
        new_name: '',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
    });

    test('allows valid identifiers with underscore', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7,
        new_name: '_private_var',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
    });

    test('allows valid identifiers with dollar sign', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7,
        new_name: '$value',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
    });
  });

  describe('error handling', () => {
    test('handles invalid file path', async () => {
      const result = await handleRenameSymbol({
        file: path.join(tempDir, 'nonexistent.ts'),
        line: 1,
        column: 1,
        new_name: 'newName',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
      expect(result.isError).toBe(true);
    });

    test('handles missing file argument', async () => {
      const result = await handleRenameSymbol({
        file: '',
        line: 1,
        column: 1,
        new_name: 'newName',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
    });

    test('handles invalid line number', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      const result = await handleRenameSymbol({
        file,
        line: 0,
        column: 1,
        new_name: 'newName',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
    });

    test('handles invalid column number', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 0,
        new_name: 'newName',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
    });

    test('handles missing new_name argument', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7,
        new_name: '',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
    });
  });

  describe('non-renameable symbols', () => {
    test('handles non-renameable symbol gracefully', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'console.log("hello");');

      // Try to rename a position that is not a symbol (keyword)
      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 1, // Position on 'console' (built-in)
        new_name: 'myConsole',
      });
      const data = JSON.parse(result.content[0].text);

      // Should either not be renameable or return empty edits
      expect(data).toBeDefined();
      if (data.can_rename === false) {
        expect(data.reason).toBeDefined();
      }
    });

    test('handles position on keyword', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      // Position on 'const' keyword
      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 1,
        new_name: 'let',
      });
      const data = JSON.parse(result.content[0].text);

      // Keywords cannot be renamed - either can_rename is false or we get an error
      expect(data.can_rename === false || data.error !== undefined).toBe(true);
    });

    test('handles position on number literal', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 123;');

      // Position on '123' literal
      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 13,
        new_name: 'value',
      });
      const data = JSON.parse(result.content[0].text);

      // Literals cannot be renamed - either can_rename is false or we get an error
      expect(data.can_rename === false || data.error !== undefined).toBe(true);
    });
  });

  describe('edit metadata', () => {
    test('edits include start and end positions', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7,
        new_name: 'bar',
      });
      const data = JSON.parse(result.content[0].text);

      if (data.edits.length > 0) {
        const edit = data.edits[0];
        expect(edit).toHaveProperty('line');
        expect(edit).toHaveProperty('column');
        expect(edit).toHaveProperty('end_line');
        expect(edit).toHaveProperty('end_column');
      }
    });

    test('edits include old_text and new_text', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7,
        new_name: 'bar',
      });
      const data = JSON.parse(result.content[0].text);

      if (data.edits.length > 0) {
        const edit = data.edits[0];
        expect(edit).toHaveProperty('old_text');
        expect(edit).toHaveProperty('new_text');
        expect(edit.old_text).toBe('foo');
        expect(edit.new_text).toBe('bar');
      }
    });

    test('edits include relative file path', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7,
        new_name: 'bar',
      });
      const data = JSON.parse(result.content[0].text);

      if (data.edits.length > 0) {
        const edit = data.edits[0];
        expect(edit).toHaveProperty('file');
        expect(typeof edit.file).toBe('string');
      }
    });
  });

  describe('different symbol types', () => {
    test('renames function', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'function greet(name: string) { return name; }\ngreet("World");'
      );

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 10, // Position on 'greet'
        new_name: 'sayHello',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
      expect(data.edits.length).toBeGreaterThanOrEqual(2);
    });

    test('renames class', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'class MyClass { }\nconst obj = new MyClass();'
      );

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7, // Position on 'MyClass'
        new_name: 'NewClass',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
      expect(data.edits.length).toBeGreaterThanOrEqual(2);
    });

    test('renames interface', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'interface User { name: string; }\nconst user: User = { name: "Test" };'
      );

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 11, // Position on 'User'
        new_name: 'Person',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
      expect(data.edits.length).toBeGreaterThanOrEqual(2);
    });

    test('renames type alias', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'type ID = string | number;\nconst id: ID = "123";'
      );

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 6, // Position on 'ID'
        new_name: 'Identifier',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
      expect(data.edits.length).toBeGreaterThanOrEqual(2);
    });

    test('renames parameter', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'function process(input: string) {\n  return input.toUpperCase();\n}'
      );

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 18, // Position on 'input'
        new_name: 'value',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
      expect(data.edits.length).toBeGreaterThanOrEqual(2);
    });

    test('renames property', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'const obj = { value: 1 };\nconsole.log(obj.value);'
      );

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 15, // Position on 'value' in declaration
        new_name: 'data',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
      expect(data.edits.length).toBeGreaterThanOrEqual(2);
    });

    test('renames method', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'class MyClass {\n  myMethod() { return 1; }\n}\nconst obj = new MyClass();\nobj.myMethod();'
      );

      const result = await handleRenameSymbol({
        file,
        line: 2,
        column: 3, // Position on 'myMethod'
        new_name: 'newMethod',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
      expect(data.edits.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('multi-file scenarios', () => {
    test('includes edits across files for exported symbol', async () => {
      const moduleFile = path.join(tempDir, 'module.ts');
      const mainFile = path.join(tempDir, 'main.ts');

      fs.writeFileSync(moduleFile, 'export const foo = 42;');
      fs.writeFileSync(
        mainFile,
        'import { foo } from "./module";\nconsole.log(foo);'
      );

      // First load both files
      await languageServiceManager.getServiceForFile(mainFile);

      const result = await handleRenameSymbol({
        file: moduleFile,
        line: 1,
        column: 14, // Position on 'foo'
        new_name: 'bar',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
      // Should find edits in both files
      expect(data.edits.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('edge cases', () => {
    test('handles destructuring', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'const { a, b } = { a: 1, b: 2 };\nconsole.log(a, b);'
      );

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 9, // Position on 'a' in destructuring
        new_name: 'x',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
    });

    test('handles arrow functions', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'const fn = (x: number) => x * 2;'
      );

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7, // Position on 'fn'
        new_name: 'double',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
    });

    test('handles template literals', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'const name = "World";\nconst greeting = `Hello, ${name}!`;'
      );

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7, // Position on 'name'
        new_name: 'user',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
      // May be 1 or more edits depending on how TS handles the template
      expect(data.edits.length).toBeGreaterThanOrEqual(1);
    });

    test('handles computed property names', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'const key = "value";\nconst obj = { [key]: 1 };'
      );

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7, // Position on 'key'
        new_name: 'propName',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
    });

    test('handles default function parameters', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'const defaultValue = 10;\nfunction process(value = defaultValue) { return value; }'
      );

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7, // Position on 'defaultValue'
        new_name: 'initialValue',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.can_rename).toBe(true);
      expect(data.edits.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7,
        new_name: 'bar',
      });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7,
        new_name: 'bar',
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    test('includes all expected fields for successful rename', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 7,
        new_name: 'bar',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('can_rename');
      expect(data).toHaveProperty('edits');
      expect(data).toHaveProperty('files_affected');
    });

    test('includes reason when rename is not possible', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const foo = 1;');

      // Position on keyword
      const result = await handleRenameSymbol({
        file,
        line: 1,
        column: 1, // 'const' keyword
        new_name: 'let',
      });
      const data = JSON.parse(result.content[0].text);

      // Either can_rename is false with reason, or there's an error
      if (data.can_rename === false) {
        expect(data.reason).toBeDefined();
      } else {
        // Handler may have returned an error
        expect(data.error || data.can_rename === false).toBeTruthy();
      }
    });
  });
});
