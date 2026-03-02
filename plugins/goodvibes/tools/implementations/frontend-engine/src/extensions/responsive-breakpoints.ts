/**
 * Analyze Responsive Breakpoints Extension
 *
 * L2 orchestrator that composes L1 core primitives to analyze responsive
 * Tailwind classes across breakpoints. Identifies mobile-first patterns,
 * breakpoint coverage, property transitions, and potential issues.
 *
 * @module extensions/frontend/responsive-breakpoints
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { getProjectRoot } from '../shared/config.js';
import { ok, fail, failFromException, missingArg } from '../shared/response.js';
import type { McpResponse } from '../shared/types.js';
import { parseClassName, parseBreakpointClasses, trackPropertyChanges } from '../core/responsive/class-parser.js';
import { detectIssues } from '../core/responsive/issue-detector.js';
import { extractClassNames } from '../core/responsive/jsx-extractor.js';
import { resolveBreakpoints } from '../core/responsive/breakpoint-resolver.js';
import type {
  AnalyzeResponsiveBreakpointsArgs,
  AnalyzeResponsiveBreakpointsResult,
  BreakpointCoverage,
  ElementAnalysis,
} from '../core/responsive/types.js';

// =============================================================================
// Handler
// =============================================================================

/**
 * Analyze responsive Tailwind classes across breakpoints.
 *
 * Orchestrates: validate file -> resolve breakpoints -> parse file
 * -> extract class names -> analyze elements -> detect issues -> ok(result)
 *
 * Breakpoint resolution priority:
 *   1. Explicit `breakpoints` argument (overrides + adds keys)
 *   2. Auto-detected tailwind.config.js/ts in project root
 *   3. Hardcoded Tailwind defaults (sm, md, lg, xl, 2xl)
 *
 * @param args - The analyze_responsive_breakpoints tool arguments (unknown, validated at runtime)
 * @returns MCP tool response with breakpoint analysis
 */
export async function analyzeResponsiveBreakpoints(args: unknown): Promise<McpResponse> {
  const typedArgs = args as AnalyzeResponsiveBreakpointsArgs;
  const projectRoot = getProjectRoot();

  if (!typedArgs.file) {
    return missingArg('file');
  }

  try {
    // Resolve active breakpoints (explicit > tailwind.config > defaults)
    const { breakpoints, sizes } = resolveBreakpoints(typedArgs.breakpoints, projectRoot);

    // Resolve file path
    const filePath = path.isAbsolute(typedArgs.file)
      ? typedArgs.file
      : path.resolve(projectRoot, typedArgs.file);

    if (!fs.existsSync(filePath)) {
      return fail(`File not found: ${typedArgs.file}`, {
        provided_path: typedArgs.file,
        resolved_path: filePath,
      });
    }

    // Validate file extension — support React/JSX/TSX files only
    const ext = path.extname(filePath).toLowerCase();
    if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
      return fail(`Unsupported file type: ${ext}. Expected .tsx, .jsx, .ts, or .js`, {
        file: typedArgs.file,
      });
    }

    // Read and parse file
    const content = fs.readFileSync(filePath, 'utf-8');
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

    // Extract className attributes
    const classNameExtractions = extractClassNames(sourceFile, typedArgs.element);

    // Build initial breakpoint coverage record with all resolved breakpoints
    const buildEmptyCoverage = (): BreakpointCoverage => {
      const coverage: BreakpointCoverage = { base: false };
      for (const bp of breakpoints) {
        coverage[bp] = false;
      }
      return coverage;
    };

    const relativeFile = path.relative(projectRoot, filePath).replace(/\\/g, '/');

    if (classNameExtractions.length === 0) {
      return ok({
        file: relativeFile,
        breakpoints_used: [],
        breakpoint_coverage: buildEmptyCoverage(),
        elements: [],
        issues: [],
        summary: 'No className attributes found in file.',
      } satisfies AnalyzeResponsiveBreakpointsResult);
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
    notes.push(`Analyzed ${elements.length} elements with className attributes`);

    if (!breakpointCoverage.base && elements.length > 0) {
      notes.push(
        'Warning: No base (mobile) styles defined - consider mobile-first approach'
      );
    }

    if (mobileFirst) {
      notes.push('Using mobile-first responsive pattern');
    } else {
      notes.push(
        'Detected desktop-first patterns - consider refactoring to mobile-first'
      );
    }

    if (issues.length > 0) {
      notes.push(`Found ${issues.length} potential responsive design issues`);
    }

    if (breakpointsUsed.length > 0) {
      notes.push(`Breakpoints used: ${breakpointsUsed.join(', ')}`);
    }

    const usedSizes = breakpointsUsed.map((bp) => `${bp}: ${sizes[bp]}`);
    if (usedSizes.length > 0) {
      notes.push(`Breakpoint sizes: ${usedSizes.join(', ')}`);
    }

    const summaryText = notes.join('. ') + (notes.length > 0 ? '.' : '');

    const result: AnalyzeResponsiveBreakpointsResult = {
      file: relativeFile,
      breakpoints_used: breakpointsUsed,
      breakpoint_coverage: breakpointCoverage,
      elements,
      issues,
      summary: summaryText,
    };

    return ok(result);
  } catch (error) {
    return failFromException(error, 'Responsive breakpoints analysis failed');
  }
}

// =============================================================================
// Deprecated alias
// =============================================================================

/** @deprecated Use analyzeResponsiveBreakpoints */
export const handleAnalyzeResponsiveBreakpoints = analyzeResponsiveBreakpoints;
