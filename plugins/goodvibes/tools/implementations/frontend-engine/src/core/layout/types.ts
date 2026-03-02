/**
 * Layout Core Types
 *
 * Type definitions for layout hierarchy analysis.
 * Extracted from layout-hierarchy-analyzers and layout-hierarchy-utils.
 *
 * @module core/layout/types
 */

// Re-export shared display and position types from core/tailwind
export type { DisplayType, PositionType } from '../tailwind/types.js';

import type { DisplayType, PositionType } from '../tailwind/types.js';

// =============================================================================
// Sizing Strategy
// =============================================================================

/**
 * Sizing strategy for width/height (layout-aware variant)
 *
 * Differs from SizingStrategyType in that it uses 'fit-content' instead
 * of 'content-based', and 'flex' instead of 'flex-controlled', to align
 * with the CSS naming conventions used in layout analysis.
 */
export interface SizingStrategy {
  strategy: 'fixed' | 'percentage' | 'auto' | 'flex' | 'fit-content';
  value?: string;
}

// =============================================================================
// Parsed CSS Properties
// =============================================================================

/**
 * Parsed CSS properties from Tailwind classes — layout hierarchy variant
 */
export interface ParsedCssProperties {
  width?: SizingStrategy;
  height?: SizingStrategy;
  minWidth?: string;
  maxWidth?: string;
  minHeight?: string;
  maxHeight?: string;
  display?: DisplayType;
  flexDirection?: string;
  flexWrap?: string;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: string;
  alignItems?: string;
  alignSelf?: string;
  justifyContent?: string;
  justifyItems?: string;
  gap?: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gridColumn?: string;
  gridRow?: string;
  gridArea?: string;
  overflow?: string;
  overflowX?: string;
  overflowY?: string;
  position?: PositionType;
}

// =============================================================================
// Layout Tree Types
// =============================================================================

/**
 * Sizing properties for an element
 */
export interface Sizing {
  width: SizingStrategy;
  height: SizingStrategy;
}

/**
 * Flex properties for a flex container or item
 */
export interface FlexProps {
  direction: string;
  grow: number;
  shrink: number;
  basis: string;
  wrap?: string;
  align?: string;
  justify?: string;
  gap?: string;
}

/**
 * Grid properties for a grid container or item
 */
export interface GridProps {
  template_columns?: string;
  template_rows?: string;
  gap?: string;
  area?: string;
  column?: string;
  row?: string;
}

/**
 * Overflow properties
 */
export interface Overflow {
  x: string;
  y: string;
}

/**
 * Layout node in the hierarchy tree
 */
export interface LayoutNode {
  element: string;
  tag: string;
  classes: string[];
  sizing: Sizing;
  display: DisplayType;
  flex_props?: FlexProps;
  grid_props?: GridProps;
  overflow: Overflow;
  position: PositionType;
  children: LayoutNode[];
}

// =============================================================================
// Issue & Context Types
// =============================================================================

/**
 * Potential layout issue
 */
export interface LayoutIssue {
  element: string;
  issue: string;
  suggestion: string;
}

/**
 * Parent context for issue detection
 */
export interface LayoutContext {
  parentDisplay?: DisplayType;
  parentSizing?: Sizing;
  parentOverflow?: Overflow;
  parentPosition?: PositionType;
  depth: number;
}
