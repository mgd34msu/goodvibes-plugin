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
import type { AnalyzeRenderTriggersArgs, AnalyzeRenderTriggersResult, ChildAnalysis, ToolResponse } from './types.js';
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
    const memoInfo = detectMemoization(sourceFile);

    // Find components in the file
    const components = findComponents(sourceFile, memoInfo);

    if (components.length === 0) {
      return createSuccessResponse({
        message: 'No React components found in file',
        file: relativePath,
      });
    }

    // Analyze the first/main component (or we could return all)
    const mainComponent = components[0];
    const componentMemo = mainComponent.memoInfo;

    // Gather all render triggers
    const renderTriggers = [
      ...findStateHooks(mainComponent.node, sourceFile),
      ...findPropTriggers(mainComponent.node, sourceFile, componentMemo.is_memoized),
      ...findForceUpdateTriggers(mainComponent.node, sourceFile),
    ];

    // Add parent re-render trigger
    renderTriggers.push({
      type: 'parent',
      source: 'Parent component re-render',
      frequency: componentMemo.is_memoized ? 'on_change' : 'every_render',
      preventable: !componentMemo.is_memoized,
      prevention_method: componentMemo.is_memoized
        ? undefined
        : 'Wrap component with React.memo()',
    });

    // Find inline definitions
    const inlineDefinitions = findInlineDefinitions(mainComponent.node, sourceFile);

    // Find expensive computations
    const expensiveComputations = findExpensiveComputations(mainComponent.node, sourceFile);

    // Analyze context usage
    const contextSubscriptions = analyzeContextUsage(mainComponent.node, sourceFile);

    // Analyze child components if requested
    let childrenAnalysis: ChildAnalysis[] | undefined;
    if (includeChildren) {
      childrenAnalysis = analyzeChildProps(mainComponent.node, sourceFile, inlineDefinitions);
    }

    // Generate optimization suggestions
    const optimizationSuggestions = generateSuggestions(
      componentMemo.is_memoized,
      inlineDefinitions,
      expensiveComputations,
      contextSubscriptions,
      childrenAnalysis || []
    );

    const result: AnalyzeRenderTriggersResult = {
      component: mainComponent.name,
      file: relativePath,
      is_memoized: componentMemo.is_memoized,
      memo_type: componentMemo.memo_type,
      render_triggers: renderTriggers,
      inline_definitions: inlineDefinitions,
      expensive_computations: expensiveComputations,
      context_subscriptions: contextSubscriptions,
      children_analysis: childrenAnalysis,
      optimization_suggestions: optimizationSuggestions,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
