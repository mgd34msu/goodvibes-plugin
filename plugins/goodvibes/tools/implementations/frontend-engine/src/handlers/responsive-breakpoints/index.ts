/**
 * Analyze Responsive Breakpoints Handler
 *
 * Analyzes responsive Tailwind classes across breakpoints to identify
 * mobile-first patterns, breakpoint coverage, and potential issues
 * in responsive design implementation.
 *
 * @module handlers/frontend/responsive-breakpoints
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// Re-export types
export type {
  AnalyzeResponsiveBreakpointsArgs,
  AnalyzeResponsiveBreakpointsResult,
  BreakpointClasses,
  BreakpointCoverage,
  PropertyTransition,
  PropertyChange,
  ElementAnalysis,
  Issue,
  Warning,
  AnalysisSummary,
  ToolResponse,
} from './types.js';

// Import from modules
import type {
  AnalyzeResponsiveBreakpointsArgs,
  AnalyzeResponsiveBreakpointsResult,
  BreakpointCoverage,
  ElementAnalysis,
  ToolResponse,
} from './types.js';
import { createSuccessResponse, createErrorResponse, makeRelativePath } from './utils.js';
import { parseClassName, parseBreakpointClasses, trackPropertyChanges } from './class-parser.js';
import { detectIssues } from './issue-detector.js';
import { extractClassNames } from './jsx-extractor.js';
import { resolveBreakpoints } from './breakpoint-resolver.js';

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Handles the analyze_responsive_breakpoints MCP tool call.
 *
 * Analyzes responsive Tailwind classes across breakpoints to:
 * - Identify mobile-first patterns
 * - Track breakpoint coverage
 * - Detect property changes across breakpoints
 * - Flag potential responsive design issues
 *
 * Breakpoint resolution priority:
 *   1. Explicit `breakpoints` argument (overrides + adds keys)
 *   2. Auto-detected tailwind.config.js/ts in project root
 *   3. Hardcoded Tailwind defaults (sm, md, lg, xl, 2xl)
 *
 * @param args - The analyze_responsive_breakpoints tool arguments
 * @returns MCP tool response with breakpoint analysis
 */
export async function handleAnalyzeResponsiveBreakpoints(
  args: AnalyzeResponsiveBreakpointsArgs
): Promise<ToolResponse> {
  const projectRoot = process.cwd();

  try {
    // Validate file argument
    if (!args.file) {
      return createErrorResponse('file argument is required');
    }

    // Resolve active breakpoints (explicit > tailwind.config > defaults)
    const { breakpoints, sizes } = resolveBreakpoints(args.breakpoints, projectRoot);

    // Resolve file path
    const filePath = path.isAbsolute(args.file)
      ? args.file
      : path.resolve(projectRoot, args.file);

    if (!fs.existsSync(filePath)) {
      return createErrorResponse(`File not found: ${args.file}`, {
        provided_path: args.file,
        resolved_path: filePath,
      });
    }

    // Check file extension - support React/JSX/TSX files
    const ext = path.extname(filePath).toLowerCase();
    if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
      return createErrorResponse(
        `Unsupported file type: ${ext}. Expected .tsx, .jsx, .ts, or .js`,
        { file: args.file }
      );
    }

    // Read and parse file
    const content = fs.readFileSync(filePath, 'utf-8');

    // Use TSX/JSX script kind to properly parse JSX elements
    const scriptKind = ext === '.tsx' || ext === '.ts' ? ts.ScriptKind.TSX : ts.ScriptKind.JSX;
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );

    // Extract className attributes
    const classNameExtractions = extractClassNames(sourceFile, args.element);

    // Build initial breakpoint coverage record with all resolved breakpoints
    const buildEmptyCoverage = (): BreakpointCoverage => {
      const coverage: BreakpointCoverage = { base: false };
      for (const bp of breakpoints) {
        coverage[bp] = false;
      }
      return coverage;
    };

    if (classNameExtractions.length === 0) {
      return createSuccessResponse({
        file: makeRelativePath(filePath, projectRoot),
        breakpoints_used: [],
        breakpoint_coverage: buildEmptyCoverage(),
        elements: [],
        issues: [],
        summary: 'No className attributes found in file.',
      });
    }

    // Analyze each element
    const elements: ElementAnalysis[] = [];
    const allBreakpointsUsed = new Set<string>();
    const breakpointCoverage: BreakpointCoverage = buildEmptyCoverage();

    for (const extraction of classNameExtractions) {
      const classes = parseClassName(extraction.className);
      const breakpointClasses = parseBreakpointClasses(classes, breakpoints);
      const propertyChanges = trackPropertyChanges(breakpointClasses, breakpoints);

      // Track breakpoint usage
      if (breakpointClasses.base.length > 0) {
        allBreakpointsUsed.add('base');
        breakpointCoverage.base = true;
      }
      for (const bp of breakpoints) {
        if (breakpointClasses[bp] && (breakpointClasses[bp] as string[]).length > 0) {
          allBreakpointsUsed.add(bp);
          breakpointCoverage[bp] = true;
        }
      }

      elements.push({
        element: extraction.element,
        classes_by_breakpoint: breakpointClasses,
        property_changes: propertyChanges,
      });
    }

    // Detect issues
    const issues = detectIssues(elements, breakpoints);

    // Generate summary
    const breakpointsUsed = Array.from(allBreakpointsUsed).sort((a, b) => {
      const order = ['base', ...breakpoints];
      return order.indexOf(a) - order.indexOf(b);
    });

    // Determine if mobile-first pattern is being used
    // Use the second half of breakpoints as "large" indicators
    const midIndex = Math.ceil(breakpoints.length / 2);
    const largeBreakpoints = new Set(breakpoints.slice(midIndex));

    let mobileFirst = true;
    let desktopFirstCount = 0;
    for (const el of elements) {
      for (const change of el.property_changes) {
        if (change.base_value === '' && change.transitions.length > 0) {
          const firstBp = change.transitions[0].breakpoint;
          if (largeBreakpoints.has(firstBp)) {
            desktopFirstCount++;
          }
        }
      }
    }
    if (desktopFirstCount > elements.length / 2) {
      mobileFirst = false;
    }

    // Generate notes
    const notes: string[] = [];
    notes.push(
      `Analyzed ${elements.length} elements with className attributes`
    );

    if (!breakpointCoverage.base && elements.length > 0) {
      notes.push('Warning: No base (mobile) styles defined - consider mobile-first approach');
    }

    if (mobileFirst) {
      notes.push('Using mobile-first responsive pattern');
    } else {
      notes.push('Detected desktop-first patterns - consider refactoring to mobile-first');
    }

    if (issues.length > 0) {
      notes.push(`Found ${issues.length} potential responsive design issues`);
    }

    // Add breakpoints used to notes for searchability
    if (breakpointsUsed.length > 0) {
      notes.push(`Breakpoints used: ${breakpointsUsed.join(', ')}`);
    }

    // Add breakpoint size reference
    const usedSizes = breakpointsUsed.map((bp) => `${bp}: ${sizes[bp]}`);
    if (usedSizes.length > 0) {
      notes.push(`Breakpoint sizes: ${usedSizes.join(', ')}`);
    }

    // Generate text summary for easy searching
    const summaryText = notes.join('. ') + (notes.length > 0 ? '.' : '');

    const result: AnalyzeResponsiveBreakpointsResult = {
      file: makeRelativePath(filePath, projectRoot),
      breakpoints_used: breakpointsUsed,
      breakpoint_coverage: breakpointCoverage,
      elements,
      issues,
      summary: summaryText,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
