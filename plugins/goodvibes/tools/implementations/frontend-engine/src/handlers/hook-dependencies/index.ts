/**
 * Audit Hook Dependencies Handler
 *
 * Analyzes React hook dependency arrays for stale closures, missing/unnecessary
 * dependencies, unstable references, and anti-patterns.
 *
 * @module handlers/frontend/hook-dependencies
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import type { AuditHookDependenciesArgs, AuditResult, HookInfo, HookIssue, ToolResponse } from './types.js';
import { buildComponentScope, extractHooksWithDeps } from './hook-extractor.js';
import { analyzeDependencies } from './stability-analyzer.js';
import { detectAllIssues } from './issue-detector.js';
import { getProjectRoot } from '../../config.js';

// =============================================================================
// Helpers
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

function makeRelativePath(absolutePath: string, projectRoot: string): string {
  return path.relative(projectRoot, absolutePath).replace(/\\/g, '/');
}

function resolveFilePath(filePath: string, projectRoot: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
}

// =============================================================================
// Component Detection
// =============================================================================

/**
 * Detect the name of the first React component/function in the source file.
 * Falls back to the file name (without extension) if no component is found.
 */
function detectComponentName(sourceFile: ts.SourceFile, filePath: string): string {
  for (const statement of sourceFile.statements) {
    // function Component() { ... }
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      /^[A-Z]/.test(statement.name.getText(sourceFile))
    ) {
      return statement.name.getText(sourceFile);
    }

    // const Component = (...) => ...
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          /^[A-Z]/.test(decl.name.getText(sourceFile)) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          return decl.name.getText(sourceFile);
        }
      }
    }

    // export default function Component()
    if (
      ts.isExportAssignment(statement) &&
      ts.isFunctionDeclaration(statement as unknown as ts.Node)
    ) {
      const inner = (statement as unknown as ts.ExportAssignment).expression;
      if (ts.isFunctionExpression(inner) && inner.name) {
        return inner.name.getText(sourceFile);
      }
    }
  }

  // Fall back to file name
  return path.basename(filePath, path.extname(filePath));
}

/**
 * Find the first function-like node in the source file that likely contains hooks.
 * Used when the file doesn't have a single obvious component.
 */
function findComponentNode(sourceFile: ts.SourceFile): ts.Node {
  // Return source file itself to analyze all hooks at top level
  return sourceFile;
}

/**
 * Filter hooks by a specific hook filter string (variable name or line number).
 */
function filterHooks(hooks: HookInfo[], hookFilter: string): HookInfo[] {
  // Try numeric line filter
  const lineNum = parseInt(hookFilter, 10);
  if (!isNaN(lineNum)) {
    return hooks.filter(h => h.line === lineNum);
  }

  // Try variable name filter
  return hooks.filter(
    h => h.variableName === hookFilter || h.name === hookFilter
  );
}

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Main handler for the audit_hook_dependencies tool.
 *
 * Parses the file, extracts all hooks with dependency arrays,
 * analyzes dep stability, detects issues, and returns a structured report.
 */
export async function handleAuditHookDependencies(
  args: AuditHookDependenciesArgs
): Promise<ToolResponse> {
  if (!args.file) {
    return createErrorResponse('file argument is required');
  }

  const projectRoot = getProjectRoot();
  const filePath = resolveFilePath(args.file, projectRoot);

  if (!fs.existsSync(filePath)) {
    return createErrorResponse(`File not found: ${args.file}`, { provided_path: args.file });
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
    return createErrorResponse(
      `Unsupported file type: ${ext}. Supported: .tsx, .jsx, .ts, .js`,
      { file: args.file }
    );
  }

  try {
    // Parse source file
    const content = fs.readFileSync(filePath, 'utf-8');
    const scriptKind =
      ext === '.tsx' ? ts.ScriptKind.TSX :
      ext === '.jsx' ? ts.ScriptKind.JSX :
      ts.ScriptKind.TS;

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );

    // Detect component name
    const componentName = detectComponentName(sourceFile, filePath);

    // Find component node (use source file to capture all hooks)
    const componentNode = findComponentNode(sourceFile);

    // Build scope (imports, module-level decls, hook assignments)
    const scope = buildComponentScope(componentNode, sourceFile);

    // Extract all hooks with dependency arrays
    let hooks = extractHooksWithDeps(componentNode, sourceFile, scope);

    // Apply hook filter if provided
    if (args.hook) {
      hooks = filterHooks(hooks, args.hook);
    }

    // Analyze stability for each hook's deps
    const includeStable = args.include_stable_analysis !== false; // default true

    for (const hook of hooks) {
      const analyzedDeps = analyzeDependencies(hook.rawDeps, scope, sourceFile);
      hook.deps = includeStable
        ? analyzedDeps
        : analyzedDeps.filter(d => d.stability !== 'stable');
    }

    // Detect issues for all hooks
    const allIssues: HookIssue[] = [];
    for (const hook of hooks) {
      const hookIssues = detectAllIssues(hook, scope);
      allIssues.push(...hookIssues);
    }

    // Build summary statistics
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const issue of allIssues) {
      bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
      byType[issue.type] = (byType[issue.type] ?? 0) + 1;
    }

    const result: AuditResult = {
      file: makeRelativePath(filePath, projectRoot),
      component: componentName,
      hooks,
      issues: allIssues,
      summary: {
        total_hooks: hooks.length,
        total_issues: allIssues.length,
        by_severity: bySeverity,
        by_type: byType,
      },
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}

// Re-export types
export type { AuditHookDependenciesArgs, AuditResult, HookInfo, HookIssue } from './types.js';
