/**
 * Test Finder — L1 Core
 *
 * Pure utilities for discovering and scoring test files against source files.
 * No handler logic: all functions operate on file system state and string data.
 *
 * resolveModulePath is kept private; the outer logic in the L2 extension
 * composes these primitives. The exported functions correspond to the
 * originally named functions in find-tests.ts with minor renames:
 * - parseImports (renamed: parseTestImports)
 *
 * @module core/testing/test-finder
 */

import * as node_path from 'node:path';
import * as node_fs from 'node:fs';
import ts from 'typescript';

import { normalizeFilePath, makeRelativePath } from '../code-intel/file-utils.js';
import { TEST_PATTERNS } from './constants.js';
import type { TestType, TestFile } from './types.js';

// =============================================================================
// Test File Discovery
// =============================================================================

/**
 * Recursively find all test files under a directory.
 *
 * Skips `node_modules`, `dist`, and hidden directories (starting with `.`).
 * A file is considered a test file if:
 * - Its name ends with one of the TEST_PATTERNS.suffixes, OR
 * - Its path contains one of the TEST_PATTERNS.directories
 *
 * @param directory - Absolute path to start the search from
 * @param patterns - Test patterns to match against (defaults to TEST_PATTERNS)
 * @param testFiles - Accumulator array (used in recursive calls)
 * @returns Sorted array of normalized absolute test file paths
 */
export function findTestFiles(
  directory: string,
  patterns: typeof TEST_PATTERNS = TEST_PATTERNS,
  testFiles: string[] = []
): string[] {
  try {
    const entries = node_fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = node_path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name.startsWith('.')
        ) {
          continue;
        }
        findTestFiles(fullPath, patterns, testFiles);
      } else if (entry.isFile()) {
        const isTestFile =
          patterns.suffixes.some((suffix) => entry.name.endsWith(suffix)) ||
          patterns.directories.some((testDir) =>
            fullPath.includes(node_path.sep + testDir + node_path.sep)
          );

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
 * Determine the test type based on file path conventions.
 *
 * - `e2e` — path contains `/e2e/`, `\\e2e\\`, or `.e2e.`
 * - `integration` — path contains `/integration/`, `\\integration\\`, or `.integration.`
 * - `unit` — everything else
 *
 * @param filePath - Normalized file path to classify
 * @returns TestType: 'unit' | 'integration' | 'e2e'
 */
export function determineTestType(filePath: string): TestType {
  const normalized = filePath.toLowerCase();

  if (
    normalized.includes('/e2e/') ||
    normalized.includes('\\e2e\\') ||
    normalized.includes('.e2e.')
  ) {
    return 'e2e';
  }

  if (
    normalized.includes('/integration/') ||
    normalized.includes('\\integration\\') ||
    normalized.includes('.integration.')
  ) {
    return 'integration';
  }

  return 'unit';
}

// =============================================================================
// Module Path Resolution (private)
// =============================================================================

/**
 * Resolve a relative module path to an absolute normalized file path.
 * Only handles relative imports (starting with '.'); returns null for
 * node_modules or bare specifiers.
 *
 * @param modulePath - Module specifier from an import statement
 * @param fromDir - Absolute directory of the importing file
 * @returns Normalized absolute file path, or null if unresolvable
 */
function resolveModulePath(modulePath: string, fromDir: string): string | null {
  if (!modulePath.startsWith('.')) {
    return null;
  }

  const basePath = node_path.resolve(fromDir, modulePath);
  // '' (empty string) handles extensionless imports that resolve as directories (index files)
  const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];

  for (const ext of extensions) {
    const fullPath = basePath + ext;
    if (node_fs.existsSync(fullPath) && node_fs.statSync(fullPath).isFile()) {
      return normalizeFilePath(fullPath);
    }

    // Check for index files
    const indexPath = node_path.join(basePath, 'index' + (ext || '.ts'));
    if (node_fs.existsSync(indexPath) && node_fs.statSync(indexPath).isFile()) {
      return normalizeFilePath(indexPath);
    }
  }

  return null;
}

// =============================================================================
// Import Analysis
// =============================================================================

/**
 * Parse imports from a TypeScript/JavaScript file.
 *
 * Handles:
 * - Static import declarations: `import { x } from './module'`
 * - Dynamic imports: `import('./module')`
 * - CommonJS require: `require('./module')`
 *
 * Returns only resolved relative imports (absolute normalized paths).
 * Skips node_modules and bare specifiers.
 *
 * @param filePath - Absolute path to the file to parse
 * @returns Array of normalized absolute paths of imported project files
 */
