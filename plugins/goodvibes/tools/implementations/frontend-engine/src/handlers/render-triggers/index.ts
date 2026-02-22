/**
 * Analyze Render Triggers Handler
 *
 * Identifies what causes React components to re-render by analyzing:
 * - Memoization status (React.memo, PureComponent, shouldComponentUpdate)
 * - Inline definitions (objects, arrays, functions, JSX in render)
 * - Expensive computations not wrapped in useMemo
 * - Context subscriptions and their granularity
 * - Child component prop stability
 *
 * @module handlers/frontend/render-triggers
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// Re-export types
export type {
  AnalyzeRenderTriggersArgs,
  AnalyzeRenderTriggersResult,
  ComponentResult,
  RenderTrigger,
  InlineDefinition,
  ExpensiveComputation,
  ContextSubscription,
  ChildAnalysis,
  OptimizationSuggestion,
  MemoType,
  ToolResponse,
} from './types.js';

// Import from modules
import type { AnalyzeRenderTriggersArgs, AnalyzeRenderTriggersResult, ChildAnalysis, ComponentResult, ToolResponse } from './types.js';
import { createSuccessResponse, createErrorResponse, makeRelativePath } from './utils.js';
import { detectMemoization, findComponents } from './memoization-detector.js';
import {
  findStateHooks,
  findPropTriggers,
  findForceUpdateTriggers,
  findInlineDefinitions,
  findExpensiveComputations,
  analyzeContextUsage,
  analyzeChildProps,
} from './trigger-analyzers.js';
import { generateSuggestions } from './suggestion-generator.js';

// =============================================================================
// Handler
// =============================================================================

/**
 * Handles the analyze_render_triggers MCP tool call.
 *
 * Analyzes a React component file to identify:
 * - Whether the component is memoized
 * - What triggers re-renders (state, props, context, parent)
 * - Inline definitions that create unstable references
 * - Expensive computations not wrapped in useMemo
 * - Context subscription patterns
 * - Props passed to child components
 *
 * @param args - The analyze_render_triggers tool arguments
 * @returns MCP tool response with render trigger analysis
 */
export async function handleAnalyzeRenderTriggers(
  args: AnalyzeRenderTriggersArgs
): Promise<ToolResponse> {
  const projectRoot = process.cwd();
  const includeChildren = args.include_children ?? false;

  // Validate file argument
  if (!args.file) {
    return createErrorResponse('file argument is required');
  }

  const filePath = path.isAbsolute(args.file)
    ? args.file
    : path.resolve(projectRoot, args.file);

  if (!fs.existsSync(filePath)) {
    return createErrorResponse(`File not found: ${args.file}`, { provided_path: args.file });
  }

  // Check file extension
  const ext = path.extname(filePath).toLowerCase();
  if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
    return createErrorResponse(
      'File must be a React component file (.tsx, .jsx, .ts, or .js)',
      { provided_extension: ext }
    );
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ext === '.tsx' || ext === '.jsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const relativePath = makeRelativePath(filePath, projectRoot);

    // Detect memoization patterns
    const memoMap = detectMemoization(sourceFile);

    // Find components in the file
    const components = findComponents(sourceFile, memoMap);

    if (components.length === 0) {
      return createSuccessResponse({
        message: 'No React components found in file',
        file: relativePath,
      });
    }

    // Determine the default export name (if any) to identify the main component
    let defaultExportName: string | undefined;
    ts.forEachChild(sourceFile, (node) => {
      // export default Identifier
      if (ts.isExportAssignment(node) && !node.isExportEquals) {
        if (ts.isIdentifier(node.expression)) {
          defaultExportName = node.expression.getText(sourceFile);
        } else if (ts.isCallExpression(node.expression)) {
          const arg = node.expression.arguments[0];
          if (arg && ts.isIdentifier(arg)) {
            defaultExportName = arg.getText(sourceFile);
          }
        }
      }
      // export default function ComponentName / export default class ComponentName
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node)
      ) {
        const modifiers = ts.getModifiers(node);
        if (
          modifiers &&
          modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) &&
          node.name
        ) {
          defaultExportName = node.name.getText(sourceFile);
        }
      }
    });

    // Main component: prefer default export; fallback to last component (convention)
    const mainComponent =
      (defaultExportName && components.find(c => c.name === defaultExportName)) ||
      components[components.length - 1];

    // Analyze a single component and return its ComponentResult
    function analyzeComponent(comp: typeof components[0]): ComponentResult {
      const memo = comp.memoInfo;

      const triggers = [
        ...findStateHooks(comp.node, sourceFile),
        ...findPropTriggers(comp.node, sourceFile, memo.is_memoized),
        ...findForceUpdateTriggers(comp.node, sourceFile),
      ];

      // Determine if component has props
      const hasPropTriggers = triggers.some(t => t.type === 'prop');

      triggers.push({
        type: 'parent',
        source: 'Parent component re-render',
        frequency: memo.is_memoized ? 'on_change' : 'every_render',
        preventable: !memo.is_memoized,
        prevention_method: memo.is_memoized
          ? undefined
          : 'Wrap component with React.memo()',
      });

      const inlineDefs = findInlineDefinitions(comp.node, sourceFile);
      const expensiveComps = findExpensiveComputations(comp.node, sourceFile);
      const ctxSubs = analyzeContextUsage(comp.node, sourceFile);

      let childrenAnalysis: ChildAnalysis[] | undefined;
      if (includeChildren) {
        childrenAnalysis = analyzeChildProps(comp.node, sourceFile, inlineDefs, memoMap);
      }

      const suggestions = generateSuggestions(
        memo.is_memoized,
        inlineDefs,
        expensiveComps,
        ctxSubs,
        childrenAnalysis || [],
        hasPropTriggers
      );

      return {
        component: comp.name,
        is_memoized: memo.is_memoized,
        memo_type: memo.memo_type,
        render_triggers: triggers,
        inline_definitions: inlineDefs,
        expensive_computations: expensiveComps,
        context_subscriptions: ctxSubs,
        children_analysis: childrenAnalysis,
        optimization_suggestions: suggestions,
      };
    }

    // Analyze all components
    const allComponentResults = components.map(analyzeComponent);

    // Main component result (for backward-compatible top-level fields)
    const mainResult = allComponentResults.find(r => r.component === mainComponent.name)!;

    const result: AnalyzeRenderTriggersResult = {
      component: mainResult.component,
      file: relativePath,
      is_memoized: mainResult.is_memoized,
      memo_type: mainResult.memo_type,
      render_triggers: mainResult.render_triggers,
      inline_definitions: mainResult.inline_definitions,
      expensive_computations: mainResult.expensive_computations,
      context_subscriptions: mainResult.context_subscriptions,
      children_analysis: mainResult.children_analysis,
      optimization_suggestions: mainResult.optimization_suggestions,
      components: allComponentResults,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
