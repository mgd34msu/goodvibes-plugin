/**
 * Analyze Error Boundaries Handler
 *
 * Analyzes React/Next.js projects for error boundary coverage:
 * - Detects class-based and library error boundary components
 * - Analyzes which component subtrees are protected
 * - Flags Next.js App Router route segments missing error.tsx files
 * - Detects boundaries without fallback UI or reset mechanisms
 * - Identifies async components without error boundary protection
 *
 * @module handlers/frontend/error-boundaries
 */

import * as fs from 'fs';
import * as path from 'path';

import { getProjectRoot } from '../../config.js';
import { createSuccessResponse, createErrorResponse } from '../response-utils.js';
import {
  collectFiles,
  scanFileForErrorBoundaries,
  scanNextjsRouteSegments,
  fileHasAsyncOperations,
} from './scanner.js';
import {
  buildForwardImportGraph,
  analyzeCoverage,
  updateSegmentProtection,
} from './coverage-analyzer.js';
import { detectAllIssues } from './issue-detector.js';
import type {
  AnalyzeErrorBoundariesArgs,
  ErrorBoundaryResult,
  ErrorBoundarySummary,
  ToolResponse,
} from './types.js';

// Re-export types for barrel access
export type {
  AnalyzeErrorBoundariesArgs,
  ErrorBoundaryResult,
  ErrorBoundaryInfo,
  ErrorBoundaryIssue,
  ErrorBoundarySummary,
  CoverageResult,
  RouteSegment,
  ToolResponse,
} from './types.js';

// =============================================================================
// Path utilities
// =============================================================================

/**
 * Resolve and validate a project path, ensuring it stays within the project root.
 * Uses the trailing-separator pattern to prevent path traversal attacks.
 */
function resolveProjectPath(
  projectPath: string
): { absPath: string; error?: string } {
  const configRoot = getProjectRoot();
  const absPath = path.isAbsolute(projectPath)
    ? projectPath
    : path.resolve(configRoot, projectPath);

  // Trailing sep pattern (pat_20260221_220001) to prevent /project-root-evil/ bypass
  const normalizedRoot = configRoot.endsWith(path.sep) ? configRoot : configRoot + path.sep;
  if (!absPath.startsWith(normalizedRoot) && absPath !== configRoot) {
    return { absPath: '', error: 'project_path is outside the configured project root' };
  }

  return { absPath };
}

/**
 * Detect whether a given project path uses the Next.js App Router.
 * Checks for the presence of an app/ directory at root or under src/.
 */
function detectAppRouterDir(projectPath: string): string | null {
  const candidates = [
    path.join(projectPath, 'app'),
    path.join(projectPath, 'src', 'app'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return null;
}

// =============================================================================
// Main handler
// =============================================================================

/**
 * Handles the analyze_error_boundaries MCP tool call.
 *
 * Orchestrates scanning, coverage analysis, and issue detection for
 * React/Next.js error boundary coverage.
 *
 * @param args - The analyze_error_boundaries tool arguments
 * @returns MCP tool response with error boundary analysis
 */
export async function handleAnalyzeErrorBoundaries(
  args: AnalyzeErrorBoundariesArgs
): Promise<ToolResponse> {
  if (!args.project_path) {
    return createErrorResponse('project_path argument is required');
  }

  const { absPath: projectPath, error: pathError } = resolveProjectPath(args.project_path);
  if (pathError) {
    return createErrorResponse(pathError, { provided: args.project_path });
  }

  if (!fs.existsSync(projectPath)) {
    return createErrorResponse(
      `project_path not found: ${args.project_path}`,
      { resolved: projectPath }
    );
  }

  const stat = fs.statSync(projectPath);
  if (!stat.isDirectory()) {
    return createErrorResponse(
      `project_path must be a directory: ${args.project_path}`,
      { resolved: projectPath }
    );
  }

  const includeLibraries = args.include_library_boundaries !== false; // default true

  try {
    // =========================================================================
    // STEP 1: Collect all source files
    // =========================================================================
    let allFiles: string[];
    if (args.entry) {
      const entryAbs = path.isAbsolute(args.entry)
        ? args.entry
        : path.resolve(projectPath, args.entry);
      const normalizedRoot = projectPath.endsWith(path.sep) ? projectPath : projectPath + path.sep;
      if (!entryAbs.startsWith(normalizedRoot) && entryAbs !== projectPath) {
        return createErrorResponse('entry path is outside project_path', { provided: args.entry });
      }
      allFiles = fs.existsSync(entryAbs) ? [entryAbs] : [];
    } else {
      allFiles = collectFiles(projectPath);
    }

    if (allFiles.length === 0) {
      return createSuccessResponse({
        project_path: args.project_path,
        boundaries: [],
        route_segments: [],
        coverage: [],
        issues: [],
        summary: {
          total_boundaries: 0,
          total_route_segments: 0,
          protected_segments: 0,
          unprotected_segments: 0,
          total_issues: 0,
          by_severity: {},
          by_type: {},
          is_nextjs_app_router: false,
        },
      } satisfies ErrorBoundaryResult);
    }

    // =========================================================================
    // STEP 2: Scan all files for error boundary definitions
    // =========================================================================
    const boundaries = allFiles.flatMap(
      (f) => scanFileForErrorBoundaries(f, projectPath, includeLibraries)
    );

    // =========================================================================
    // STEP 3: Detect Next.js App Router and scan route segments
    // =========================================================================
    const appDir = detectAppRouterDir(projectPath);
    const isNextjsAppRouter = appDir !== null;

    let routeSegments = isNextjsAppRouter
      ? scanNextjsRouteSegments(appDir!, projectPath)
      : [];

    // Update segments with parent-inherited protection
    if (isNextjsAppRouter) {
      routeSegments = updateSegmentProtection(routeSegments);
    }

    // =========================================================================
    // STEP 4: Build forward import graph and analyze coverage
    // =========================================================================
    const forwardGraph = buildForwardImportGraph(allFiles, projectPath);
    const coverage = analyzeCoverage(boundaries, allFiles, forwardGraph, projectPath);

    // =========================================================================
    // STEP 5: Collect async files for async-without-boundary detection
    // =========================================================================
    const asyncFiles = new Set<string>();
    for (const f of allFiles) {
      if (fileHasAsyncOperations(f)) {
        const rel = path.relative(projectPath, f).replace(/\\/g, '/');
        asyncFiles.add(rel);
      }
    }

    // =========================================================================
    // STEP 6: Detect issues
    // =========================================================================
    const issues = detectAllIssues(
      boundaries,
      routeSegments,
      coverage,
      asyncFiles,
      isNextjsAppRouter
    );

    // =========================================================================
    // STEP 7: Build summary
    // =========================================================================
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const issue of issues) {
      bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
      byType[issue.type] = (byType[issue.type] ?? 0) + 1;
    }

    const protectedSegments = routeSegments.filter(s => s.isProtected).length;
    const unprotectedSegments = routeSegments.filter(s => !s.isProtected).length;

    const summary: ErrorBoundarySummary = {
      total_boundaries: boundaries.length,
      total_route_segments: routeSegments.length,
      protected_segments: protectedSegments,
      unprotected_segments: unprotectedSegments,
      total_issues: issues.length,
      by_severity: bySeverity,
      by_type: byType,
      is_nextjs_app_router: isNextjsAppRouter,
    };

    const result: ErrorBoundaryResult = {
      project_path: args.project_path,
      boundaries,
      route_segments: routeSegments,
      coverage,
      issues,
      summary,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { project_path: args.project_path });
  }
}
