/**
 * Overflow diagnosis types — Lane 4.
 * Ported from frontend-engine `core/overflow/types.ts` (subset the merged
 * layout_analysis needs).
 *
 * @module frontend/overflow/types
 */

import type { LayoutNode as BaseLayoutNode } from '../layout/types.js';

/** Layout node with a parent reference for upward traversal. */
export interface LayoutNode extends BaseLayoutNode {
  parent?: LayoutNode;
  children: LayoutNode[];
}

/** An overflow-prone pattern detected in the layout tree. */
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

/** A fix option for an overflow pattern. */
export interface FixOption {
  location: 'inside' | 'outside' | 'chain';
  element: string;
  fix: string;
  code_change: string;
  trade_off: string;
}

export type { LayoutNode as BaseLayoutNode } from '../layout/types.js';
