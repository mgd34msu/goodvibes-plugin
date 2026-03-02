/**
 * Analyze Component State Extension
 *
 * L2 orchestrator that composes L1 core primitives to trace React state and
 * props through a component tree. Analyzes useState, useReducer, useRef,
 * useContext, useEffect, and other hooks. Detects common issues like prop
 * drilling and callback instability.
 *
 * @module extensions/frontend/component-state
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { getProjectRoot } from '../shared/config.js';
import { ok, fail, failFromException, missingArg, invalidArg } from '../shared/response.js';
import type { McpResponse } from '../shared/types.js';
import { makeRelativePath } from '../shared/utils.js';
import { isReactComponent, getComponentName } from '../core/component-state/detector.js';
import { extractHooks } from '../core/component-state/hook-analyzer.js';
import { analyzeJsx } from '../core/component-state/jsx-analyzer.js';
import { extractReceivedProps, findProvidedContexts } from '../core/component-state/props-analyzer.js';
import { detectIssues } from '../core/component-state/issue-detector.js';
import type {
  TraceComponentStateArgs,
  TraceComponentStateResult,
  ChildComponentAnalysis,
  AnalysisContext,
} from '../core/component-state/types.js';

// =============================================================================
// Helpers
// =============================================================================

function resolveFilePath(filePath: string, projectRoot: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
}

/**
 * Resolves the file path of a named import in the given source file.
 * Returns the resolved absolute path (with extension found on disk), or null.
 * Validates that the resolved path stays within the project root.
 */
function resolveImportPath(
  name: string,
  sourceFilePath: string,
  projectRoot: string,
  sourceFile: ts.SourceFile
): string | null {
  const dir = path.dirname(sourceFilePath);

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;

    const clause = statement.importClause;
    if (!clause) continue;

    let found = false;
    if (clause.name?.getText(sourceFile) === name) {
      found = true;
    } else if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const spec of clause.namedBindings.elements) {
        if (spec.name.getText(sourceFile) === name) {
          found = true;
          break;
        }
      }
    }

    if (!found) continue;

    const moduleSpec = (statement.moduleSpecifier as ts.StringLiteral).text;
    if (!moduleSpec.startsWith('.')) return null;

    const extensions = ['.tsx', '.jsx', '.ts', '.js', '/index.tsx', '/index.jsx', '/index.ts', '/index.js'];
    const resolved = path.resolve(dir, moduleSpec);

    // Path traversal guard
    const normalizedRoot = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
    if (!resolved.startsWith(normalizedRoot) && resolved !== projectRoot) return null;

    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (fs.existsSync(candidate)) return candidate;
    }
    if (fs.existsSync(resolved)) return resolved;
  }

  return null;
}

/**
 * Finds all PascalCase JSX component usages in a source file.
 */
