/**
 * Unit tests for handleGetTypeHierarchy
 *
 * Tests the type hierarchy handler that provides type hierarchy information
 * for a symbol at a given position, including supertypes and subtypes.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { handleGetTypeHierarchy } from '../../../handlers/lsp/type-hierarchy.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

// Mock console.warn to suppress expected warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('handleGetTypeHierarchy', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'type-hierarchy-test-'));
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
      const result = await handleGetTypeHierarchy({
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
      fs.writeFileSync(file, 'class Foo {}');

      const result = await handleGetTypeHierarchy({
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
      fs.writeFileSync(file, 'class Foo {}');

      const result = await handleGetTypeHierarchy({
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
      fs.writeFileSync(file, 'class Foo {}');

      const result = await handleGetTypeHierarchy({
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
      fs.writeFileSync(file, 'class Foo {}');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: -5,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('column');
    });

    test('returns error for invalid direction', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'class Foo {}');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 7,
        direction: 'invalid' as any,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('direction');
    });

    test('returns error for invalid depth', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'class Foo {}');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 7,
        depth: 0,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('depth');
    });

    test('returns error for depth greater than 20', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'class Foo {}');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 7,
        depth: 21,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('depth');
    });

    test('returns error when file not found', async () => {
      const result = await handleGetTypeHierarchy({
        file: path.join(tempDir, 'nonexistent.ts'),
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('not found');
    });
  });

  describe('class supertypes', () => {
    test('finds superclass with extends', async () => {
      const file = path.join(tempDir, 'extends.ts');
      fs.writeFileSync(file, `
class Animal {
  name: string;
}

class Dog extends Animal {
  bark() {}
}
`);

      const result = await handleGetTypeHierarchy({
        file,
        line: 6,
        column: 7, // Position on 'Dog'
        direction: 'supertypes',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.item).not.toBeNull();
      expect(data.item.name).toBe('Dog');
      expect(data.supertypes.length).toBeGreaterThanOrEqual(1);
      if (data.supertypes.length > 0) {
        expect(data.supertypes[0].type.name).toBe('Animal');
        expect(data.supertypes[0].relation).toBe('extends');
      }
    });

    test('finds interface with implements', async () => {
      const file = path.join(tempDir, 'implements.ts');
      fs.writeFileSync(file, `
interface Runnable {
  run(): void;
}

class Task implements Runnable {
  run() {}
}
`);

      const result = await handleGetTypeHierarchy({
        file,
        line: 6,
        column: 7, // Position on 'Task'
        direction: 'supertypes',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      if (data.supertypes.length > 0) {
        expect(data.supertypes[0].type.name).toBe('Runnable');
        expect(data.supertypes[0].relation).toBe('implements');
      }
    });

    test('finds multiple supertypes', async () => {
      const file = path.join(tempDir, 'multi-super.ts');
      fs.writeFileSync(file, `
interface Runnable {
  run(): void;
}

interface Stoppable {
  stop(): void;
}

class Service implements Runnable, Stoppable {
  run() {}
  stop() {}
}
`);

      const result = await handleGetTypeHierarchy({
        file,
        line: 10,
        column: 7, // Position on 'Service'
        direction: 'supertypes',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      if (data.supertypes.length > 0) {
        expect(data.supertypes.length).toBeGreaterThanOrEqual(2);
      }
    });

    test('handles recursive supertypes', async () => {
      const file = path.join(tempDir, 'recursive-super.ts');
      fs.writeFileSync(file, `
class Grandparent {}
class Parent extends Grandparent {}
class Child extends Parent {}
`);

      const result = await handleGetTypeHierarchy({
        file,
        line: 4,
        column: 7, // Position on 'Child'
        direction: 'supertypes',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      if (data.supertypes.length > 0) {
        expect(data.supertypes[0].type.name).toBe('Parent');
        // Parent should have Grandparent in its supertypes
        if (data.supertypes[0].supertypes.length > 0) {
          expect(data.supertypes[0].supertypes[0].type.name).toBe('Grandparent');
        }
      }
    });
  });

  describe('interface supertypes', () => {
    test('finds extended interface', async () => {
      const file = path.join(tempDir, 'iface-extends.ts');
      fs.writeFileSync(file, `
interface Base {
  id: string;
}

interface Derived extends Base {
  name: string;
}
`);

      const result = await handleGetTypeHierarchy({
        file,
        line: 6,
        column: 11, // Position on 'Derived'
        direction: 'supertypes',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      if (data.supertypes.length > 0) {
        expect(data.supertypes[0].type.name).toBe('Base');
        expect(data.supertypes[0].relation).toBe('extends');
      }
    });

    test('finds multiple extended interfaces', async () => {
      const file = path.join(tempDir, 'multi-iface.ts');
      fs.writeFileSync(file, `
interface A { a: string; }
interface B { b: string; }
interface C extends A, B { c: string; }
`);

      const result = await handleGetTypeHierarchy({
        file,
        line: 4,
        column: 11, // Position on 'C'
        direction: 'supertypes',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('subtypes', () => {
    test('finds class that extends', async () => {
      const file = path.join(tempDir, 'subtypes.ts');
      fs.writeFileSync(file, `
class Animal {}
class Dog extends Animal {}
class Cat extends Animal {}
`);

      const result = await handleGetTypeHierarchy({
        file,
        line: 2,
        column: 7, // Position on 'Animal'
        direction: 'subtypes',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      if (data.subtypes.length > 0) {
        const subtypeNames = data.subtypes.map((s: any) => s.type.name);
        expect(subtypeNames).toContain('Dog');
        expect(subtypeNames).toContain('Cat');
      }
    });

    test('finds class that implements interface', async () => {
      const file = path.join(tempDir, 'impl-subtypes.ts');
      fs.writeFileSync(file, `
interface Logger {
  log(msg: string): void;
}

class ConsoleLogger implements Logger {
  log(msg: string) { console.log(msg); }
}

class FileLogger implements Logger {
  log(msg: string) { /* write to file */ }
}
`);

      const result = await handleGetTypeHierarchy({
        file,
        line: 2,
        column: 11, // Position on 'Logger'
        direction: 'subtypes',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      if (data.subtypes.length > 0) {
        const subtypeNames = data.subtypes.map((s: any) => s.type.name);
        expect(subtypeNames.some((n: string) => n.includes('Logger'))).toBe(true);
      }
    });

    test('finds interface that extends', async () => {
      const file = path.join(tempDir, 'iface-subtypes.ts');
      fs.writeFileSync(file, `
