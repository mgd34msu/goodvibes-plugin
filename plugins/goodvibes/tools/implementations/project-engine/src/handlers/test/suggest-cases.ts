/**
 * Test Case Suggestion Handler
 *
 * Analyzes functions and suggests comprehensive test cases using
 * LLM-powered analysis. Identifies edge cases, error conditions,
 * boundary values, and happy path scenarios.
 *
 * This tool uses static analysis to gather context and then
 * applies heuristic-based rules to generate test suggestions.
 *
 * @module handlers/test/suggest-cases
 */

import * as path from 'path';
import * as fs from 'fs';
import ts from 'typescript';

import { PROJECT_ROOT } from '../../config.js';
import {
  createSuccessResponse,
  createErrorResponse,
  normalizeFilePath,
  makeRelativePath,
  resolveFilePath,
  type ToolResponse,
} from '../lsp/utils.js';
import { handleFindTestsForFile, type FindTestsForFileArgs } from './find-tests.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the suggest_test_cases tool.
 */
export interface SuggestTestCasesArgs {
  /** Source file containing the function */
  file: string;
  /** Name of the function to analyze */
  function: string;
  /** Include existing tests for context (default true) */
  include_existing?: boolean;
}

/**
 * Test case category.
 */
type TestCategory = 'happy_path' | 'edge_case' | 'error_case' | 'boundary';

/**
 * Existing test reference.
 */
interface ExistingTest {
  /** Test file path relative to project root */
  file: string;
  /** Name of the test case */
  test_name: string;
}

/**
 * Suggested test case.
 */
interface SuggestedTest {
  /** Suggested test case name */
  name: string;
  /** What this test verifies */
  description: string;
  /** Example input values */
  input: string;
  /** Expected output or behavior */
  expected: string;
  /** Why this test case is important */
  rationale: string;
  /** Category of test case */
  category: TestCategory;
}

/**
 * Category counts for suggested tests.
 */
interface CategoryCounts {
  happy_path: number;
  edge_case: number;
  error_case: number;
  boundary: number;
}

/**
 * Result of the suggest_test_cases tool.
 */
interface SuggestTestCasesResult {
  /** The full function signature with types */
  function_signature: string;
  /** Existing tests found */
  existing_tests: ExistingTest[];
  /** Suggested test cases */
  suggested_tests: SuggestedTest[];
  /** Category counts */
  categories: CategoryCounts;
}

/**
 * Parsed function information.
 */
interface FunctionInfo {
  name: string;
  signature: string;
  parameters: ParameterInfo[];
  returnType: string;
  isAsync: boolean;
  isGenerator: boolean;
  documentation: string | null;
  body: string | null;
}

/**
 * Parameter information.
 */
interface ParameterInfo {
  name: string;
  type: string;
  optional: boolean;
  hasDefault: boolean;
  defaultValue: string | null;
}

// =============================================================================
// Function Parsing
// =============================================================================

/**
 * Parse a TypeScript/JavaScript file and find function information.
 *
 * @param filePath - Path to the source file
 * @param functionName - Name of the function to find
 * @returns Function information or null if not found
 */
function parseFunction(filePath: string, functionName: string): FunctionInfo | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    let result: FunctionInfo | null = null;

    function visit(node: ts.Node): void {
      if (result) return; // Already found

      // Function declaration: function foo() {}
      if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
        result = extractFunctionInfo(node, sourceFile, content);
        return;
      }

      // Variable declaration with arrow function: const foo = () => {}
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === functionName) {
            if (
              decl.initializer &&
              (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
            ) {
              result = extractFunctionInfo(decl.initializer, sourceFile, content, functionName);
              return;
            }
          }
        }
      }

      // Method declaration in class
      if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === functionName) {
        result = extractFunctionInfo(node, sourceFile, content);
        return;
      }

      // Property assignment with function: module.exports.foo = function() {}
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === functionName) {
        if (ts.isFunctionExpression(node.initializer) || ts.isArrowFunction(node.initializer)) {
          result = extractFunctionInfo(node.initializer, sourceFile, content, functionName);
          return;
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return result;
  } catch {
    return null;
  }
}

/**
 * Extract function information from a function-like node.
 */
