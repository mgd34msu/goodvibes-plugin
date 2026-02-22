/**
 * Analyze Responsive Breakpoints Handler
 *
 * Analyzes responsive Tailwind classes across breakpoints to identify
 * mobile-first patterns, breakpoint coverage, and potential issues
 * in responsive design implementation.
 *
 * @module handlers/frontend/analyze-responsive-breakpoints
 */

// Re-export everything from the modular implementation
export {
  handleAnalyzeResponsiveBreakpoints,
  type AnalyzeResponsiveBreakpointsArgs,
  type AnalyzeResponsiveBreakpointsResult,
  type BreakpointClasses,
  type BreakpointCoverage,
  type PropertyTransition,
  type PropertyChange,
  type ElementAnalysis,
  type Issue,
  type ToolResponse,
} from './responsive-breakpoints/index.js';
