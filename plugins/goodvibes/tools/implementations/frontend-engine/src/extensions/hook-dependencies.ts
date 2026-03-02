/**
 * Analyze Hook Dependencies Extension
 *
 * L2 orchestrator that composes L1 core primitives to audit React hook
 * dependency arrays for stale closures, missing/unnecessary dependencies,
 * unstable references, and anti-patterns.
 *
 * @module extensions/frontend/hook-dependencies
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { getProjectRoot } from '../shared/config.js';
import { ok, fail, failFromException, missingArg, invalidArg } from '../shared/response.js';
import type { McpResponse } from '../shared/types.js';
import { makeRelativePath } from '../shared/utils.js';
import { buildComponentScope, extractHooksWithDeps } from '../core/hooks/extractor.js';
import { analyzeDependencies } from '../core/hooks/stability-analyzer.js';
import { detectAllIssues } from '../core/hooks/issue-detector.js';
import type {
  AuditHookDependenciesArgs,
  AuditResult,
  HookInfo,
  HookIssue,
} from '../core/hooks/types.js';

// =============================================================================
// Helpers
// =============================================================================

function resolveFilePath(filePath: string, projectRoot: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
}

/**
 * Detect the name of the first React component/function in the source file.
 * Falls back to the file name (without extension) if no component is found.
 */
function detectComponentName(sourceFile: ts.SourceFile, filePath: string): string {
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      /^[A-Z]/.test(statement.name.getText(sourceFile))
    ) {
      return statement.name.getText(sourceFile);
    }

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
  }
  return path.basename(filePath, path.extname(filePath));
}

/**
 * Filter hooks by a specific hook filter string (variable name or line number).
 */
function filterHooks(hooks: HookInfo[], hookFilter: string): HookInfo[] {
  const lineNum = parseInt(hookFilter, 10);
  if (!isNaN(lineNum)) {
    return hooks.filter((h) => h.line === lineNum);
  }
  return hooks.filter(
    (h) => h.variableName === hookFilter || h.name === hookFilter
  );
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Audits React hook dependency arrays for issues.
 *
 * Orchestrates: validate args -> resolve path -> parse AST -> build scope
 * -> extract hooks -> apply filter -> analyze stability -> detect issues
 * -> aggregate results -> ok(result)
 *
 * @param args - The audit_hook_dependencies tool arguments (unknown, validated at runtime)
 * @returns MCP tool response with hook dependency audit
 */
export async function analyzeHookDependencies(args: unknown): Promise<McpResponse> {
  if (!args || typeof args !== 'object') {
    return fail('Invalid arguments: expected an object');
  }

  const a = args as Record<string, unknown>;

  if (!a.file) {
    return missingArg('file');
  }
  if (typeof a.file !== 'string') {
    return invalidArg('file', 'must be a string');
  }
  if (a.hook !== undefined && typeof a.hook !== 'string') {
    return invalidArg('hook', 'must be a string (variable name or line number)');
  }
  if (a.include_stable_analysis !== undefined && typeof a.include_stable_analysis !== 'boolean') {
    return invalidArg('include_stable_analysis', 'must be a boolean');
  }

  const typedArgs: AuditHookDependenciesArgs = {
    file: a.file,
    hook: a.hook as string | undefined,
    include_stable_analysis: a.include_stable_analysis as boolean | undefined,
  };

  const projectRoot = getProjectRoot();
  const filePath = resolveFilePath(typedArgs.file, projectRoot);

  if (!fs.existsSync(filePath)) {
    return fail(`File not found: ${typedArgs.file}`, { provided_path: typedArgs.file });
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
    return fail(`Unsupported file type: ${ext}. Supported: .tsx, .jsx, .ts, .js`, { file: typedArgs.file });
  }

  try {
    // STEP 1: Parse source file with 4-way ScriptKind
    const content = fs.readFileSync(filePath, 'utf-8');
    const scriptKind =
      ext === '.tsx' ? ts.ScriptKind.TSX :
      ext === '.jsx' ? ts.ScriptKind.JSX :
      ext === '.ts'  ? ts.ScriptKind.TS :
                       ts.ScriptKind.JS;

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );

    // STEP 2: Detect component name
    const componentName = detectComponentName(sourceFile, filePath);

    // STEP 3: Build component scope (imports, module-level decls, hook assignments)
    const componentNode = sourceFile; // analyze all hooks at top level
    const scope = buildComponentScope(componentNode, sourceFile);

    // STEP 4: Extract all hooks with dependency arrays
    let hooks = extractHooksWithDeps(componentNode, sourceFile, scope);

    // STEP 5: Apply hook filter if provided
    if (typedArgs.hook) {
      hooks = filterHooks(hooks, typedArgs.hook);
    }

    // STEP 6: Analyze dependency stability for each hook
    const includeStable = typedArgs.include_stable_analysis !== false; // default true
    for (const hook of hooks) {
      const analyzedDeps = analyzeDependencies(hook.rawDeps, scope, sourceFile);
      hook.deps = includeStable
        ? analyzedDeps
        : analyzedDeps.filter((d) => d.stability !== 'stable');
    }

    // STEP 7: Detect issues across all hooks
    const allIssues: HookIssue[] = [];
    for (const hook of hooks) {
      const hookIssues = detectAllIssues(hook, scope);
      allIssues.push(...hookIssues);
    }

    // STEP 8: Aggregate summary statistics
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

    return ok(result);
  } catch (error) {
    return failFromException(error, 'Hook dependency analysis failed');
  }
}

// =============================================================================
// Deprecated Alias
// =============================================================================

/** @deprecated Use analyzeHookDependencies */
export const handleAuditHookDependencies = analyzeHookDependencies;
