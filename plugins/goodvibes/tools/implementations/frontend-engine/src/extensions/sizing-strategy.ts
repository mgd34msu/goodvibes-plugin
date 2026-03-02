/**
 * Sizing Strategy Extension
 *
 * L2 orchestrator that composes L1 core sizing primitives into the
 * get_sizing_strategy MCP tool handler. Validates arguments, delegates
 * to core analysis functions, and formats results.
 *
 * @module extensions/sizing-strategy
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

import { ok, fail, failFromException, missingArg } from '../shared/response.js';
import type { McpResponse } from '../shared/types.js';
import { createElementIdentifier } from '../core/tailwind/identifier.js';
import {
  analyzeWidthStrategy,
  analyzeHeightStrategy,
  analyzeFlexBehavior,
  analyzeGridBehavior,
} from '../core/sizing/analyzers.js';
import {
  getPositionContext,
  buildAncestorChain,
  generateSummary,
} from '../core/sizing/context.js';
import type { SizingDimension, FlexBehavior, GridBehavior, AncestorNode } from '../core/sizing/context.js';
import { findRootJsx } from '../core/layout/analyzer.js';
import {
  findElementBySelector,
  getAllElements,
} from '../core/jsx/element-finder.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the get_sizing_strategy tool
 */
export interface GetSizingStrategyArgs {
  /** Component file path to analyze */
  file: string;
  /** Element selector (id, class, or tag name) to analyze */
  element: string;
}

/**
 * Result of sizing strategy analysis
 */
export interface GetSizingStrategyResult {
  file: string;
  element: string;
  classes: string[];
  width: SizingDimension;
  height: SizingDimension;
  flex_behavior?: FlexBehavior;
  grid_behavior?: GridBehavior;
  position_context: string;
  ancestor_chain: AncestorNode[];
  summary: string;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Analyze how an element's size is determined.
 *
 * Examines:
 * - Explicit width/height classes and their values
 * - Display type and its effect on sizing
 * - Flex properties (grow, shrink, basis)
 * - Grid placement and track sizes
 * - Position context (static, relative, absolute, fixed, sticky)
 * - Parent constraints (max-width, overflow, etc.)
 *
 * @param args - The get_sizing_strategy tool arguments
 * @returns MCP tool response with sizing analysis
 */
export async function analyzeSizingStrategy(args: unknown): Promise<McpResponse> {
  const typedArgs = args as GetSizingStrategyArgs;
  const projectRoot = process.cwd();

  if (!typedArgs.file) {
    return missingArg('file');
  }
  if (!typedArgs.element) {
    return missingArg('element');
  }

  try {
    // Resolve file path
    const filePath = path.isAbsolute(typedArgs.file)
      ? typedArgs.file
      : path.resolve(projectRoot, typedArgs.file);

    // Check file exists
    if (!fs.existsSync(filePath)) {
      return fail(`File not found: ${typedArgs.file}`, { provided_path: typedArgs.file });
    }

    // Validate file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
      return fail(
        `Unsupported file type: ${ext}. Supported: .tsx, .jsx, .ts, .js`,
        { provided_path: typedArgs.file }
      );
    }

    // Parse as TSX/JSX
    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ext === '.tsx' ? ts.ScriptKind.TSX
      : ext === '.jsx' ? ts.ScriptKind.JSX
      : ext === '.ts' ? ts.ScriptKind.TS
      : ts.ScriptKind.JS
    );

    // Find root JSX element
    const rootJsxNode = findRootJsx(sourceFile);
    if (!rootJsxNode) {
      return fail('No JSX element found in file. Ensure the component returns JSX.', {
        file: typedArgs.file,
      });
    }

    // Find target element by selector
    const elementNode = findElementBySelector(rootJsxNode, sourceFile, typedArgs.element);
    if (!elementNode) {
      const availableElements = getAllElements(rootJsxNode, sourceFile);
      const suggestions = availableElements.slice(0, 10).map((e) => e.selector);
      return fail(
        `Element "${typedArgs.element}" not found in component.`,
        {
          file: typedArgs.file,
          selector: typedArgs.element,
          available_selectors: suggestions,
          hint: 'Use #id, .className, or tagName as selector',
        }
      );
    }

    // Run sizing analysis
    const widthAnalysis = analyzeWidthStrategy(elementNode);
    const heightAnalysis = analyzeHeightStrategy(elementNode);
    const flexBehavior = analyzeFlexBehavior(elementNode);
    const gridBehavior = analyzeGridBehavior(elementNode);
    const positionContext = getPositionContext(elementNode);
    const ancestorChain = buildAncestorChain(elementNode);
    const summary = generateSummary(elementNode, widthAnalysis, heightAnalysis, flexBehavior, gridBehavior);

    const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    const result: GetSizingStrategyResult = {
      file: relativePath,
      element: createElementIdentifier(elementNode.tagName, elementNode.classes, elementNode.id),
      classes: elementNode.classes,
      width: widthAnalysis,
      height: heightAnalysis,
      flex_behavior: flexBehavior,
      grid_behavior: gridBehavior,
      position_context: positionContext,
      ancestor_chain: ancestorChain,
      summary,
    };

    return ok(result);
  } catch (error) {
    /* v8 ignore next */
    return failFromException(error, 'Analysis failed');
  }
}

// =============================================================================
// Deprecated Alias
// =============================================================================

/** @deprecated Use analyzeSizingStrategy */
export const handleGetSizingStrategy = analyzeSizingStrategy;
