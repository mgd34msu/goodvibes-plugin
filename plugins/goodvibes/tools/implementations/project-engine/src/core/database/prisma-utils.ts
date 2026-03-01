/**
 * Prisma static analysis utilities
 *
 * Functions for detecting Prisma usage, analyzing AST for operation calls,
 * detecting N+1 query patterns, and generating optimization recommendations.
 *
 * @module core/database/prisma-utils
 */

import * as node_fs from 'node:fs';
import * as node_path from 'node:path';
import ts from 'typescript';
import { normalizePath, toRelativePath } from '../../shared/utils.js';
import { PRISMA_OPERATIONS, LOOP_KEYWORDS } from './constants.js';

// =============================================================================
// Types
// =============================================================================

/**
 * A detected Prisma operation call in source code.
 */
export interface PrismaOperation {
  /** Relative file path */
  file: string;
  /** 1-indexed line number */
  line: number;
  /** Prisma model name (e.g. 'user', 'post') */
  model: string;
  /** Operation name (e.g. 'findMany', 'create') */
  operation: string;
  /** Whether the call includes a relation (include/select with nested objects) */
  includes_relation: boolean;
  /** Truncated code snippet */
  code_snippet: string;
}

/**
 * A detected N+1 query pattern.
 */
export interface N1Pattern {
  /** Relative file path */
  file: string;
  /** 1-indexed line number */
  line: number;
  /** Human-readable description of the pattern */
  description: string;
  /** Suggested fix */
  suggestion: string;
  /** Severity classification */
  severity: 'low' | 'medium' | 'high';
}

// =============================================================================
// Prisma Detection Helpers
// =============================================================================

/**
 * Check if file content imports or uses the Prisma client.
 *
 * @param content - File content string
 * @returns true if the file references Prisma
 */