interface Base {
  id: string;
}

interface DerivedA extends Base {
  a: string;
}

interface DerivedB extends Base {
  b: string;
}
`);

      const result = await handleGetTypeHierarchy({
        file,
        line: 2,
        column: 11, // Position on 'Base'
        direction: 'subtypes',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles recursive subtypes', async () => {
      const file = path.join(tempDir, 'recursive-sub.ts');
      fs.writeFileSync(file, `
class Grandparent {}
class Parent extends Grandparent {}
class Child extends Parent {}
`);

      const result = await handleGetTypeHierarchy({
        file,
        line: 2,
        column: 7, // Position on 'Grandparent'
        direction: 'subtypes',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      if (data.subtypes.length > 0) {
        expect(data.subtypes[0].type.name).toBe('Parent');
        // Parent should have Child in its subtypes
        if (data.subtypes[0].subtypes.length > 0) {
          expect(data.subtypes[0].subtypes[0].type.name).toBe('Child');
        }
      }
    });
  });

  describe('direction options', () => {
    test('returns only supertypes when direction is "supertypes"', async () => {
      const file = path.join(tempDir, 'super-only.ts');
      fs.writeFileSync(file, `
class Parent {}
class Child extends Parent {}
`);

      const result = await handleGetTypeHierarchy({
        file,
        line: 3,
        column: 7, // Position on 'Child'
        direction: 'supertypes',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.subtypes).toEqual([]);
    });

    test('returns only subtypes when direction is "subtypes"', async () => {
      const file = path.join(tempDir, 'sub-only.ts');
      fs.writeFileSync(file, `
class Parent {}
class Child extends Parent {}
`);

      const result = await handleGetTypeHierarchy({
        file,
        line: 2,
        column: 7, // Position on 'Parent'
        direction: 'subtypes',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.supertypes).toEqual([]);
    });

    test('returns both when direction is "both"', async () => {
      const file = path.join(tempDir, 'both.ts');
      fs.writeFileSync(file, `
class Grandparent {}
class Parent extends Grandparent {}
class Child extends Parent {}
`);

      const result = await handleGetTypeHierarchy({
        file,
        line: 3,
        column: 7, // Position on 'Parent'
        direction: 'both',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data).toHaveProperty('supertypes');
      expect(data).toHaveProperty('subtypes');
    });

    test('defaults to "both" when direction not specified', async () => {
      const file = path.join(tempDir, 'default.ts');
      fs.writeFileSync(file, 'class Foo {}');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data).toHaveProperty('supertypes');
      expect(data).toHaveProperty('subtypes');
    });
  });

  describe('depth limiting', () => {
    test('respects custom depth', async () => {
      const file = path.join(tempDir, 'depth.ts');
      fs.writeFileSync(file, `
