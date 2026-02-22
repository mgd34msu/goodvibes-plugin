/**
 * Trace Component State Handler
 *
 * Traces React state and props through component trees using TypeScript
 * AST analysis. Analyzes useState, useReducer, useRef, useContext, useEffect,
 * and other hooks. Detects common issues like prop drilling and callback
 * instability.
 *
 * @module handlers/frontend/component-state
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// Re-export types
export type {
  TraceComponentStateArgs,
  TraceComponentStateResult,
  ChildComponentAnalysis,
  LocalStateInfo,
  ReceivedProp,
  PassedDownProp,
  PropsAnalysis,
  ConsumedContext,
  ProvidedContext,
  ContextAnalysis,
  EffectInfo,
  ComponentIssue,
  ToolResponse,
  AnalysisContext,
} from './types.js';

// Import from modules
import type { TraceComponentStateArgs, TraceComponentStateResult, ChildComponentAnalysis, AnalysisContext, ToolResponse } from './types.js';
import { createSuccessResponse, createErrorResponse, makeRelativePath, resolveFilePath } from './utils.js';
import { getProjectRoot } from '../../config.js';
import { extractHooks } from './hook-analyzer.js';
import { extractReceivedProps, findProvidedContexts } from './props-analyzer.js';
import { analyzeJsx } from './jsx-analyzer.js';
import { detectIssues } from './issue-detector.js';
import { isReactComponent, getComponentName } from './component-detector.js';

// =============================================================================
// Child Component Analysis
// =============================================================================

/**
 * Finds all PascalCase JSX component usages in a source file using AST analysis.
 * Returns unique component names (custom components, not HTML elements).
 * Handles standard components (<UserCard />) and namespaced (<Icons.Arrow />).
 */
function findJsxComponentNames(sourceFile: ts.SourceFile): string[] {
  const seen = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName;
      let name: string;

      if (ts.isPropertyAccessExpression(tagName)) {
        // Namespaced: <Icons.Arrow /> — extract the root identifier (Icons)
        name = tagName.expression.getText(sourceFile);
      } else {
        name = tagName.getText(sourceFile);
      }

      // Only include PascalCase (custom components, not HTML elements)
      if (/^[A-Z]/.test(name)) {
        seen.add(name);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return Array.from(seen);
}

/**
 * Resolves the file path of a named import in the given source file.
 * Looks for `import { name } from 'relPath'` or `import name from 'relPath'`.
 * Returns the resolved absolute path (with extension found on disk), or null.
 * Validates that the resolved path stays within the project root.
 */
function resolveImportPath(name: string, sourceFilePath: string, projectRoot: string, sourceFile: ts.SourceFile): string | null {
  const dir = path.dirname(sourceFilePath);

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;

    // Check if this import includes our name
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

    // Get the module specifier
    const moduleSpec = (statement.moduleSpecifier as ts.StringLiteral).text;
    // Skip non-relative imports (node_modules)
    if (!moduleSpec.startsWith('.')) return null;

    // Try common extensions in order
    const extensions = ['.tsx', '.jsx', '.ts', '.js', '/index.tsx', '/index.jsx', '/index.ts', '/index.js'];
    const resolved = path.resolve(dir, moduleSpec);

    // Path traversal guard: ensure resolved path stays within project root
    // Use separator suffix to prevent bypasses like "/project-root-evil/"
    const normalizedRoot = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
    if (!resolved.startsWith(normalizedRoot) && resolved !== projectRoot) return null;

    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (fs.existsSync(candidate)) return candidate;
    }
    // Maybe the import already has an extension
    if (fs.existsSync(resolved)) return resolved;
  }

  return null;
}

// =============================================================================
// Internal Core Analysis
// =============================================================================

/**
 * Internal core analysis function — runs the full component analysis for a single file.
 * Called by handleTraceComponentState (with a fresh visitedFiles set) and
 * recursively by the child component analysis loop (with the shared visitedFiles set).
 *
 * @param filePath - Absolute path to the component file
 * @param args - Original trace args (component filter, include_children, depth)
 * @param projectRoot - Project root for path operations
 * @param visitedFiles - Set of already-visited file paths (circular reference guard)
 */