function extractFunctionInfo(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration,
  sourceFile: ts.SourceFile,
  content: string,
  overrideName?: string
): FunctionInfo {
  const name = overrideName || ('name' in node && node.name ? node.name.getText(sourceFile) : 'anonymous');

  // Get parameters
  const parameters: ParameterInfo[] = node.parameters.map((param) => {
    const paramName = param.name.getText(sourceFile);
    const paramType = param.type ? param.type.getText(sourceFile) : 'any';
    const optional = !!param.questionToken;
    const hasDefault = !!param.initializer;
    const defaultValue = param.initializer ? param.initializer.getText(sourceFile) : null;

    return { name: paramName, type: paramType, optional, hasDefault, defaultValue };
  });

  // Get return type
  const returnType = node.type ? node.type.getText(sourceFile) : inferReturnType(node, sourceFile);

  // Check if async
  const isAsync = !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

  // Check if generator
  const isGenerator = 'asteriskToken' in node && !!node.asteriskToken;

  // Build signature
  const paramsStr = parameters.map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join(', ');
  const asyncPrefix = isAsync ? 'async ' : '';
  const signature = `${asyncPrefix}${name}(${paramsStr}): ${returnType}`;

  // Get JSDoc comment
  const documentation = getJSDocComment(node, sourceFile);

  // Get function body
  const body = node.body ? node.body.getText(sourceFile) : null;

  return { name, signature, parameters, returnType, isAsync, isGenerator, documentation, body };
}

/**
 * Infer return type from function body.
 */
function inferReturnType(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration,
  sourceFile: ts.SourceFile
): string {
  const hasAsyncModifier = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

  // Check for arrow function with expression body
  if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
    return hasAsyncModifier ? 'Promise<unknown>' : 'unknown';
  }

  // Check body for return statements
  if (node.body && ts.isBlock(node.body)) {
    let hasReturn = false;
    let hasVoidReturn = false;

    function checkReturns(n: ts.Node): void {
      if (ts.isReturnStatement(n)) {
        hasReturn = true;
        if (!n.expression) hasVoidReturn = true;
      }
      ts.forEachChild(n, checkReturns);
    }

    checkReturns(node.body);

    if (!hasReturn || hasVoidReturn) {
      return hasAsyncModifier ? 'Promise<void>' : 'void';
    }
  }

  return hasAsyncModifier ? 'Promise<unknown>' : 'unknown';
}

/**
 * Get JSDoc comment for a node.
 */
function getJSDocComment(node: ts.Node, sourceFile: ts.SourceFile): string | null {
  const comments = ts.getLeadingCommentRanges(sourceFile.text, node.pos);
  if (!comments || comments.length === 0) return null;

  for (const comment of comments) {
    const text = sourceFile.text.slice(comment.pos, comment.end);
    if (text.startsWith('/**')) {
      return text
        .replace(/^\/\*\*\s*/, '')
        .replace(/\s*\*\/$/, '')
        .replace(/^\s*\*\s?/gm, '')
        .trim();
    }
  }

  return null;
}

// =============================================================================
// Test Name Extraction
// =============================================================================

/**
 * Extract test names from a test file.
 *
 * @param filePath - Path to the test file
 * @param targetFunction - Function name to filter for
 * @returns Array of test names
 */
