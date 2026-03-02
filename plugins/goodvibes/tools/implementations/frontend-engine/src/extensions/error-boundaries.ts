/**
 * Analyze Error Boundaries Extension
 *
 * L2 orchestrator that composes L1 core primitives to analyze React/Next.js
 * error boundary coverage. Detects class-based and library boundaries,
 * analyzes which subtrees are protected, and flags missing coverage.
 *
 * @module extensions/frontend/error-boundaries
 */

import * as fs from 'fs';
import * as path from 'path';

import { getProjectRoot } from '../shared/config.js';
import { ok, fail, failFromException, missingArg } from '../shared/response.js';
import type { McpResponse } from '../shared/types.js';
import {
  collectFiles,
  scanFileForErrorBoundaries,
  scanNextjsRouteSegments,
  fileHasAsyncOperations,
} from '../core/error-boundaries/scanner.js';
import {
  buildForwardImportGraph,
  analyzeCoverage,
  updateSegmentProtection,
} from '../core/error-boundaries/coverage-analyzer.js';
import { detectAllIssues } from '../core/error-boundaries/issue-detector.js';
import type {
  AnalyzeErrorBoundariesArgs,
  ErrorBoundaryResult,
  ErrorBoundarySummary,
} from '../core/error-boundaries/types.js';

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

  // Trailing sep pattern to prevent /project-root-evil/ bypass
  const normalizedRoot = configRoot.endsWith(path.sep)
    ? configRoot
    : configRoot + path.sep;
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
// Handler
// =============================================================================

/**
 * Analyze React/Next.js error boundary coverage.
 *
 * Orchestrates: validate path -> collect files -> scan boundaries
 * -> scan route segments -> analyze coverage -> detect issues -> ok(result)
 *
 * @param args - The analyze_error_boundaries tool arguments (unknown, validated at runtime)
 * @returns MCP tool response with error boundary analysis
 */
export async function analyzeErrorBoundaries(args: unknown): Promise<McpResponse> {
  const typedArgs = args as AnalyzeErrorBoundariesArgs;

  if (!typedArgs.project_path) {
    return missingArg('project_path');
  }

  const { absPath: projectPath, error: pathError } = resolveProjectPath(
    typedArgs.project_path
  );
  if (pathError) {
    return fail(pathError, { provided: typedArgs.project_path });
  }

  if (!fs.existsSync(projectPath)) {
    return fail(`project_path not found: ${typedArgs.project_path}`, {
      resolved: projectPath,
    });
  }

  const stat = fs.statSync(projectPath);
  if (!stat.isDirectory()) {
    return fail(`project_path must be a directory: ${typedArgs.project_path}`, {
      resolved: projectPath,
    });
  }

  const includeLibraries = typedArgs.include_library_boundaries !== false; // default true

  try {
    // =========================================================================
    // STEP 1: Collect all source files
    // =========================================================================
    let allFiles: string[];
    if (typedArgs.entry) {
      const entryAbs = path.isAbsolute(typedArgs.entry)
        ? typedArgs.entry
        : path.resolve(projectPath, typedArgs.entry);
      const normalizedRoot = projectPath.endsWith(path.sep)
        ? projectPath
        : projectPath + path.sep;
      if (!entryAbs.startsWith(normalizedRoot) && entryAbs !== projectPath) {
        return fail('entry path is outside project_path', { provided: typedArgs.entry });
      }
      allFiles = fs.existsSync(entryAbs) ? [entryAbs] : [];
    } else {
      allFiles = collectFiles(projectPath);
    }

    if (allFiles.length === 0) {
      return ok({
        project_path: typedArgs.project_path,
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
    const boundaries = allFiles.flatMap((f) =>
      scanFileForErrorBoundaries(f, projectPath, includeLibraries)
    );

    // =========================================================================
    // STEP 3: Detect Next.js App Router and scan route segments
    // =========================================================================
    const appDir = detectAppRouterDir(projectPath);
    const isNextjsAppRouter = appDir !== null;

    let routeSegments = isNextjsAppRouter
      ? scanNextjsRouteSegments(appDir!, projectPath)
      : [];

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

    const protectedSegments = routeSegments.filter((s) => s.isProtected).length;
    const unprotectedSegments = routeSegments.filter((s) => !s.isProtected).length;

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
      project_path: typedArgs.project_path,
      boundaries,
      route_segments: routeSegments,
      coverage,
      issues,
      summary,
    };

    return ok(result);
  } catch (error) {
    return failFromException(error, 'Error boundary analysis failed');
  }
}

// =============================================================================
// Deprecated alias
// =============================================================================

/** @deprecated Use analyzeErrorBoundaries */
export const handleAnalyzeErrorBoundaries = analyzeErrorBoundaries;
