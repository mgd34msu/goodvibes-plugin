/**
 * Tailwind core types, Lane 4.
 * Ported from frontend-engine `core/tailwind/types.ts`.
 *
 * @module frontend/tailwind/types
 */

export type DisplayType =
  | 'block' | 'flex' | 'grid' | 'inline' | 'inline-block'
  | 'inline-flex' | 'inline-grid' | 'none' | 'contents';

export type PositionType = 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';

export type SizingStrategyType =
  | 'fixed' | 'percentage' | 'viewport' | 'content-based'
  | 'flex-controlled' | 'grid-controlled' | 'auto' | 'inherit';

/** Internal element analysis node (used by sizing + element-finder). */
export interface ElementNode {
  tagName: string;
  classes: string[];
  id?: string;
  parent?: ElementNode;
  children: ElementNode[];
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
