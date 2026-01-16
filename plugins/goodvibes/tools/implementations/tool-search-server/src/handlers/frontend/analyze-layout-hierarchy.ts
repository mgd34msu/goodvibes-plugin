/**
 * Analyze Layout Hierarchy Handler
 *
 * Parses JSX/TSX/Vue/Svelte files and analyzes the CSS layout hierarchy
 * to identify sizing constraints, flex/grid properties, and potential
 * layout issues. Supports Tailwind CSS class parsing.
 *
 * @module handlers/frontend/analyze-layout-hierarchy
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// Re-export types from sub-modules
export type { SizingStrategy, DisplayType, PositionType, ParsedCssProperties } from './layout-hierarchy-utils.js';
export type {
  Sizing,
  FlexProps,
  GridProps,
  Overflow,
  LayoutNode,
  LayoutIssue,
  LayoutContext,
} from './layout-hierarchy-analyzers.js';

// Import from sub-modules
import { parseTailwindClasses } from './layout-hierarchy-utils.js';
import {
  type LayoutNode,
  type LayoutIssue,
  detectIssues,
  generateConstraintNotes,
  generateSummary,
} from './layout-hierarchy-analyzers.js';
import {
  parseJsxElement,
  findRootJsx,
} from './layout-hierarchy-core.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the analyze_layout_hierarchy tool
 */
export interface AnalyzeLayoutHierarchyArgs {
  /** Component file path to analyze */
  file: string;
  /** Optional: Focus on specific element by class or id */
  selector?: string;
}

/**
 * Result of layout hierarchy analysis
 */
export interface AnalyzeLayoutHierarchyResult {
  file: string;
  root_element: string;
  layout_tree: LayoutNode;
  constraint_notes: string[];
  potential_issues: LayoutIssue[];
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
 * Handles the analyze_layout_hierarchy MCP tool call.
 *
 * Parses JSX/TSX files to analyze the CSS layout hierarchy, extracting:
 * - Display types (flex, grid, block)
 * - Sizing strategies (fixed, percentage, auto)
 * - Flex/grid properties
 * - Overflow and position settings
 * - Potential layout issues and suggestions
 *
 * @param args - The analyze_layout_hierarchy tool arguments
 * @returns MCP tool response with layout analysis
 */
export async function handleAnalyzeLayoutHierarchy(
  args: AnalyzeLayoutHierarchyArgs
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
    if (!['.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte'].includes(ext)) {
      return createErrorResponse(
        `Unsupported file type: ${ext}. Supported: .tsx, .jsx, .ts, .js, .vue, .svelte`,
        { provided_path: args.file }
      );
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // For Vue/Svelte, extract template section
    let jsxContent = content;
    if (ext === '.vue') {
      const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
      if (templateMatch) {
        // Convert Vue template to JSX-like format for parsing
        jsxContent = templateMatch[1]
          .replace(/:class=/g, 'className=')
          .replace(/v-bind:class=/g, 'className=')
          .replace(/class=/g, 'className=');
      }
    } else if (ext === '.svelte') {
      // For Svelte, content is mixed, try to parse directly
      jsxContent = content.replace(/class=/g, 'className=');
    }

    // Determine script kind based on file extension
    const scriptKind =
      ext === '.tsx' ? ts.ScriptKind.TSX
      : ext === '.jsx' ? ts.ScriptKind.JSX
      : ext === '.ts' ? ts.ScriptKind.TSX  // Use TSX for .ts to support JSX in tests
      : ts.ScriptKind.JSX;  // Use JSX for .js and others

    // Parse as TSX/JSX
    const sourceFile = ts.createSourceFile(
      filePath,
      jsxContent,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );

    // Find root JSX element
    const rootJsxNode = findRootJsx(sourceFile);

    if (!rootJsxNode) {
      return createErrorResponse('No JSX element found in file. Ensure the component returns JSX.', {
        file: args.file,
      });
    }

    // Parse JSX tree into layout nodes
    const layoutTree = parseJsxElement(rootJsxNode, sourceFile, args.selector);

    if (!layoutTree) {
      if (args.selector) {
        return createErrorResponse(`No element matching selector "${args.selector}" found in component.`, {
          file: args.file,
          selector: args.selector,
        });
      }
      return createErrorResponse('Failed to parse layout hierarchy from JSX.', {
        file: args.file,
      });
    }

    // Detect issues
    const potentialIssues = detectIssues(layoutTree);

    // Generate constraint notes
    const constraintNotes = generateConstraintNotes(layoutTree);

    // Generate summary
    const summary = generateSummary(layoutTree, potentialIssues);

    // Build result
    const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    const result: AnalyzeLayoutHierarchyResult = {
      file: relativePath,
      root_element: layoutTree.element,
      layout_tree: layoutTree,
      constraint_notes: constraintNotes,
      potential_issues: potentialIssues,
      summary,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
