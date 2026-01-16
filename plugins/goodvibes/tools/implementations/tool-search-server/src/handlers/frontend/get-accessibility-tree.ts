/**
 * Get Accessibility Tree Handler
 *
 * Builds an accessibility tree from React/Vue/Svelte components and detects
 * WCAG issues. Analyzes semantic roles, focus order, keyboard interactions,
 * and ARIA patterns.
 *
 * @module handlers/frontend/get-accessibility-tree
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// Re-export types from sub-modules
export type { ElementInfo } from './accessibility-tree-utils.js';
export type {
  A11yNode,
  FocusOrderEntry,
  A11yIssue,
  KeyboardInteractions,
  AriaPattern,
} from './accessibility-tree-analyzers.js';

// Import from sub-modules
import { analyzeJsxFile } from './accessibility-tree-core.js';
import {
  type A11yNode,
  type FocusOrderEntry,
  type A11yIssue,
  type KeyboardInteractions,
  type AriaPattern,
  buildA11yTree,
  buildFocusOrder,
  detectA11yIssues,
  analyzeKeyboardInteractions,
  validateAriaPatterns,
  generateSummary,
} from './accessibility-tree-analyzers.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the get_accessibility_tree tool
 */
export interface GetAccessibilityTreeArgs {
  /** File path to analyze (relative to project root or absolute) */
  file: string;
  /** Optional: Focus on specific element (by tag or component name) */
  element?: string;
  /** Check for common accessibility patterns (default true) */
  check_patterns?: boolean;
}

/**
 * Result of accessibility tree analysis
 */
interface GetAccessibilityTreeResult {
  /** File that was analyzed */
  file: string;
  /** Root of the accessibility tree */
  a11y_tree: A11yNode;
  /** Focus order sequence */
  focus_order: FocusOrderEntry[];
  /** Detected accessibility issues */
  issues: A11yIssue[];
  /** Keyboard interaction analysis */
  keyboard_interactions: KeyboardInteractions;
  /** ARIA pattern validation results */
  aria_patterns: AriaPattern[];
  /** Summary of the analysis */
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
 * Handles the get_accessibility_tree MCP tool call.
 *
 * Builds an accessibility tree from a component file and detects WCAG issues.
 *
 * @param args - The get_accessibility_tree tool arguments
 * @returns MCP tool response with accessibility analysis
 */
export async function handleGetAccessibilityTree(
  args: GetAccessibilityTreeArgs
): Promise<ToolResponse> {
  const projectRoot = process.cwd();
  const checkPatterns = args.check_patterns ?? true;

  try {
    // Resolve file path
    const filePath = path.isAbsolute(args.file)
      ? args.file
      : path.resolve(projectRoot, args.file);

    // Check file exists
    if (!fs.existsSync(filePath)) {
      return createErrorResponse(`File not found: ${args.file}`, {
        provided_path: args.file,
        resolved_path: filePath,
      });
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.tsx', '.jsx', '.vue', '.svelte'].includes(ext)) {
      return createErrorResponse(
        `Unsupported file type: ${ext}. Supported: .tsx, .jsx, .vue, .svelte`,
        { file: args.file }
      );
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // For Vue/Svelte, extract template section
    let templateContent = content;
    if (ext === '.vue') {
      const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
      templateContent = templateMatch ? templateMatch[1] : content;
    } else if (ext === '.svelte') {
      templateContent = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
    }

    // Create TypeScript source file for parsing
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ext === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
    );

    // Analyze elements
    const elements = analyzeJsxFile(filePath, content, sourceFile, args.element);

    if (elements.length === 0) {
      return createSuccessResponse({
        file: path.relative(projectRoot, filePath),
        a11y_tree: {
          role: 'document',
          name: 'Document',
          focusable: false,
          hidden: false,
          children: [],
        },
        focus_order: [],
        issues: [],
        keyboard_interactions: {
          expected: [],
          implemented: [],
          missing: [],
        },
        aria_patterns: [],
        summary: 'No JSX elements found to analyze',
      });
    }

    // Build accessibility tree
    const a11yTree = buildA11yTree(elements);

    // Build focus order
    const focusOrder = buildFocusOrder(elements);

    // Detect issues
    const issues = detectA11yIssues(elements);

    // Analyze keyboard interactions
    const keyboardInteractions = analyzeKeyboardInteractions(elements);

    // Validate ARIA patterns
    const ariaPatterns = checkPatterns ? validateAriaPatterns(elements) : [];

    // Generate summary
    const summary = generateSummary(elements, issues, focusOrder, ariaPatterns);

    const result: GetAccessibilityTreeResult = {
      file: path.relative(projectRoot, filePath),
      a11y_tree: a11yTree,
      focus_order: focusOrder,
      issues,
      keyboard_interactions: keyboardInteractions,
      aria_patterns: ariaPatterns,
      summary,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
