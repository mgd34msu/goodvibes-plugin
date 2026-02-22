/**
 * Analyze Client Boundary Handler
 *
 * Analyzes Next.js App Router "use client" / "use server" boundaries to find
 * misclassified components, unnecessary client components, and optimization opportunities.
 *
 * @module handlers/frontend/analyze-client-boundary
 */

// Re-export everything from the modular implementation
export {
  handleAnalyzeClientBoundary,
  type AnalyzeClientBoundaryArgs,
  type ClientBoundaryResult,
  type ComponentClassification,
  type ClientBoundaryIssue,
  type BoundarySummary,
  type BoundaryEntry,
  type ToolResponse,
} from './client-boundary/index.js';
