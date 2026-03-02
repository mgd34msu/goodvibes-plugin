/**
 * Overflow Diagnosis Extension
 *
 * L2 orchestration function that composes L1 core overflow and layout primitives
 * to diagnose CSS/Tailwind layout overflow issues and generate actionable
 * fix recommendations.
 *
 * @module extensions/overflow-diagnosis
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { ok, fail, missingArg, invalidArg, failFromException } from '../shared/response.js';
import type { McpResponse } from '../shared/types.js';
import { getProjectRoot } from '../shared/config.js';
import type {
  AnalyzeLayoutHierarchyResult,
  LayoutNode as CoreLayoutNode,
  LayoutIssue,
} from '../core/layout/types.js';
import {
  findRootJsx,
  parseJsxElement,
  detectIssues,
  generateConstraintNotes,
  generateSummary,
} from '../core/layout/analyzer.js';
import type {
  DiagnoseOverflowArgs,
  DiagnoseOverflowResult,
  Diagnosis,
  FixOption,
} from '../core/overflow/types.js';
import { enrichTreeWithParents } from '../core/overflow/utils.js';
import { findOverflowPatterns } from '../core/overflow/pattern-detector.js';
import { buildConstraintChain } from '../core/overflow/constraint-builder.js';
import {
  generateFixes,
  generateRecommendation,
  collectRelatedElements,
} from '../core/overflow/fix-generator.js';

/**
 * Parse a JSX/TSX file and build a layout hierarchy tree.
 *
 * Replicates the file I/O + AST parsing pipeline from the layout hierarchy
 * handler, using core/ primitives directly to avoid L2→L1 cross-layer calls.
 *
 * @param filePath - Absolute path to the file
 * @param selector - Optional CSS-style selector to focus on
 * @returns Parsed layout hierarchy result or an error
 */
async function buildLayoutHierarchy(
  filePath: string,
  selector?: string
): Promise<AnalyzeLayoutHierarchyResult | { error: string; context?: Record<string, unknown> }> {
  const projectRoot = getProjectRoot();

  // Check file exists
  if (!fs.existsSync(filePath)) {
    return { error: `File not found: ${filePath}`, context: { resolved_path: filePath } };
  }

  // Validate file extension
  const ext = path.extname(filePath).toLowerCase();
  if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
    return {
      error: `Unsupported file type: ${ext}. Supported: .tsx, .jsx, .ts, .js`,
      context: { resolved_path: filePath },
    };
  }

  // Read file content
  const content = fs.readFileSync(filePath, 'utf-8');

  // Determine TypeScript script kind
  const scriptKind =
    ext === '.tsx' ? ts.ScriptKind.TSX
    : ext === '.jsx' ? ts.ScriptKind.JSX
    : ext === '.ts' ? ts.ScriptKind.TS
    : ts.ScriptKind.JS;

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
    return {
      error: 'No JSX element found in file. Ensure the component returns JSX.',
      context: { file: filePath },
    };
  }

  // Parse JSX tree into layout nodes
  const layoutTree = parseJsxElement(rootJsxNode, sourceFile, selector);
  if (!layoutTree) {
    if (selector) {
      return {
        error: `No element matching selector "${selector}" found in component.`,
        context: { file: filePath, selector },
      };
    }
    return { error: 'Failed to parse layout hierarchy from JSX.', context: { file: filePath } };
  }

  // Detect issues, notes, summary
  const potentialIssues: LayoutIssue[] = detectIssues(layoutTree);
  const constraintNotes: string[] = generateConstraintNotes(layoutTree);
  const summary: string = generateSummary(layoutTree, potentialIssues);

  const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
  return {
    file: relativePath,
    root_element: layoutTree.element,
    layout_tree: layoutTree as CoreLayoutNode,
    constraint_notes: constraintNotes,
    potential_issues: potentialIssues,
    summary,
  };
}

/**
 * Diagnose overflow issues in a JSX/TSX file.
 *
 * Orchestrates: validate args → resolve file → build layout hierarchy via core/
 * → enrich tree → find overflow patterns → build constraint chain
 * → generate fixes → ok()
 *
 * @param args - The diagnose_overflow tool arguments
 * @returns MCP tool response with overflow diagnosis
 */
export async function diagnoseOverflow(args: unknown): Promise<McpResponse> {
  const typedArgs = args as Partial<DiagnoseOverflowArgs>;

  if (!typedArgs.file) {
    return missingArg('file');
  }

  const projectRoot = getProjectRoot();

  // Validate file extension up front before resolving
  const ext = path.extname(typedArgs.file).toLowerCase();
  if (typedArgs.file && ext && !['.tsx', '.jsx', '.ts', '.js', ''].includes(ext)) {
    return invalidArg(
      'file',
      `Unsupported file type: ${ext}. Supported: .tsx, .jsx, .ts, .js`
    );
  }

  // Resolve absolute path
  const filePath = path.isAbsolute(typedArgs.file)
    ? typedArgs.file
    : path.resolve(projectRoot, typedArgs.file);

  try {
    // Build layout hierarchy using core/ primitives directly (no handler call)
    const layoutResult = await buildLayoutHierarchy(filePath, typedArgs.element_hint);

    // Pass through layout analysis errors
    if ('error' in layoutResult) {
      return fail(layoutResult.error, layoutResult.context);
    }

    // Enrich the tree with parent references
    const enrichedTree = enrichTreeWithParents(layoutResult.layout_tree);

    // Find overflow patterns
    const patterns = findOverflowPatterns(enrichedTree, typedArgs.element_hint);

    // Build constraint chain if we have an element hint
    const constraintChain = typedArgs.element_hint
      ? buildConstraintChain(enrichedTree, typedArgs.element_hint)
      : [];

    // Generate fixes for all patterns
    const allFixes: FixOption[] = [];
    for (const pattern of patterns) {
      allFixes.push(...generateFixes(pattern));
    }

    // Deduplicate fixes by code_change and element
    const uniqueFixes = allFixes.filter(
      (fix, index, arr) =>
        index ===
        arr.findIndex(
          (f) => f.code_change === fix.code_change && f.element === fix.element
        )
    );

    // Generate recommendation
    const recommendation = generateRecommendation(patterns, uniqueFixes);

    // Determine cause description
    let cause = 'No specific overflow issue detected';
    if (patterns.length > 0) {
      const primaryPattern = patterns[0];
      cause = primaryPattern.description;
      if (typedArgs.problem_description) {
        cause = `${primaryPattern.description}. User reports: ${typedArgs.problem_description}`;
      }
    } else if (typedArgs.problem_description) {
      cause = `User reports: ${typedArgs.problem_description}. No matching pattern found in layout analysis.`;
    }

    // Build diagnosis
    const diagnosis: Diagnosis = {
      overflow_likely: patterns.length > 0,
      overflow_source:
        patterns[0]?.element?.element || patterns[0]?.children?.[0]?.element,
      container: patterns[0]?.parent?.element || patterns[0]?.element?.element,
      cause,
      constraint_chain: constraintChain,
      fix_options: uniqueFixes,
      recommendation,
    };

    const relativePath = path.isAbsolute(typedArgs.file)
      ? path.relative(projectRoot, typedArgs.file).replace(/\\/g, '/')
      : typedArgs.file;

    const result: DiagnoseOverflowResult = {
      file: relativePath,
      diagnosis,
      related_elements: collectRelatedElements(patterns),
    };

    return ok(result);
  } catch (error) {
    return failFromException(error, 'Failed to diagnose overflow');
  }
}

/** @deprecated Use diagnoseOverflow */
export const handleDiagnoseOverflow = diagnoseOverflow;
