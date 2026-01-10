/**
 * Prisma Operations Handler
 *
 * Finds all Prisma client usages in the codebase and detects N+1 query patterns.
 * Combines static analysis to find prisma.model.operation() calls with
 * pattern matching to detect inefficient query patterns.
 *
 * @module handlers/framework/prisma
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the get_prisma_operations tool
 */
export interface GetPrismaOperationsArgs {
  /** Directory to analyze for Prisma operations */
  path?: string;
  /** Run N+1 pattern detection */
  include_n1_detection?: boolean;
}

/**
 * A detected Prisma operation
 */
interface PrismaOperation {
  file: string;
  line: number;
  model: string;
  operation: string;
  includes_relation: boolean;
  code_snippet: string;
}

/**
 * Model usage summary
 */
interface ModelUsage {
  name: string;
  operations: number;
}

/**
 * Detected N+1 query pattern
 */
interface N1Pattern {
  file: string;
  line: number;
  description: string;
  suggestion: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Analysis result
 */
interface PrismaOperationsResult {
  operations: PrismaOperation[];
  models_used: ModelUsage[];
  n1_patterns: N1Pattern[];
  recommendations: string[];
}

/**
 * Tool response format
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Context for N+1 detection - tracks code structure
 */
interface AnalysisContext {
  inLoop: boolean;
  loopLine: number;
  loopType: string;
  queriesInLoop: PrismaOperation[];
  previousQueries: PrismaOperation[];
}

// =============================================================================
// Response Helpers
// =============================================================================

function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function createErrorResponse(message: string, context?: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) }],
    isError: true,
  };
}

// =============================================================================
// Path Helpers
// =============================================================================

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function makeRelativePath(absolutePath: string, projectRoot: string): string {
  return normalizeFilePath(path.relative(projectRoot, absolutePath));
}

// =============================================================================
// Prisma Operation Patterns
// =============================================================================

/** Known Prisma query operations */
const PRISMA_OPERATIONS = [
  // Read operations
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  // Write operations
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  // Raw queries
  '$queryRaw',
  '$executeRaw',
  '$queryRawUnsafe',
  '$executeRawUnsafe',
];

/** Loop constructs that may cause N+1 issues */
const LOOP_KEYWORDS = ['for', 'forEach', 'map', 'filter', 'reduce', 'some', 'every', 'flatMap'];

// =============================================================================
// File Discovery
// =============================================================================

/**
 * Find all TypeScript/JavaScript files that might use Prisma
 */
