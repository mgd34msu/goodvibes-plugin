/**
 * Diagnose Overflow Handler
 *
 * Analyzes CSS/Tailwind layout patterns to diagnose overflow issues and
 * recommend fixes. Leverages the analyze_layout_hierarchy handler to parse
 * JSX/TSX files, then identifies overflow-prone patterns and generates
 * actionable fix options.
 *
 * @module handlers/frontend/overflow-diagnosis
 */

import * as path from 'path';
import { getProjectRoot } from '../../config.js';
import {
  handleAnalyzeLayoutHierarchy,
  type AnalyzeLayoutHierarchyResult,
} from '../analyze-layout-hierarchy.js';

const PROJECT_ROOT = getProjectRoot();

// Re-export types
export type {
  DiagnoseOverflowArgs,
  DiagnoseOverflowResult,
  OverflowPattern,
  ConstraintChainEntry,
  FixOption,
  Recommendation,
  Diagnosis,
  ToolResponse,
  LayoutNode,
} from './types.js';

// Import from modules
import type { DiagnoseOverflowArgs, DiagnoseOverflowResult, Diagnosis, FixOption, ToolResponse } from './types.js';
import { createSuccessResponse, createErrorResponse, enrichTreeWithParents } from './utils.js';
import { findOverflowPatterns } from './pattern-detector.js';
import { buildConstraintChain } from './constraint-builder.js';
import { generateFixes, generateRecommendation, collectRelatedElements } from './fix-generator.js';

// =============================================================================
// Handler
// =============================================================================

/**
 * Handles the diagnose_overflow MCP tool call.
 *
 * Analyzes CSS/Tailwind layout patterns in JSX/TSX files to diagnose
 * overflow issues and generate actionable fix recommendations.
 *
 * @param args - The diagnose_overflow tool arguments
 * @returns MCP tool response with overflow diagnosis
 */
export async function handleDiagnoseOverflow(
  args: DiagnoseOverflowArgs
): Promise<ToolResponse> {
  // Validate file argument
  if (!args.file) {
    return createErrorResponse('file argument is required');
  }

  // First, use the layout hierarchy analyzer to parse the file
  const layoutResult = await handleAnalyzeLayoutHierarchy({
    file: args.file,
    selector: args.element_hint,
  });

  // Check if layout analysis failed
  const resultText = layoutResult.content[0]?.text;
  if (!resultText) {
    return createErrorResponse('Failed to analyze layout hierarchy');
  }

  let parsedResult: AnalyzeLayoutHierarchyResult;
  try {
    parsedResult = JSON.parse(resultText);
  } catch {
    return createErrorResponse('Failed to parse layout analysis result');
  }

  // Check for error in result
  if ('error' in parsedResult) {
    return layoutResult; // Pass through the error
  }

  // Enrich the tree with parent references
  const enrichedTree = enrichTreeWithParents(parsedResult.layout_tree);

  // Find overflow patterns
  const patterns = findOverflowPatterns(enrichedTree, args.element_hint);

  // Build constraint chain if we have an element hint
  const constraintChain = args.element_hint
    ? buildConstraintChain(enrichedTree, args.element_hint)
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
    if (args.problem_description) {
      cause = `${primaryPattern.description}. User reports: ${args.problem_description}`;
    }
  } else if (args.problem_description) {
    cause = `User reports: ${args.problem_description}. No matching pattern found in layout analysis.`;
  }

  // Build result
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

  const relativePath = path.isAbsolute(args.file)
    ? path.relative(PROJECT_ROOT, args.file).replace(/\\/g, '/')
    : args.file;

  const result: DiagnoseOverflowResult = {
    file: relativePath,
    diagnosis,
    related_elements: collectRelatedElements(patterns),
  };

  return createSuccessResponse(result);
}
