/**
 * Types for Diagnose Overflow
 *
 * @module handlers/frontend/overflow-diagnosis/types
 */

import type { LayoutNode as BaseLayoutNode } from '../analyze-layout-hierarchy.js';

/**
 * Arguments for the diagnose_overflow tool
 */
export interface DiagnoseOverflowArgs {
  /** File path to analyze (relative to project root or absolute) */
  file: string;
  /** Description of the overflow problem (e.g., "content overflowing container") */
  problem_description?: string;
  /** Class name or selector to focus analysis on */
  element_hint?: string;
}

/**
 * Extended layout node with parent reference for traversal
 */
export interface LayoutNode extends BaseLayoutNode {
  parent?: LayoutNode;
}

/**
 * Overflow pattern detection result
 */
export interface OverflowPattern {
  type:
    | 'fixed_parent_auto_children'
    | 'constrained_flex_no_overflow'
    | 'nested_percentage_heights'
    | 'absolute_no_containment'
    | 'flex_no_shrink'
    | 'grid_overflow'
    | 'min_height_zero_missing';
  severity: 'high' | 'medium' | 'low';
  description: string;
  parent?: LayoutNode;
  element?: LayoutNode;
  children?: LayoutNode[];
}

/**
 * Constraint chain entry
 */
export interface ConstraintChainEntry {
  element: string;
  constrains: string;
  receives_from_parent?: string;
}

/**
 * Fix option for overflow issue
 */
export interface FixOption {
  location: 'inside' | 'outside' | 'chain';
  element: string;
  fix: string;
  code_change: string;
  trade_off: string;
}

/**
 * Recommendation for fixing overflow
 */
export interface Recommendation {
  location: 'inside' | 'outside';
  reason: string;
  suggested_fix: string;
  suggested_code: string;
}

/**
 * Diagnosis result
 */
export interface Diagnosis {
  overflow_likely: boolean;
  overflow_source?: string;
  container?: string;
  cause: string;
  constraint_chain: ConstraintChainEntry[];
  fix_options: FixOption[];
  recommendation: Recommendation;
}

/**
 * Complete result structure
 */
export interface DiagnoseOverflowResult {
  file: string;
  diagnosis: Diagnosis;
  related_elements: string[];
}

/**
 * Tool response format
 */
export interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// Re-export the base type for convenience
export type { LayoutNode as BaseLayoutNode } from '../analyze-layout-hierarchy.js';