function findSourceFiles(dirPath: string, projectRoot: string): string[] {
  const files: string[] = [];
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip non-source directories
        if (['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.prisma'].includes(entry.name)) {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  const absoluteDir = path.isAbsolute(dirPath) ? dirPath : path.resolve(projectRoot, dirPath);
  walk(absoluteDir);
  return files;
}

/**
 * Check if a file imports Prisma client
 */
function fileUsesPrisma(content: string): boolean {
  // Check for common Prisma import patterns
  const patterns = [
    /@prisma\/client/,
    /from\s+['"].*prisma['"]/,
    /require\s*\(\s*['"].*prisma['"]\s*\)/,
    /PrismaClient/,
    /prisma\./,
  ];

  return patterns.some(pattern => pattern.test(content));
}

// =============================================================================
// AST Analysis
// =============================================================================

/**
 * Get code snippet around a position
 */
function getCodeSnippet(sourceFile: ts.SourceFile, start: number, end: number, maxLength: number = 100): string {
  const fullText = sourceFile.text;

  // Get the line containing the start position
  const lineStart = fullText.lastIndexOf('\n', start) + 1;
  const lineEnd = fullText.indexOf('\n', end);
  const endPos = lineEnd === -1 ? fullText.length : lineEnd;

  let snippet = fullText.slice(lineStart, endPos).trim();

  if (snippet.length > maxLength) {
    snippet = snippet.slice(0, maxLength) + '...';
  }

  return snippet;
}

/**
 * Check if a call expression includes relations
 */
function hasRelationInclusion(node: ts.CallExpression, sourceFile: ts.SourceFile): boolean {
  // Look for include or select with nested objects
  for (const arg of node.arguments) {
    const text = arg.getText(sourceFile);
    if (text.includes('include:') || text.includes('include :')) {
      return true;
    }
    // select with nested objects also indicates relation loading
    if (text.includes('select:') && text.includes(': {')) {
      return true;
    }
  }
  return false;
}

/**
 * Extract model name from prisma.model.operation() call chain
 */
function extractModelFromPrismaCall(node: ts.CallExpression, sourceFile: ts.SourceFile): { model: string; operation: string } | null {
  // Expected pattern: prisma.model.operation()
  // Or: this.prisma.model.operation()
  // Or: db.model.operation()

  const expr = node.expression;

  // Must be a property access: something.operation
  if (!ts.isPropertyAccessExpression(expr)) {
    return null;
  }

  const operation = expr.name.getText(sourceFile);

  // Check if this is a known Prisma operation
  if (!PRISMA_OPERATIONS.includes(operation)) {
    return null;
  }

  // The thing before .operation should be prisma.model or db.model
  const modelAccess = expr.expression;

  if (!ts.isPropertyAccessExpression(modelAccess)) {
    return null;
  }

  const model = modelAccess.name.getText(sourceFile);

  // The thing before .model should be prisma, db, this.prisma, etc.
  const clientExpr = modelAccess.expression;
  const clientText = clientExpr.getText(sourceFile);

  // Common Prisma client variable names
  const validClients = ['prisma', 'db', 'client', 'this.prisma', 'this.db', 'ctx.prisma', 'ctx.db'];

  // Also check for patterns like ctx.prisma
  const isValidClient = validClients.some(c => clientText === c || clientText.endsWith('.' + c.split('.').pop()));

  if (!isValidClient) {
    return null;
  }

  return { model, operation };
}

/**
 * Check if a node is inside a loop construct
 */
function isInsideLoop(node: ts.Node, sourceFile: ts.SourceFile): { inLoop: boolean; loopType: string; loopLine: number } {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    // For loops
    if (ts.isForStatement(current) || ts.isForInStatement(current) || ts.isForOfStatement(current)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(current.getStart(sourceFile));
      return { inLoop: true, loopType: 'for', loopLine: line + 1 };
    }

    // While loops
    if (ts.isWhileStatement(current) || ts.isDoStatement(current)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(current.getStart(sourceFile));
      return { inLoop: true, loopType: 'while', loopLine: line + 1 };
    }

    // Array methods like .forEach, .map, etc.
    if (ts.isCallExpression(current)) {
      const callExpr = current.expression;
      if (ts.isPropertyAccessExpression(callExpr)) {
        const methodName = callExpr.name.getText(sourceFile);
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

/**
 * Analyze a file for Prisma operations
 */
function analyzeFile(
  filePath: string,
  projectRoot: string,
  detectN1: boolean
): { operations: PrismaOperation[]; n1Patterns: N1Pattern[] } {
  const operations: PrismaOperation[] = [];
  const n1Patterns: N1Pattern[] = [];

  if (!fs.existsSync(filePath)) {
    return { operations, n1Patterns };
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Quick check if file uses Prisma
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

  const relativePath = makeRelativePath(filePath, projectRoot);

  // Track operations found in loops for N+1 detection
  const loopOperations: Map<number, PrismaOperation[]> = new Map();

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const prismaCall = extractModelFromPrismaCall(node, sourceFile);

      if (prismaCall) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const lineNumber = line + 1;

        const operation: PrismaOperation = {
          file: relativePath,
          line: lineNumber,
          model: prismaCall.model,
          operation: prismaCall.operation,
          includes_relation: hasRelationInclusion(node, sourceFile),
          code_snippet: getCodeSnippet(sourceFile, node.getStart(sourceFile), node.getEnd()),
        };

        operations.push(operation);

        // N+1 detection
        if (detectN1) {
          const loopInfo = isInsideLoop(node, sourceFile);

          if (loopInfo.inLoop) {
            // Operation inside a loop - potential N+1
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

  // Analyze loop operations for N+1 patterns
  if (detectN1) {
    for (const [loopLine, ops] of loopOperations) {
      // If there are database queries inside a loop, that's a potential N+1
      for (const op of ops) {
        // Read operations in loops are the classic N+1 pattern
        const readOps = ['findUnique', 'findFirst', 'findMany', 'findUniqueOrThrow', 'findFirstOrThrow'];

        if (readOps.includes(op.operation)) {
          // Higher severity if no include/select
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
// Recommendations Generator
// =============================================================================

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(operations: PrismaOperation[], n1Patterns: N1Pattern[]): string[] {
  const recommendations: string[] = [];

  // Check for operations without includes
  const opsWithoutIncludes = operations.filter(op => !op.includes_relation && ['findMany', 'findUnique', 'findFirst'].includes(op.operation));
  if (opsWithoutIncludes.length > 0) {
    recommendations.push(
      'Consider using `include` or `select` to fetch related data in single queries to avoid N+1 problems'
    );
  }

  // Check for many findMany operations
  const findManyCount = operations.filter(op => op.operation === 'findMany').length;
  if (findManyCount > 5) {
    recommendations.push(
      'Multiple findMany operations detected. Consider using prisma.$transaction() for related operations to ensure consistency'
    );
  }

  // Check for raw queries
  const rawQueries = operations.filter(op => op.operation.startsWith('$'));
  if (rawQueries.length > 0) {
    recommendations.push(
      'Raw SQL queries detected. Ensure proper parameterization to prevent SQL injection'
    );
  }

  // N+1 specific recommendations
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

  // Check for upsert vs create/update patterns
  const hasCreate = operations.some(op => op.operation === 'create');
  const hasUpdate = operations.some(op => op.operation === 'update');
  if (hasCreate && hasUpdate) {
    recommendations.push(
      'Both create and update operations found. Consider using `upsert` for create-or-update patterns'
    );
  }

  // General performance recommendations
  if (operations.length > 20) {
    recommendations.push(
      'Consider implementing connection pooling (e.g., PgBouncer) for high-traffic applications'
    );
  }

  // If no issues found
  if (recommendations.length === 0) {
    recommendations.push('No obvious Prisma performance issues detected. Good work!');
  }

  return recommendations;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handles the get_prisma_operations MCP tool call.
 *
 * Analyzes the codebase for Prisma client usage:
 * - Finds all prisma.model.operation() calls
 * - Detects N+1 query patterns
 * - Provides optimization recommendations
 *
 * @param args - The get_prisma_operations tool arguments
 * @returns MCP tool response with Prisma analysis
 */
export async function handleGetPrismaOperations(args: GetPrismaOperationsArgs): Promise<ToolResponse> {
  const projectRoot = process.cwd();
  const searchPath = args.path || 'src';
  const detectN1 = args.include_n1_detection !== false; // Default true

  try {
    // Find all source files
    const files = findSourceFiles(searchPath, projectRoot);

    if (files.length === 0) {
      return createSuccessResponse({
        operations: [],
        models_used: [],
        n1_patterns: [],
        recommendations: [`No source files found in ${searchPath}`],
      });
    }

    // Analyze each file
    const allOperations: PrismaOperation[] = [];
    const allN1Patterns: N1Pattern[] = [];

    for (const file of files) {
      const { operations, n1Patterns } = analyzeFile(file, projectRoot, detectN1);
      allOperations.push(...operations);
      allN1Patterns.push(...n1Patterns);
    }

    // Summarize models used
    const modelCounts = new Map<string, number>();
    for (const op of allOperations) {
      modelCounts.set(op.model, (modelCounts.get(op.model) || 0) + 1);
    }

    const modelsUsed: ModelUsage[] = Array.from(modelCounts.entries())
      .map(([name, operations]) => ({ name, operations }))
      .sort((a, b) => b.operations - a.operations);

    // Generate recommendations
    const recommendations = generateRecommendations(allOperations, allN1Patterns);

    const result: PrismaOperationsResult = {
      operations: allOperations,
      models_used: modelsUsed,
      n1_patterns: allN1Patterns,
      recommendations,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { path: searchPath });
  }
}
