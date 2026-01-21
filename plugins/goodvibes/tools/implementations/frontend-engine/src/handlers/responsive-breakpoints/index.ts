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
import { BREAKPOINTS, BREAKPOINT_SIZES } from './constants.js';
import { createSuccessResponse, createErrorResponse, makeRelativePath } from './utils.js';
import { parseClassName, parseBreakpointClasses, trackPropertyChanges } from './class-parser.js';
import { detectIssues } from './issue-detector.js';
import { extractClassNames } from './jsx-extractor.js';

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

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte'].includes(ext)) {
      return createErrorResponse(
        `Unsupported file type: ${ext}. Expected .tsx, .jsx, .ts, .js, .vue, or .svelte`,
        { file: args.file }
      );
    }

    // Read and parse file
    const content = fs.readFileSync(filePath, 'utf-8');

    // For Vue/Svelte, extract template section
    let processableContent = content;
    if (ext === '.vue') {
      const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
      if (templateMatch) {
        // Wrap in a JSX-compatible format for parsing
        processableContent = `function Component() { return (<>${templateMatch[1]}</>) }`;
      }
    } else if (ext === '.svelte') {
      // For Svelte, treat the whole file as template (simplified)
      const scriptMatch = content.match(/<script[^>]*>[\s\S]*?<\/script>/gi);
      let templateContent = content;
      if (scriptMatch) {
        for (const script of scriptMatch) {
          templateContent = templateContent.replace(script, '');
        }
      }
      const styleMatch = templateContent.match(/<style[^>]*>[\s\S]*?<\/style>/gi);
      if (styleMatch) {
        for (const style of styleMatch) {
          templateContent = templateContent.replace(style, '');
        }
      }
      processableContent = `function Component() { return (<>${templateContent}</>) }`;
    }

    // Use TSX/JSX script kind to properly parse JSX elements
    const scriptKind = ext === '.tsx' || ext === '.ts' ? ts.ScriptKind.TSX : ts.ScriptKind.JSX;
    const sourceFile = ts.createSourceFile(
      filePath,
      processableContent,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );

    // Extract className attributes
    const classNameExtractions = extractClassNames(sourceFile, args.element);

    if (classNameExtractions.length === 0) {
      return createSuccessResponse({
        file: makeRelativePath(filePath, projectRoot),
        breakpoints_used: [],
        breakpoint_coverage: {
          base: false,
          sm: false,
          md: false,
          lg: false,
          xl: false,
          '2xl': false,
        },
        elements: [],
        issues: [],
        summary: 'No className attributes found in file.',
      });
    }

    // Analyze each element
    const elements: ElementAnalysis[] = [];
    const allBreakpointsUsed = new Set<string>();
    const breakpointCoverage: BreakpointCoverage = {
      base: false,
      sm: false,
      md: false,
      lg: false,
      xl: false,
      '2xl': false,
    };

    for (const extraction of classNameExtractions) {
      const classes = parseClassName(extraction.className);
      const breakpointClasses = parseBreakpointClasses(classes);
      const propertyChanges = trackPropertyChanges(breakpointClasses);

      // Track breakpoint usage
      if (breakpointClasses.base.length > 0) {
        allBreakpointsUsed.add('base');
        breakpointCoverage.base = true;
      }
      for (const bp of BREAKPOINTS) {
        if (breakpointClasses[bp] && breakpointClasses[bp]!.length > 0) {
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
    const issues = detectIssues(elements);

    // Generate summary
    const breakpointsUsed = Array.from(allBreakpointsUsed).sort((a, b) => {
      const order = ['base', ...BREAKPOINTS];
      return order.indexOf(a) - order.indexOf(b);
    });

    // Determine if mobile-first pattern is being used
    let mobileFirst = true;
    let desktopFirstCount = 0;
    for (const el of elements) {
      for (const change of el.property_changes) {
        if (change.base_value === '' && change.transitions.length > 0) {
          const firstBp = change.transitions[0].breakpoint;
          // If first definition is at md or larger, might be desktop-first
          if (['md', 'lg', 'xl', '2xl'].includes(firstBp)) {
            desktopFirstCount++;
          }
        }
      }
    }
    if (desktopFirstCount > elements.length / 2) {
      mobileFirst = false;
    }

    // Check complete coverage
    const completeCoverage =
      breakpointCoverage.base &&
      (breakpointCoverage.sm || breakpointCoverage.md) &&
      (breakpointCoverage.lg || breakpointCoverage.xl);

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
    const usedSizes = breakpointsUsed.map((bp) => `${bp}: ${BREAKPOINT_SIZES[bp]}`);
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
