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

// Mock find-tests module
const mockHandleFindTestsForFile = vi.fn().mockResolvedValue({
  isError: false,
  content: [{ type: 'text', text: JSON.stringify({ tests: [], count: 0 }) }],
});
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

      // Debug: check what error we're getting if there is one
      if (response.isError) {
        console.log('Error response:', response.content[0].text);
      }

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
      const { handleFindTestsForFile } = await import('../../../handlers/test/find-tests.js');
      vi.mocked(handleFindTestsForFile).mockResolvedValue({
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
  });
});
