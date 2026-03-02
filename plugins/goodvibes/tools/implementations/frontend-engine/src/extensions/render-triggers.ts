/**
 * Analyze Render Triggers Extension
 *
 * L2 orchestrator that composes L1 core primitives to identify what causes
 * React components to re-render. Analyzes memoization, inline definitions,
 * expensive computations, context subscriptions, and child prop stability.
 *
 * @module extensions/frontend/render-triggers
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { getProjectRoot } from '../shared/config.js';
import { ok, fail, failFromException, missingArg, invalidArg } from '../shared/response.js';
import type { McpResponse } from '../shared/types.js';
import { makeRelativePath } from '../shared/utils.js';
import { detectMemoization, findComponents } from '../core/render-triggers/memoization.js';
import {
  findStateHooks,
  findPropTriggers,
  findForceUpdateTriggers,
  findInlineDefinitions,
  findExpensiveComputations,
  analyzeContextUsage,
  analyzeChildProps,
} from '../core/render-triggers/analyzers.js';
import { generateSuggestions } from '../core/render-triggers/suggestions.js';
import type {
  AnalyzeRenderTriggersArgs,
  AnalyzeRenderTriggersResult,
  ComponentResult,
  ChildAnalysis,
} from '../core/render-triggers/types.js';

// =============================================================================
// Handler
// =============================================================================

/**
 * Analyzes what causes React components to re-render.
 *
 * Orchestrates: validate args -> resolve path -> parse AST -> detect memo
 * -> find components -> analyze triggers/inline defs/expensive computations
 * -> analyze context/children -> generate suggestions -> ok(result)
 *
 * @param args - The analyze_render_triggers tool arguments (unknown, validated at runtime)
 * @returns MCP tool response with render trigger analysis
 */
export async function analyzeRenderTriggers(args: unknown): Promise<McpResponse> {
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
  if (a.include_children !== undefined && typeof a.include_children !== 'boolean') {
    return invalidArg('include_children', 'must be a boolean');
  }

  const typedArgs: AnalyzeRenderTriggersArgs = {
    file: a.file,
    include_children: a.include_children as boolean | undefined,
  };

  const projectRoot = getProjectRoot();
  const filePath = path.isAbsolute(typedArgs.file)
    ? typedArgs.file
    : path.resolve(projectRoot, typedArgs.file);

  if (!fs.existsSync(filePath)) {
    return fail(`File not found: ${typedArgs.file}`, { provided_path: typedArgs.file });
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
    return fail(
      `Unsupported file type: ${ext}. Supported: .tsx, .jsx, .ts, .js`,
      { file: typedArgs.file }
    );
  }

  const includeChildren = typedArgs.include_children ?? false;

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

    const relativePath = makeRelativePath(filePath, projectRoot);

    // STEP 2: Detect memoization patterns
    const memoMap = detectMemoization(sourceFile);

    // STEP 3: Find all components in the file
    const components = findComponents(sourceFile, memoMap);

    if (components.length === 0) {
      return ok({
        message: 'No React components found in file',
        file: relativePath,
      });
    }

    // STEP 4: Determine default export name for main component selection
    let defaultExportName: string | undefined;
    ts.forEachChild(sourceFile, (node) => {
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
      if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
        const modifiers = ts.getModifiers(node);
        if (
          modifiers &&
          modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) &&
          node.name
        ) {
          defaultExportName = node.name.getText(sourceFile);
        }
      }
    });

    // Main component: prefer default export; fallback to last component (convention)
    const mainComponent =
      (defaultExportName && components.find((c) => c.name === defaultExportName)) ||
      components[components.length - 1];

    // STEP 5: Analyze each component using core primitives
    function analyzeComponent(comp: (typeof components)[0]): ComponentResult {
      const memo = comp.memoInfo;

      const triggers = [
        ...findStateHooks(comp.node, sourceFile),
        ...findPropTriggers(comp.node, sourceFile, memo.is_memoized),
        ...findForceUpdateTriggers(comp.node, sourceFile),
      ];

      const hasPropTriggers = triggers.some((t) => t.type === 'prop');

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

    // STEP 6: Analyze all components
    const allComponentResults = components.map(analyzeComponent);

    // STEP 7: Build final result (main component at top level for backward compatibility)
    const mainResult = allComponentResults.find((r) => r.component === mainComponent.name)!;

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

    return ok(result);
  } catch (error) {
    return failFromException(error, 'Render trigger analysis failed');
  }
}

// =============================================================================
// Deprecated Alias
// =============================================================================

/** @deprecated Use analyzeRenderTriggers */
export const handleAnalyzeRenderTriggers = analyzeRenderTriggers;
