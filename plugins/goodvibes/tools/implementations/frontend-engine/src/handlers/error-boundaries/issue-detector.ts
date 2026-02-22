/**
 * Issue detector for error boundary coverage analysis
 *
 * Detects:
 * - Unprotected route segments (pages/layouts without error boundaries)
 * - Missing error.tsx in Next.js App Router route segments
 * - Error boundaries without proper fallback UI
 * - Overly broad error boundaries wrapping the entire app
 * - Components doing async operations without error boundary protection
 * - Missing reset/retry functionality in error boundaries
 *
 * @module handlers/frontend/error-boundaries/issue-detector
 */

import type {
  ErrorBoundaryInfo,
  ErrorBoundaryIssue,
  RouteSegment,
  CoverageResult,
} from './types.js';

// =============================================================================
// Issue detectors
// =============================================================================

/**
 * Detect error boundaries that lack a fallback UI.
 * A boundary without fallback shows nothing (or crashes) when an error occurs.
 */
export function detectMissingFallback(boundaries: ErrorBoundaryInfo[]): ErrorBoundaryIssue[] {
  const issues: ErrorBoundaryIssue[] = [];

  for (const boundary of boundaries) {
    if (!boundary.hasFallback) {
      issues.push({
        type: 'missing_fallback',
        severity: 'warning',
        file: boundary.file,
        message: `Error boundary "${boundary.name}" has no fallback UI defined. Without a fallback, errors will silently unmount the component tree.`,
        suggestion:
          boundary.kind === 'react_error_boundary'
            ? 'Add a fallback, FallbackComponent, or fallbackRender prop to provide user feedback on errors.'
            : 'Implement a render() method that checks this.state.hasError and returns a fallback UI element.',
      });
    }
  }

  return issues;
}

/**
 * Detect error boundaries that lack reset or retry functionality.
 * This is a lower-severity issue — boundaries should let users recover.
 */
export function detectMissingReset(boundaries: ErrorBoundaryInfo[]): ErrorBoundaryIssue[] {
  const issues: ErrorBoundaryIssue[] = [];

  for (const boundary of boundaries) {
    if (!boundary.hasReset) {
      issues.push({
        type: 'missing_reset',
        severity: 'info',
        file: boundary.file,
        message: `Error boundary "${boundary.name}" has no reset or retry mechanism. Users cannot recover without a full page reload.`,
        suggestion:
          boundary.kind === 'react_error_boundary'
            ? 'Add onReset handler and resetKeys prop, or use the fallbackRender pattern with a reset callback.'
            : 'Add a reset() method that calls this.setState({ hasError: false }) and expose it via the fallback UI.',
      });
    }
  }

  return issues;
}

/**
 * Detect overly broad error boundaries.
 * A single boundary wrapping the entire application (root-level component files)
 * can mask errors too broadly and degrade UX for unrelated sections of the app.
 */
export function detectOverlyBroadBoundary(
  boundaries: ErrorBoundaryInfo[]
): ErrorBoundaryIssue[] {
  const issues: ErrorBoundaryIssue[] = [];

  const rootLevelPatterns = [
    /^(src\/)?app\/layout\.[tj]sx?$/,
    /^(src\/)?main\.[tj]sx?$/,
    /^(src\/)?index\.[tj]sx?$/,
    /^(src\/)?App\.[tj]sx?$/,
    /^(src\/)?(app|pages|src)\/index\.[tj]sx?$/,
  ];

  for (const boundary of boundaries) {
    const isRootLevel = rootLevelPatterns.some(pattern => pattern.test(boundary.file));
    if (isRootLevel) {
      issues.push({
        type: 'overly_broad_boundary',
        severity: 'info',
        file: boundary.file,
        message: `Error boundary "${boundary.name}" is placed at the application root. A single top-level boundary may provide poor error isolation.`,
        suggestion:
          'Consider adding more granular error boundaries at the route, feature, or widget level so that errors in one section do not unmount the entire UI.',
      });
    }
  }

  return issues;
}

/**
 * Detect Next.js App Router route segments without error.tsx files.
 * Every route segment that renders user-visible content should have an error boundary.
 */