function extractTestNames(filePath: string, targetFunction: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const testNames: string[] = [];

    // Match common test patterns
    const patterns = [
      // Jest/Vitest: it('...', () => {}) or test('...', () => {})
      /(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/g,
      // describe blocks: describe('...',
      /describe\s*\(\s*['"`]([^'"`]+)['"`]/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const testName = match[1];
        // Only include tests that mention the target function
        if (
          testName.toLowerCase().includes(targetFunction.toLowerCase()) ||
          content.slice(Math.max(0, match.index - 500), match.index + 500).includes(targetFunction)
        ) {
          testNames.push(testName);
        }
      }
    }

    return testNames;
  } catch {
    return [];
  }
}

// =============================================================================
// Test Case Generation
// =============================================================================

/**
 * Generate test case suggestions based on function analysis.
 *
 * @param func - Parsed function information
 * @returns Array of suggested test cases
 */
function generateTestSuggestions(func: FunctionInfo): SuggestedTest[] {
  const suggestions: SuggestedTest[] = [];

  // Happy path test
  suggestions.push(generateHappyPathTest(func));

  // Parameter-based suggestions
  for (const param of func.parameters) {
    suggestions.push(...generateParameterTests(func, param));
  }

  // Return type based suggestions
  suggestions.push(...generateReturnTypeTests(func));

  // Async function suggestions
  if (func.isAsync) {
    suggestions.push(...generateAsyncTests(func));
  }

  // Body analysis for additional suggestions
  if (func.body) {
    suggestions.push(...analyzeBodyForTests(func));
  }

  return suggestions;
}

/**
 * Generate happy path test.
 */
function generateHappyPathTest(func: FunctionInfo): SuggestedTest {
  const exampleInputs = func.parameters.map((p) => generateExampleValue(p.type)).join(', ');
  const callPrefix = func.isAsync ? 'await ' : '';

  return {
    name: `should ${getActionVerb(func.name)} correctly with valid input`,
    description: 'Verify the function works correctly with typical valid input',
    input: `${callPrefix}${func.name}(${exampleInputs})`,
    expected: `Returns ${describeExpectedReturn(func.returnType)}`,
    rationale: 'Every function needs a basic happy path test to verify core functionality',
    category: 'happy_path',
  };
}

/**
 * Generate tests based on parameter types.
 */
function generateParameterTests(func: FunctionInfo, param: ParameterInfo): SuggestedTest[] {
  const tests: SuggestedTest[] = [];
  const paramType = param.type.toLowerCase();

  // String parameters
  if (paramType === 'string' || paramType.includes('string')) {
    tests.push({
      name: `should handle empty string for ${param.name}`,
      description: `Verify behavior when ${param.name} is an empty string`,
      input: `${func.name}(${generateInputsWithOverride(func, param.name, '""')})`,
      expected: 'Handles empty string appropriately (returns fallback or throws)',
      rationale: 'Empty strings are a common edge case that should be explicitly tested',
      category: 'edge_case',
    });

    tests.push({
      name: `should handle very long string for ${param.name}`,
      description: `Verify behavior with extremely long ${param.name} input`,
      input: `${func.name}(${generateInputsWithOverride(func, param.name, '"a".repeat(10000)')})`,
      expected: 'Handles long input without crashing or hanging',
      rationale: 'Large inputs can expose buffer limits or performance issues',
      category: 'boundary',
    });
  }

  // Number parameters
  if (paramType === 'number' || paramType.includes('number')) {
    tests.push({
      name: `should handle zero for ${param.name}`,
      description: `Verify behavior when ${param.name} is 0`,
      input: `${func.name}(${generateInputsWithOverride(func, param.name, '0')})`,
      expected: 'Correctly handles zero value',
      rationale: 'Zero is a special case for many numeric operations',
      category: 'edge_case',
    });

    tests.push({
      name: `should handle negative number for ${param.name}`,
      description: `Verify behavior with negative ${param.name}`,
      input: `${func.name}(${generateInputsWithOverride(func, param.name, '-100')})`,
      expected: 'Handles negative numbers appropriately',
      rationale: 'Negative numbers may have different semantics',
      category: 'edge_case',
    });

    tests.push({
      name: `should handle NaN for ${param.name}`,
      description: `Verify behavior when ${param.name} is NaN`,
      input: `${func.name}(${generateInputsWithOverride(func, param.name, 'NaN')})`,
      expected: 'Throws error or returns appropriate fallback',
      rationale: 'NaN is a valid number that can cause unexpected behavior',
      category: 'error_case',
    });

    tests.push({
      name: `should handle very large number for ${param.name}`,
      description: `Verify behavior with Number.MAX_SAFE_INTEGER`,
      input: `${func.name}(${generateInputsWithOverride(func, param.name, 'Number.MAX_SAFE_INTEGER')})`,
      expected: 'Handles large numbers without overflow',
      rationale: 'Large numbers can cause precision issues',
      category: 'boundary',
    });
  }

  // Array parameters
  if (paramType.includes('[]') || paramType.includes('array')) {
    tests.push({
      name: `should handle empty array for ${param.name}`,
      description: `Verify behavior when ${param.name} is empty`,
      input: `${func.name}(${generateInputsWithOverride(func, param.name, '[]')})`,
      expected: 'Handles empty array appropriately',
      rationale: 'Empty arrays are common and may need special handling',
      category: 'edge_case',
    });

    tests.push({
      name: `should handle large array for ${param.name}`,
      description: `Verify behavior with large array`,
      input: `${func.name}(${generateInputsWithOverride(func, param.name, 'Array.from({length: 10000})')})`,
      expected: 'Handles large arrays without performance issues',
      rationale: 'Large arrays can expose algorithmic inefficiencies',
      category: 'boundary',
    });
  }

  // Optional parameters
  if (param.optional) {
    tests.push({
      name: `should work without optional ${param.name}`,
      description: `Verify function works when ${param.name} is not provided`,
      input: `${func.name}(${generateInputsWithoutParam(func, param.name)})`,
      expected: 'Uses default behavior or value',
      rationale: 'Optional parameters should have sensible defaults',
      category: 'edge_case',
    });
  }

  // Nullable parameters
  if (paramType.includes('null') || paramType.includes('undefined')) {
    tests.push({
      name: `should handle null/undefined ${param.name}`,
      description: `Verify behavior when ${param.name} is null or undefined`,
      input: `${func.name}(${generateInputsWithOverride(func, param.name, 'null')})`,
      expected: 'Handles null appropriately',
      rationale: 'Nullable parameters must be handled gracefully',
      category: 'error_case',
    });
  }

  return tests;
}

/**
 * Generate tests based on return type.
 */
function generateReturnTypeTests(func: FunctionInfo): SuggestedTest[] {
  const tests: SuggestedTest[] = [];
  const returnType = func.returnType.toLowerCase();

  if (returnType.includes('promise')) {
    tests.push({
      name: 'should resolve successfully',
      description: 'Verify the promise resolves with expected value',
      input: `await ${func.name}(...)`,
      expected: 'Promise resolves with correct value type',
      rationale: 'Async functions should be tested for successful resolution',
      category: 'happy_path',
    });
  }

  if (returnType === 'boolean' || returnType === 'bool') {
    tests.push({
      name: 'should return true when condition is met',
      description: 'Verify returns true for positive case',
      input: `${func.name}(/* valid input */)`,
      expected: 'Returns true',
      rationale: 'Boolean functions need both true and false paths tested',
      category: 'happy_path',
    });

    tests.push({
      name: 'should return false when condition is not met',
      description: 'Verify returns false for negative case',
      input: `${func.name}(/* input that should fail */)`,
      expected: 'Returns false',
      rationale: 'Boolean functions need both true and false paths tested',
      category: 'edge_case',
    });
  }

  return tests;
}

/**
 * Generate tests for async functions.
 */
function generateAsyncTests(func: FunctionInfo): SuggestedTest[] {
  return [
    {
      name: 'should reject on error condition',
      description: 'Verify the promise rejects when an error occurs',
      input: `await ${func.name}(/* error-inducing input */)`,
      expected: 'Promise rejects with appropriate error',
      rationale: 'Async error handling must be tested',
      category: 'error_case',
    },
    {
      name: 'should handle timeout',
      description: 'Verify behavior when operation times out',
      input: `await Promise.race([${func.name}(...), timeout(1000)])`,
      expected: 'Either completes or times out gracefully',
      rationale: 'Long-running operations should have timeout handling',
      category: 'error_case',
    },
  ];
}

/**
 * Analyze function body for additional test suggestions.
 */
function analyzeBodyForTests(func: FunctionInfo): SuggestedTest[] {
  const tests: SuggestedTest[] = [];
  const body = func.body || '';

  // Check for throw statements
  if (body.includes('throw')) {
    tests.push({
      name: 'should throw error for invalid input',
      description: 'Verify error is thrown when expected',
      input: `${func.name}(/* invalid input */)`,
      expected: 'Throws expected error type with message',
      rationale: 'Error throwing paths should be tested',
      category: 'error_case',
    });
  }

  // Check for conditional logic
  if (body.match(/if\s*\(/)) {
    tests.push({
      name: 'should handle alternative branch',
      description: 'Test the else/alternative path in conditionals',
      input: `${func.name}(/* input for else branch */)`,
      expected: 'Executes alternative path correctly',
      rationale: 'All conditional branches should be covered',
      category: 'edge_case',
    });
  }

  // Check for try-catch
  if (body.includes('try') && body.includes('catch')) {
    tests.push({
      name: 'should handle caught errors gracefully',
      description: 'Verify error handling in catch block',
      input: `${func.name}(/* input that causes caught error */)`,
      expected: 'Error is handled and appropriate action taken',
      rationale: 'Error handling logic should be tested',
      category: 'error_case',
    });
  }

  // Check for array operations
  if (body.match(/\.(map|filter|reduce|find|forEach)\(/)) {
    tests.push({
      name: 'should handle single element collection',
      description: 'Verify behavior with single-item array',
      input: `${func.name}([singleItem])`,
      expected: 'Correctly processes single element',
      rationale: 'Single element arrays are a common edge case',
      category: 'edge_case',
    });
  }

  return tests;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate example value for a type.
 */
function generateExampleValue(type: string): string {
  const t = type.toLowerCase();

  if (t === 'string') return '"example"';
  if (t === 'number') return '42';
  if (t === 'boolean') return 'true';
  if (t.includes('[]')) return '[]';
  if (t.includes('object') || t.includes('{')) return '{}';
  if (t.includes('null')) return 'null';
  if (t.includes('undefined')) return 'undefined';

  return '/* value */';
}

/**
 * Generate inputs with one parameter overridden.
 */
function generateInputsWithOverride(func: FunctionInfo, paramName: string, value: string): string {
  return func.parameters
    .map((p) => {
      if (p.name === paramName) return value;
      return generateExampleValue(p.type);
    })
    .join(', ');
}

/**
 * Generate inputs without a specific parameter.
 */
function generateInputsWithoutParam(func: FunctionInfo, paramName: string): string {
  return func.parameters
    .filter((p) => p.name !== paramName)
    .map((p) => generateExampleValue(p.type))
    .join(', ');
}

/**
 * Get action verb from function name.
 */
function getActionVerb(name: string): string {
  const prefixes = ['get', 'set', 'create', 'delete', 'update', 'fetch', 'load', 'save', 'parse', 'format'];
  for (const prefix of prefixes) {
    if (name.toLowerCase().startsWith(prefix)) {
      return name.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
    }
  }
  return name.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
}

/**
 * Describe expected return type.
 */
function describeExpectedReturn(type: string): string {
  const t = type.toLowerCase();

  if (t === 'void' || t === 'promise<void>') return 'nothing (void)';
  if (t === 'boolean' || t === 'promise<boolean>') return 'true or false';
  if (t === 'string' || t === 'promise<string>') return 'a string value';
  if (t === 'number' || t === 'promise<number>') return 'a numeric value';
  if (t.includes('[]')) return 'an array';

  return type;
}

/**
 * Count test categories.
 */
function countCategories(tests: SuggestedTest[]): CategoryCounts {
  const counts: CategoryCounts = {
    happy_path: 0,
    edge_case: 0,
    error_case: 0,
    boundary: 0,
  };

  for (const test of tests) {
    counts[test.category]++;
  }

  return counts;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the suggest_test_cases MCP tool call.
 *
 * Analyzes a function and suggests comprehensive test cases:
 * - Happy path tests for normal operation
 * - Edge case tests for boundary conditions
 * - Error case tests for exception handling
 * - Boundary tests for limits and extremes
 *
 * @param args - The suggest_test_cases tool arguments
 * @returns MCP tool response with test suggestions
 */
export async function handleSuggestTestCases(args: SuggestTestCasesArgs): Promise<ToolResponse> {
  try {
    // Validate required arguments
    if (!args.file) {
      return createErrorResponse('Missing required argument: file');
    }
    if (!args.function) {
      return createErrorResponse('Missing required argument: function');
    }

    // Resolve file path
    const filePath = resolveFilePath(args.file, PROJECT_ROOT);

    // Verify file exists
    if (!fs.existsSync(filePath)) {
      return createErrorResponse(`Source file not found: ${args.file}`);
    }

    // Parse function
    const funcInfo = parseFunction(filePath, args.function);

    if (!funcInfo) {
      return createErrorResponse(`Function "${args.function}" not found in ${args.file}`, {
        suggestion: 'Check the function name and ensure it is exported or declared at module level',
      });
    }

    // Find existing tests
    const existingTests: ExistingTest[] = [];
    const includeExisting = args.include_existing !== false;

    if (includeExisting) {
      const findArgs: FindTestsForFileArgs = { file: args.file, include_indirect: false };
      const testResponse = await handleFindTestsForFile(findArgs);

      if (!testResponse.isError && testResponse.content.length > 0) {
        try {
          const testResult = JSON.parse(testResponse.content[0].text) as { tests: Array<{ file: string }> };
          for (const test of testResult.tests) {
            const testPath = resolveFilePath(test.file, PROJECT_ROOT);
            const testNames = extractTestNames(testPath, args.function);
            for (const testName of testNames) {
              existingTests.push({
                file: test.file,
                test_name: testName,
              });
            }
          }
        } catch {
          // Could not parse test results
        }
      }
    }

    // Generate test suggestions
    const suggestedTests = generateTestSuggestions(funcInfo);

    // Build result
    const result: SuggestTestCasesResult = {
      function_signature: funcInfo.signature,
      existing_tests: existingTests,
      suggested_tests: suggestedTests,
      categories: countCategories(suggestedTests),
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to suggest test cases: ${message}`);
  }
}
