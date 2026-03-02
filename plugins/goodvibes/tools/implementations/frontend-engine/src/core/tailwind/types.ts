/**
 * Tailwind Core Types
 *
 * Shared type definitions for Tailwind CSS analysis primitives.
 * Extracted from sizing-strategy-utils for reuse across the frontend-engine.
 *
 * @module core/tailwind/types
 */

// =============================================================================
// Display & Position Types
// =============================================================================

/**
 * Display type
 */
export type DisplayType =
  | 'block'
  | 'flex'
  | 'grid'
  | 'inline'
  | 'inline-block'
  | 'inline-flex'
  | 'inline-grid'
  | 'none'
  | 'contents';

/**
 * Position type
 */
export type PositionType = 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';

// =============================================================================
// Sizing Types
// =============================================================================

/**
 * Sizing strategy type
 */
export type SizingStrategyType =
  | 'fixed'
  | 'percentage'
  | 'viewport'
  | 'content-based'
  | 'flex-controlled'
  | 'grid-controlled'
  | 'auto'
  | 'inherit';

// =============================================================================
// Element Node
// =============================================================================

/**
 * Internal element analysis node
 */
export interface ElementNode {
  tagName: string;
  classes: string[];
  id?: string;
  parent?: ElementNode;
  children: ElementNode[];
  // Parsed properties
  width?: { strategy: SizingStrategyType; value?: string; classes: string[] };
  height?: { strategy: SizingStrategyType; value?: string; classes: string[] };
  minWidth?: string;
  maxWidth?: string;
  minHeight?: string;
  maxHeight?: string;
  display: DisplayType;
  position: PositionType;
  flexDirection?: string;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: string;
  gridColumn?: string;
  gridRow?: string;
  gridArea?: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  overflowX: string;
  overflowY: string;
}
