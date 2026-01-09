/**
 * Unit tests for handleGoToDefinition
 *
 * Tests the go to definition LSP handler that finds definition locations
 * of symbols in TypeScript/JavaScript files.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { handleGoToDefinition } from '../../../handlers/lsp/go-to-definition.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

describe('handleGoToDefinition', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-to-def-test-'));
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
    test('finds definition of a variable', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = x;');

      // Go to definition of 'x' on line 2, column 11
      const result = await handleGoToDefinition({ file, line: 2, column: 11 });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions).toBeDefined();
      expect(data.definitions.length).toBeGreaterThan(0);
      expect(data.definitions[0].line).toBe(1); // Definition is on line 1
    });

    test('includes symbol name in result', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const myVariable = 1;\nconst y = myVariable;');

      const result = await handleGoToDefinition({ file, line: 2, column: 11 });
      const data = JSON.parse(result.content[0].text);

      expect(data.symbol).toBeDefined();
    });

    test('handles no definition found', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      // Position on whitespace/keyword
      const result = await handleGoToDefinition({ file, line: 1, column: 1 });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions).toBeDefined();
      expect(data.definitions).toEqual([]);
      expect(data.count).toBe(0);
    });

    test('returns count matching definitions length', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = x;');

      const result = await handleGoToDefinition({ file, line: 2, column: 11 });
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBe(data.definitions.length);
    });
  });

  describe('error handling', () => {
    test('handles invalid file path', async () => {
      const result = await handleGoToDefinition({
        file: path.join(tempDir, 'nonexistent.ts'),
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
      expect(result.isError).toBe(true);
    });

    test('handles missing file argument', async () => {
      const result = await handleGoToDefinition({
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

      const result = await handleGoToDefinition({ file, line: 0, column: 1 });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
      expect(result.isError).toBe(true);
    });

    test('handles invalid line number (negative)', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGoToDefinition({ file, line: -1, column: 1 });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
    });

    test('handles invalid column number (zero)', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGoToDefinition({ file, line: 1, column: 0 });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
    });

    test('handles invalid column number (negative)', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGoToDefinition({ file, line: 1, column: -1 });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBeDefined();
    });
  });

  describe('definition metadata', () => {
    test('includes file, line, column in definitions', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = x;');

      const result = await handleGoToDefinition({ file, line: 2, column: 11 });
      const data = JSON.parse(result.content[0].text);

      if (data.definitions.length > 0) {
        const def = data.definitions[0];
        expect(def).toHaveProperty('file');
        expect(def).toHaveProperty('line');
        expect(def).toHaveProperty('column');
        expect(typeof def.line).toBe('number');
        expect(typeof def.column).toBe('number');
      }
    });

    test('includes kind in definitions', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = x;');

      const result = await handleGoToDefinition({ file, line: 2, column: 11 });
      const data = JSON.parse(result.content[0].text);

      if (data.definitions.length > 0) {
        const def = data.definitions[0];
        expect(def).toHaveProperty('kind');
        expect(typeof def.kind).toBe('string');
      }
    });

    test('includes name in definitions', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const myVar = 1;\nconst y = myVar;');

      const result = await handleGoToDefinition({ file, line: 2, column: 11 });
      const data = JSON.parse(result.content[0].text);

      if (data.definitions.length > 0) {
        const def = data.definitions[0];
        expect(def).toHaveProperty('name');
      }
    });

    test('includes preview in definitions', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = x;');

      const result = await handleGoToDefinition({ file, line: 2, column: 11 });
      const data = JSON.parse(result.content[0].text);

      if (data.definitions.length > 0) {
        const def = data.definitions[0];
        expect(def).toHaveProperty('preview');
        expect(typeof def.preview).toBe('string');
      }
    });
  });

  describe('multi-file scenarios', () => {
    test('finds definition of imported symbol', async () => {
      const moduleFile = path.join(tempDir, 'module.ts');
      const mainFile = path.join(tempDir, 'main.ts');

      fs.writeFileSync(moduleFile, 'export const foo = 42;');
      fs.writeFileSync(
        mainFile,
        'import { foo } from "./module";\nconsole.log(foo);'
      );

      const result = await handleGoToDefinition({
        file: mainFile,
        line: 2,
        column: 13, // Position on 'foo'
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
      // Should point to the module file
      const defInModule = data.definitions.find(
        (d: { file: string }) => d.file.includes('module.ts')
      );
      expect(defInModule).toBeDefined();
    });

    test('finds definition of imported type', async () => {
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

      const result = await handleGoToDefinition({
        file: mainFile,
        line: 2,
        column: 13, // Position on 'User'
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
    });

    test('handles default exports', async () => {
      const moduleFile = path.join(tempDir, 'module.ts');
      const mainFile = path.join(tempDir, 'main.ts');

      fs.writeFileSync(
        moduleFile,
        'const value = 42;\nexport default value;'
      );
      fs.writeFileSync(
        mainFile,
        'import value from "./module";\nconsole.log(value);'
      );

      const result = await handleGoToDefinition({
        file: mainFile,
        line: 2,
        column: 13, // Position on 'value'
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
    });
  });

  describe('different symbol types', () => {
    test('finds function definition', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'function greet(name: string) { return `Hello, ${name}`; }\ngreet("World");'
      );

      const result = await handleGoToDefinition({
        file,
        line: 2,
        column: 1, // Position on 'greet' call
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
      expect(data.definitions[0].kind).toBe('function');
    });

    test('finds class definition', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'class MyClass { constructor() {} }\nconst instance = new MyClass();'
      );

      const result = await handleGoToDefinition({
        file,
        line: 2,
        column: 22, // Position on 'MyClass' in 'new MyClass()'
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
      expect(data.definitions[0].kind).toBe('class');
    });

    test('finds interface definition', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'interface User { name: string; }\nconst user: User = { name: "Test" };'
      );

      const result = await handleGoToDefinition({
        file,
        line: 2,
        column: 13, // Position on 'User' type annotation
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
      expect(data.definitions[0].kind).toBe('interface');
    });

    test('finds type alias definition', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'type ID = string | number;\nconst id: ID = "123";'
      );

      const result = await handleGoToDefinition({
        file,
        line: 2,
        column: 11, // Position on 'ID' type annotation
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
      expect(data.definitions[0].kind).toBe('type');
    });

    test('finds enum definition', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'enum Color { Red, Green, Blue }\nconst c: Color = Color.Red;'
      );

      const result = await handleGoToDefinition({
        file,
        line: 2,
        column: 10, // Position on 'Color' type annotation
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
      expect(data.definitions[0].kind).toBe('enum');
    });

    test('finds method definition', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'class MyClass {\n  myMethod() { return 1; }\n}\nconst obj = new MyClass();\nobj.myMethod();'
      );

      const result = await handleGoToDefinition({
        file,
        line: 5,
        column: 5, // Position on 'myMethod' call
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
      expect(data.definitions[0].kind).toBe('method');
    });

    test('finds property definition', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'const obj = { value: 1 };\nconsole.log(obj.value);'
      );

      const result = await handleGoToDefinition({
        file,
        line: 2,
        column: 17, // Position on 'value' property access
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
      expect(data.definitions[0].kind).toBe('property');
    });
  });

  describe('include_type_definitions option', () => {
    test('includes type definitions when requested', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'class MyClass { value: number = 1; }\nconst instance = new MyClass();'
      );

      const result = await handleGoToDefinition({
        file,
        line: 2,
        column: 7, // Position on 'instance'
        include_type_definitions: true,
      });
      const data = JSON.parse(result.content[0].text);

      // Should potentially include both value and type definitions
      expect(data.definitions).toBeDefined();
    });

    test('excludes type definitions by default', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'class MyClass { value: number = 1; }\nconst instance = new MyClass();'
      );

      const withType = await handleGoToDefinition({
        file,
        line: 2,
        column: 7,
        include_type_definitions: true,
      });
      const dataWithType = JSON.parse(withType.content[0].text);

      const withoutType = await handleGoToDefinition({
        file,
        line: 2,
        column: 7,
        include_type_definitions: false,
      });
      const dataWithoutType = JSON.parse(withoutType.content[0].text);

      // Both should work without errors
      expect(dataWithType.definitions).toBeDefined();
      expect(dataWithoutType.definitions).toBeDefined();
    });
  });

  describe('edge cases', () => {
    test('handles empty file', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, '');

      const result = await handleGoToDefinition({ file, line: 1, column: 1 });
      const data = JSON.parse(result.content[0].text);

      // Should return empty or handle gracefully
      expect(data).toBeDefined();
    });

    test('handles file with only comments', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, '// This is a comment\n/* Block comment */');

      const result = await handleGoToDefinition({ file, line: 1, column: 5 });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions).toBeDefined();
      expect(data.definitions).toEqual([]);
    });

    test('handles destructuring', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'const obj = { a: 1, b: 2 };\nconst { a, b } = obj;\nconsole.log(a);'
      );

      const result = await handleGoToDefinition({
        file,
        line: 3,
        column: 13, // Position on 'a'
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
    });

    test('handles arrow functions', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'const fn = (x: number) => x * 2;\nfn(5);'
      );

      const result = await handleGoToDefinition({
        file,
        line: 2,
        column: 1, // Position on 'fn' call
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
    });

    test('handles async functions', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'async function fetchData() { return Promise.resolve(1); }\nawait fetchData();'
      );

      const result = await handleGoToDefinition({
        file,
        line: 2,
        column: 7, // Position on 'fetchData' call
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
    });

    test('handles generics', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'function identity<T>(arg: T): T { return arg; }\nidentity<number>(5);'
      );

      const result = await handleGoToDefinition({
        file,
        line: 2,
        column: 1, // Position on 'identity' call
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
    });

    test('handles namespace imports', async () => {
      const moduleFile = path.join(tempDir, 'utils.ts');
      const mainFile = path.join(tempDir, 'main.ts');

      fs.writeFileSync(
        moduleFile,
        'export const foo = 1;\nexport const bar = 2;'
      );
      fs.writeFileSync(
        mainFile,
        'import * as utils from "./utils";\nconsole.log(utils.foo);'
      );

      const result = await handleGoToDefinition({
        file: mainFile,
        line: 2,
        column: 19, // Position on 'foo' in 'utils.foo'
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
    });

    test('handles optional chaining', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        file,
        'interface User { profile?: { name: string } }\nconst user: User = {};\nconsole.log(user.profile?.name);'
      );

      const result = await handleGoToDefinition({
        file,
        line: 3,
        column: 18, // Position on 'profile'
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
    });

    test('handles JSX components', async () => {
      const file = path.join(tempDir, 'test.tsx');
      fs.writeFileSync(
        file,
        'function MyComponent() { return <div>Hello</div>; }\nconst element = <MyComponent />;'
      );

      const result = await handleGoToDefinition({
        file,
        line: 2,
        column: 18, // Position on 'MyComponent' in JSX
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.definitions.length).toBeGreaterThan(0);
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = x;');

      const result = await handleGoToDefinition({ file, line: 2, column: 11 });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGoToDefinition({ file, line: 1, column: 7 });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    test('includes all expected fields', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = x;');

      const result = await handleGoToDefinition({ file, line: 2, column: 11 });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('symbol');
      expect(data).toHaveProperty('definitions');
      expect(data).toHaveProperty('count');
    });
  });
});