export function fileUsesPrisma(content: string): boolean {
  const patterns = [
    /@prisma\/client/,
    /from\s+['"].*prisma['"]/,
    /require\s*\(\s*['"].*prisma['"]\s*\)/,
    /PrismaClient/,
    /prisma\./,
  ];
  return patterns.some(pattern => pattern.test(content));
}

/**
 * Check if a Prisma call expression includes relations.
 *
 * Looks for `include:` or `select:` with nested objects in call arguments.
 *
 * @param node - The TypeScript call expression node
 * @param sourceFile - The source file for text extraction
 * @returns true if the call loads related records
 */
export function hasRelationInclusion(node: ts.CallExpression, sourceFile: ts.SourceFile): boolean {
  for (const arg of node.arguments) {
    const text = arg.getText(sourceFile);
    if (text.includes('include:') || text.includes('include :')) return true;
    if (text.includes('select:') && text.includes(': {')) return true;
  }
  return false;
}

/**
 * Extract model and operation from a prisma.model.operation() call chain.
 *
 * Recognizes patterns like:
 * - `prisma.user.findMany()`
 * - `this.prisma.post.create()`
 * - `db.user.findUnique()`
 *
 * @param node - The TypeScript call expression node
 * @param sourceFile - The source file for text extraction
 * @returns Object with model and operation names, or null if not a Prisma call
 */
export function extractModelFromPrismaCall(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile
): { model: string; operation: string } | null {
  const expr = node.expression;
  if (!ts.isPropertyAccessExpression(expr)) return null;

  const operation = expr.name.getText(sourceFile);
  if (!PRISMA_OPERATIONS.includes(operation)) return null;

  const modelAccess = expr.expression;
  if (!ts.isPropertyAccessExpression(modelAccess)) return null;

  const model = modelAccess.name.getText(sourceFile);
  const clientExpr = modelAccess.expression;
  const clientText = clientExpr.getText(sourceFile);

  const validClients = ['prisma', 'db', 'client', 'this.prisma', 'this.db', 'ctx.prisma', 'ctx.db'];
  const isValidClient = validClients.some(c =>
    clientText === c || clientText.endsWith('.' + c.split('.').pop())
  );

  if (!isValidClient) return null;

  return { model, operation };
}

/**
 * Check if a TypeScript AST node is inside a loop construct.
 *
 * Detects for/while loops and array iteration methods (forEach, map, etc.).
 *
 * @param node - The node to check
 * @param sourceFile - The source file for position lookup
 * @returns Loop context info
 */
export function isInsideLoop(
  node: ts.Node,
  sourceFile: ts.SourceFile
): { inLoop: boolean; loopType: string; loopLine: number } {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (ts.isForStatement(current) || ts.isForInStatement(current) || ts.isForOfStatement(current)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(current.getStart(sourceFile));
      return { inLoop: true, loopType: 'for', loopLine: line + 1 };
    }

    if (ts.isWhileStatement(current) || ts.isDoStatement(current)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(current.getStart(sourceFile));
      return { inLoop: true, loopType: 'while', loopLine: line + 1 };
    }

    if (ts.isCallExpression(current)) {
      const callExpr = current.expression;
      if (ts.isPropertyAccessExpression(callExpr)) {
        const methodName = callExpr.name.getText(sourceFile);
        /* v8 ignore next */
        if (LOOP_KEYWORDS.includes(methodName)) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(current.getStart(sourceFile));
          return { inLoop: true, loopType: methodName, loopLine: line + 1 };
        }
      }
    }

    current = current.parent;
  }

  return { inLoop: false, loopType: '', loopLine: 0 };
}

// =============================================================================
// File Analysis
// =============================================================================

/**
 * Analyze a single file for Prisma operations and N+1 patterns.
 *
 * Uses the TypeScript compiler API to parse the AST and walk the tree
 * looking for prisma.model.operation() call chains.
 *
 * @param filePath - Absolute path to the TypeScript/JavaScript file
 * @param projectRoot - Project root for computing relative paths (uses shared utils)
 * @param detectN1 - Whether to run N+1 loop detection
 * @returns Discovered operations and N+1 patterns
 */
export function analyzePrismaFile(
  filePath: string,
  projectRoot: string,
  detectN1: boolean
): { operations: PrismaOperation[]; n1Patterns: N1Pattern[] } {
  const operations: PrismaOperation[] = [];
  const n1Patterns: N1Pattern[] = [];

  if (!node_fs.existsSync(filePath)) {
    return { operations, n1Patterns };
  }

  const content = node_fs.readFileSync(filePath, 'utf-8');

  if (!fileUsesPrisma(content)) {
    return { operations, n1Patterns };
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  // Use shared utils for path normalization
  const relativePath = toRelativePath(filePath, projectRoot);
  const loopOperations: Map<number, PrismaOperation[]> = new Map();

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const prismaCall = extractModelFromPrismaCall(node, sourceFile);

      if (prismaCall) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const lineNumber = line + 1;

        // Get code snippet
        const fullText = sourceFile.text;
        const start = node.getStart(sourceFile);
        const end = node.getEnd();
        const lineStart = fullText.lastIndexOf('\n', start) + 1;
        const lineEndIdx = fullText.indexOf('\n', end);
        const endPos = lineEndIdx === -1 ? fullText.length : lineEndIdx;
        let snippet = fullText.slice(lineStart, endPos).trim();
        if (snippet.length > 100) snippet = snippet.slice(0, 100) + '...';

        const operation: PrismaOperation = {
          file: relativePath,
          line: lineNumber,
          model: prismaCall.model,
          operation: prismaCall.operation,
          includes_relation: hasRelationInclusion(node, sourceFile),
          code_snippet: snippet,
        };

        operations.push(operation);

        if (detectN1) {
          const loopInfo = isInsideLoop(node, sourceFile);
          if (loopInfo.inLoop) {
            if (!loopOperations.has(loopInfo.loopLine)) {
              loopOperations.set(loopInfo.loopLine, []);
            }
            loopOperations.get(loopInfo.loopLine)!.push(operation);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Detect N+1 patterns from loop operations
  if (detectN1) {
    const readOps = ['findUnique', 'findFirst', 'findMany', 'findUniqueOrThrow', 'findFirstOrThrow'];

    for (const [loopLine, ops] of loopOperations) {
      for (const op of ops) {
        /* v8 ignore next */
        if (readOps.includes(op.operation)) {
          const severity: 'low' | 'medium' | 'high' = op.includes_relation ? 'medium' : 'high';
          n1Patterns.push({
            file: relativePath,
            line: op.line,
            description: `Prisma ${op.model}.${op.operation}() called inside a loop (starting line ${loopLine}). This causes N+1 queries where each iteration makes a separate database call.`,
            suggestion: `Refactor to fetch all needed data before the loop using a single query with include or select. Example: prisma.${op.model}.findMany({ where: { id: { in: ids } }, include: { relatedModel: true } })`,
            severity,
          });
        }
      }
    }
  }

  return { operations, n1Patterns };
}

// =============================================================================
// Recommendations
// =============================================================================

/**
 * Generate optimization recommendations from Prisma analysis results.
 *
 * @param operations - Discovered Prisma operations
 * @param n1Patterns - Detected N+1 patterns
 * @returns Array of recommendation strings
 */
export function generatePrismaRecommendations(
  operations: PrismaOperation[],
  n1Patterns: N1Pattern[]
): string[] {
  const recommendations: string[] = [];

  const opsWithoutIncludes = operations.filter(
    op => !op.includes_relation && ['findMany', 'findUnique', 'findFirst'].includes(op.operation)
  );
  if (opsWithoutIncludes.length > 0) {
    recommendations.push(
      'Consider using `include` or `select` to fetch related data in single queries to avoid N+1 problems'
    );
  }

  const findManyCount = operations.filter(op => op.operation === 'findMany').length;
  if (findManyCount > 5) {
    recommendations.push(
      'Multiple findMany operations detected. Consider using prisma.$transaction() for related operations to ensure consistency'
    );
  }

  const rawQueries = operations.filter(op => op.operation.startsWith('$'));
  if (rawQueries.length > 0) {
    recommendations.push(
      'Raw SQL queries detected. Ensure proper parameterization to prevent SQL injection'
    );
  }

  if (n1Patterns.length > 0) {
    const highSeverity = n1Patterns.filter(p => p.severity === 'high').length;
    if (highSeverity > 0) {
      recommendations.push(
        `${highSeverity} high-severity N+1 pattern(s) detected. These should be prioritized for optimization`
      );
    }
    recommendations.push(
      'For bulk operations, use findMany with `where: { id: { in: ids } }` instead of querying in a loop'
    );
  }

  const hasCreate = operations.some(op => op.operation === 'create');
  const hasUpdate = operations.some(op => op.operation === 'update');
  if (hasCreate && hasUpdate) {
    recommendations.push(
      'Both create and update operations found. Consider using `upsert` for create-or-update patterns'
    );
  }

  if (operations.length > 20) {
    recommendations.push(
      'Consider implementing connection pooling (e.g., PgBouncer) for high-traffic applications'
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('No obvious Prisma performance issues detected. Good work!');
  }

  return recommendations;
}

// =============================================================================
// File Discovery (delegates to shared utils pattern)
// =============================================================================

/**
 * Find all TypeScript/JavaScript files that might use Prisma in a directory.
 *
 * Skips node_modules, .git, dist, build, .next, coverage, .prisma directories.
 *
 * @param dirPath - Directory path to search (absolute or relative to projectRoot)
 * @param projectRoot - Project root for resolving relative paths
 * @returns Array of absolute file paths
 */
export function findPrismaSourceFiles(dirPath: string, projectRoot: string): string[] {
  const files: string[] = [];
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'];
  const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.prisma'];

  function walk(dir: string): void {
    /* v8 ignore next */
    if (!node_fs.existsSync(dir)) return;

    const entries = node_fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = node_path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!skipDirs.includes(entry.name)) {
          walk(fullPath);
        }
        /* v8 ignore next 5 */
      } else if (entry.isFile()) {
        if (extensions.includes(node_path.extname(entry.name))) {
          files.push(fullPath);
        }
      }
    }
  }

  const absoluteDir = node_path.isAbsolute(dirPath)
    ? dirPath
    : node_path.resolve(projectRoot, dirPath);
  walk(absoluteDir);
  return files;
}
