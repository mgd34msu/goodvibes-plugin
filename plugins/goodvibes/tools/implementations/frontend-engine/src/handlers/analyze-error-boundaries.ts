/**
 * Barrel re-export for the analyze_error_boundaries handler.
 *
 * @module handlers/frontend/analyze-error-boundaries
 */
export {
  handleAnalyzeErrorBoundaries,
  type AnalyzeErrorBoundariesArgs,
  type ErrorBoundaryResult,
  type ErrorBoundaryInfo,
  type ErrorBoundaryIssue,
  type ErrorBoundarySummary,
  type CoverageResult,
  type RouteSegment,
} from './error-boundaries/index.js';
