/**
 * Find Tests for File Handler
 *
 * Finds test files that cover a given source file by:
 * 1. Pattern matching test file names (*.test.ts, *.spec.ts, __tests__/*.ts)
 * 2. Analyzing import graphs from test files to find which source files they test
 * 3. Returning a ranked list of test files with confidence scores
 *
 * @module handlers/test/find-tests
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

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the find_tests_for_file tool.
 */
export interface FindTestsForFileArgs {
  /** Source file path (relative to project root or absolute) */
  file: string;
  /** Include tests that import files which import this file */
  include_indirect?: boolean;
}

/**
 * Type of test based on file location and naming patterns.
 */
export type TestType = 'unit' | 'integration' | 'e2e';

/**
 * A single test file result.
 */
interface TestFile {
  /** Test file path relative to project root */
  file: string;
  /** Type of test based on file location and naming */
  type: TestType;
  /** Whether the test imports the source file directly */
  imports_source_directly: boolean;
  /** Confidence score (0-1) that this test covers the source file */
  confidence: number;
}

/**
 * Result of the find_tests_for_file tool.
 */
interface FindTestsResult {
  /** Array of test files found */
  tests: TestFile[];
  /** Total count of test files */
  count: number;
}

// =============================================================================
// Test File Discovery
// =============================================================================

/** Test file patterns to match */
const TEST_PATTERNS = {
  suffixes: ['.test.ts', '.test.tsx', '.test.js', '.test.jsx', '.spec.ts', '.spec.tsx', '.spec.js', '.spec.jsx'],
  directories: ['__tests__', 'tests', 'test', 'e2e', 'integration'],
};

/**
 * Recursively find all test files in a directory.
 */
function findTestFiles(dir: string, testFiles: string[] = []): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip node_modules, dist, and hidden directories
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
          continue;
        }
        findTestFiles(fullPath, testFiles);
      } else if (entry.isFile()) {
        const isTestFile =
          TEST_PATTERNS.suffixes.some((suffix) => entry.name.endsWith(suffix)) ||
          TEST_PATTERNS.directories.some((testDir) => fullPath.includes(path.sep + testDir + path.sep));

        if (isTestFile) {
          testFiles.push(normalizeFilePath(fullPath));
        }
      }
    }
  } catch {
    // Directory doesn't exist or isn't readable
  }

  return testFiles;
}

/**
 * Determine the test type based on file path.
 */
function determineTestType(filePath: string): TestType {
  const normalized = filePath.toLowerCase();

  // E2E tests
  if (normalized.includes('/e2e/') || normalized.includes('\\e2e\\') || normalized.includes('.e2e.')) {
    return 'e2e';
  }

  // Integration tests
  if (
    normalized.includes('/integration/') ||
    normalized.includes('\\integration\\') ||
    normalized.includes('.integration.')
  ) {
    return 'integration';
  }

  // Default to unit tests
  return 'unit';
}

// =============================================================================
// Import Analysis
// =============================================================================

/**
 * Parse imports from a TypeScript/JavaScript file.
 * Returns normalized absolute paths of imported modules.
 */
function parseImports(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const imports: string[] = [];
    const fileDir = path.dirname(filePath);

    function visit(node: ts.Node): void {
      // Handle import declarations: import { x } from './module'
      if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const modulePath = node.moduleSpecifier.text;
        const resolvedPath = resolveModulePath(modulePath, fileDir);
        if (resolvedPath) {
          imports.push(resolvedPath);
        }
      }

      // Handle dynamic imports: import('./module')
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          const modulePath = arg.text;
          const resolvedPath = resolveModulePath(modulePath, fileDir);
          if (resolvedPath) {
            imports.push(resolvedPath);
          }
        }
      }

      // Handle require(): const x = require('./module')
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length > 0
      ) {
        const arg = node.arguments[0];
        if (ts.isStringLiteral(arg)) {
          const modulePath = arg.text;
          const resolvedPath = resolveModulePath(modulePath, fileDir);
          if (resolvedPath) {
            imports.push(resolvedPath);
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return imports;
  } catch {
    return [];
  }
}

/**
 * Resolve a module path to an absolute file path.
 * Handles relative imports only (not node_modules).
 */
function resolveModulePath(modulePath: string, fromDir: string): string | null {
  // Only handle relative imports
  if (!modulePath.startsWith('.')) {
    return null;
  }

  const basePath = path.resolve(fromDir, modulePath);
  const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];

  for (const ext of extensions) {
    const fullPath = basePath + ext;
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      return normalizeFilePath(fullPath);
    }

    // Check for index files
    const indexPath = path.join(basePath, 'index' + (ext || '.ts'));
    if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
      return normalizeFilePath(indexPath);
    }
  }

  return null;
}

/**
 * Check if a test file imports the source file (directly or indirectly).
 */