function findJsxComponentNames(sourceFile: ts.SourceFile): string[] {
  const seen = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName;
      let name: string;
      if (ts.isPropertyAccessExpression(tagName)) {
        name = tagName.expression.getText(sourceFile);
      } else {
        name = tagName.getText(sourceFile);
      }
      if (/^[A-Z]/.test(name)) {
        seen.add(name);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return Array.from(seen);
}

// =============================================================================
// Core Analysis
// =============================================================================

/**
 * Analyzes a single component file, optionally recursing into child components.
 */
async function analyzeComponent(
  filePath: string,
  args: TraceComponentStateArgs,
  projectRoot: string,
  visitedFiles: Set<string>
): Promise<TraceComponentStateResult | { message: string; file: string }> {
  visitedFiles.add(filePath);

  const ext = path.extname(filePath).toLowerCase();
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

  // Find the target React component
  let componentNode: ts.Node | null = null;
  let componentName: string | null = null;
  const targetComponent = args.component;

  function findComponent(node: ts.Node): void {
    if (!componentNode && isReactComponent(node, sourceFile)) {
      const name = getComponentName(node, sourceFile);
      if (targetComponent) {
        if (name === targetComponent) {
          componentNode = node;
          componentName = name;
        }
      } else {
        componentNode = node;
        componentName = name;
      }
    }
    if (!componentNode) {
      ts.forEachChild(node, findComponent);
    }
  }

  findComponent(sourceFile);

  if (!componentNode || !componentName) {
    return { message: 'No React components found in file', file: makeRelativePath(filePath, projectRoot) };
  }

  // Build analysis context
  const ctx: AnalysisContext = {
    sourceFile,
    projectRoot,
    stateVariables: new Map(),
    propNames: new Set(),
    contextValues: new Map(),
    jsxUsedIdentifiers: new Set(),
    jsxPassedProps: [],
    inlineCallbacks: [],
  };

  // Run core primitives in sequence
  const { states, effects, contexts } = extractHooks(componentNode, ctx);
  const receivedProps = extractReceivedProps(componentNode, ctx);
  analyzeJsx(componentNode, ctx);
  const providedContexts = findProvidedContexts(componentNode, ctx);

  // Mark which states are used in JSX
  for (const state of states) {
    if (
      ctx.jsxUsedIdentifiers.has(state.name) ||
      (state.setter && ctx.jsxUsedIdentifiers.has(state.setter))
    ) {
      state.used_in_jsx = true;
    }
    for (const passedProp of ctx.jsxPassedProps) {
      if (passedProp.original_source === 'state') {
        state.passed_to_children = state.passed_to_children || [];
        if (!state.passed_to_children.includes(passedProp.to_component)) {
          state.passed_to_children.push(passedProp.to_component);
        }
      }
    }
  }

  const issues = detectIssues(componentNode, ctx, receivedProps, effects);

  const result: TraceComponentStateResult = {
    component: componentName,
    file: makeRelativePath(filePath, projectRoot),
    local_state: states,
    props: {
      received: receivedProps,
      passed_down: ctx.jsxPassedProps,
    },
    context: {
      consumed: contexts,
      provided: providedContexts,
    },
    effects,
    issues,
  };

  // Recurse into child components if requested
  if (args.include_children && (args.depth ?? 2) > 0) {
    const childDepth = args.depth ?? 2;
    const componentNames = findJsxComponentNames(sourceFile);
    const children: ChildComponentAnalysis[] = [];

    for (const name of componentNames) {
      const childFilePath = resolveImportPath(name, filePath, projectRoot, sourceFile);
      if (!childFilePath) continue;
      if (visitedFiles.has(childFilePath)) continue;

      try {
        const childArgs: TraceComponentStateArgs = {
          file: childFilePath,
          component: name,
          include_children: childDepth > 1,
          depth: childDepth - 1,
        };

        const childResult = await analyzeComponent(childFilePath, childArgs, projectRoot, visitedFiles);
        if ('message' in childResult) continue;

        children.push({
          component: name,
          file: childFilePath.startsWith(projectRoot)
            ? childFilePath.slice(projectRoot.length).replace(/^\//, '')
            : childFilePath,
          analysis: childResult,
        });
      } catch {
        // Skip children that fail to analyze — prevents broken child from breaking parent
      }
    }

    result.children = children;
  }

  return result;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Traces React state and props through a component tree.
 *
 * Orchestrates: validate args -> resolve path -> parse AST -> extract hooks
 * -> extract props -> analyze JSX -> detect issues -> recurse children -> ok(result)
 *
 * @param args - The trace_component_state tool arguments (unknown, validated at runtime)
 * @returns MCP tool response with component state analysis
 */
export async function analyzeComponentState(args: unknown): Promise<McpResponse> {
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
  if (a.component !== undefined && typeof a.component !== 'string') {
    return invalidArg('component', 'must be a string');
  }
  if (a.include_children !== undefined && typeof a.include_children !== 'boolean') {
    return invalidArg('include_children', 'must be a boolean');
  }
  if (a.depth !== undefined && (typeof a.depth !== 'number' || !Number.isInteger(a.depth) || a.depth < 0)) {
    return invalidArg('depth', 'must be a non-negative integer');
  }

  const typedArgs: TraceComponentStateArgs = {
    file: a.file,
    component: a.component as string | undefined,
    include_children: a.include_children as boolean | undefined,
    depth: a.depth as number | undefined,
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
    const result = await analyzeComponent(filePath, typedArgs, projectRoot, new Set<string>());
    return ok(result);
  } catch (error) {
    return failFromException(error, 'Component state analysis failed');
  }
}

// =============================================================================
// Deprecated Alias
// =============================================================================

/** @deprecated Use analyzeComponentState */
export const handleTraceComponentState = analyzeComponentState;