export function parseTestImports(filePath: string): string[] {
  try {
    const content = node_fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );

    const imports: string[] = [];
    const fileDir = node_path.dirname(filePath);

    function visit(node: ts.Node): void {
      // import { x } from './module'
      if (
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const resolved = resolveModulePath(node.moduleSpecifier.text, fileDir);
        if (resolved) imports.push(resolved);
      }

      // import('./module')
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          const resolved = resolveModulePath(arg.text, fileDir);
          if (resolved) imports.push(resolved);
        }
      }

      // require('./module')
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length > 0
      ) {
        const arg = node.arguments[0];
        if (ts.isStringLiteral(arg)) {
          const resolved = resolveModulePath(arg.text, fileDir);
          if (resolved) imports.push(resolved);
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
 * Check whether a test file imports a source file (directly or transitively).
 *
 * Recursively follows imports when `includeIndirect` is true, tracking
 * visited files to avoid infinite loops.
 *
 * @param testFilePath - Normalized path of the test file
 * @param sourceFilePath - Normalized path of the source file to look for
 * @param includeIndirect - Whether to follow transitive imports
 * @param visited - Set of already-visited file paths (for cycle detection)
 * @returns Object indicating whether an import was found and if it was direct
 */
export function checkImportRelationship(
  testFilePath: string,
  sourceFilePath: string,
  includeIndirect: boolean,
  visited: Set<string> = new Set()
): { imports: boolean; direct: boolean } {
  if (visited.has(testFilePath)) {
    return { imports: false, direct: false };
  }
  visited.add(testFilePath);

  const imports = parseTestImports(testFilePath);
  const normalizedSource = normalizeFilePath(sourceFilePath);

  // Check direct import
  for (const importPath of imports) {
    if (importPath === normalizedSource) {
      return { imports: true, direct: true };
    }
  }

  // Check indirect imports if requested
  if (includeIndirect) {
    for (const importPath of imports) {
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

/**
 * Calculate pattern-match confidence between a source file and a test file.
 *
 * Confidence levels:
 * - 1.0 — Same directory, exact name match
 * - 0.95 — `__tests__` subdirectory, exact name match
 * - 0.9 — Parallel test/src directory structure, exact name match
 * - 0.8 — Different directory, exact name match
 * - 0.6 — Test name starts with source name
 * - 0.4 — Test name contains source name
 * - 0.0 — No match
 *
 * @param sourceFile - Normalized path of the source file
 * @param testFile - Normalized path of the test file
 * @returns Confidence score from 0.0 to 1.0
 */
export function calculatePatternConfidence(sourceFile: string, testFile: string): number {
  const sourceName = node_path.basename(sourceFile, node_path.extname(sourceFile));
  const testName = node_path.basename(testFile).replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, '');

  if (sourceName === testName) {
    const sourceDir = node_path.dirname(sourceFile);
    const testDir = node_path.dirname(testFile);

    if (sourceDir === testDir) return 1.0;
    if (testDir === node_path.join(sourceDir, '__tests__')) return 0.95;
    if (testDir.replace(/tests?[\/\\]/, '') === sourceDir.replace(/src[\/\\]/, '')) return 0.9;
    return 0.8;
  }

  if (testName.startsWith(sourceName)) return 0.6;
  if (testName.includes(sourceName)) return 0.4;

  return 0;
}

// =============================================================================
// Result Builder
// =============================================================================

/**
 * Build scored TestFile results for a source file against a list of candidate test files.
 *
 * For each candidate:
 * 1. Calculate pattern-match confidence
 * 2. Check import relationship
 * 3. Combine into a final confidence score
 * 4. Exclude entries with confidence <= 0.1
 *
 * @param sourceFilePath - Normalized path of the source file
 * @param testFilePaths - Normalized paths of all candidate test files
 * @param includeIndirect - Whether to follow transitive imports
 * @param projectRoot - Project root for computing relative paths
 * @returns Array of TestFile results sorted by confidence descending
 */
export function scoreTestFiles(
  sourceFilePath: string,
  testFilePaths: string[],
  includeIndirect: boolean,
  projectRoot: string
): TestFile[] {
  const normalizedSource = normalizeFilePath(sourceFilePath);
  const results: TestFile[] = [];

  for (const testFilePath of testFilePaths) {
    if (testFilePath === normalizedSource) continue;

    const patternConfidence = calculatePatternConfidence(normalizedSource, testFilePath);
    const importRelation = checkImportRelationship(testFilePath, normalizedSource, includeIndirect);

    let confidence = 0;
    let importsDirect = false;

    if (importRelation.imports) {
      importsDirect = importRelation.direct;
      confidence = importRelation.direct
        ? Math.max(patternConfidence, 0.9)
        : Math.max(patternConfidence * 0.7, 0.5);
    } else if (patternConfidence > 0) {
      confidence = patternConfidence * 0.8;
    }

    if (confidence > 0.1) {
      results.push({
        file: makeRelativePath(testFilePath, projectRoot),
        type: determineTestType(testFilePath),
        imports_source_directly: importsDirect,
        confidence: Math.round(confidence * 100) / 100,
      });
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}
