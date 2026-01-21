/**
 * Get Sizing Strategy Handler
 *
 * Analyzes how an element's size is determined by examining its CSS classes,
 * display properties, flex/grid behavior, and parent constraints. Supports
 * Tailwind CSS class parsing.
 *
 * @module handlers/frontend/get-sizing-strategy
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// Re-export types from sub-modules
export type {
  DisplayType,
  PositionType,
  SizingStrategyType,
  ElementNode,
} from './sizing-strategy-utils.js';
export type {
  SizingDimension,
  FlexBehavior,
  GridBehavior,
  AncestorNode,
} from './sizing-strategy-analyzers.js';

// Import from sub-modules
import { createElementIdentifier } from './sizing-strategy-utils.js';
import {
  type SizingDimension,
  type FlexBehavior,
  type GridBehavior,
  type AncestorNode,
  analyzeWidthStrategy,
  analyzeHeightStrategy,
  analyzeFlexBehavior,
  analyzeGridBehavior,
  getPositionContext,
  buildAncestorChain,
  generateSummary,
} from './sizing-strategy-analyzers.js';
import {
  findRootJsx,
  findElementBySelector,
  getAllElements,
} from './sizing-strategy-core.js';

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

/**
 * Tool response format
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
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
// Handler
// =============================================================================

/**
 * Handles the get_sizing_strategy MCP tool call.
 *
 * Analyzes how an element's size is determined by examining:
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
export async function handleGetSizingStrategy(
  args: GetSizingStrategyArgs
): Promise<ToolResponse> {
  const projectRoot = process.cwd();

  try {
    // Resolve file path
    const filePath = path.isAbsolute(args.file) ? args.file : path.resolve(projectRoot, args.file);

    // Check file exists
    if (!fs.existsSync(filePath)) {
      return createErrorResponse(`File not found: ${args.file}`, { provided_path: args.file });
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.tsx', '.jsx', '.vue', '.svelte'].includes(ext)) {
      return createErrorResponse(
        `Unsupported file type: ${ext}. Supported: .tsx, .jsx, .vue, .svelte`,
        { provided_path: args.file }
      );
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // For Vue/Svelte, extract template section and wrap as JSX
    let jsxContent = content;
    if (ext === '.vue') {
      const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
      if (templateMatch) {
        const templateContent = templateMatch[1]
          .replace(/:class=/g, 'className=')
          .replace(/v-bind:class=/g, 'className=')
          .replace(/class=/g, 'className=');
        // Wrap Vue template content in a JSX function for parsing
        jsxContent = `function VueComponent() { return (<>${templateContent}</>); }`;
      } else {
        return createErrorResponse('No <template> section found in Vue file', { file: args.file });
      }
    } else if (ext === '.svelte') {
      // Extract just the template part (strip script/style)
      let templateContent = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/class=/g, 'className=')
        .trim();
      // Wrap Svelte template content in a JSX function for parsing
      jsxContent = `function SvelteComponent() { return (<>${templateContent}</>); }`;
    }

    // Parse as TSX
    const sourceFile = ts.createSourceFile(
      filePath,
      jsxContent,
      ts.ScriptTarget.Latest,
      true,
      ext === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
    );

    // Find root JSX element
    const rootJsxNode = findRootJsx(sourceFile);

    if (!rootJsxNode) {
      return createErrorResponse('No JSX element found in file. Ensure the component returns JSX.', {
        file: args.file,
      });
    }

    // Find the target element
    const elementNode = findElementBySelector(rootJsxNode, sourceFile, args.element);

    if (!elementNode) {
      // Get available elements for helpful error message
      const availableElements = getAllElements(rootJsxNode, sourceFile);
      const suggestions = availableElements.slice(0, 10).map((e) => e.selector);

      return createErrorResponse(
        `Element "${args.element}" not found in component.`,
        {
          file: args.file,
          selector: args.element,
          available_selectors: suggestions,
          hint: 'Use #id, .className, or tagName as selector',
        }
      );
    }

    // Analyze sizing
    const widthAnalysis = analyzeWidthStrategy(elementNode);
    const heightAnalysis = analyzeHeightStrategy(elementNode);
    const flexBehavior = analyzeFlexBehavior(elementNode);
    const gridBehavior = analyzeGridBehavior(elementNode);
    const positionContext = getPositionContext(elementNode);
    const ancestorChain = buildAncestorChain(elementNode);

    // Generate summary
    const summary = generateSummary(
      elementNode,
      widthAnalysis,
      heightAnalysis,
      flexBehavior,
      gridBehavior
    );

    // Build result
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

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
