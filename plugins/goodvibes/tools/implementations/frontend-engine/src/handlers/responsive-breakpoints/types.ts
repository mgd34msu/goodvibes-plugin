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
}

/**
 * Classes organized by breakpoint
 */
export interface BreakpointClasses {
  base: string[];
  sm?: string[];
  md?: string[];
  lg?: string[];
  xl?: string[];
  '2xl'?: string[];
}

/**
 * Coverage status for each breakpoint
 */
export interface BreakpointCoverage {
  base: boolean;
  sm: boolean;
  md: boolean;
  lg: boolean;
  xl: boolean;
  '2xl': boolean;
}

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