export function detectMissingErrorFiles(
  segments: RouteSegment[]
): ErrorBoundaryIssue[] {
  const issues: ErrorBoundaryIssue[] = [];

  for (const segment of segments) {
    if (!segment.isProtected) {
      issues.push({
        type: 'missing_error_file',
        severity: 'warning',
        file: segment.segmentPath,
        message: `Route segment "${segment.segmentPath}" has no error boundary coverage. Errors in this segment will propagate to the nearest parent error boundary or crash the page.`,
        suggestion:
          'Create an error.tsx file in this route segment. It must be a Client Component (\'use client\') and receive { error, reset } props.',
      });
    }
  }

  return issues;
}

/**
 * Detect unprotected route files (page / layout components without error boundary coverage).
 * This detects standard React projects (non-Next.js) where route-level files lack protection.
 */
export function detectUnprotectedRoutes(
  coverage: CoverageResult[]
): ErrorBoundaryIssue[] {
  const issues: ErrorBoundaryIssue[] = [];

  // Detect files that look like route-level components
  const routePatterns = [
    /\/pages?\//,
    /\/routes?\//,
    /\/views?\//,
    /\/screens?\//,
    /Page\.[tj]sx?$/,
    /Route\.[tj]sx?$/,
    /View\.[tj]sx?$/,
    /Screen\.[tj]sx?$/,
  ];

  for (const result of coverage) {
    if (result.isProtected) continue;

    const isRouteLike = routePatterns.some(pattern => pattern.test(result.file));
    if (isRouteLike) {
      issues.push({
        type: 'unprotected_route',
        severity: 'warning',
        file: result.file,
        message: `Route-level component "${result.file}" is not protected by any error boundary.`,
        suggestion:
          'Wrap this route with an error boundary to prevent unhandled render errors from crashing the entire application.',
      });
    }
  }

  return issues;
}

/**
 * Detect async components (data fetching, server components) without error boundary protection.
 * Async operations that throw need error boundaries to prevent unhandled promise rejections
 * from propagating to the root.
 *
 * @param coverage - Coverage results per file
 * @param asyncFiles - Set of relative file paths that contain async operations
 */
export function detectAsyncWithoutBoundary(
  coverage: CoverageResult[],
  asyncFiles: Set<string>
): ErrorBoundaryIssue[] {
  const issues: ErrorBoundaryIssue[] = [];

  for (const result of coverage) {
    if (result.isProtected) continue;
    if (!asyncFiles.has(result.file)) continue;

    issues.push({
      type: 'async_without_boundary',
      severity: 'warning',
      file: result.file,
      message: `Component "${result.file}" performs async operations but is not protected by an error boundary. Failed async operations can crash the component tree.`,
      suggestion:
        'Wrap this component or its parent with an error boundary. For Next.js App Router, adding error.tsx in the route segment also provides coverage.',
    });
  }

  return issues;
}

// =============================================================================
// Orchestrator
// =============================================================================

/**
 * Run all issue detectors and return the combined set of issues.
 *
 * @param boundaries - Detected error boundary components
 * @param segments - Next.js App Router route segments
 * @param coverage - Coverage results per file
 * @param asyncFiles - Set of files with async operations
 * @param isNextjsAppRouter - Whether the project uses Next.js App Router
 * @returns All detected issues
 */
export function detectAllIssues(
  boundaries: ErrorBoundaryInfo[],
  segments: RouteSegment[],
  coverage: CoverageResult[],
  asyncFiles: Set<string>,
  isNextjsAppRouter: boolean
): ErrorBoundaryIssue[] {
  const issues: ErrorBoundaryIssue[] = [];

  // Boundary-level issues
  issues.push(...detectMissingFallback(boundaries));
  issues.push(...detectMissingReset(boundaries));
  issues.push(...detectOverlyBroadBoundary(boundaries));

  if (isNextjsAppRouter) {
    // Next.js-specific: check for missing error.tsx files
    issues.push(...detectMissingErrorFiles(segments));
  } else {
    // Standard React: check for unprotected route components
    issues.push(...detectUnprotectedRoutes(coverage));
  }

  // Async operations without boundaries (applies to both)
  issues.push(...detectAsyncWithoutBoundary(coverage, asyncFiles));

  return issues;
}
