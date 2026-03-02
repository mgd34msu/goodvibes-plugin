/**
 * Accessibility Core Types
 *
 * All type definitions for accessibility tree analysis,
 * including element info, ARIA patterns, and analysis results.
 *
 * @module core/accessibility/types
 */

// =============================================================================
// Element Representation
// =============================================================================

/**
 * Internal element representation during analysis
 */
export interface ElementInfo {
  /** Tag name or component name */
  tag: string;
  /** Line number in source */
  line: number;
  /** Element identifier (tag:line) */
  identifier: string;
  /** All attributes as key-value pairs */
  attributes: Map<string, string>;
  /** Text content if present */
  textContent: string;
  /** Whether this is a component (uppercase) vs HTML element */
  isComponent: boolean;
  /** Parent element index */
  parentIndex: number | null;
  /** Child element indices */
  childIndices: number[];
}

/**
 * ARIA pattern definition
 */
export interface AriaPatternDef {
  required: string[];
  optional?: string[];
  children_role?: string;
}

// =============================================================================
// Accessibility Tree Nodes
// =============================================================================

/**
 * Represents a node in the accessibility tree
 */
export interface A11yNode {
  /** ARIA role or inferred semantic role */
  role: string;
  /** Accessible name (from aria-label, text content, etc.) */
  name: string;
  /** Accessible description (from aria-describedby, title, etc.) */
  description?: string;
  /** Whether the element can receive focus */
  focusable: boolean;
  /** Whether the element is hidden from assistive technology */
  hidden: boolean;
  /** Expanded state for expandable elements */
  expanded?: boolean;
  /** Selected state for selectable elements */
  selected?: boolean;
  /** Child nodes in the accessibility tree */
  children: A11yNode[];
}

/**
 * Focus order entry
 */
export interface FocusOrderEntry {
  /** Order index in focus sequence */
  index: number;
  /** Element identifier */
  element: string;
  /** tabindex value if explicitly set */
  tabindex?: number;
}

/**
 * Accessibility issue detected
 */
export interface A11yIssue {
  /** Issue severity */
  severity: 'error' | 'warning' | 'suggestion';
  /** Element where the issue was found */
  element: string;
  /** Description of the issue */
  issue: string;
  /** WCAG criterion if applicable */
  wcag_criterion?: string;
  /** Suggested fix */
  fix: string;
}

/**
 * Keyboard interaction analysis
 */
export interface KeyboardInteractions {
  /** Expected keyboard interactions based on role */
  expected: string[];
  /** Implemented keyboard handlers found */
  implemented: string[];
  /** Missing keyboard interactions */
  missing: string[];
}

/**
 * ARIA pattern validation result
 */
export interface AriaPattern {
  /** Pattern name (e.g., "dialog", "combobox") */
  pattern: string;
  /** Whether the pattern is valid */
  valid: boolean;
  /** Missing required attributes */
  missing_attributes?: string[];
}

// =============================================================================
// Tool Arguments
// =============================================================================

/**
 * Arguments for the get_accessibility_tree tool
 */
export interface GetAccessibilityTreeArgs {
  /** File path to analyze (relative to project root or absolute) */
  file: string;
  /** Optional: Focus on specific element (by tag or component name) */
  element?: string;
  /** Check for common accessibility patterns (default true) */
  check_patterns?: boolean;
}
