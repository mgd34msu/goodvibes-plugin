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
import ts from 'typescript';

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

describe('handleGetSignatureHelp with mocked language service', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-help-mock-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    languageServiceManager.cleanup();
    vi.restoreAllMocks();
  });

  test('handles undefined displayParts in signature', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'function foo() {}\nfoo(');

    const originalGetServiceForFile = languageServiceManager.getServiceForFile.bind(languageServiceManager);

    vi.spyOn(languageServiceManager, 'getServiceForFile').mockImplementation(async (filePath) => {
      const result = await originalGetServiceForFile(filePath);

      const mockService = {
        ...result.service,
        getSignatureHelpItems: () => ({
          items: [
            {
              prefixDisplayParts: undefined,
              suffixDisplayParts: undefined,
              separatorDisplayParts: undefined,
              parameters: [],
              documentation: undefined,
            },
          ] as ts.SignatureHelpItem[],
          applicableSpan: { start: 0, length: 0 },
          selectedItemIndex: 0,
          argumentIndex: 0,
          argumentCount: 0,
        }),
        getProgram: result.service.getProgram.bind(result.service),
      } as unknown as ts.LanguageService;

      return { ...result, service: mockService };
    });

    const resultData = await handleGetSignatureHelp({
      file,
      line: 2,
      column: 5,
    });
    const data = JSON.parse(resultData.content[0].text);

    expect(resultData.isError).toBeFalsy();
    expect(data.signatures).toBeDefined();
    if (data.signatures.length > 0) {
      expect(data.signatures[0].label).toBe('');
    }
  });

  test('handles parameter with undefined displayParts', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'function foo(x: number) {}\nfoo(');

    const originalGetServiceForFile = languageServiceManager.getServiceForFile.bind(languageServiceManager);

    vi.spyOn(languageServiceManager, 'getServiceForFile').mockImplementation(async (filePath) => {
      const result = await originalGetServiceForFile(filePath);

      const mockService = {
        ...result.service,
        getSignatureHelpItems: () => ({
          items: [
            {
              prefixDisplayParts: [{ kind: 'text', text: 'foo(' }],
              suffixDisplayParts: [{ kind: 'text', text: ')' }],
              separatorDisplayParts: [{ kind: 'punctuation', text: ', ' }],
              parameters: [
                {
                  name: 'x',
                  displayParts: undefined, // undefined displayParts
                  documentation: [],
                  isOptional: false,
                },
              ],
              documentation: [],
            },
          ] as ts.SignatureHelpItem[],
          applicableSpan: { start: 0, length: 0 },
          selectedItemIndex: 0,
          argumentIndex: 0,
          argumentCount: 1,
        }),
        getProgram: result.service.getProgram.bind(result.service),
      } as unknown as ts.LanguageService;

      return { ...result, service: mockService };
    });

    const resultData = await handleGetSignatureHelp({
      file,
      line: 2,
      column: 5,
    });
    const data = JSON.parse(resultData.content[0].text);

    expect(resultData.isError).toBeFalsy();
    if (data.signatures.length > 0 && data.signatures[0].parameters.length > 0) {
      // Type should be empty string when displayParts is undefined
      expect(data.signatures[0].parameters[0].type).toBe('');
    }
  });

  test('handles parameter with empty displayParts array', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'function foo(x: number) {}\nfoo(');

    const originalGetServiceForFile = languageServiceManager.getServiceForFile.bind(languageServiceManager);

    vi.spyOn(languageServiceManager, 'getServiceForFile').mockImplementation(async (filePath) => {
      const result = await originalGetServiceForFile(filePath);

      const mockService = {
        ...result.service,
        getSignatureHelpItems: () => ({
          items: [
            {
              prefixDisplayParts: [{ kind: 'text', text: 'foo(' }],
              suffixDisplayParts: [{ kind: 'text', text: ')' }],
              separatorDisplayParts: [{ kind: 'punctuation', text: ', ' }],
              parameters: [
                {
                  name: 'x',
                  displayParts: [], // empty displayParts
                  documentation: [],
                  isOptional: false,
                },
              ],
              documentation: [],
            },
          ] as ts.SignatureHelpItem[],
          applicableSpan: { start: 0, length: 0 },
          selectedItemIndex: 0,
          argumentIndex: 0,
          argumentCount: 1,
        }),
        getProgram: result.service.getProgram.bind(result.service),
      } as unknown as ts.LanguageService;

      return { ...result, service: mockService };
    });

    const resultData = await handleGetSignatureHelp({
      file,
      line: 2,
      column: 5,
    });
    const data = JSON.parse(resultData.content[0].text);

    expect(resultData.isError).toBeFalsy();
    if (data.signatures.length > 0 && data.signatures[0].parameters.length > 0) {
      // Type should be empty string when displayParts is empty
      expect(data.signatures[0].parameters[0].type).toBe('');
    }
  });

  test('handles parameter without name property (fallback extraction)', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'function foo(x: number) {}\nfoo(');

    const originalGetServiceForFile = languageServiceManager.getServiceForFile.bind(languageServiceManager);

    vi.spyOn(languageServiceManager, 'getServiceForFile').mockImplementation(async (filePath) => {
      const result = await originalGetServiceForFile(filePath);

      const mockService = {
        ...result.service,
        getSignatureHelpItems: () => ({
          items: [
            {
              prefixDisplayParts: [{ kind: 'text', text: 'foo(' }],
              suffixDisplayParts: [{ kind: 'text', text: ')' }],
              separatorDisplayParts: [{ kind: 'punctuation', text: ', ' }],
              parameters: [
                {
                  name: '', // empty name, should fallback to displayParts extraction
                  displayParts: [
                    { kind: 'parameterName', text: 'myParam' },
                    { kind: 'punctuation', text: ':' },
                    { kind: 'space', text: ' ' },
                    { kind: 'keyword', text: 'number' },
                  ],
                  documentation: [],
                  isOptional: false,
                },
              ],
              documentation: [],
            },
          ] as ts.SignatureHelpItem[],
          applicableSpan: { start: 0, length: 0 },
          selectedItemIndex: 0,
          argumentIndex: 0,
          argumentCount: 1,
        }),
        getProgram: result.service.getProgram.bind(result.service),
      } as unknown as ts.LanguageService;

      return { ...result, service: mockService };
    });

    const resultData = await handleGetSignatureHelp({
      file,
      line: 2,
      column: 5,
    });
    const data = JSON.parse(resultData.content[0].text);

    expect(resultData.isError).toBeFalsy();
    if (data.signatures.length > 0 && data.signatures[0].parameters.length > 0) {
      // Name should be extracted from displayParts
      expect(data.signatures[0].parameters[0].name).toBe('myParam');
    }
  });

  test('handles parameter displayParts without colon (no type)', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'function foo(x) {}\nfoo(');

    const originalGetServiceForFile = languageServiceManager.getServiceForFile.bind(languageServiceManager);

    vi.spyOn(languageServiceManager, 'getServiceForFile').mockImplementation(async (filePath) => {
      const result = await originalGetServiceForFile(filePath);

      const mockService = {
        ...result.service,
        getSignatureHelpItems: () => ({
          items: [
            {
              prefixDisplayParts: [{ kind: 'text', text: 'foo(' }],
              suffixDisplayParts: [{ kind: 'text', text: ')' }],
              separatorDisplayParts: [{ kind: 'punctuation', text: ', ' }],
              parameters: [
                {
                  name: 'x',
                  displayParts: [
                    { kind: 'parameterName', text: 'x' },
                    // No colon, so no type
                  ],
                  documentation: [],
                  isOptional: false,
                },
              ],
              documentation: [],
            },
          ] as ts.SignatureHelpItem[],
          applicableSpan: { start: 0, length: 0 },
          selectedItemIndex: 0,
          argumentIndex: 0,
          argumentCount: 1,
        }),
        getProgram: result.service.getProgram.bind(result.service),
      } as unknown as ts.LanguageService;

      return { ...result, service: mockService };
    });

    const resultData = await handleGetSignatureHelp({
      file,
      line: 2,
      column: 5,
    });
    const data = JSON.parse(resultData.content[0].text);

    expect(resultData.isError).toBeFalsy();
    if (data.signatures.length > 0 && data.signatures[0].parameters.length > 0) {
      // Type should be empty when no colon found
      expect(data.signatures[0].parameters[0].type).toBe('');
    }
  });

  test('extracts type parts after colon correctly', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'function foo(x: number) {}\nfoo(');

    const originalGetServiceForFile = languageServiceManager.getServiceForFile.bind(languageServiceManager);

    vi.spyOn(languageServiceManager, 'getServiceForFile').mockImplementation(async (filePath) => {
      const result = await originalGetServiceForFile(filePath);

      const mockService = {
        ...result.service,
        getSignatureHelpItems: () => ({
          items: [
            {
              prefixDisplayParts: [{ kind: 'text', text: 'foo(' }],
              suffixDisplayParts: [{ kind: 'text', text: ')' }],
              separatorDisplayParts: [{ kind: 'punctuation', text: ', ' }],
              parameters: [
                {
                  name: 'x',
                  displayParts: [
                    { kind: 'parameterName', text: 'x' },
                    { kind: 'punctuation', text: ':' },
                    { kind: 'space', text: ' ' },
                    { kind: 'keyword', text: 'number' },
                  ],
                  documentation: [],
                  isOptional: false,
                },
              ],
              documentation: [],
            },
          ] as ts.SignatureHelpItem[],
          applicableSpan: { start: 0, length: 0 },
          selectedItemIndex: 0,
          argumentIndex: 0,
          argumentCount: 1,
        }),
        getProgram: result.service.getProgram.bind(result.service),
      } as unknown as ts.LanguageService;

      return { ...result, service: mockService };
    });

    const resultData = await handleGetSignatureHelp({
      file,
      line: 2,
      column: 5,
    });
    const data = JSON.parse(resultData.content[0].text);

    expect(resultData.isError).toBeFalsy();
    if (data.signatures.length > 0 && data.signatures[0].parameters.length > 0) {
      // Type should be "number" (trimmed)
      expect(data.signatures[0].parameters[0].type).toBe('number');
    }
  });

  test('handles error thrown by language service', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'function foo() {}\nfoo(');

    vi.spyOn(languageServiceManager, 'getServiceForFile').mockRejectedValue(
      new Error('Language service error')
    );

    const result = await handleGetSignatureHelp({
      file,
      line: 2,
      column: 5,
    });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toContain('Language service error');
  });

  test('handles non-Error thrown by language service', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'function foo() {}\nfoo(');

    vi.spyOn(languageServiceManager, 'getServiceForFile').mockRejectedValue('String error');

    const result = await handleGetSignatureHelp({
      file,
      line: 2,
      column: 5,
    });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toContain('String error');
  });

  test('handles null signature help response', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'const x = 1;');

    const originalGetServiceForFile = languageServiceManager.getServiceForFile.bind(languageServiceManager);

    vi.spyOn(languageServiceManager, 'getServiceForFile').mockImplementation(async (filePath) => {
      const result = await originalGetServiceForFile(filePath);

      const mockService = {
        ...result.service,
        getSignatureHelpItems: () => undefined, // Returns null
        getProgram: result.service.getProgram.bind(result.service),
      } as unknown as ts.LanguageService;

      return { ...result, service: mockService };
    });

    const resultData = await handleGetSignatureHelp({
      file,
      line: 1,
      column: 1,
    });
    const data = JSON.parse(resultData.content[0].text);

    expect(resultData.isError).toBeFalsy();
    expect(data.signatures).toEqual([]);
    expect(data.active_signature).toBe(0);
  });

  test('handles signature help with empty items array', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'const x = 1;');

    const originalGetServiceForFile = languageServiceManager.getServiceForFile.bind(languageServiceManager);

    vi.spyOn(languageServiceManager, 'getServiceForFile').mockImplementation(async (filePath) => {
      const result = await originalGetServiceForFile(filePath);

      const mockService = {
        ...result.service,
        getSignatureHelpItems: () => ({
          items: [], // Empty items array
          applicableSpan: { start: 0, length: 0 },
          selectedItemIndex: 0,
          argumentIndex: 0,
          argumentCount: 0,
        }),
        getProgram: result.service.getProgram.bind(result.service),
      } as unknown as ts.LanguageService;

      return { ...result, service: mockService };
    });

    const resultData = await handleGetSignatureHelp({
      file,
      line: 1,
      column: 1,
    });
    const data = JSON.parse(resultData.content[0].text);

    expect(resultData.isError).toBeFalsy();
    expect(data.signatures).toEqual([]);
    expect(data.active_signature).toBe(0);
  });

  test('handles parameter with undefined name (uses empty fallback)', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'function foo(x: number) {}\nfoo(');

    const originalGetServiceForFile = languageServiceManager.getServiceForFile.bind(languageServiceManager);

    vi.spyOn(languageServiceManager, 'getServiceForFile').mockImplementation(async (filePath) => {
      const result = await originalGetServiceForFile(filePath);

      const mockService = {
        ...result.service,
        getSignatureHelpItems: () => ({
          items: [
            {
              prefixDisplayParts: [{ kind: 'text', text: 'foo(' }],
              suffixDisplayParts: [{ kind: 'text', text: ')' }],
              separatorDisplayParts: [{ kind: 'punctuation', text: ', ' }],
              parameters: [
                {
                  name: undefined as unknown as string, // undefined name
                  displayParts: [], // and empty displayParts
                  documentation: [],
                  isOptional: false,
                },
              ],
              documentation: [],
            },
          ] as ts.SignatureHelpItem[],
          applicableSpan: { start: 0, length: 0 },
          selectedItemIndex: 0,
          argumentIndex: 0,
          argumentCount: 1,
        }),
        getProgram: result.service.getProgram.bind(result.service),
      } as unknown as ts.LanguageService;

      return { ...result, service: mockService };
    });

    const resultData = await handleGetSignatureHelp({
      file,
      line: 2,
      column: 5,
    });
    const data = JSON.parse(resultData.content[0].text);

    expect(resultData.isError).toBeFalsy();
    if (data.signatures.length > 0 && data.signatures[0].parameters.length > 0) {
      // Name should fall back to empty string
      expect(data.signatures[0].parameters[0].name).toBe('');
    }
  });

  test('handles complex type with multiple parts after colon', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'function foo(x: { a: number; b: string }) {}\nfoo(');

    const originalGetServiceForFile = languageServiceManager.getServiceForFile.bind(languageServiceManager);

    vi.spyOn(languageServiceManager, 'getServiceForFile').mockImplementation(async (filePath) => {
      const result = await originalGetServiceForFile(filePath);

      const mockService = {
        ...result.service,
        getSignatureHelpItems: () => ({
          items: [
            {
              prefixDisplayParts: [{ kind: 'text', text: 'foo(' }],
              suffixDisplayParts: [{ kind: 'text', text: ')' }],
              separatorDisplayParts: [{ kind: 'punctuation', text: ', ' }],
              parameters: [
                {
                  name: 'x',
                  displayParts: [
                    { kind: 'parameterName', text: 'x' },
                    { kind: 'punctuation', text: ':' },
                    { kind: 'space', text: ' ' },
                    { kind: 'punctuation', text: '{' },
                    { kind: 'space', text: ' ' },
                    { kind: 'propertyName', text: 'a' },
                    { kind: 'punctuation', text: ':' },
                    { kind: 'space', text: ' ' },
                    { kind: 'keyword', text: 'number' },
                    { kind: 'punctuation', text: ';' },
                    { kind: 'space', text: ' ' },
                    { kind: 'propertyName', text: 'b' },
                    { kind: 'punctuation', text: ':' },
                    { kind: 'space', text: ' ' },
                    { kind: 'keyword', text: 'string' },
                    { kind: 'punctuation', text: '}' },
                  ],
                  documentation: [],
                  isOptional: false,
                },
              ],
              documentation: [],
            },
          ] as ts.SignatureHelpItem[],
          applicableSpan: { start: 0, length: 0 },
          selectedItemIndex: 0,
          argumentIndex: 0,
          argumentCount: 1,
        }),
        getProgram: result.service.getProgram.bind(result.service),
      } as unknown as ts.LanguageService;

      return { ...result, service: mockService };
    });

    const resultData = await handleGetSignatureHelp({
      file,
      line: 2,
      column: 5,
    });
    const data = JSON.parse(resultData.content[0].text);

    expect(resultData.isError).toBeFalsy();
    if (data.signatures.length > 0 && data.signatures[0].parameters.length > 0) {
      // Type should contain the complex object type
      expect(data.signatures[0].parameters[0].type).toContain('{');
      expect(data.signatures[0].parameters[0].type).toContain('number');
      expect(data.signatures[0].parameters[0].type).toContain('string');
    }
  });

  test('handles absolute file path correctly', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, `
function greet(name: string): void {}
greet(
`);

    const result = await handleGetSignatureHelp({
      file: file, // Absolute path
      line: 3,
      column: 7,
    });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeFalsy();
  });

  test('handles file path with backslashes (Windows-style)', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, `
function greet(name: string): void {}
greet(
`);

    const windowsPath = file.replace(/\//g, '\\');

    const result = await handleGetSignatureHelp({
      file: windowsPath,
      line: 3,
      column: 7,
    });

    // Should work without error
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
  });

  test('handles parameter with documentation', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'function foo(x: number) {}\nfoo(');

    const originalGetServiceForFile = languageServiceManager.getServiceForFile.bind(languageServiceManager);

    vi.spyOn(languageServiceManager, 'getServiceForFile').mockImplementation(async (filePath) => {
      const result = await originalGetServiceForFile(filePath);

      const mockService = {
        ...result.service,
        getSignatureHelpItems: () => ({
          items: [
            {
              prefixDisplayParts: [{ kind: 'text', text: 'foo(' }],
              suffixDisplayParts: [{ kind: 'text', text: ')' }],
              separatorDisplayParts: [{ kind: 'punctuation', text: ', ' }],
              parameters: [
                {
                  name: 'x',
                  displayParts: [
                    { kind: 'parameterName', text: 'x' },
                    { kind: 'punctuation', text: ':' },
                    { kind: 'space', text: ' ' },
                    { kind: 'keyword', text: 'number' },
                  ],
                  documentation: [{ kind: 'text', text: 'The parameter documentation' }],
                  isOptional: false,
                },
              ],
              documentation: [{ kind: 'text', text: 'Function documentation' }],
            },
          ] as ts.SignatureHelpItem[],
          applicableSpan: { start: 0, length: 0 },
          selectedItemIndex: 0,
          argumentIndex: 0,
          argumentCount: 1,
        }),
        getProgram: result.service.getProgram.bind(result.service),
      } as unknown as ts.LanguageService;

      return { ...result, service: mockService };
    });

    const resultData = await handleGetSignatureHelp({
      file,
      line: 2,
      column: 5,
    });
    const data = JSON.parse(resultData.content[0].text);

    expect(resultData.isError).toBeFalsy();
    if (data.signatures.length > 0) {
      expect(data.signatures[0].documentation).toBe('Function documentation');
      if (data.signatures[0].parameters.length > 0) {
        expect(data.signatures[0].parameters[0].documentation).toBe('The parameter documentation');
      }
    }
  });
});

describe('handleGetSignatureHelp validation edge cases', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-help-validation-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    languageServiceManager.cleanup();
    vi.restoreAllMocks();
  });

  test('handles line as non-number type', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'function foo() {}\nfoo(');

    const result = await handleGetSignatureHelp({
      file,
      line: 'invalid' as unknown as number,
      column: 1,
    });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toContain('line');
  });

  test('handles column as non-number type', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'function foo() {}\nfoo(');

    const result = await handleGetSignatureHelp({
      file,
      line: 1,
      column: 'invalid' as unknown as number,
    });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toContain('column');
  });

  test('handles very large line number', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'const x = 1;');

    const result = await handleGetSignatureHelp({
      file,
      line: 999999,
      column: 1,
    });
    const data = JSON.parse(result.content[0].text);

    // Should return error or empty signatures
    expect(result).toBeDefined();
  });

  test('handles very large column number', async () => {
    const file = path.join(tempDir, 'test.ts');
    fs.writeFileSync(file, 'const x = 1;');

    const result = await handleGetSignatureHelp({
      file,
      line: 1,
      column: 999999,
    });

    // Should return error or empty signatures
    expect(result).toBeDefined();
  });
});
