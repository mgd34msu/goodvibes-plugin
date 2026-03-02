/**
 * Accessibility Tree Extension
 *
 * L2 orchestrator that composes L1 core primitives to build an accessibility
 * tree from React components and detect WCAG issues. Analyzes semantic roles,
 * focus order, keyboard interactions, and ARIA patterns.
 *
 * @module extensions/accessibility-tree
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { getProjectRoot } from '../shared/config.js';
import { ok, fail, failFromException, missingArg } from '../shared/response.js';
import type { McpResponse } from '../shared/response.js';
import type {
  ElementInfo,
  A11yNode,
  FocusOrderEntry,
  A11yIssue,
  KeyboardInteractions,
  AriaPattern,
  GetAccessibilityTreeArgs,
} from '../core/accessibility/types.js';
import { analyzeJsxFile } from '../core/accessibility/scanner.js';
import {
  buildA11yTree,
  buildFocusOrder,
  detectA11yIssues,
  analyzeKeyboardInteractions,
  validateAriaPatterns,
  generateSummary,
} from '../core/accessibility/rules.js';

// =============================================================================
// Result Type
// =============================================================================

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

// =============================================================================
// Handler
// =============================================================================

/**
 * Analyze a component file and return its accessibility tree with WCAG issues.
 *
 * Orchestrates: validate args → resolve path → parse TypeScript → analyzeJsxFile
 * → buildA11yTree + buildFocusOrder + detectA11yIssues + analyzeKeyboardInteractions
 * + validateAriaPatterns + generateSummary → ok(result)
 *
 * @param args - The get_accessibility_tree tool arguments (unknown at call site)
 * @returns McpResponse with JSON-formatted accessibility analysis
 *
 * @example
 * ```typescript
 * const result = await analyzeAccessibilityTree({ file: 'src/components/Button.tsx' });
 * // Returns a11y_tree, focus_order, issues, keyboard_interactions, aria_patterns, summary
 * ```
 */
export async function analyzeAccessibilityTree(args: unknown): Promise<McpResponse> {
  const typedArgs = args as GetAccessibilityTreeArgs;

  if (!typedArgs.file) {
    return missingArg('file');
  }

  const projectRoot = getProjectRoot();
  const checkPatterns = typedArgs.check_patterns ?? true;

  try {
    // Resolve file path
    const filePath = path.isAbsolute(typedArgs.file)
      ? typedArgs.file
      : path.resolve(projectRoot, typedArgs.file);

    // Check file exists
    if (!fs.existsSync(filePath)) {
      return fail(`File not found: ${typedArgs.file}`, {
        provided_path: typedArgs.file,
        resolved_path: filePath,
      });
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
      return fail(
        `Unsupported file type: ${ext}. Supported: .tsx, .jsx, .ts, .js`,
        { file: typedArgs.file }
      );
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // Create TypeScript source file for parsing
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

    // Analyze elements using core scanner
    const elements: ElementInfo[] = analyzeJsxFile(
      filePath,
      content,
      sourceFile,
      typedArgs.element
    );

    const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');

    if (elements.length === 0) {
      return ok({
        file: relativePath,
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

    // Compose core analysis functions
    const a11yTree = buildA11yTree(elements);
    const focusOrder = buildFocusOrder(elements);
    const issues = detectA11yIssues(elements);
    const keyboardInteractions = analyzeKeyboardInteractions(elements);
    const ariaPatterns = checkPatterns ? validateAriaPatterns(elements) : [];
    const summary = generateSummary(elements, issues, focusOrder, ariaPatterns);

    const result: GetAccessibilityTreeResult = {
      file: relativePath,
      a11y_tree: a11yTree,
      focus_order: focusOrder,
      issues,
      keyboard_interactions: keyboardInteractions,
      aria_patterns: ariaPatterns,
      summary,
    };

    return ok(result);
  } catch (error) {
    return failFromException(error, `Failed to analyze accessibility tree: ${typedArgs.file}`);
  }
}

// =============================================================================
// Deprecated Alias
// =============================================================================

/** @deprecated Use analyzeAccessibilityTree */
export const handleGetAccessibilityTree = analyzeAccessibilityTree;
