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
import type { TraceComponentStateArgs, TraceComponentStateResult, AnalysisContext, ToolResponse } from './types.js';
import { createSuccessResponse, createErrorResponse, makeRelativePath, resolveFilePath } from './utils.js';
import { extractHooks } from './hook-analyzer.js';
import { extractReceivedProps, findProvidedContexts } from './props-analyzer.js';
import { analyzeJsx } from './jsx-analyzer.js';
import { detectIssues } from './issue-detector.js';
import { isReactComponent, getComponentName } from './component-detector.js';

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
  const projectRoot = process.cwd();
  const filePath = resolveFilePath(args.file, projectRoot);

  if (!fs.existsSync(filePath)) {
    return createErrorResponse(`File not found: ${args.file}`, { provided_path: args.file });
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
    return createErrorResponse(`File must be a React component file (.tsx, .jsx, .ts, .js)`, { file: args.file });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ext === '.tsx' ? ts.ScriptKind.TSX : ext === '.jsx' ? ts.ScriptKind.JSX : ts.ScriptKind.TS
    );

    // Find the first React component in the file
    let componentNode: ts.Node | null = null;
    let componentName: string | null = null;

    function findComponent(node: ts.Node): void {
      if (!componentNode && isReactComponent(node, sourceFile)) {
        componentNode = node;
        componentName = getComponentName(node, sourceFile);
      }
      if (!componentNode) {
        ts.forEachChild(node, findComponent);
      }
    }

    findComponent(sourceFile);

    if (!componentNode || !componentName) {
      return createErrorResponse(`No React component found in file`, { file: args.file });
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

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
