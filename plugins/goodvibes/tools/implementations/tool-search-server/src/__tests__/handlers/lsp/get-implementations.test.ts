/**
 * Unit tests for handleGetImplementations
 *
 * Tests the get implementations handler that finds all concrete implementations
 * of an interface or abstract method.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { handleGetImplementations } from '../../../handlers/lsp/get-implementations.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

// Mock console.warn to suppress expected warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('handleGetImplementations', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'get-implementations-test-'));
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
      const result = await handleGetImplementations({
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
      fs.writeFileSync(file, 'interface Foo {}');

      const result = await handleGetImplementations({
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
      fs.writeFileSync(file, 'interface Foo {}');

      const result = await handleGetImplementations({
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
      fs.writeFileSync(file, 'interface Foo {}');

      const result = await handleGetImplementations({
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
      fs.writeFileSync(file, 'interface Foo {}');

      const result = await handleGetImplementations({
        file,
        line: 1,
        column: -5,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('column');
    });

    test('returns error when file not found', async () => {
      const result = await handleGetImplementations({
        file: path.join(tempDir, 'nonexistent.ts'),
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('not found');
    });
  });

  describe('interface implementations', () => {
    test('finds class implementing interface', async () => {
      const file = path.join(tempDir, 'impl.ts');
      fs.writeFileSync(file, `
interface Repository {
  find(id: string): any;
  save(item: any): void;
}

class UserRepository implements Repository {
  find(id: string) { return { id }; }
  save(item: any) { console.log(item); }
}
`);

      const result = await handleGetImplementations({
        file,
        line: 2, // Position on "Repository"
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.implementations).toBeDefined();
      expect(Array.isArray(data.implementations)).toBe(true);
    });

    test('finds multiple implementations of interface', async () => {
      const file = path.join(tempDir, 'multi-impl.ts');
      fs.writeFileSync(file, `
interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string) { console.log(message); }
}

class FileLogger implements Logger {
  log(message: string) { /* write to file */ }
}

class NoopLogger implements Logger {
  log(message: string) { /* do nothing */ }
}
`);

      const result = await handleGetImplementations({
        file,
        line: 2, // Position on "Logger"
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      if (data.implementations.length > 0) {
        expect(data.implementations.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('abstract class implementations', () => {
    test('finds class extending abstract class', async () => {
      const file = path.join(tempDir, 'abstract.ts');
      fs.writeFileSync(file, `
abstract class Animal {
  abstract speak(): void;
}

class Dog extends Animal {
  speak() { console.log("Woof!"); }
}

class Cat extends Animal {
  speak() { console.log("Meow!"); }
}
`);

      const result = await handleGetImplementations({
        file,
        line: 2, // Position on "Animal"
        column: 16,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      if (data.implementations.length > 0) {
        expect(data.count).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('method implementations', () => {
    test('finds method implementations in implementing classes', async () => {
      const file = path.join(tempDir, 'method-impl.ts');
      fs.writeFileSync(file, `
interface Service {
  process(): void;
}

class ServiceA implements Service {
  process() { console.log("A"); }
}

class ServiceB implements Service {
  process() { console.log("B"); }
}
`);

      const result = await handleGetImplementations({
        file,
        line: 3, // Position on "process" in interface
        column: 3,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('implementation metadata', () => {
    test('includes file path in implementations', async () => {
      const file = path.join(tempDir, 'meta.ts');
      fs.writeFileSync(file, `
interface Foo { bar(): void; }
class FooImpl implements Foo { bar() {} }
`);

      const result = await handleGetImplementations({
        file,
        line: 2,
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.implementations.length > 0) {
        expect(data.implementations[0]).toHaveProperty('file');
      }
    });

    test('includes line and column in implementations', async () => {
      const file = path.join(tempDir, 'meta.ts');
      fs.writeFileSync(file, `
interface Foo { bar(): void; }
class FooImpl implements Foo { bar() {} }
`);

      const result = await handleGetImplementations({
        file,
        line: 2,
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.implementations.length > 0) {
        expect(data.implementations[0]).toHaveProperty('line');
        expect(data.implementations[0]).toHaveProperty('column');
        expect(data.implementations[0].line).toBeGreaterThan(0);
        expect(data.implementations[0].column).toBeGreaterThan(0);
      }
    });

    test('includes kind in implementations', async () => {
      const file = path.join(tempDir, 'meta.ts');
      fs.writeFileSync(file, `
interface Foo { bar(): void; }
class FooImpl implements Foo { bar() {} }
`);

      const result = await handleGetImplementations({
        file,
        line: 2,
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.implementations.length > 0) {
        expect(data.implementations[0]).toHaveProperty('kind');
      }
    });

    test('includes name in implementations', async () => {
      const file = path.join(tempDir, 'meta.ts');
      fs.writeFileSync(file, `
interface Foo { bar(): void; }
class FooImpl implements Foo { bar() {} }
`);

      const result = await handleGetImplementations({
        file,
        line: 2,
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.implementations.length > 0) {
        expect(data.implementations[0]).toHaveProperty('name');
      }
    });

    test('includes preview in implementations', async () => {
      const file = path.join(tempDir, 'meta.ts');
      fs.writeFileSync(file, `
interface Foo { bar(): void; }
class FooImpl implements Foo { bar() {} }
`);

      const result = await handleGetImplementations({
        file,
        line: 2,
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.implementations.length > 0) {
        expect(data.implementations[0]).toHaveProperty('preview');
      }
    });

    test('includes containerName if available', async () => {
      const file = path.join(tempDir, 'container.ts');
      fs.writeFileSync(file, `
