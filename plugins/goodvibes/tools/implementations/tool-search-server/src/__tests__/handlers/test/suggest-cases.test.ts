/**
 * Unit tests for handlers/test/suggest-cases.ts
 *
 * Tests cover:
 * - handleSuggestTestCases function
 * - Argument validation
 * - Function parsing
 * - Test suggestion generation
 * - Error handling
 *
 * Note: Function parsing is tested through integration with real TypeScript files
 * since mocking the TypeScript compiler's createSourceFile is complex.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { handleSuggestTestCases, type SuggestTestCasesArgs } from '../../../handlers/test/suggest-cases.js';

// Mock fs module
vi.mock('fs');
const mockFs = vi.mocked(fs);

// Mock config module
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/project',
}));

// Mock lsp/utils module - need to provide all the used functions
vi.mock('../../../handlers/lsp/utils.js', () => ({
  createSuccessResponse: vi.fn((data) => ({
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  })),
  createErrorResponse: vi.fn((message, context) => ({
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) }],
    isError: true,
  })),
  normalizeFilePath: vi.fn((p: string) => p.replace(/\\/g, '/')),
  makeRelativePath: vi.fn((abs: string, root: string) => {
    const relative = path.relative(root, abs);
    return relative.replace(/\\/g, '/');
  }),
  resolveFilePath: vi.fn((filePath: string, projectRoot: string) => {
    if (path.isAbsolute(filePath)) return filePath;
    return path.join(projectRoot, filePath).replace(/\\/g, '/');
  }),
}));

// Mock find-tests module - use vi.hoisted to create the mock before hoisting
const { mockHandleFindTestsForFile } = vi.hoisted(() => ({
  mockHandleFindTestsForFile: vi.fn().mockResolvedValue({
    isError: false,
    content: [{ type: 'text', text: JSON.stringify({ tests: [], count: 0 }) }],
  }),
}));

vi.mock('../../../handlers/test/find-tests.js', () => ({
  handleFindTestsForFile: mockHandleFindTestsForFile,
}));

describe('handleSuggestTestCases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish the default mock return value after clearing
    mockHandleFindTestsForFile.mockResolvedValue({
      isError: false,
      content: [{ type: 'text', text: JSON.stringify({ tests: [], count: 0 }) }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Argument Validation', () => {
    it('should return error when file argument is missing', async () => {
      const args: SuggestTestCasesArgs = { file: '', function: 'myFunc' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Missing required argument: file');
    });

    it('should return error when function argument is missing', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: '' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Missing required argument: function');
    });

    it('should return error when source file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const args: SuggestTestCasesArgs = { file: 'src/missing.ts', function: 'myFunc' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Source file not found');
    });

    it('should return error when function is not found in empty file', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('// empty file');

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'nonExistentFunction' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Function "nonExistentFunction" not found');
      expect(parsed.suggestion).toBeDefined();
    });
  });

  describe('Function Parsing with Real TypeScript Content', () => {
    it('should parse function declarations', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function calculateSum(a: number, b: number): number {
  return a + b;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'calculateSum' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('calculateSum');
      expect(parsed.function_signature).toContain('number');
      expect(parsed.suggested_tests.length).toBeGreaterThan(0);
    });

    it('should parse arrow function declarations', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export const multiply = (a: number, b: number): number => {
  return a * b;
};
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'multiply' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('multiply');
    });

    it('should parse function expressions', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export const divide = function(a: number, b: number): number {
  return a / b;
};
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'divide' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('divide');
    });

    it('should parse class method declarations', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'add' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('add');
    });

    it('should parse async function declarations', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export async function fetchData(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'fetchData' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('async');
      expect(parsed.function_signature).toContain('Promise');
    });

    it('should parse async arrow functions', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export const fetchUser = async (id: string): Promise<object> => {
  return { id };
};
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'fetchUser' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('async');
    });
  });

  describe('Parameter Parsing', () => {
    it('should parse required parameters', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function greet(name: string, age: number): string {
  return \`Hello \${name}, you are \${age}\`;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'greet' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('name');
      expect(parsed.function_signature).toContain('string');
      expect(parsed.function_signature).toContain('age');
      expect(parsed.function_signature).toContain('number');
    });

    it('should parse optional parameters', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function format(text: string, uppercase?: boolean): string {
  return uppercase ? text.toUpperCase() : text;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'format' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('uppercase?');
      // Should suggest test for optional parameter
      const optionalTest = parsed.suggested_tests.find(
        (t: { name: string }) => t.name.includes('without optional')
      );
      expect(optionalTest).toBeDefined();
    });

    it('should parse parameters with default values', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function paginate(items: string[], page: number = 1, pageSize: number = 10): string[] {
  return items.slice((page - 1) * pageSize, page * pageSize);
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'paginate' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
    });

    it('should handle nullable parameter types', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function processValue(value: string | null): string {
  return value ?? 'default';
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'processValue' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Should suggest null handling test
      const nullTest = parsed.suggested_tests.find(
        (t: { name: string }) => t.name.toLowerCase().includes('null')
      );
      expect(nullTest).toBeDefined();
    });
  });

  describe('Return Type Inference', () => {
    it('should infer void return type when no return statement', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function logMessage(message: string): void {
  console.log(message);
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'logMessage' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('void');
    });

    it('should infer Promise<void> for async functions without return', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export async function sendNotification(message: string): Promise<void> {
  console.log(message);
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'sendNotification' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('Promise<void>');
    });

    it('should handle arrow functions with expression body', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export const double = (n: number): number => n * 2;
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'double' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
    });
  });

  describe('Test Suggestion Generation', () => {
    it('should always suggest a happy path test', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function simpleFunc(x: number): number {
  return x * 2;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'simpleFunc' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      const happyPath = parsed.suggested_tests.find(
        (t: { category: string }) => t.category === 'happy_path'
      );
      expect(happyPath).toBeDefined();
    });

    it('should suggest string edge cases for string parameters', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function processName(name: string): string {
  return name.trim();
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'processName' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      const emptyStringTest = parsed.suggested_tests.find(
        (t: { name: string }) => t.name.includes('empty string')
      );
      expect(emptyStringTest).toBeDefined();
      expect(emptyStringTest.category).toBe('edge_case');
    });

    it('should suggest number edge cases for number parameters', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function divide(a: number, b: number): number {
  return a / b;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'divide' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      const zeroTest = parsed.suggested_tests.find(
        (t: { name: string }) => t.name.includes('zero')
      );
      expect(zeroTest).toBeDefined();
    });

    it('should suggest array edge cases for array parameters', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function sum(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0);
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'sum' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      const emptyArrayTest = parsed.suggested_tests.find(
        (t: { name: string }) => t.name.includes('empty array')
      );
      expect(emptyArrayTest).toBeDefined();
    });

    it('should suggest boolean tests for boolean returns', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function isEven(n: number): boolean {
  return n % 2 === 0;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'isEven' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      const trueTest = parsed.suggested_tests.find(
        (t: { name: string }) => t.name.includes('return true')
      );
      const falseTest = parsed.suggested_tests.find(
        (t: { name: string }) => t.name.includes('return false')
      );
      expect(trueTest).toBeDefined();
      expect(falseTest).toBeDefined();
    });

    it('should suggest async tests for async functions', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export async function fetchUser(id: string): Promise<object> {
  return { id };
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'fetchUser' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      const rejectTest = parsed.suggested_tests.find(
        (t: { name: string }) => t.name.includes('reject')
      );
      expect(rejectTest).toBeDefined();
      expect(rejectTest.category).toBe('error_case');
    });

    it('should suggest error test when function has throw statements', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function validate(input: string): void {
  if (!input) {
    throw new Error('Input is required');
  }
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'validate' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      const throwTest = parsed.suggested_tests.find(
        (t: { name: string }) => t.name.includes('throw')
      );
      expect(throwTest).toBeDefined();
      expect(throwTest.category).toBe('error_case');
    });

    it('should suggest branch test when function has conditionals', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function getDiscount(price: number): number {
  if (price > 100) {
    return price * 0.1;
  }
  return 0;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'getDiscount' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      const branchTest = parsed.suggested_tests.find(
        (t: { name: string }) => t.name.includes('alternative branch')
      );
      expect(branchTest).toBeDefined();
    });

    it('should suggest error handling test when function has try-catch', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function parseJSON(text: string): object {
  try {
    return JSON.parse(text);
  } catch (error) {
    return {};
  }
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'parseJSON' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      const catchTest = parsed.suggested_tests.find(
        (t: { name: string }) => t.name.includes('caught errors')
      );
      expect(catchTest).toBeDefined();
    });

    it('should suggest single element test when function uses array methods', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function doubleAll(numbers: number[]): number[] {
  return numbers.map(n => n * 2);
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'doubleAll' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      const singleElementTest = parsed.suggested_tests.find(
        (t: { name: string }) => t.name.includes('single element')
      );
      expect(singleElementTest).toBeDefined();
    });
  });

  describe('Category Counts', () => {
    it('should count tests by category', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function processData(data: string[]): string[] {
  if (!data.length) {
    throw new Error('Empty data');
  }
  return data.map(d => d.trim());
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'processData' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.categories).toBeDefined();
      expect(parsed.categories.happy_path).toBeGreaterThanOrEqual(1);
      expect(typeof parsed.categories.edge_case).toBe('number');
      expect(typeof parsed.categories.error_case).toBe('number');
      expect(typeof parsed.categories.boundary).toBe('number');
    });
  });

  describe('Existing Tests Discovery', () => {
    it('should include existing tests when include_existing is true', async () => {
      mockHandleFindTestsForFile.mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            tests: [{ file: 'src/utils.test.ts' }],
            count: 1,
          }),
        }],
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr.includes('.test.ts')) {
          return `
describe('myFunc', () => {
  it('should work with valid input', () => {});
  test('handles edge cases', () => {});
});
`;
        }
        return `
export function myFunc(x: number): number {
  return x * 2;
}
`;
      });

      const args: SuggestTestCasesArgs = {
        file: 'src/utils.ts',
        function: 'myFunc',
        include_existing: true,
      };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.existing_tests).toBeDefined();
    });

    it('should skip existing tests when include_existing is false', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function myFunc(x: number): number {
  return x * 2;
}
`);

      const args: SuggestTestCasesArgs = {
        file: 'src/utils.ts',
        function: 'myFunc',
        include_existing: false,
      };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.existing_tests).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should handle parse errors gracefully', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
this is not valid typescript {{{
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'myFunc' };
      const response = await handleSuggestTestCases(args);

      // Should return error about function not found (parsing failed)
      expect(response.isError).toBe(true);
    });

    it('should handle general exceptions', async () => {
      mockFs.existsSync.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'myFunc' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Failed to suggest test cases');
    });

    it('should handle non-Error exceptions', async () => {
      mockFs.existsSync.mockImplementation(() => {
        throw 'String error';
      });

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'myFunc' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBe(true);
    });
  });

  describe('Response Format', () => {
    it('should include all required fields in successful response', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function testFunc(x: number): number {
  return x * 2;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'testFunc' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);

      expect(parsed).toHaveProperty('function_signature');
      expect(parsed).toHaveProperty('existing_tests');
      expect(parsed).toHaveProperty('suggested_tests');
      expect(parsed).toHaveProperty('categories');

      expect(Array.isArray(parsed.existing_tests)).toBe(true);
      expect(Array.isArray(parsed.suggested_tests)).toBe(true);

      if (parsed.suggested_tests.length > 0) {
        const test = parsed.suggested_tests[0];
        expect(test).toHaveProperty('name');
        expect(test).toHaveProperty('description');
        expect(test).toHaveProperty('input');
        expect(test).toHaveProperty('expected');
        expect(test).toHaveProperty('rationale');
        expect(test).toHaveProperty('category');
      }
    });

    it('should return valid categories structure', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function simple(x: number): number {
  return x;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'simple' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);

      expect(parsed.categories).toHaveProperty('happy_path');
      expect(parsed.categories).toHaveProperty('edge_case');
      expect(parsed.categories).toHaveProperty('error_case');
      expect(parsed.categories).toHaveProperty('boundary');

      // Category counts should match actual tests
      const totalFromCategories =
        parsed.categories.happy_path +
        parsed.categories.edge_case +
        parsed.categories.error_case +
        parsed.categories.boundary;
      expect(totalFromCategories).toBe(parsed.suggested_tests.length);
    });
  });

  describe('Edge Cases', () => {
    it('should handle function with no parameters', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function noParams(): string {
  return 'hello';
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'noParams' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.suggested_tests.length).toBeGreaterThan(0);
    });

    it('should handle function with many parameters', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function manyParams(
  a: string,
  b: number,
  c: boolean,
  d: string[],
  e?: number,
  f: string | null = null
): void {}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'manyParams' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Should generate tests for each parameter type
      expect(parsed.suggested_tests.length).toBeGreaterThan(5);
    });

    it('should handle generator functions', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function* numberGenerator(): Generator<number> {
  yield 1;
  yield 2;
  yield 3;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'numberGenerator' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
    });

    it('should handle undefined type in parameters', async () => {
      // This covers line 648: if (t.includes('undefined')) return 'undefined';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function processOptional(value: string | undefined): string {
  return value ?? 'default';
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'processOptional' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Should generate tests including undefined case
      const undefinedTest = parsed.suggested_tests.find(
        (t: { name: string }) => t.name.toLowerCase().includes('undefined')
      );
      expect(undefinedTest).toBeDefined();
    });

    it('should handle unknown types with fallback value', async () => {
      // This covers line 650: return '/* value */';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function processCustomType(value: CustomType): void {
  console.log(value);
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'processCustomType' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
    });

    it('should return null when no JSDoc comment exists', async () => {
      // This covers line 293: return null when extractJSDoc doesn't find a comment
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
// Regular comment, not JSDoc
export function noJsDoc(x: number): number {
  return x * 2;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'noJsDoc' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Should still work, just without JSDoc info
      expect(parsed.suggested_tests.length).toBeGreaterThan(0);
    });

    it('should handle test file read errors gracefully', async () => {
      // This covers line 336: return [] in extractTestNames catch block
      mockHandleFindTestsForFile.mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            tests: [{ file: 'src/utils.test.ts' }],
            count: 1,
          }),
        }],
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr.includes('.test.ts')) {
          // Throw error when reading test file to trigger catch block
          throw new Error('Cannot read test file');
        }
        return `
export function myFunc(x: number): number {
  return x * 2;
}
`;
      });

      const args: SuggestTestCasesArgs = {
        file: 'src/utils.ts',
        function: 'myFunc',
        include_existing: true,
      };
      const response = await handleSuggestTestCases(args);

      // Should still succeed, just with empty existing tests
      expect(response.isError).toBeUndefined();
    });

    it('should parse property assignment with function expression (lines 177-179)', async () => {
      // This covers the property assignment parsing branch
      // e.g., module.exports.foo = function() {}
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
const obj = {
  myHandler: function(x: number): number {
    return x * 2;
  }
};
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'myHandler' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('myHandler');
    });

    it('should parse property assignment with arrow function', async () => {
      // Also covers lines 177-179 with arrow function variant
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
const handlers = {
  processData: (data: string): string => {
    return data.trim();
  }
};
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'processData' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('processData');
    });

    it('should return null and handle error when file read fails in parseFunction (line 189)', async () => {
      // This covers the catch block in parseFunction that returns null
      mockFs.existsSync.mockReturnValue(true);
      // First call for file existence check passes
      // Second call for readFileSync throws
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'anyFunc' };
      const response = await handleSuggestTestCases(args);

      // Should return error about function not found (because parsing returned null)
      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Function "anyFunc" not found');
    });

    it('should infer return type for arrow function with expression body (lines 248-250)', async () => {
      // This covers inferReturnType when arrow function has no block body
      // and no explicit return type annotation
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export const double = (n: number) => n * 2;
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'double' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Should infer 'unknown' since no explicit type
      expect(parsed.function_signature).toContain('unknown');
    });

    it('should infer Promise<unknown> for async arrow function with expression body (lines 248-250)', async () => {
      // Async variant of expression body inference
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export const asyncDouble = async (n: number) => n * 2;
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'asyncDouble' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('Promise<unknown>');
    });

    it('should infer void return type when function has no return statement (lines 253-270)', async () => {
      // This covers the block body analysis for return statements
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function logSomething(msg: string) {
  console.log(msg);
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'logSomething' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('void');
    });

    it('should infer void return type when function has empty return statement (lines 260, 267-268)', async () => {
      // Covers hasVoidReturn = true case
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function earlyExit(condition: boolean) {
  if (condition) {
    return;
  }
  console.log('did not exit early');
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'earlyExit' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('void');
    });

    it('should infer Promise<void> for async function with void return (lines 267-268)', async () => {
      // Covers the async + void return case
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export async function asyncLog(msg: string) {
  console.log(msg);
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'asyncLog' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('Promise<void>');
    });

    it('should infer unknown return type when function has value return (lines 267, 272)', async () => {
      // Covers hasReturn=true and hasVoidReturn=false
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function getValue(x: number) {
  return x * 2;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'getValue' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('unknown');
    });

    it('should infer Promise<unknown> for async function with value return (line 272)', async () => {
      // Covers async + hasReturn=true, hasVoidReturn=false
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export async function asyncGetValue(x: number) {
  return x * 2;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'asyncGetValue' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('Promise<unknown>');
    });

    it('should extract and return JSDoc comment (line 285)', async () => {
      // This covers the JSDoc extraction returning actual content
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
/**
 * Calculates the sum of two numbers.
 * @param a - First number
 * @param b - Second number
 * @returns The sum
 */
export function addNumbers(a: number, b: number): number {
  return a + b;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'addNumbers' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('addNumbers');
      // The function should parse successfully with JSDoc
      expect(parsed.suggested_tests.length).toBeGreaterThan(0);
    });

    it('should handle function with object type parameter', async () => {
      // Covers generateExampleValue for object types (line 646)
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function processObject(data: object): void {
  console.log(data);
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'processObject' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.suggested_tests.length).toBeGreaterThan(0);
    });

    it('should handle function with inline object type parameter', async () => {
      // Covers generateExampleValue for { } types (line 646)
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function processConfig(config: { name: string; value: number }): void {
  console.log(config);
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'processConfig' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.suggested_tests.length).toBeGreaterThan(0);
    });

    it('should filter out tests that do not mention target function (line 325)', async () => {
      // This covers the branch where test name doesn't include the function
      // and the surrounding context also doesn't include it
      mockHandleFindTestsForFile.mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            tests: [{ file: 'src/utils.test.ts' }],
            count: 1,
          }),
        }],
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr.includes('.test.ts')) {
          // Test file with tests that don't mention 'targetFunc'
          return `
describe('unrelatedThing', () => {
  it('should do something else', () => {});
  test('another unrelated test', () => {});
});
`;
        }
        return `
export function targetFunc(x: number): number {
  return x * 2;
}
`;
      });

      const args: SuggestTestCasesArgs = {
        file: 'src/utils.ts',
        function: 'targetFunc',
        include_existing: true,
      };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Existing tests should be empty since none mention targetFunc
      expect(parsed.existing_tests).toEqual([]);
    });

    it('should handle function declaration without body (line 370)', async () => {
      // This covers the branch where func.body is null (ambient declaration)
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
declare function externalFunc(x: number): number;
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.d.ts', function: 'externalFunc' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Should still generate basic tests without body analysis
      expect(parsed.suggested_tests.length).toBeGreaterThan(0);
      // Should not have body-related tests (throw, try-catch, etc)
      const throwTest = parsed.suggested_tests.find(
        (t: { name: string }) => t.name.includes('throw')
      );
      expect(throwTest).toBeUndefined();
    });

    it('should handle when findTestsForFile returns error (line 772)', async () => {
      // Covers the case where testResponse.isError is true
      mockHandleFindTestsForFile.mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: 'Failed to find tests' }) }],
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function myFunc(x: number): number {
  return x * 2;
}
`);

      const args: SuggestTestCasesArgs = {
        file: 'src/utils.ts',
        function: 'myFunc',
        include_existing: true,
      };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Should succeed but with empty existing tests
      expect(parsed.existing_tests).toEqual([]);
    });

    it('should handle when findTestsForFile returns empty content (line 772)', async () => {
      // Covers the case where testResponse.content.length is 0
      mockHandleFindTestsForFile.mockResolvedValue({
        isError: false,
        content: [],
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function myFunc(x: number): number {
  return x * 2;
}
`);

      const args: SuggestTestCasesArgs = {
        file: 'src/utils.ts',
        function: 'myFunc',
        include_existing: true,
      };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Should succeed but with empty existing tests
      expect(parsed.existing_tests).toEqual([]);
    });

    it('should handle function with null type parameter', async () => {
      // Covers generateExampleValue for null types (line 647)
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function processNull(value: null): void {
  console.log(value);
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'processNull' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.suggested_tests.length).toBeGreaterThan(0);
    });

    it('should handle array type with Array generic syntax', async () => {
      // Covers the check for 'array' in paramType (line 462)
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function processArray(items: Array<string>): void {
  console.log(items);
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'processArray' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Should have array edge case tests
      const emptyArrayTest = parsed.suggested_tests.find(
        (t: { name: string }) => t.name.includes('empty array')
      );
      expect(emptyArrayTest).toBeDefined();
    });

    it('should handle parameters without explicit type annotation (line 207)', async () => {
      // This covers the 'any' fallback when param.type is undefined
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export function noTypes(value) {
  return value;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.js', function: 'noTypes' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Signature should have 'any' for untyped parameter
      expect(parsed.function_signature).toContain('any');
    });

    it('should handle anonymous function expression (line 202)', async () => {
      // This covers the 'anonymous' fallback when extractFunctionInfo has no name
      // Uses a named function expression assigned to a variable
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export const handler = function(x: number): number {
  return x * 2;
};
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'handler' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('handler');
    });

    it('should not match property assignment with non-function initializer', async () => {
      // This covers the branch where property assignment has a non-function value
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
const obj = {
  notAFunction: "just a string",
  actualFunc: function(x: number): number {
    return x * 2;
  }
};
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'notAFunction' };
      const response = await handleSuggestTestCases(args);

      // Should not find a function named 'notAFunction'
      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Function "notAFunction" not found');
    });

    it('should handle function without block body (inferReturnType line 253)', async () => {
      // This covers when node.body exists but is not a Block (arrow expression)
      // The arrow function with expression body is parsed
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
export const implicitReturn = (x: number) => x + 1;
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'implicitReturn' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Should infer 'unknown' for expression body without explicit type
      expect(parsed.function_signature).toContain('unknown');
    });

    it('should skip property assignment when name does not match (line 176)', async () => {
      // This ensures we don't accidentally match a wrong property
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
const obj = {
  otherHandler: function(x: number): number {
    return x;
  }
};

export function myTargetFunc(y: string): string {
  return y;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'myTargetFunc' };
      const response = await handleSuggestTestCases(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.function_signature).toContain('myTargetFunc');
      expect(parsed.function_signature).toContain('string');
    });

    it('should skip variable declaration without initializer (line 158)', async () => {
      // This covers when variable has matching name but no initializer
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
let myFunc: () => void;
export function actualFunc(x: number): number {
  return x * 2;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'myFunc' };
      const response = await handleSuggestTestCases(args);

      // Should not find the declared but uninitialized variable
      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Function "myFunc" not found');
    });

    it('should skip variable declaration with non-function initializer (line 158)', async () => {
      // This covers when variable has matching name but initializer is not a function
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
const myFunc = 42;
export function actualFunc(x: number): number {
  return x * 2;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'myFunc' };
      const response = await handleSuggestTestCases(args);

      // Should not find a function named 'myFunc'
      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Function "myFunc" not found');
    });

    it('should skip variable with destructuring pattern name (line 157)', async () => {
      // This covers when decl.name is not an Identifier (e.g., destructuring)
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
const { myFunc } = someModule;
export function actualFunc(x: number): number {
  return x * 2;
}
`);

      const args: SuggestTestCasesArgs = { file: 'src/utils.ts', function: 'myFunc' };
      const response = await handleSuggestTestCases(args);

      // Destructuring patterns are not identifiers, should not match
      expect(response.isError).toBe(true);
    });
  });
});