function checkImportRelationship(
  testFilePath: string,
  sourceFilePath: string,
  includeIndirect: boolean,
  visited: Set<string> = new Set()
): { imports: boolean; direct: boolean } {
  if (visited.has(testFilePath)) {
    return { imports: false, direct: false };
  }
  visited.add(testFilePath);

  const imports = parseImports(testFilePath);
  const normalizedSource = normalizeFilePath(sourceFilePath);

  // Check for direct import
  for (const importPath of imports) {
    if (importPath === normalizedSource) {
      return { imports: true, direct: true };
    }
  }

  // Check for indirect imports if requested
  if (includeIndirect) {
    for (const importPath of imports) {
      // Only check project files, not node_modules
      if (!importPath.includes('node_modules')) {
        const result = checkImportRelationship(importPath, sourceFilePath, true, visited);
        if (result.imports) {
          return { imports: true, direct: false };
        }
      }
    }
  }

  return { imports: false, direct: false };
}

// =============================================================================
// Pattern Matching
// =============================================================================

/**
 * Calculate pattern match confidence between a source file and a test file.
 * Higher confidence for naming conventions like:
 * - src/utils.ts -> src/utils.test.ts (1.0)
 * - src/utils.ts -> src/__tests__/utils.test.ts (0.95)
 * - src/utils.ts -> tests/utils.test.ts (0.9)
 */
function calculatePatternConfidence(sourceFile: string, testFile: string): number {
  const sourceName = path.basename(sourceFile, path.extname(sourceFile));
  const testName = path.basename(testFile).replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, '');

  // Exact name match
  if (sourceName === testName) {
    const sourceDir = path.dirname(sourceFile);
    const testDir = path.dirname(testFile);

    // Same directory
    if (sourceDir === testDir) {
      return 1.0;
    }

    // __tests__ subdirectory
    if (testDir === path.join(sourceDir, '__tests__')) {
      return 0.95;
    }

    // Parallel test directory structure
    if (testDir.replace(/tests?[/\\]/, '') === sourceDir.replace(/src[/\\]/, '')) {
      return 0.9;
    }

    // Same base name but different directory
    return 0.8;
  }

  // Test name starts with source name (e.g., utils -> utils-helpers.test.ts)
  if (testName.startsWith(sourceName)) {
    return 0.6;
  }

  // Test name contains source name
  if (testName.includes(sourceName)) {
    return 0.4;
  }

  return 0;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the find_tests_for_file MCP tool call.
 *
 * Finds test files that cover a given source file by:
 * 1. Finding all test files in the project
 * 2. Pattern matching test file names against the source file
 * 3. Analyzing import graphs from test files
 * 4. Returning a ranked list with confidence scores
 *
 * @param args - The find_tests_for_file tool arguments
 * @returns MCP tool response with JSON-formatted test files
 */
export async function handleFindTestsForFile(args: FindTestsForFileArgs): Promise<ToolResponse> {
  try {
    // Validate required arguments
    if (!args.file) {
      return createErrorResponse('Missing required argument: file');
    }

    // Resolve source file path
    const sourceFilePath = resolveFilePath(args.file, PROJECT_ROOT);
    const normalizedSourcePath = normalizeFilePath(sourceFilePath);

    // Verify source file exists
    if (!fs.existsSync(sourceFilePath)) {
      return createErrorResponse(`Source file not found: ${args.file}`);
    }

    const includeIndirect = args.include_indirect ?? false;

    // Find all test files in the project
    const testFiles = findTestFiles(PROJECT_ROOT);

    // Analyze each test file
    const results: TestFile[] = [];

    for (const testFilePath of testFiles) {
      // Skip if this is the source file itself
      if (testFilePath === normalizedSourcePath) {
        continue;
      }

      // Check pattern match confidence
      const patternConfidence = calculatePatternConfidence(normalizedSourcePath, testFilePath);

      // Check import relationship
      const importRelation = checkImportRelationship(testFilePath, normalizedSourcePath, includeIndirect);

      // Calculate final confidence
      let confidence = 0;
      let importsDirect = false;

      if (importRelation.imports) {
        importsDirect = importRelation.direct;
        // Direct import: high confidence
        if (importRelation.direct) {
          confidence = Math.max(patternConfidence, 0.9);
        } else {
          // Indirect import: medium confidence
          confidence = Math.max(patternConfidence * 0.7, 0.5);
        }
      } else if (patternConfidence > 0) {
        // Pattern match only: use pattern confidence with a penalty
        confidence = patternConfidence * 0.8;
      }

      // Only include if there's some confidence
      if (confidence > 0.1) {
        results.push({
          file: makeRelativePath(testFilePath, PROJECT_ROOT),
          type: determineTestType(testFilePath),
          imports_source_directly: importsDirect,
          confidence: Math.round(confidence * 100) / 100, // Round to 2 decimals
        });
      }
    }

    // Sort by confidence (highest first)
    results.sort((a, b) => b.confidence - a.confidence);

    const result: FindTestsResult = {
      tests: results,
      count: results.length,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to find tests: ${message}`);
  }
}