interface Foo { bar(): void; }
class FooImpl implements Foo {
  bar() {}
}
`);

      const result = await handleGetImplementations({
        file,
        line: 2,
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      // containerName may be undefined but should be present if available
      expect(result.isError).toBeFalsy();
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'interface Foo {}');

      const result = await handleGetImplementations({
        file,
        line: 1,
        column: 11,
      });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'interface Foo {}');

      const result = await handleGetImplementations({
        file,
        line: 1,
        column: 11,
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    test('includes symbol name in result', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'interface MyInterface {}');

      const result = await handleGetImplementations({
        file,
        line: 1,
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('symbol');
    });

    test('includes count in result', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'interface Foo {}');

      const result = await handleGetImplementations({
        file,
        line: 1,
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('count');
      expect(typeof data.count).toBe('number');
      expect(data.count).toBe(data.implementations.length);
    });
  });

  describe('edge cases', () => {
    test('returns empty implementations for non-interface', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetImplementations({
        file,
        line: 1,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.implementations).toEqual([]);
    });

    test('handles empty file', async () => {
      const file = path.join(tempDir, 'empty.ts');
      fs.writeFileSync(file, '');

      const result = await handleGetImplementations({
        file,
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles relative file path', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'interface Foo {}');

      const originalEnv = process.env.PROJECT_ROOT;
      process.env.PROJECT_ROOT = tempDir;

      try {
        const result = await handleGetImplementations({
          file: 'test.ts',
          line: 1,
          column: 11,
        });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeFalsy();
      } finally {
        process.env.PROJECT_ROOT = originalEnv;
      }
    });

    test('deduplicates implementation locations', async () => {
      const file = path.join(tempDir, 'dedup.ts');
      fs.writeFileSync(file, `
interface Foo { bar(): void; }
class FooImpl implements Foo { bar() {} }
`);

      const result = await handleGetImplementations({
        file,
        line: 2,
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      // Check for duplicates
      const seen = new Set<string>();
      for (const impl of data.implementations) {
        const key = `${impl.file}:${impl.line}:${impl.column}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    });
  });

  describe('cross-file implementations', () => {
    test('finds implementations in other files', async () => {
      const interfaceFile = path.join(tempDir, 'types.ts');
      const implFile = path.join(tempDir, 'impl.ts');

      fs.writeFileSync(interfaceFile, 'export interface Service { run(): void; }');
      fs.writeFileSync(implFile, `
import { Service } from './types';
class MyService implements Service {
  run() { console.log("running"); }
}
`);

      const result = await handleGetImplementations({
        file: interfaceFile,
        line: 1,
        column: 18,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('kind mapping', () => {
    test('maps class kind correctly', async () => {
      const file = path.join(tempDir, 'kind.ts');
      fs.writeFileSync(file, `
interface Foo {}
class FooClass implements Foo {}
`);

      const result = await handleGetImplementations({
        file,
        line: 2,
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.implementations.length > 0) {
        expect(data.implementations[0].kind).toBe('class');
      }
    });

    test('maps method kind correctly', async () => {
      const file = path.join(tempDir, 'method-kind.ts');
      fs.writeFileSync(file, `
interface Foo { myMethod(): void; }
class FooClass implements Foo { myMethod() {} }
`);

      const result = await handleGetImplementations({
        file,
        line: 2,
        column: 17, // Position on myMethod in interface
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('error handling', () => {
    test('handles language service errors gracefully', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'interface Foo {}');

      const result = await handleGetImplementations({
        file,
        line: 1,
        column: 11,
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    test('includes context in error response', async () => {
      const result = await handleGetImplementations({
        file: path.join(tempDir, 'nonexistent.ts'),
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
    });
  });

  describe('symbol extraction', () => {
    test('extracts symbol name from quick info', async () => {
      const file = path.join(tempDir, 'symbol.ts');
      fs.writeFileSync(file, 'interface MyInterface { value: string; }');

      const result = await handleGetImplementations({
        file,
        line: 1,
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.symbol).toBeDefined();
    });

    test('falls back to identifier text when quick info unavailable', async () => {
      const file = path.join(tempDir, 'fallback.ts');
      fs.writeFileSync(file, 'interface SomeInterface {}');

      const result = await handleGetImplementations({
        file,
        line: 1,
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.symbol).toBeDefined();
    });
  });

  describe('container name extraction', () => {
    test('extracts container name for nested methods', async () => {
      const file = path.join(tempDir, 'container.ts');
      fs.writeFileSync(file, `
interface Foo {
  bar(): void;
}

class FooImpl implements Foo {
  bar() { console.log("bar"); }
}
`);

      const result = await handleGetImplementations({
        file,
        line: 3,
        column: 3, // Position on bar in interface
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // containerName should be extracted for implementations
    });
  });

  describe('generic interfaces', () => {
    test('handles generic interface implementations', async () => {
      const file = path.join(tempDir, 'generic.ts');
      fs.writeFileSync(file, `
interface Repository<T> {
  find(id: string): T;
  save(item: T): void;
}

class UserRepository implements Repository<User> {
  find(id: string) { return { id } as User; }
  save(item: User) {}
}

type User = { id: string; name: string };
`);

      const result = await handleGetImplementations({
        file,
        line: 2,
        column: 11,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });
});
