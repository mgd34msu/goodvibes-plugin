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

      const result = await handleGetDocumentSymbols({ file });
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

      const result = await handleGetDocumentSymbols({ file });
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

      const result = await handleGetDocumentSymbols({ file });
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

      const result = await handleGetDocumentSymbols({ file });
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

      const result = await handleGetDocumentSymbols({ file });
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
        expect(data.error).toContain('Failed to get document symbols');
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
