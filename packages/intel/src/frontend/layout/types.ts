/**
 * Layout core types — Lane 4.
 * Ported from frontend-engine `core/layout/types.ts`.
 *
 * @module frontend/layout/types
 */

export type { DisplayType, PositionType } from '../tailwind/types.js';
import type { DisplayType, PositionType } from '../tailwind/types.js';

/** Sizing strategy for width/height (layout-aware variant). */
export interface SizingStrategy {
  strategy: 'fixed' | 'percentage' | 'auto' | 'flex' | 'fit-content';
  value?: string;
}

/** Parsed CSS properties — layout hierarchy variant. */
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

export interface Sizing {
  width: SizingStrategy;
  height: SizingStrategy;
}

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

export interface GridProps {
  template_columns?: string;
  template_rows?: string;
  gap?: string;
  area?: string;
  column?: string;
  row?: string;
}

export interface Overflow {
  x: string;
  y: string;
}

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

export interface LayoutIssue {
  element: string;
  issue: string;
  suggestion: string;
}

export interface LayoutContext {
  parentDisplay?: DisplayType;
  parentSizing?: Sizing;
  parentOverflow?: Overflow;
  parentPosition?: PositionType;
  depth: number;
}
