/**
 * Types for Analyze Responsive Breakpoints
 *
 * @module handlers/frontend/responsive-breakpoints/types
 */

/**
 * Arguments for the analyze_responsive_breakpoints tool
 */
export interface AnalyzeResponsiveBreakpointsArgs {
  /** File path to analyze */
  file: string;
  /** Specific element to analyze, or analyze whole component */
  element?: string;
  /**
   * Optional custom breakpoint overrides as a map of name to min-width size.
   * E.g., { xs: '480px', '3xl': '1920px' }
   * Overrides matching defaults; new keys are added.
   * Tailwind config is auto-detected when this is omitted.
   */
  breakpoints?: Record<string, string>;
}

/**
 * Classes organized by breakpoint.
 * 'base' is always present; all other keys are dynamic and depend on the
 * resolved breakpoint set.
 */
export interface BreakpointClasses {
  base: string[];
  [breakpoint: string]: string[] | undefined;
}

/**
 * Coverage status for each breakpoint.
 * Keys are dynamic and match the resolved breakpoint set (plus 'base').
 */
export type BreakpointCoverage = Record<string, boolean>;

/**
 * Property transition across breakpoints
 */
export interface PropertyTransition {
  breakpoint: string;
  value: string;
}

/**
 * Property change tracking
 */
export interface PropertyChange {
  property: string;
  base_value: string;
  transitions: PropertyTransition[];
}

/**
 * Analyzed element information
 */
export interface ElementAnalysis {
  element: string;
  classes_by_breakpoint: BreakpointClasses;
  property_changes: PropertyChange[];
}

/**
 * Issue about potential responsive design problems
 */
export interface Issue {
  element: string;
  breakpoint?: string;
  issue: string;
  suggestion: string;
}

/**
 * @deprecated Use Issue instead
 */
export type Warning = Issue;

/**
 * Analysis summary
 */
export interface AnalysisSummary {
  mobile_first: boolean;
  complete_coverage: boolean;
  breakpoints_used: string[];
  notes: string[];
}

/**
 * Complete analysis result
 */
export interface AnalyzeResponsiveBreakpointsResult {
  file: string;
  breakpoints_used: string[];
  breakpoint_coverage: BreakpointCoverage;
  elements: ElementAnalysis[];
  issues: Issue[];
  /** Human-readable text summary of the analysis */
  summary: string;
}

/**
 * Tool response format
 */
export interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Internal className extraction result
 */
export interface ClassNameExtraction {
  element: string;
  className: string;
  line: number;
}
