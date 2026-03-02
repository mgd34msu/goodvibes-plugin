/**
 * Layout Hierarchy Extension
 *
 * L2 orchestrator that composes L1 core layout primitives into the
 * analyze_layout_hierarchy MCP tool handler. Validates arguments,
 * delegates to core analysis functions, and formats results.
 *
 * @module extensions/layout-hierarchy
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

import { ok, fail, failFromException, missingArg } from '../shared/response.js';
import type { McpResponse } from '../shared/types.js';
import type {
  LayoutNode,
  LayoutIssue,
} from '../core/layout/types.js';
import {
  findRootJsx,
  parseJsxElement,
  detectIssues,
  generateConstraintNotes,
  generateSummary,
} from '../core/layout/analyzer.js';

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

// =============================================================================
// Handler
// =============================================================================

/**
 * Analyze CSS layout hierarchy of a JSX/TSX component file.
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
export async function analyzeLayoutHierarchy(args: unknown): Promise<McpResponse> {
  const typedArgs = args as AnalyzeLayoutHierarchyArgs;
  const projectRoot = process.cwd();

  if (!typedArgs.file) {
    return missingArg('file');
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

    // Determine script kind based on file extension
    const scriptKind =
      ext === '.tsx' ? ts.ScriptKind.TSX
      : ext === '.jsx' ? ts.ScriptKind.JSX
      : ext === '.ts' ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;

    // Parse as TSX/JSX
    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );

    // Find root JSX element
    const rootJsxNode = findRootJsx(sourceFile);
    if (!rootJsxNode) {
      return fail('No JSX element found in file. Ensure the component returns JSX.', {
        file: typedArgs.file,
      });
    }

    // Parse JSX tree into layout nodes
    const layoutTree = parseJsxElement(rootJsxNode, sourceFile, typedArgs.selector);
    if (!layoutTree) {
      if (typedArgs.selector) {
        return fail(
          `No element matching selector "${typedArgs.selector}" found in component.`,
          { file: typedArgs.file, selector: typedArgs.selector }
        );
      }
      /* v8 ignore next 3 -- defensive: parseJsxElement only returns null with selector */
      return fail('Failed to parse layout hierarchy from JSX.', { file: typedArgs.file });
    }

    // Detect issues and generate notes
    const potentialIssues = detectIssues(layoutTree);
    const constraintNotes = generateConstraintNotes(layoutTree);
    const summary = generateSummary(layoutTree, potentialIssues);

    const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    const result: AnalyzeLayoutHierarchyResult = {
      file: relativePath,
      root_element: layoutTree.element,
      layout_tree: layoutTree,
      constraint_notes: constraintNotes,
      potential_issues: potentialIssues,
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

/** @deprecated Use analyzeLayoutHierarchy */
export const handleAnalyzeLayoutHierarchy = analyzeLayoutHierarchy;