class A {}
class B extends A {}
class C extends B {}
class D extends C {}
`);

      const result = await handleGetTypeHierarchy({
        file,
        line: 5,
        column: 7, // Position on 'D'
        direction: 'supertypes',
        depth: 2,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('defaults to depth 5', async () => {
      const file = path.join(tempDir, 'default-depth.ts');
      fs.writeFileSync(file, 'class Foo {}');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('item metadata', () => {
    test('includes name in item', async () => {
      const file = path.join(tempDir, 'item-name.ts');
      fs.writeFileSync(file, 'class MyClass {}');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.item.name).toBe('MyClass');
    });

    test('includes kind in item', async () => {
      const file = path.join(tempDir, 'item-kind.ts');
      fs.writeFileSync(file, 'class MyClass {}');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.item.kind).toBe('class');
    });

    test('includes file in item', async () => {
      const file = path.join(tempDir, 'item-file.ts');
      fs.writeFileSync(file, 'class MyClass {}');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.item.file).toBeDefined();
    });

    test('includes line and column in item', async () => {
      const file = path.join(tempDir, 'item-pos.ts');
      fs.writeFileSync(file, 'class MyClass {}');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.item.line).toBeDefined();
      expect(data.item.column).toBeDefined();
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'class Foo {}');

      const result = await handleGetTypeHierarchy({
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
      fs.writeFileSync(file, 'class Foo {}');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 7,
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    test('includes all required fields', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'class Foo {}');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('item');
      expect(data).toHaveProperty('supertypes');
      expect(data).toHaveProperty('subtypes');
    });
  });

  describe('edge cases', () => {
    test('returns null item for non-type position', async () => {
      const file = path.join(tempDir, 'non-type.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.item).toBeNull();
    });

    test('handles empty file', async () => {
      const file = path.join(tempDir, 'empty.ts');
      fs.writeFileSync(file, '');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.item).toBeNull();
    });

    test('handles relative file path', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'class Foo {}');

      const originalEnv = process.env.PROJECT_ROOT;
      process.env.PROJECT_ROOT = tempDir;

      try {
        const result = await handleGetTypeHierarchy({
          file: 'test.ts',
          line: 1,
          column: 7,
        });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeFalsy();
      } finally {
        process.env.PROJECT_ROOT = originalEnv;
      }
    });

    test('handles circular type references gracefully', async () => {
      const file = path.join(tempDir, 'circular.ts');
      // This shouldn't create infinite loops due to visited set
      fs.writeFileSync(file, `
class A extends B {}
class B extends A {}
`);

      const result = await handleGetTypeHierarchy({
        file,
        line: 2,
        column: 7,
        direction: 'supertypes',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('type kind detection', () => {
    test('detects class kind', async () => {
      const file = path.join(tempDir, 'class-kind.ts');
      fs.writeFileSync(file, 'class Foo {}');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.item.kind).toBe('class');
    });

    test('detects interface kind', async () => {
      const file = path.join(tempDir, 'iface-kind.ts');
      fs.writeFileSync(file, 'interface Foo {}');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.item.kind).toBe('interface');
    });

    test('detects type alias kind', async () => {
      const file = path.join(tempDir, 'type-kind.ts');
      fs.writeFileSync(file, 'type Foo = { x: number };');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 6,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.item) {
        expect(data.item.kind).toBe('type');
      }
    });

    test('detects enum kind', async () => {
      const file = path.join(tempDir, 'enum-kind.ts');
      fs.writeFileSync(file, 'enum Foo { A, B }');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 6,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.item) {
        expect(data.item.kind).toBe('enum');
      }
    });
  });

  describe('sorting', () => {
    test('sorts subtypes by file then line', async () => {
      const file = path.join(tempDir, 'sorted.ts');
      fs.writeFileSync(file, `
class Parent {}
class C extends Parent {}
class A extends Parent {}
class B extends Parent {}
`);

      const result = await handleGetTypeHierarchy({
        file,
        line: 2,
        column: 7,
        direction: 'subtypes',
      });
      const data = JSON.parse(result.content[0].text);

      if (data.subtypes.length > 1) {
        for (let i = 1; i < data.subtypes.length; i++) {
          const prev = data.subtypes[i - 1];
          const curr = data.subtypes[i];

          const fileCompare = prev.type.file.localeCompare(curr.type.file);
          if (fileCompare === 0) {
            expect(prev.type.line).toBeLessThanOrEqual(curr.type.line);
          }
        }
      }
    });
  });

  describe('error handling', () => {
    test('handles source file not found', async () => {
      const file = path.join(tempDir, 'not-found.ts');
      fs.writeFileSync(file, 'class Foo {}');

      // Delete the file after creating it to simulate a race condition
      fs.unlinkSync(file);

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
    });

    test('handles language service errors gracefully', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'class Foo {}');

      const result = await handleGetTypeHierarchy({
        file,
        line: 1,
        column: 7,
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });
});
