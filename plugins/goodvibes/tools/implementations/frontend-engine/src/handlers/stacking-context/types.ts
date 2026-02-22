/**
 * Types for Analyze Stacking Context
 *
 * @module handlers/frontend/stacking-context/types
 */

/**
 * Arguments for the analyze_stacking_context tool
 */
export interface AnalyzeStackingContextArgs {
  /** File path to analyze (relative to project root or absolute) */
  file: string;
  /** Optional: Filter results to specific element/component name */
  element?: string;
  /** Look for portal destinations (default true) */
  include_portals?: boolean;
}

/**
 * Represents a node in the stacking context tree
 */
export interface StackingContext {
  /** Element identifier (tag name or component name with line) */
  element: string;
  /** z-index value or "auto" */
  z_index: number | 'auto';
  /** Whether this element creates a new stacking context */
  creates_context: boolean;
  /** Reason why it creates a stacking context */
  context_reason?: string;
  /** Child elements in the stacking tree */
  children: StackingContext[];
}

/**
 * Information about an element that creates a stacking context
 */
export interface ContextCreator {
  /** Element identifier */
  element: string;
  /** Reason for context creation */
  reason: string;
  /** z-index value */
  z_index: number | 'auto';
  /** CSS classes applied to the element */
  classes: string[];
}

/**
 * Information about a z-index value in the document
 */
export interface ZIndexInfo {
  /** Element identifier */
  element: string;
  /** The z-index value */
  z_index: number;
  /** The parent stacking context */
  context_parent: string;
}

/**
 * A detected potential issue with stacking
 */
export interface StackingIssue {
  /** Issue type/title */
  issue: string;
  /** Elements involved */
  elements: string[];
  /** Detailed explanation */
  explanation: string;
  /** Suggested fix */
  fix: string;
}

/**
 * Portal destination information
 */
export interface PortalInfo {
  /** Component name containing the portal */
  component: string;
  /** Portal destination (DOM element ID or description) */
  destination: string;
  /** z-index if specified */
  z_index?: number;
}

/**
 * Flat stacking context entry (for backward compatibility with tests)
 */
export interface StackingContextEntry {
  /** Element identifier */
  element: string;
  /** Position type */
  position: 'relative' | 'absolute' | 'fixed' | 'sticky' | 'static';
  /** z-index value (number or 'auto') */
  z_index: number | 'auto';
  /** Whether it creates a stacking context */
  creates_context: boolean;
  /** Reason for creating stacking context */
  creates_context_reason?: string;
  /** CSS classes */
  classes: string[];
  /** Line number */
  line: number;
}

/**
 * Result of stacking context analysis
 */
export interface AnalyzeStackingContextResult {
  /** File that was analyzed */
  file: string;
  /** Hierarchical stacking context tree */
  stacking_tree: StackingContext;
  /** Flat list of stacking contexts (for backward compatibility) */
  stacking_contexts: StackingContextEntry[];
  /** List of elements that create stacking contexts */
  context_creators: ContextCreator[];
  /** List of z-index values found */
  z_index_values: ZIndexInfo[];
  /** Potential issues detected */
  potential_issues: StackingIssue[];
  /** Flat issues list (alias for potential_issues for backward compatibility) */
  issues: StackingIssue[];
  /** Human-readable summary */
  summary: string;
  /** Portal destinations if include_portals is true */
  portals?: PortalInfo[];
  /** Optional message */
  message?: string;
}

/**
 * Thresholds for stacking issue detection (all configurable)
 */
export interface StackingThresholds {
  /** Minimum z-index value to be considered "high" (default: 50) */
  highZIndex: number;
  /** Z-index value considered "very high" / extreme (default: 9999) */
  veryHighZIndex: number;
  /** Minimum count of high-z elements before flagging inflation (default: 3) */
  zInflationCount: number;
  /** Z-index value above which children are flagged in isolation check (default: 10) */
  isolationChildZIndex: number;
}

/**
 * Default thresholds for stacking issue detection
 */
export const DEFAULT_STACKING_THRESHOLDS: StackingThresholds = {
  highZIndex: 50,
  veryHighZIndex: 9999,
  zInflationCount: 3,
  isolationChildZIndex: 10,
};

/**
 * Tool response format
 */
export interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Internal element representation during analysis
 */
export interface ElementInfo {
  /** Element identifier */
  element: string;
  /** Line number in source */
  line: number;
  /** CSS classes */
  classes: string[];
  /** z-index value */
  z_index: number | 'auto';
  /** Position type */
  position: 'relative' | 'absolute' | 'fixed' | 'sticky' | 'static';
  /** Whether it creates a stacking context */
  creates_context: boolean;
  /** Reason for context creation */
  context_reason?: string;
  /** Parent element index */
  parent_index: number | null;
  /** Whether this is a component (uppercase) vs HTML element */
  is_component: boolean;
}
