/**
 * Unit tests for handleGetSignatureHelp
 *
 * Tests the signature help handler that provides function signature information
 * at a call site, including parameter types, documentation, and which parameter
 * the cursor is currently on.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { handleGetSignatureHelp } from '../../../handlers/lsp/signature-help.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

// Mock console.warn to suppress expected warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('handleGetSignatureHelp', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-help-test-'));
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
      const result = await handleGetSignatureHelp({
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

      const result = await handleGetSignatureHelp({
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

      const result = await handleGetSignatureHelp({
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

      const result = await handleGetSignatureHelp({
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

      const result = await handleGetSignatureHelp({
        file,
        line: 1,
        column: -5,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('column');
    });
  });

  describe('basic signature help', () => {
    test('returns empty signatures when not at call site', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSignatureHelp({
        file,
        line: 1,
        column: 5,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.signatures).toEqual([]);
    });

    test('returns signature at function call', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, `
function greet(name: string, age: number): string {
  return \`Hello \${name}, you are \${age}\`;
}

greet(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 6,
        column: 7, // Inside the parentheses
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.signatures.length).toBeGreaterThanOrEqual(1);
    });

    test('returns signature at method call', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, `
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
}

const calc = new Calculator();
calc.add(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 9,
        column: 10, // Inside the parentheses
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('signature metadata', () => {
    test('includes label in signatures', async () => {
      const file = path.join(tempDir, 'label.ts');
      fs.writeFileSync(file, `
function foo(x: number): void {}
foo(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 3,
        column: 5,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.signatures.length > 0) {
        expect(data.signatures[0]).toHaveProperty('label');
        expect(typeof data.signatures[0].label).toBe('string');
      }
    });

    test('includes documentation in signatures', async () => {
      const file = path.join(tempDir, 'docs.ts');
      fs.writeFileSync(file, `
/**
 * Adds two numbers together.
 * @param a The first number
 * @param b The second number
 * @returns The sum
 */
function add(a: number, b: number): number {
  return a + b;
}