async function _analyzeComponent(
  filePath: string,
  args: TraceComponentStateArgs,
  projectRoot: string,
  visitedFiles: Set<string>
): Promise<ToolResponse> {
  // Mark this file as visited before analysis to prevent circular references
  visitedFiles.add(filePath);

  const ext = path.extname(filePath).toLowerCase();

  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ext === '.tsx' ? ts.ScriptKind.TSX : ext === '.jsx' ? ts.ScriptKind.JSX : ts.ScriptKind.TS
  );

  // Find React component in the file (optionally filtered by name)
  let componentNode: ts.Node | null = null;
  let componentName: string | null = null;
  const targetComponent = args.component;

  function findComponent(node: ts.Node): void {
    if (!componentNode && isReactComponent(node, sourceFile)) {
      const name = getComponentName(node, sourceFile);
      // If a specific component is requested, only match that one
      if (targetComponent) {
        if (name === targetComponent) {
          componentNode = node;
          componentName = name;
        }
      } else {
        // No filter - take the first component found
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
    return createSuccessResponse({ message: 'No React components found in file', file: makeRelativePath(filePath, projectRoot) });
  }

  // Create analysis context
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

  // Run analysis
  const { states, effects, contexts } = extractHooks(componentNode, ctx);
  const receivedProps = extractReceivedProps(componentNode, ctx);
  analyzeJsx(componentNode, ctx);
  const providedContexts = findProvidedContexts(componentNode, ctx);

  // Mark which states are used in JSX
  for (const state of states) {
    if (ctx.jsxUsedIdentifiers.has(state.name) ||
        (state.setter && ctx.jsxUsedIdentifiers.has(state.setter))) {
      state.used_in_jsx = true;
    }

    // Find which children receive this state
    for (const passedProp of ctx.jsxPassedProps) {
      if (passedProp.original_source === 'state') {
        state.passed_to_children = state.passed_to_children || [];
        if (!state.passed_to_children.includes(passedProp.to_component)) {
          state.passed_to_children.push(passedProp.to_component);
        }
      }
    }
  }

  // Detect issues
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

  // Analyze child components if requested
  // Reuse the already-parsed sourceFile to find JSX component names (avoids double read)
  if (args.include_children && (args.depth ?? 2) > 0) {
    const childDepth = args.depth ?? 2;
    const componentNames = findJsxComponentNames(sourceFile);
    const children: ChildComponentAnalysis[] = [];

    for (const name of componentNames) {
      const childFilePath = resolveImportPath(name, filePath, projectRoot, sourceFile);
      if (!childFilePath) continue;

      // Circular reference guard: skip already-visited files (also covers self-reference)
      if (visitedFiles.has(childFilePath)) continue;

      try {
        const childArgs: TraceComponentStateArgs = {
          file: childFilePath,
          component: name,
          include_children: childDepth > 1,
          depth: childDepth - 1,
        };

        const response = await _analyzeComponent(childFilePath, childArgs, projectRoot, visitedFiles);
        if (response.isError) continue;

        const analysisData = JSON.parse(response.content[0].text) as TraceComponentStateResult;
        children.push({
          component: name,
          file: childFilePath.startsWith(projectRoot)
            ? childFilePath.slice(projectRoot.length).replace(/^\//, '')
            : childFilePath,
          analysis: analysisData,
        });
      } catch {
        // Intentionally skip children that fail to analyze (e.g., unresolvable imports,
        // parse errors in child files). This prevents one broken child from breaking
        // the entire parent analysis. Failed children are simply omitted from results.
      }
    }

    result.children = children;
  }

  return createSuccessResponse(result);
}

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Handles the trace_component_state MCP tool call.
 *
 * Traces React state and props through a component, analyzing:
 * - useState, useReducer, useRef hooks
 * - Props received and passed to children
 * - Context consumed and provided
 * - Effects and their dependencies
 * - Common issues (prop drilling, callback instability, etc.)
 *
 * @param args - The trace_component_state tool arguments
 * @returns MCP tool response with component state analysis
 */
export async function handleTraceComponentState(args: TraceComponentStateArgs): Promise<ToolResponse> {
  const projectRoot = getProjectRoot();

  // Validate file argument exists
  if (!args.file) {
    return createErrorResponse('file argument is required');
  }

  const filePath = resolveFilePath(args.file, projectRoot);

  if (!fs.existsSync(filePath)) {
    return createErrorResponse(`File not found: ${args.file}`, { provided_path: args.file });
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
    return createErrorResponse(`Unsupported file type: ${ext}. Supported: .tsx, .jsx, .ts, .js`, { file: args.file });
  }

  try {
    // Use a fresh visited set for each top-level call to prevent circular references
    return await _analyzeComponent(filePath, args, projectRoot, new Set<string>());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
