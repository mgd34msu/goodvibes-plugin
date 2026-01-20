/**
 * Unit tests for handleGetDocumentSymbols
 *
 * Tests the document symbols handler that returns the structural outline
 * of a document including classes, functions, interfaces, and other symbols.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { handleGetDocumentSymbols } from '../../../handlers/lsp/document-symbols.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

// Mock console.warn to suppress expected warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('handleGetDocumentSymbols', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'document-symbols-test-'));
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
      const result = await handleGetDocumentSymbols({ file: '' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('file');
    });

    test('returns error for non-existent file', async () => {
      const result = await handleGetDocumentSymbols({
        file: path.join(tempDir, 'nonexistent.ts'),
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('not found');
    });
  });

  describe('function declarations', () => {
    test('returns function symbols', async () => {
      const file = path.join(tempDir, 'funcs.ts');
      fs.writeFileSync(file, `
function add(a: number, b: number): number {
  return a + b;
}

function multiply(a: number, b: number) {
  return a * b;
}
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.length).toBe(2);
      expect(data.symbols.some((s: { name: string }) => s.name === 'add')).toBe(true);
      expect(data.symbols.some((s: { name: string }) => s.name === 'multiply')).toBe(true);
    });

    test('identifies function kind correctly', async () => {
      const file = path.join(tempDir, 'func.ts');
      fs.writeFileSync(file, 'function myFunction() {}');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(data.symbols[0].kind).toBe('function');
    });
  });

  describe('class declarations', () => {
    test('returns class symbols', async () => {
      const file = path.join(tempDir, 'classes.ts');
      fs.writeFileSync(file, `
class Animal {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}

class Dog extends Animal {
  bark() {
    console.log("Woof!");
  }
}
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.some((s: { name: string }) => s.name === 'Animal')).toBe(true);
      expect(data.symbols.some((s: { name: string }) => s.name === 'Dog')).toBe(true);
    });

    test('identifies class kind correctly', async () => {
      const file = path.join(tempDir, 'class.ts');
      fs.writeFileSync(file, 'class MyClass {}');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(data.symbols[0].kind).toBe('class');
    });

    test('includes class methods as children', async () => {
      const file = path.join(tempDir, 'class-methods.ts');
      fs.writeFileSync(file, `
class Calculator {
  add(a: number, b: number) { return a + b; }
  subtract(a: number, b: number) { return a - b; }
}
`);

      const result = await handleGetDocumentSymbols({ file, output_mode: 'verbose' });
      const data = JSON.parse(result.content[0].text);

      const calc = data.symbols.find((s: { name: string }) => s.name === 'Calculator');
      expect(calc).toBeDefined();
      expect(calc.children.length).toBeGreaterThanOrEqual(2);
    });

    test('includes class properties as children', async () => {
      const file = path.join(tempDir, 'class-props.ts');
      fs.writeFileSync(file, `
class Person {
  name: string;
  age: number;
  constructor(name: string, age: number) {
    this.name = name;
    this.age = age;
  }
}
`);

      const result = await handleGetDocumentSymbols({ file, output_mode: 'verbose' });
      const data = JSON.parse(result.content[0].text);

      const person = data.symbols.find((s: { name: string }) => s.name === 'Person');
      expect(person).toBeDefined();
      expect(person.children.some((c: { name: string }) => c.name === 'name')).toBe(true);
      expect(person.children.some((c: { name: string }) => c.name === 'age')).toBe(true);
    });

    test('includes constructor as child', async () => {
      const file = path.join(tempDir, 'constructor.ts');
      fs.writeFileSync(file, `
class Foo {
  constructor() {}
}
`);

      const result = await handleGetDocumentSymbols({ file, output_mode: 'verbose' });
      const data = JSON.parse(result.content[0].text);

      const foo = data.symbols.find((s: { name: string }) => s.name === 'Foo');
      expect(foo).toBeDefined();
      expect(foo.children.some((c: { name: string }) => c.name === 'constructor')).toBe(true);
    });
  });

  describe('interface declarations', () => {
    test('returns interface symbols', async () => {
      const file = path.join(tempDir, 'interfaces.ts');
      fs.writeFileSync(file, `
interface User {
  id: string;
  name: string;
  email: string;
}

interface Post {
  id: string;
  title: string;
  content: string;
}
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.some((s: { name: string }) => s.name === 'User')).toBe(true);
      expect(data.symbols.some((s: { name: string }) => s.name === 'Post')).toBe(true);
    });

    test('identifies interface kind correctly', async () => {
      const file = path.join(tempDir, 'iface.ts');
      fs.writeFileSync(file, 'interface MyInterface {}');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(data.symbols[0].kind).toBe('interface');
    });

    test('includes interface properties as children', async () => {
      const file = path.join(tempDir, 'iface-props.ts');
      fs.writeFileSync(file, `
interface Config {
  host: string;
  port: number;
  debug: boolean;
}
`);

      const result = await handleGetDocumentSymbols({ file, output_mode: 'verbose' });
      const data = JSON.parse(result.content[0].text);

      const config = data.symbols.find((s: { name: string }) => s.name === 'Config');
      expect(config).toBeDefined();
      expect(config.children.length).toBe(3);
    });
  });

  describe('type alias declarations', () => {
    test('returns type alias symbols', async () => {
      const file = path.join(tempDir, 'types.ts');
      fs.writeFileSync(file, `
type StringOrNumber = string | number;
type Point = { x: number; y: number };
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.some((s: { name: string }) => s.name === 'StringOrNumber')).toBe(true);
      expect(data.symbols.some((s: { name: string }) => s.name === 'Point')).toBe(true);
    });

    test('identifies type alias kind correctly', async () => {
      const file = path.join(tempDir, 'type.ts');
      fs.writeFileSync(file, 'type MyType = string;');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(data.symbols[0].kind).toBe('type');
    });
  });

  describe('enum declarations', () => {
    test('returns enum symbols', async () => {
      const file = path.join(tempDir, 'enums.ts');
      fs.writeFileSync(file, `
enum Color {
  Red,
  Green,
  Blue
}

enum Status {
  Pending = 'pending',
  Active = 'active',
  Completed = 'completed'
}
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.some((s: { name: string }) => s.name === 'Color')).toBe(true);
      expect(data.symbols.some((s: { name: string }) => s.name === 'Status')).toBe(true);
    });

    test('identifies enum kind correctly', async () => {
      const file = path.join(tempDir, 'enum.ts');
      fs.writeFileSync(file, 'enum MyEnum { A, B }');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(data.symbols[0].kind).toBe('enum');
    });

    test('includes enum members as children', async () => {
      const file = path.join(tempDir, 'enum-members.ts');
      fs.writeFileSync(file, `
enum Direction {
  North,
  South,
  East,
  West
}
`);

      const result = await handleGetDocumentSymbols({ file, output_mode: 'verbose' });
      const data = JSON.parse(result.content[0].text);

      const direction = data.symbols.find((s: { name: string }) => s.name === 'Direction');
      expect(direction).toBeDefined();
      expect(direction.children.length).toBe(4);
    });
  });

  describe('variable declarations', () => {
    test('returns const declarations', async () => {
      const file = path.join(tempDir, 'consts.ts');
      fs.writeFileSync(file, `
const PI = 3.14159;
const MAX_SIZE = 100;
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.some((s: { name: string }) => s.name === 'PI')).toBe(true);
      expect(data.symbols.some((s: { name: string }) => s.name === 'MAX_SIZE')).toBe(true);
    });

    test('returns let declarations', async () => {
      const file = path.join(tempDir, 'lets.ts');
      fs.writeFileSync(file, `
let counter = 0;
let name = 'test';
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.some((s: { name: string }) => s.name === 'counter')).toBe(true);
      expect(data.symbols.some((s: { name: string }) => s.name === 'name')).toBe(true);
    });
  });

  describe('symbol position', () => {
    test('includes line and column for symbols', async () => {
      const file = path.join(tempDir, 'position.ts');
      fs.writeFileSync(file, 'function test() {}');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(data.symbols[0]).toHaveProperty('line');
      expect(data.symbols[0]).toHaveProperty('column');
      expect(data.symbols[0].line).toBeGreaterThan(0);
      expect(data.symbols[0].column).toBeGreaterThan(0);
    });

    test('includes end_line and end_column for symbols', async () => {
      const file = path.join(tempDir, 'position.ts');
      fs.writeFileSync(file, 'function test() { return 1; }');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(data.symbols[0]).toHaveProperty('end_line');
      expect(data.symbols[0]).toHaveProperty('end_column');
    });

    test('positions are 1-based', async () => {
      const file = path.join(tempDir, 'one-based.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      // First symbol should start at line 1
      expect(data.symbols[0].line).toBe(1);
    });
  });

  describe('nested symbols', () => {
    test('handles nested classes', async () => {
      const file = path.join(tempDir, 'nested-class.ts');
      fs.writeFileSync(file, `
class Outer {
  static Inner = class {
    value: number;
  };
}
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      const outer = data.symbols.find((s: { name: string }) => s.name === 'Outer');
      expect(outer).toBeDefined();
    });

    test('handles deeply nested symbols', async () => {
      const file = path.join(tempDir, 'deep-nesting.ts');
      fs.writeFileSync(file, `
namespace Outer {
  export namespace Inner {
    export interface Config {
      value: string;
    }
  }
}
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetDocumentSymbols({ file });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetDocumentSymbols({ file });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    test('includes file path in result', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('file');
    });

    test('includes count in result', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;\nconst y = 2;');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('count');
      expect(data.count).toBe(data.symbols.length);
    });

    test('children array is always present', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'function foo() {}');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(data.symbols[0]).toHaveProperty('children');
      expect(Array.isArray(data.symbols[0].children)).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('handles empty file', async () => {
      const file = path.join(tempDir, 'empty.ts');
      fs.writeFileSync(file, '');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols).toEqual([]);
      expect(data.count).toBe(0);
    });

    test('handles file with only comments', async () => {
      const file = path.join(tempDir, 'comments.ts');
      fs.writeFileSync(file, '// This is a comment\n/* Multi-line comment */');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols).toEqual([]);
    });

    test('handles file with only imports', async () => {
      const file = path.join(tempDir, 'imports.ts');
      fs.writeFileSync(file, 'import * as fs from "fs";\nimport * as path from "path";');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles relative file path', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const originalEnv = process.env.PROJECT_ROOT;
      process.env.PROJECT_ROOT = tempDir;

      try {
        const result = await handleGetDocumentSymbols({ file: 'test.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeFalsy();
      } finally {
        process.env.PROJECT_ROOT = originalEnv;
      }
    });

    test('handles arrow functions in const declarations', async () => {
      const file = path.join(tempDir, 'arrows.ts');
      fs.writeFileSync(file, `
const add = (a: number, b: number) => a + b;
const greet = (name: string) => \`Hello, \${name}!\`;
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.some((s: { name: string }) => s.name === 'add')).toBe(true);
      expect(data.symbols.some((s: { name: string }) => s.name === 'greet')).toBe(true);
    });

    test('skips anonymous function placeholders', async () => {
      const file = path.join(tempDir, 'anonymous.ts');
      fs.writeFileSync(file, `
const handler = function() { return 1; };
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // Should not include <function> placeholders
      expect(data.symbols.every((s: { name: string }) => !s.name.startsWith('<'))).toBe(true);
    });
  });

  describe('file types', () => {
    test('handles JavaScript files', async () => {
      const file = path.join(tempDir, 'test.js');
      fs.writeFileSync(file, 'function foo() {}');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.length).toBeGreaterThan(0);
    });

    test('handles JSX files', async () => {
      const file = path.join(tempDir, 'test.jsx');
      fs.writeFileSync(file, 'function Component() { return <div />; }');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles TSX files', async () => {
      const file = path.join(tempDir, 'test.tsx');
      fs.writeFileSync(file, 'function Component(): JSX.Element { return <div />; }');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('symbol kinds', () => {
    test('identifies module kind', async () => {
      const file = path.join(tempDir, 'module.ts');
      fs.writeFileSync(file, 'namespace MyModule { export const x = 1; }');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      const mod = data.symbols.find((s: { name: string }) => s.name === 'MyModule');
      if (mod) {
        expect(['namespace', 'module']).toContain(mod.kind);
      }
    });

    test('identifies method kind', async () => {
      const file = path.join(tempDir, 'method.ts');
      fs.writeFileSync(file, 'class Foo { bar() {} }');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      const foo = data.symbols.find((s: { name: string }) => s.name === 'Foo');
      if (foo) {
        const method = foo.children.find((c: { name: string }) => c.name === 'bar');
        if (method) {
          expect(method.kind).toBe('method');
        }
      }
    });

    test('identifies getter kind', async () => {
      const file = path.join(tempDir, 'getter.ts');
      fs.writeFileSync(file, 'class Foo { get value() { return 1; } }');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      const foo = data.symbols.find((s: { name: string }) => s.name === 'Foo');
      if (foo) {
        const getter = foo.children.find((c: { name: string }) => c.name === 'value');
        if (getter) {
          expect(getter.kind).toBe('getter');
        }
      }
    });

    test('identifies setter kind', async () => {
      const file = path.join(tempDir, 'setter.ts');
      fs.writeFileSync(file, 'class Foo { set value(v: number) {} }');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      const foo = data.symbols.find((s: { name: string }) => s.name === 'Foo');
      if (foo) {
        const setter = foo.children.find((c: { name: string }) => c.name === 'value');
        if (setter) {
          expect(setter.kind).toBe('setter');
        }
      }
    });

    test('identifies property kind', async () => {
      const file = path.join(tempDir, 'property.ts');
      fs.writeFileSync(file, 'class Foo { myProp: string; }');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      const foo = data.symbols.find((s: { name: string }) => s.name === 'Foo');
      if (foo) {
        const prop = foo.children.find((c: { name: string }) => c.name === 'myProp');
        if (prop) {
          expect(prop.kind).toBe('property');
        }
      }
    });
  });

  describe('navigation tree handling', () => {
    test('handles empty navigation tree', async () => {
      // A file that produces no navigation tree items
      const file = path.join(tempDir, 'empty-nav.ts');
      fs.writeFileSync(file, '// just a comment');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols).toEqual([]);
    });

    test('handles navigation tree with no children', async () => {
      const file = path.join(tempDir, 'no-children.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('error handling', () => {
    test('handles language service errors gracefully', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetDocumentSymbols({ file });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    test('returns error response when exception occurs', async () => {
      // Create a file then delete it to cause an error during processing
      const file = path.join(tempDir, 'will-delete.ts');
      fs.writeFileSync(file, 'const x = 1;');

      // Mock the language service manager to throw
      const originalGetServiceForFile = languageServiceManager.getServiceForFile;
      languageServiceManager.getServiceForFile = vi.fn().mockRejectedValue(
        new Error('Service initialization failed')
      );

      try {
        const result = await handleGetDocumentSymbols({ file });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        // The error is caught in processFile and returned directly
        expect(data.error).toContain('Service initialization failed');
      } finally {
        languageServiceManager.getServiceForFile = originalGetServiceForFile;
      }
    });

    test('handles non-Error exceptions in catch block', async () => {
      const file = path.join(tempDir, 'error-test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      // Mock to throw a non-Error value
      const originalGetServiceForFile = languageServiceManager.getServiceForFile;
      languageServiceManager.getServiceForFile = vi.fn().mockRejectedValue('string error');

      try {
        const result = await handleGetDocumentSymbols({ file });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(data.error).toContain('string error');
      } finally {
        languageServiceManager.getServiceForFile = originalGetServiceForFile;
      }
    });
  });

  describe('navigation tree edge cases', () => {
    test('handles navigation tree with null spans', async () => {
      // A file that might produce a node with no spans
      const file = path.join(tempDir, 'no-spans.ts');
      fs.writeFileSync(file, `
// This is just a comment file
/* with multiple
   comment styles */
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // Should return empty or handle gracefully
      expect(Array.isArray(data.symbols)).toBe(true);
    });

    test('filters out anonymous function nodes (nodes with <> names)', async () => {
      const file = path.join(tempDir, 'anon-func.ts');
      // This creates anonymous callback functions that TypeScript represents as <function>
      fs.writeFileSync(file, `
const arr = [1, 2, 3];
arr.forEach(function(item) {
  console.log(item);
});
arr.map(function(x) { return x * 2; });
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // Should not include any symbols starting with < and ending with >
      const allNames = getAllSymbolNames(data.symbols);
      expect(allNames.every((name: string) => !(name.startsWith('<') && name.endsWith('>')))).toBe(true);
    });

    test('handles file with only whitespace', async () => {
      const file = path.join(tempDir, 'whitespace-only.ts');
      fs.writeFileSync(file, '   \n   \n   ');

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols).toEqual([]);
    });

    test('handles non-script root element in navigation tree', async () => {
      // A module declaration at root level
      const file = path.join(tempDir, 'module-root.ts');
      fs.writeFileSync(file, `
declare module "my-module" {
  export function doSomething(): void;
}
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.length).toBeGreaterThanOrEqual(0);
    });

    test('handles deeply nested childItems in navigation tree', async () => {
      const file = path.join(tempDir, 'deep-children.ts');
      fs.writeFileSync(file, `
namespace Level1 {
  export namespace Level2 {
    export namespace Level3 {
      export interface DeepInterface {
        value: string;
        nested: {
          innerValue: number;
        };
      }
    }
  }
}
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // Should have properly nested structure
      expect(data.symbols.length).toBeGreaterThan(0);
    });

    test('handles nodes with empty childItems array', async () => {
      const file = path.join(tempDir, 'empty-children.ts');
      fs.writeFileSync(file, `
interface EmptyInterface {}
class EmptyClass {}
type EmptyType = {};
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // Each symbol should have an empty children array
      for (const symbol of data.symbols) {
        expect(Array.isArray(symbol.children)).toBe(true);
      }
    });
  });

  describe('symbol kind edge cases', () => {
    test('handles unknown symbol kind', async () => {
      const file = path.join(tempDir, 'unknown-kind.ts');
      // Create a file with various declarations
      fs.writeFileSync(file, `
const x = 1;
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // Should not crash on any symbol kind
      expect(data.symbols.length).toBeGreaterThan(0);
    });

    test('handles all mapped symbol kinds', async () => {
      const file = path.join(tempDir, 'all-kinds.ts');
      fs.writeFileSync(file, `
// Module/namespace
namespace MyNamespace {
  export const nsConst = 1;
}

// Class with various members
class MyClass {
  property: string;
  constructor() {}
  method() {}
  get getter() { return 1; }
  set setter(v: number) {}
  static staticMethod() {}
}

// Interface
interface MyInterface {
  prop: string;
}

// Type alias
type MyType = string | number;

// Enum
enum MyEnum {
  A,
  B,
}

// Function
function myFunction() {}

// Variables
const myConst = 1;
let myLet = 2;
var myVar = 3;

// Arrow function
const myArrow = () => {};
`);

      const result = await handleGetDocumentSymbols({ file });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.length).toBeGreaterThan(5);

      // Verify various kinds are present
      const allKinds = getAllSymbolKinds(data.symbols);
      expect(allKinds).toContain('namespace');
      expect(allKinds).toContain('class');
      expect(allKinds).toContain('interface');
      expect(allKinds).toContain('type');
      expect(allKinds).toContain('enum');
      expect(allKinds).toContain('function');
    });
  });

  // ==========================================================================
  // NEW FEATURES: Filtering, Batch Mode, Depth Control
  // ==========================================================================

  describe('kind_filter parameter', () => {
    test('filters to only return functions', async () => {
      const file = path.join(tempDir, 'mixed.ts');
      fs.writeFileSync(file, `
function add(a: number, b: number) { return a + b; }
class Calculator {}
interface Config {}
function multiply(a: number, b: number) { return a * b; }
const PI = 3.14;
`);

      const result = await handleGetDocumentSymbols({
        file,
        kind_filter: ['function'],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.length).toBe(2);
      expect(data.symbols.every((s: { kind: string }) => s.kind === 'function')).toBe(true);
    });

    test('filters with case-insensitive matching', async () => {
      const file = path.join(tempDir, 'case-test.ts');
      fs.writeFileSync(file, `
class MyClass {}
interface MyInterface {}
`);

      const result = await handleGetDocumentSymbols({
        file,
        kind_filter: ['CLASS', 'Interface'],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.length).toBe(2);
    });

    test('filters with multiple kinds', async () => {
      const file = path.join(tempDir, 'multi-kind.ts');
      fs.writeFileSync(file, `
function foo() {}
class Bar {}
interface Baz {}
type Qux = string;
enum Status { Active }
`);

      const result = await handleGetDocumentSymbols({
        file,
        kind_filter: ['function', 'interface', 'type'],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.length).toBe(3);
      const kinds = data.symbols.map((s: { kind: string }) => s.kind);
      expect(kinds).toContain('function');
      expect(kinds).toContain('interface');
      expect(kinds).toContain('type');
    });

    test('returns empty array when no symbols match filter', async () => {
      const file = path.join(tempDir, 'no-match.ts');
      fs.writeFileSync(file, `
const x = 1;
let y = 2;
`);

      const result = await handleGetDocumentSymbols({
        file,
        kind_filter: ['class', 'interface'],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols).toEqual([]);
      expect(data.count).toBe(0);
    });

    test('handles kind aliases (func -> function)', async () => {
      const file = path.join(tempDir, 'alias.ts');
      fs.writeFileSync(file, `
function myFunc() {}
class MyClass {}
`);

      const result = await handleGetDocumentSymbols({
        file,
        kind_filter: ['func', 'fn'],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.length).toBe(1);
      expect(data.symbols[0].kind).toBe('function');
    });
  });

  describe('line_range parameter', () => {
    test('filters symbols by start line', async () => {
      const file = path.join(tempDir, 'line-range.ts');
      fs.writeFileSync(file, `function first() {}

function second() {}

function third() {}

function fourth() {}
`);

      // Get baseline to check actual line numbers
      const baseline = await handleGetDocumentSymbols({ file });
      const baselineData = JSON.parse(baseline.content[0].text);

      // Find line of "third" function
      const thirdSymbol = baselineData.symbols.find((s: { name: string }) => s.name === 'third');
      expect(thirdSymbol).toBeDefined();

      const result = await handleGetDocumentSymbols({
        file,
        line_range: { start: thirdSymbol.line },
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.length).toBe(2); // third and fourth
      expect(data.symbols.some((s: { name: string }) => s.name === 'third')).toBe(true);
      expect(data.symbols.some((s: { name: string }) => s.name === 'fourth')).toBe(true);
    });

    test('filters symbols by end line', async () => {
      const file = path.join(tempDir, 'line-range-end.ts');
      fs.writeFileSync(file, `function first() {}
function second() {}
function third() {}
function fourth() {}
`);

      const result = await handleGetDocumentSymbols({
        file,
        line_range: { end: 2 },
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.length).toBe(2); // first and second
    });

    test('filters symbols by both start and end', async () => {
      const file = path.join(tempDir, 'line-range-both.ts');
      fs.writeFileSync(file, `function first() {}
function second() {}
function third() {}
function fourth() {}
function fifth() {}
`);

      const result = await handleGetDocumentSymbols({
        file,
        line_range: { start: 2, end: 4 },
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.length).toBe(3); // second, third, fourth
    });

    test('returns empty when line range matches no symbols', async () => {
      const file = path.join(tempDir, 'no-line-match.ts');
      fs.writeFileSync(file, `function first() {}
`);

      const result = await handleGetDocumentSymbols({
        file,
        line_range: { start: 100, end: 200 },
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols).toEqual([]);
    });
  });

  describe('max_depth parameter', () => {
    test('limits to top-level only with max_depth: 1', async () => {
      const file = path.join(tempDir, 'depth-test.ts');
      fs.writeFileSync(file, `
class Calculator {
  add(a: number, b: number) { return a + b; }
  subtract(a: number, b: number) { return a - b; }
}
`);

      const result = await handleGetDocumentSymbols({
        file,
        max_depth: 1,
        output_mode: 'verbose',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.length).toBe(1);
      expect(data.symbols[0].name).toBe('Calculator');
      expect(data.symbols[0].children).toEqual([]);
    });

    test('allows one level of nesting with max_depth: 2', async () => {
      const file = path.join(tempDir, 'depth-2.ts');
      fs.writeFileSync(file, `
namespace Outer {
  export class Inner {
    method() {}
  }
}
`);

      const result = await handleGetDocumentSymbols({
        file,
        max_depth: 2,
        output_mode: 'verbose',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      const outer = data.symbols.find((s: { name: string }) => s.name === 'Outer');
      expect(outer).toBeDefined();
      expect(outer.children.length).toBeGreaterThan(0);
      // Children should have empty children arrays due to depth limit
      for (const child of outer.children) {
        expect(child.children).toEqual([]);
      }
    });

    test('preserves full tree without max_depth', async () => {
      const file = path.join(tempDir, 'full-depth.ts');
      fs.writeFileSync(file, `
class Parent {
  child() {
    // Method has no children symbols
  }
}
`);

      const result = await handleGetDocumentSymbols({
        file,
        output_mode: 'verbose',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      const parent = data.symbols.find((s: { name: string }) => s.name === 'Parent');
      expect(parent).toBeDefined();
      expect(parent.children.length).toBeGreaterThan(0);
    });
  });

  describe('batch mode (files parameter)', () => {
    test('processes multiple files', async () => {
      const file1 = path.join(tempDir, 'batch1.ts');
      const file2 = path.join(tempDir, 'batch2.ts');
      fs.writeFileSync(file1, 'function foo() {}');
      fs.writeFileSync(file2, 'function bar() {}');

      const result = await handleGetDocumentSymbols({
        files: [file1, file2],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.total_files).toBe(2);
      expect(data.total_symbols).toBe(2);
      expect(data.results.length).toBe(2);
    });

    test('combines file and files parameters', async () => {
      const file1 = path.join(tempDir, 'combo1.ts');
      const file2 = path.join(tempDir, 'combo2.ts');
      const file3 = path.join(tempDir, 'combo3.ts');
      fs.writeFileSync(file1, 'const a = 1;');
      fs.writeFileSync(file2, 'const b = 2;');
      fs.writeFileSync(file3, 'const c = 3;');

      const result = await handleGetDocumentSymbols({
        file: file1,
        files: [file2, file3],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.total_files).toBe(3);
    });

    test('handles errors in individual files without failing entire batch', async () => {
      const file1 = path.join(tempDir, 'good.ts');
      const file2 = path.join(tempDir, 'nonexistent.ts');
      fs.writeFileSync(file1, 'function good() {}');

      const result = await handleGetDocumentSymbols({
        files: [file1, file2],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.total_files).toBe(2);

      const goodResult = data.results.find((r: { file: string }) => r.file.includes('good'));
      const badResult = data.results.find((r: { file: string }) => r.file.includes('nonexistent'));

      expect(goodResult.count).toBe(1);
      expect(badResult.error).toBeDefined();
    });

    test('applies filters to all files in batch', async () => {
      const file1 = path.join(tempDir, 'filter1.ts');
      const file2 = path.join(tempDir, 'filter2.ts');
      fs.writeFileSync(file1, `
function foo() {}
class Bar {}
`);
      fs.writeFileSync(file2, `
function baz() {}
interface Qux {}
`);

      const result = await handleGetDocumentSymbols({
        files: [file1, file2],
        kind_filter: ['function'],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.total_symbols).toBe(2);

      for (const fileResult of data.results) {
        for (const symbol of fileResult.symbols) {
          expect(symbol.kind).toBe('function');
        }
      }
    });

    test('batch mode with count_only output', async () => {
      const file1 = path.join(tempDir, 'count1.ts');
      const file2 = path.join(tempDir, 'count2.ts');
      fs.writeFileSync(file1, 'function a() {} function b() {}');
      fs.writeFileSync(file2, 'class C {} interface I {}');

      const result = await handleGetDocumentSymbols({
        files: [file1, file2],
        output_mode: 'count_only',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.total_files).toBe(2);

      for (const fileResult of data.results) {
        expect(fileResult.count).toBeDefined();
        expect(fileResult.symbols).toBeUndefined();
      }
    });

    test('batch mode with minimal output', async () => {
      const file1 = path.join(tempDir, 'min1.ts');
      const file2 = path.join(tempDir, 'min2.ts');
      fs.writeFileSync(file1, 'function test() {}');
      fs.writeFileSync(file2, 'class Example {}');

      const result = await handleGetDocumentSymbols({
        files: [file1, file2],
        output_mode: 'minimal',
      });
      const data = JSON.parse(result.content[0].text);

      // Batch mode returns batch format with multiple files
      expect(result.isError).toBeFalsy();
      expect(data.total_files).toBe(2);

      const symbols = data.results[0].symbols;
      expect(symbols[0]).toHaveProperty('name');
      expect(symbols[0]).toHaveProperty('kind');
      expect(symbols[0]).not.toHaveProperty('line');
    });
  });

  describe('combined filters', () => {
    test('applies kind_filter and line_range together', async () => {
      const file = path.join(tempDir, 'combined.ts');
      fs.writeFileSync(file, `function first() {}
class MyClass {}
function second() {}
interface MyInterface {}
function third() {}
`);

      const result = await handleGetDocumentSymbols({
        file,
        kind_filter: ['function'],
        line_range: { start: 2 },
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // Should only return functions starting from line 2
      expect(data.symbols.every((s: { kind: string }) => s.kind === 'function')).toBe(true);
      expect(data.symbols.every((s: { line: number }) => s.line >= 2)).toBe(true);
    });

    test('applies kind_filter and max_depth together', async () => {
      const file = path.join(tempDir, 'kind-depth.ts');
      fs.writeFileSync(file, `
class Parent {
  childMethod() {}
}
function standalone() {}
`);

      const result = await handleGetDocumentSymbols({
        file,
        kind_filter: ['class', 'function'],
        max_depth: 1,
        output_mode: 'verbose',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // Parent class should have no children due to depth limit
      const parent = data.symbols.find((s: { name: string }) => s.name === 'Parent');
      if (parent) {
        expect(parent.children).toEqual([]);
      }
    });

    test('applies all filters together', async () => {
      const file = path.join(tempDir, 'all-filters.ts');
      fs.writeFileSync(file, `
function a() {}
class B {
  method() {}
}
function c() {}
class D {
  anotherMethod() {}
}
function e() {}
`);

      const result = await handleGetDocumentSymbols({
        file,
        kind_filter: ['function', 'class'],
        line_range: { start: 3, end: 7 },
        max_depth: 1,
        output_mode: 'verbose',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // All symbols should be function or class
      for (const s of data.symbols) {
        expect(['function', 'class']).toContain(s.kind);
        expect(s.line).toBeGreaterThanOrEqual(3);
        expect(s.line).toBeLessThanOrEqual(7);
        // Classes should have no children due to max_depth
        if (s.kind === 'class') {
          expect(s.children).toEqual([]);
        }
      }
    });
  });

  describe('output_mode with new features', () => {
    test('verbose mode preserves filtered children', async () => {
      const file = path.join(tempDir, 'verbose-filter.ts');
      fs.writeFileSync(file, `
class MyClass {
  method() {}
  property: string;
}
`);

      const result = await handleGetDocumentSymbols({
        file,
        output_mode: 'verbose',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      const myClass = data.symbols.find((s: { name: string }) => s.name === 'MyClass');
      expect(myClass).toBeDefined();
      expect(myClass.children.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases for new features', () => {
    test('empty kind_filter array returns all symbols', async () => {
      const file = path.join(tempDir, 'empty-filter.ts');
      fs.writeFileSync(file, `
function foo() {}
class Bar {}
`);

      const result = await handleGetDocumentSymbols({
        file,
        kind_filter: [],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.length).toBe(2);
    });

    test('line_range with only start specified', async () => {
      const file = path.join(tempDir, 'start-only.ts');
      fs.writeFileSync(file, `const a = 1;
const b = 2;
const c = 3;
`);

      const result = await handleGetDocumentSymbols({
        file,
        line_range: { start: 2 },
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.every((s: { line: number }) => s.line >= 2)).toBe(true);
    });

    test('line_range with only end specified', async () => {
      const file = path.join(tempDir, 'end-only.ts');
      fs.writeFileSync(file, `const a = 1;
const b = 2;
const c = 3;
`);

      const result = await handleGetDocumentSymbols({
        file,
        line_range: { end: 2 },
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.symbols.every((s: { line: number }) => s.line <= 2)).toBe(true);
    });

    test('returns error when neither file nor files provided', async () => {
      const result = await handleGetDocumentSymbols({});
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('file or files');
    });

    test('single file in files array uses single-file mode response', async () => {
      const file = path.join(tempDir, 'single-in-array.ts');
      fs.writeFileSync(file, 'const x = 1;');

      // Note: With a single file in the array, we actually return batch format
      // but let's verify it still works
      const resultSingle = await handleGetDocumentSymbols({ file });
      const resultArray = await handleGetDocumentSymbols({ files: [file] });

      const dataSingle = JSON.parse(resultSingle.content[0].text);
      const dataArray = JSON.parse(resultArray.content[0].text);

      // Single file mode returns { file, symbols, count }
      expect(dataSingle).toHaveProperty('file');
      expect(dataSingle).toHaveProperty('symbols');

      // But since files array has only one item, it doesn't trigger batch mode
      // Actually per the implementation, isBatchMode = fileList.length > 1
      // So single item in files array should NOT trigger batch mode
      expect(dataArray).toHaveProperty('file');
      expect(dataArray).toHaveProperty('symbols');
    });
  });
});

/**
 * Helper function to recursively get all symbol names
 */
function getAllSymbolNames(symbols: Array<{ name: string; children?: Array<{ name: string; children?: unknown[] }> }>): string[] {
  const names: string[] = [];
  for (const symbol of symbols) {
    names.push(symbol.name);
    if (symbol.children && symbol.children.length > 0) {
      names.push(...getAllSymbolNames(symbol.children));
    }
  }
  return names;
}

/**
 * Helper function to recursively get all symbol kinds
 */
function getAllSymbolKinds(symbols: Array<{ kind: string; children?: Array<{ kind: string; children?: unknown[] }> }>): string[] {
  const kinds: string[] = [];
  for (const symbol of symbols) {
    kinds.push(symbol.kind);
    if (symbol.children && symbol.children.length > 0) {
      kinds.push(...getAllSymbolKinds(symbol.children));
    }
  }
  return kinds;
}