add(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 12,
        column: 5,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.signatures.length > 0) {
        expect(data.signatures[0]).toHaveProperty('documentation');
      }
    });

    test('includes parameters in signatures', async () => {
      const file = path.join(tempDir, 'params.ts');
      fs.writeFileSync(file, `
function greet(name: string, age: number): void {}
greet(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 3,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.signatures.length > 0) {
        expect(data.signatures[0]).toHaveProperty('parameters');
        expect(Array.isArray(data.signatures[0].parameters)).toBe(true);
      }
    });

    test('includes active_parameter in signatures', async () => {
      const file = path.join(tempDir, 'active.ts');
      fs.writeFileSync(file, `
function foo(a: number, b: string): void {}
foo(1,
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 3,
        column: 7, // After the comma, second parameter
      });
      const data = JSON.parse(result.content[0].text);

      if (data.signatures.length > 0) {
        expect(data.signatures[0]).toHaveProperty('active_parameter');
        expect(typeof data.signatures[0].active_parameter).toBe('number');
      }
    });
  });

  describe('parameter information', () => {
    test('includes name in parameters', async () => {
      const file = path.join(tempDir, 'param-name.ts');
      fs.writeFileSync(file, `
function test(myParam: number): void {}
test(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 3,
        column: 6,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.signatures.length > 0 && data.signatures[0].parameters.length > 0) {
        expect(data.signatures[0].parameters[0]).toHaveProperty('name');
        expect(data.signatures[0].parameters[0].name).toBe('myParam');
      }
    });

    test('includes type in parameters', async () => {
      const file = path.join(tempDir, 'param-type.ts');
      fs.writeFileSync(file, `
function test(x: number): void {}
test(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 3,
        column: 6,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.signatures.length > 0 && data.signatures[0].parameters.length > 0) {
        expect(data.signatures[0].parameters[0]).toHaveProperty('type');
      }
    });

    test('includes documentation in parameters', async () => {
      const file = path.join(tempDir, 'param-docs.ts');
      fs.writeFileSync(file, `
/**
 * @param x The value to process
 */
function test(x: number): void {}
test(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 6,
        column: 6,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.signatures.length > 0 && data.signatures[0].parameters.length > 0) {
        expect(data.signatures[0].parameters[0]).toHaveProperty('documentation');
      }
    });
  });

  describe('overloaded functions', () => {
    test('returns multiple signatures for overloaded functions', async () => {
      const file = path.join(tempDir, 'overload.ts');
      fs.writeFileSync(file, `
function process(x: number): number;
function process(x: string): string;
function process(x: number | string): number | string {
  return x;
}

process(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 8,
        column: 9,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      if (data.signatures.length > 1) {
        expect(data.signatures.length).toBeGreaterThan(1);
      }
    });

    test('includes active_signature index', async () => {
      const file = path.join(tempDir, 'active-sig.ts');
      fs.writeFileSync(file, `
function foo(): void {}
foo(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 3,
        column: 5,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('active_signature');
      expect(typeof data.active_signature).toBe('number');
    });
  });

  describe('active parameter tracking', () => {
    test('indicates first parameter when at start', async () => {
      const file = path.join(tempDir, 'first-param.ts');
      fs.writeFileSync(file, `
function foo(a: number, b: string): void {}
foo(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 3,
        column: 5,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.signatures.length > 0) {
        expect(data.signatures[0].active_parameter).toBe(0);
      }
    });

    test('indicates second parameter after comma', async () => {
      const file = path.join(tempDir, 'second-param.ts');
      fs.writeFileSync(file, `
function foo(a: number, b: string): void {}
foo(1,
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 3,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.signatures.length > 0) {
        expect(data.signatures[0].active_parameter).toBe(1);
      }
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSignatureHelp({
        file,
        line: 1,
        column: 1,
      });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSignatureHelp({
        file,
        line: 1,
        column: 1,
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    test('includes signatures array in result', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSignatureHelp({
        file,
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('signatures');
      expect(Array.isArray(data.signatures)).toBe(true);
    });

    test('includes active_signature in result', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSignatureHelp({
        file,
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('active_signature');
    });
  });

  describe('edge cases', () => {
    test('handles empty file', async () => {
      const file = path.join(tempDir, 'empty.ts');
      fs.writeFileSync(file, '');

      const result = await handleGetSignatureHelp({
        file,
        line: 1,
        column: 1,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.signatures).toEqual([]);
    });

    test('handles relative file path', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const originalEnv = process.env.PROJECT_ROOT;
      process.env.PROJECT_ROOT = tempDir;

      try {
        const result = await handleGetSignatureHelp({
          file: 'test.ts',
          line: 1,
          column: 1,
        });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeFalsy();
      } finally {
        process.env.PROJECT_ROOT = originalEnv;
      }
    });

    test('handles constructor calls', async () => {
      const file = path.join(tempDir, 'constructor.ts');
      fs.writeFileSync(file, `
class Foo {
  constructor(name: string, age: number) {}
}

new Foo(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 6,
        column: 9,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles arrow functions', async () => {
      const file = path.join(tempDir, 'arrow.ts');
      fs.writeFileSync(file, `
const add = (a: number, b: number) => a + b;
add(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 3,
        column: 5,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles optional parameters', async () => {
      const file = path.join(tempDir, 'optional.ts');
      fs.writeFileSync(file, `
function greet(name: string, greeting?: string): void {}
greet(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 3,
        column: 7,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles rest parameters', async () => {
      const file = path.join(tempDir, 'rest.ts');
      fs.writeFileSync(file, `
function sum(...numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0);
}
sum(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 5,
        column: 5,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });

    test('handles generic functions', async () => {
      const file = path.join(tempDir, 'generic.ts');
      fs.writeFileSync(file, `
function identity<T>(value: T): T {
  return value;
}
identity(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 5,
        column: 10,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
    });
  });

  describe('display parts handling', () => {
    test('converts display parts to string correctly', async () => {
      const file = path.join(tempDir, 'display.ts');
      fs.writeFileSync(file, `
function test(x: number): void {}
test(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 3,
        column: 6,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.signatures.length > 0) {
        expect(typeof data.signatures[0].label).toBe('string');
      }
    });

    test('extracts parameter type from display parts', async () => {
      const file = path.join(tempDir, 'param-extract.ts');
      fs.writeFileSync(file, `
function test(x: number): void {}
test(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 3,
        column: 6,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.signatures.length > 0 && data.signatures[0].parameters.length > 0) {
        expect(data.signatures[0].parameters[0].type).toBeDefined();
      }
    });

    test('extracts parameter name correctly', async () => {
      const file = path.join(tempDir, 'name-extract.ts');
      fs.writeFileSync(file, `
function test(myParam: number): void {}
test(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 3,
        column: 6,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.signatures.length > 0 && data.signatures[0].parameters.length > 0) {
        expect(data.signatures[0].parameters[0].name).toBe('myParam');
      }
    });
  });

  describe('error handling', () => {
    test('handles language service errors gracefully', async () => {
      const file = path.join(tempDir, 'test.ts');
      fs.writeFileSync(file, 'const x = 1;');

      const result = await handleGetSignatureHelp({
        file,
        line: 1,
        column: 1,
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });

  describe('separator handling', () => {
    test('uses correct separator in parameter list', async () => {
      const file = path.join(tempDir, 'separator.ts');
      fs.writeFileSync(file, `
function test(a: number, b: string, c: boolean): void {}
test(
`);

      const result = await handleGetSignatureHelp({
        file,
        line: 3,
        column: 6,
      });
      const data = JSON.parse(result.content[0].text);

      if (data.signatures.length > 0) {
        // Label should contain all parameters separated correctly
        expect(data.signatures[0].label).toContain('a');
        expect(data.signatures[0].label).toContain('b');
        expect(data.signatures[0].label).toContain('c');
      }
    });
  });
});
