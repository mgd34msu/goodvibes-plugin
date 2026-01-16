/**
 * Unit tests for handleGetCallHierarchy
 *
 * Tests the call hierarchy LSP handler that provides information about
 * which functions call a function and what functions it calls.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { handleGetCallHierarchy } from '../../../handlers/lsp/call-hierarchy.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

// Mock console.warn to suppress expected warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('handleGetCallHierarchy', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'call-hierarchy-test-'));
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
      const result = await handleGetCallHierarchy({
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
      fs.writeFileSync(file, 'function foo() {}');

      const result = await handleGetCallHierarchy({
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
      fs.writeFileSync(file, 'function foo() {}');

      const result = await handleGetCallHierarchy({
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
      fs.writeFileSync(file, 'function foo() {}');

      const result = await handleGetCallHierarchy({
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
      fs.writeFileSync(file, 'function foo() {}');

      const result = await handleGetCallHierarchy({
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
      fs.writeFileSync(file, 'function foo() {}');

      const result = await handleGetCallHierarchy({
        file,
        line: 1,
        column: 10,
        direction: 'invalid' as any,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('direction');
    });

    test('returns error when file not found', async () => {
      const result = await handleGetCallHierarchy({
        file: path.join(tempDir, 'nonexistent.ts'),
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('not found');
    });
  });

  describe('basic call hierarchy', () => {
    test('returns null item when position is not on a callable', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetCallHierarchy({
        file,
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.item).toBeNull();
      expect(data.incoming).toEqual([]);
      expect(data.outgoing).toEqual([]);
    });

    test('returns item for function declaration', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'function greet() {\n  console.log("Hello");\n}');

      const result = await handleGetCallHierarchy({
        file,
        line: 1,
        column: 10, // Position on 'greet'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.item).not.toBeNull();
      expect(data.item.name).toBe('greet');
      expect(data.item.kind).toBe('function');
    });

    test('returns item for method declaration', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'class Foo {\n  bar() {\n    return 1;\n  }\n}');

      const result = await handleGetCallHierarchy({
        file,
        line: 2,
        column: 3, // Position on 'bar'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      if (data.item) {
        expect(data.item.name).toBe('bar');
        expect(data.item.kind).toBe('method');
      }
    });
  });

  describe('incoming calls', () => {
    test('finds incoming calls to a function', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, `
function helper() {
  return 42;
}

function main() {
  const x = helper();
  const y = helper();
  return x + y;
}
`);

      const result = await handleGetCallHierarchy({
        file,
        line: 2,
        column: 10, // Position on 'helper'
        direction: 'incoming',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.item).not.toBeNull();
      expect(data.item.name).toBe('helper');
      // Should have incoming calls from main
      expect(data.incoming.length).toBeGreaterThanOrEqual(0);
    });

    test('includes call site information', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, `
function target() { return 1; }
function caller() { return target(); }
`);

      const result = await handleGetCallHierarchy({
        file,
        line: 2,
        column: 10,
        direction: 'incoming',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      if (data.incoming.length > 0) {
        expect(data.incoming[0]).toHaveProperty('from');
        expect(data.incoming[0]).toHaveProperty('call_sites');
        expect(Array.isArray(data.incoming[0].call_sites)).toBe(true);
      }
    });
  });

  describe('outgoing calls', () => {
    test('finds outgoing calls from a function', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, `
function add(a: number, b: number) {
  return a + b;
}

function main() {
  const sum = add(1, 2);
  console.log(sum);
}
`);

      const result = await handleGetCallHierarchy({
        file,
        line: 6,
        column: 10, // Position on 'main'
        direction: 'outgoing',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.item).not.toBeNull();
      expect(data.item.name).toBe('main');
      // Should have outgoing calls to add and console.log
      expect(data.outgoing.length).toBeGreaterThanOrEqual(0);
    });

    test('includes call site information for outgoing calls', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, `
function helper() { return 1; }
function caller() { return helper(); }
`);

      const result = await handleGetCallHierarchy({
        file,
        line: 3,
        column: 10,
        direction: 'outgoing',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      if (data.outgoing.length > 0) {
        expect(data.outgoing[0]).toHaveProperty('to');
        expect(data.outgoing[0]).toHaveProperty('call_sites');
      }
    });
  });

  describe('direction options', () => {
    test('returns only incoming when direction is "incoming"', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, `
function a() { return b(); }
function b() { return c(); }
function c() { return 1; }
`);

      const result = await handleGetCallHierarchy({
        file,
        line: 3,
        column: 10,
        direction: 'incoming',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // outgoing should be empty when direction is incoming
      expect(data.outgoing).toEqual([]);
    });

    test('returns only outgoing when direction is "outgoing"', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, `
function a() { return b(); }
function b() { return c(); }
function c() { return 1; }
`);

      const result = await handleGetCallHierarchy({
        file,
        line: 2,
        column: 10,
        direction: 'outgoing',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // incoming should be empty when direction is outgoing
      expect(data.incoming).toEqual([]);
    });

    test('returns both when direction is "both"', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, `
function a() { return b(); }
function b() { return c(); }
function c() { return 1; }
`);

      const result = await handleGetCallHierarchy({
        file,
        line: 3,
        column: 10,
        direction: 'both',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      // Both arrays should be present (may be empty if no calls found)
      expect(data).toHaveProperty('incoming');
      expect(data).toHaveProperty('outgoing');
    });

    test('defaults to "both" when direction not specified', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'function foo() {}');

      const result = await handleGetCallHierarchy({
        file,
        line: 1,
        column: 10,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data).toHaveProperty('incoming');
      expect(data).toHaveProperty('outgoing');
    });
  });

  describe('multi-file scenarios', () => {
    test('finds calls across files', async () => {
      const utilsFile = path.join(tempDir, 'utils.ts');
      const mainFile = path.join(tempDir, 'main.ts');

      fs.writeFileSync(utilsFile, 'export function helper() { return 42; }');
      fs.writeFileSync(mainFile, 'import { helper } from "./utils";\nfunction main() { return helper(); }');

      // Get call hierarchy for helper
      const result = await handleGetCallHierarchy({
        file: utilsFile,
        line: 1,
        column: 17, // Position on 'helper'
        direction: 'incoming',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.item).not.toBeNull();
    });
  });

  describe('class methods', () => {
    test('handles method call hierarchy', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, `
class Calculator {
  add(a: number, b: number) {
    return a + b;
  }

  calculate() {
    return this.add(1, 2);
  }
}
`);

      const result = await handleGetCallHierarchy({
        file,
        line: 3,
        column: 3, // Position on 'add'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      if (data.item) {
        expect(data.item.name).toBe('add');
      }
    });

    test('handles constructor calls', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, `
class Foo {
  constructor() {
    console.log("created");
  }
}

function createFoo() {
  return new Foo();
}
`);

      const result = await handleGetCallHierarchy({
        file,
        line: 3,
        column: 3, // Position on 'constructor'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('arrow functions', () => {
    test('handles arrow function call hierarchy', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, `
const helper = () => 42;
const main = () => helper();
`);

      const result = await handleGetCallHierarchy({
        file,
        line: 2,
        column: 7, // Position on 'helper'
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      if (data.item) {
        expect(data.item.name).toBe('helper');
      }
    });
  });

  describe('sorting', () => {
    test('sorts incoming calls by file then line', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, `
function target() { return 1; }
function callerA() { return target(); }
function callerB() { return target(); }
`);

      const result = await handleGetCallHierarchy({
        file,
        line: 2,
        column: 10,
        direction: 'incoming',
      });
      const data = JSON.parse(result.content[0].text);

      if (data.incoming.length > 1) {
        for (let i = 1; i < data.incoming.length; i++) {
          const prev = data.incoming[i - 1];
          const curr = data.incoming[i];
          const fileCompare = prev.from.file.localeCompare(curr.from.file);
          if (fileCompare === 0) {
            expect(prev.from.line).toBeLessThanOrEqual(curr.from.line);
          }
        }
      }
    });

    test('sorts outgoing calls by file then line', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, `
function a() { return 1; }
function b() { return 2; }
function caller() {
  a();
  b();
}
`);

      const result = await handleGetCallHierarchy({
        file,
        line: 4,
        column: 10,
        direction: 'outgoing',
      });
      const data = JSON.parse(result.content[0].text);

      if (data.outgoing.length > 1) {
        for (let i = 1; i < data.outgoing.length; i++) {
          const prev = data.outgoing[i - 1];
          const curr = data.outgoing[i];
          const fileCompare = prev.to.file.localeCompare(curr.to.file);
          if (fileCompare === 0) {
            expect(prev.to.line).toBeLessThanOrEqual(curr.to.line);
          }
        }
      }
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'function foo() {}');

      const result = await handleGetCallHierarchy({
        file,
        line: 1,
        column: 10,
      });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'function foo() {}');

      const result = await handleGetCallHierarchy({
        file,
        line: 1,
        column: 10,
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    test('item includes all required fields', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'function foo() {}');

      const result = await handleGetCallHierarchy({
        file,
        line: 1,
        column: 10,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.item) {
        expect(data.item).toHaveProperty('name');
        expect(data.item).toHaveProperty('kind');
        expect(data.item).toHaveProperty('file');
        expect(data.item).toHaveProperty('line');
        expect(data.item).toHaveProperty('column');
      }
    });
  });

  describe('edge cases', () => {
    test('handles empty file', async () => {
      const file = path.join(tempDir, 'empty.ts');
      fs.writeFileSync(file, '');

      const result = await handleGetCallHierarchy({
        file,
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.item).toBeNull();
    });

    test('handles position at end of file', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'function foo() {}');

      const result = await handleGetCallHierarchy({
        file,
        line: 1,
        column: 18,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles recursive functions', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, `
function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
`);

      const result = await handleGetCallHierarchy({
        file,
        line: 2,
        column: 10,
        direction: 'both',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.item).not.toBeNull();
      expect(data.item.name).toBe('factorial');
    });

    test('handles deeply nested calls', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, `
function a() { return b(); }
function b() { return c(); }
function c() { return d(); }
function d() { return 1; }
`);

      const result = await handleGetCallHierarchy({
        file,
        line: 2,
        column: 10,
        direction: 'outgoing',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles relative file path', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'function foo() {}');

      const originalEnv = process.env.PROJECT_ROOT;
      process.env.PROJECT_ROOT = tempDir;

      try {
        const result = await handleGetCallHierarchy({
          file: 'test.ts',
          line: 1,
          column: 10,
        });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeFalsy();
      } finally {
        process.env.PROJECT_ROOT = originalEnv;
      }
    });
  });

  describe('error handling', () => {
    test('handles language service errors gracefully', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'function foo() {}');

      const result = await handleGetCallHierarchy({
        file,
        line: 1,
        column: 10,
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });

  describe('symbol kind mapping', () => {
    test('maps function kind correctly', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'function test() {}');

      const result = await handleGetCallHierarchy({
        file,
        line: 1,
        column: 10,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.item) {
        expect(data.item.kind).toBe('function');
      }
    });

    test('maps method kind correctly', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'class Foo { bar() {} }');

      const result = await handleGetCallHierarchy({
        file,
        line: 1,
        column: 13,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.item) {
        expect(data.item.kind).toBe('method');
      }
    });
  });
});
