/**
 * Tailwind Class Parser
 *
 * Parse Tailwind CSS classes into structured property objects.
 * Two variants are provided:
 *   - parseTailwindClasses   — canonical superset parser, returns Partial<ElementNode>
 *   - parseTailwindClassesLayout — layout-aware parser, returns ParsedCssProperties
 *
 * The canonical parser (from sizing-strategy-utils) is the source of truth for
 * sizing strategy analysis. The layout parser extends it with flex-wrap, alignment,
 * gap, and grid alignment properties used by the layout hierarchy analyzer.
 *
 * @module core/tailwind/parser
 */

import type { ElementNode, DisplayType, PositionType, SizingStrategyType } from './types.js';
import { TAILWIND_SPACING, TAILWIND_FRACTIONS, MAX_WIDTH_VALUES } from './constants.js';

// =============================================================================
// ParsedCssProperties (layout-aware result type)
// =============================================================================

/**
 * Parsed CSS properties from Tailwind classes — layout-aware variant
 * that includes additional flex/grid layout properties beyond the
 * core ElementNode sizing fields.
 */
export interface ParsedCssProperties {
  width?: { strategy: 'fixed' | 'percentage' | 'auto' | 'flex' | 'fit-content'; value?: string };
  height?: { strategy: 'fixed' | 'percentage' | 'auto' | 'flex' | 'fit-content'; value?: string };
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
// Width Parsing
// =============================================================================

/**
 * Parse width class and determine strategy
 */
export function parseWidthClass(
  className: string
): { strategy: SizingStrategyType; value: string } | undefined {
  // Fixed widths from spacing scale: w-0, w-px, w-1, w-2, ..., w-96
  const fixedMatch = className.match(/^w-(\d+(?:\.\d+)?|px)$/);
  if (fixedMatch) {
    const value = TAILWIND_SPACING[fixedMatch[1]];
    if (value) {
      return { strategy: 'fixed', value };
    }
  }

  // Fraction widths: w-1/2, w-2/3, etc.
  const fractionMatch = className.match(/^w-(\d+\/\d+)$/);
  if (fractionMatch) {
    const value = TAILWIND_FRACTIONS[fractionMatch[1]];
    if (value) {
      return { strategy: 'percentage', value };
    }
  }

  // Arbitrary values: w-[200px], w-[50%], w-[calc(100%-2rem)]
  const arbitraryMatch = className.match(/^w-\[(.+)\]$/);
  if (arbitraryMatch) {
    const value = arbitraryMatch[1];
    if (value.endsWith('%')) {
      return { strategy: 'percentage', value };
    }
    if (value.includes('vw') || value.includes('dvw') || value.includes('svw') || value.includes('lvw')) {
      return { strategy: 'viewport', value };
    }
    return { strategy: 'fixed', value };
  }

  // Special width classes
  const specialWidths: Record<string, { strategy: SizingStrategyType; value: string }> = {
    'w-auto': { strategy: 'auto', value: 'auto' },
    'w-full': { strategy: 'percentage', value: '100%' },
    'w-screen': { strategy: 'viewport', value: '100vw' },
    'w-svw': { strategy: 'viewport', value: '100svw' },
    'w-lvw': { strategy: 'viewport', value: '100lvw' },
    'w-dvw': { strategy: 'viewport', value: '100dvw' },
    'w-min': { strategy: 'content-based', value: 'min-content' },
    'w-max': { strategy: 'content-based', value: 'max-content' },
    'w-fit': { strategy: 'content-based', value: 'fit-content' },
  };

  return specialWidths[className];
}

// =============================================================================
// Height Parsing
// =============================================================================

/**
 * Parse height class and determine strategy
 */
export function parseHeightClass(
  className: string
): { strategy: SizingStrategyType; value: string } | undefined {
  // Fixed heights from spacing scale
  const fixedMatch = className.match(/^h-(\d+(?:\.\d+)?|px)$/);
  if (fixedMatch) {
    const value = TAILWIND_SPACING[fixedMatch[1]];
    if (value) {
      return { strategy: 'fixed', value };
    }
  }

  // Fraction heights
  const fractionMatch = className.match(/^h-(\d+\/\d+)$/);
  if (fractionMatch) {
    const value = TAILWIND_FRACTIONS[fractionMatch[1]];
    if (value) {
      return { strategy: 'percentage', value };
    }
  }

  // Arbitrary values
  const arbitraryMatch = className.match(/^h-\[(.+)\]$/);
  if (arbitraryMatch) {
    const value = arbitraryMatch[1];
    if (value.endsWith('%')) {
      return { strategy: 'percentage', value };
    }
    if (value.includes('vh') || value.includes('dvh') || value.includes('svh') || value.includes('lvh')) {
      return { strategy: 'viewport', value };
    }
    return { strategy: 'fixed', value };
  }

  // Special height classes
  const specialHeights: Record<string, { strategy: SizingStrategyType; value: string }> = {
    'h-auto': { strategy: 'auto', value: 'auto' },
    'h-full': { strategy: 'percentage', value: '100%' },
    'h-screen': { strategy: 'viewport', value: '100vh' },
    'h-svh': { strategy: 'viewport', value: '100svh' },
    'h-lvh': { strategy: 'viewport', value: '100lvh' },
    'h-dvh': { strategy: 'viewport', value: '100dvh' },
    'h-min': { strategy: 'content-based', value: 'min-content' },
    'h-max': { strategy: 'content-based', value: 'max-content' },
    'h-fit': { strategy: 'content-based', value: 'fit-content' },
  };

  return specialHeights[className];
}

// =============================================================================
// Canonical Tailwind Class Parsing (sizing-strategy superset)
// =============================================================================

/**
 * Parse all Tailwind classes into element properties.
 *
 * This is the canonical superset parser extracted from sizing-strategy-utils.
 * It returns a Partial<ElementNode> suitable for sizing strategy analysis.
 * For layout hierarchy analysis, use parseTailwindClassesLayout instead.
 */
export function parseTailwindClasses(classes: string[]): Partial<ElementNode> {
  const props: Partial<ElementNode> = {
    display: 'block',
    position: 'static',
    overflowX: 'visible',
    overflowY: 'visible',
  };

  const widthClasses: string[] = [];
  const heightClasses: string[] = [];

  for (const className of classes) {
    // Width
    const widthResult = parseWidthClass(className);
    if (widthResult) {
      props.width = { ...widthResult, classes: [...widthClasses, className] };
      widthClasses.push(className);
      continue;
    }

    // Height
    const heightResult = parseHeightClass(className);
    if (heightResult) {
      props.height = { ...heightResult, classes: [...heightClasses, className] };
      heightClasses.push(className);
      continue;
    }

    // Min width
    if (className.startsWith('min-w-')) {
      const value = className.slice(6);
      if (value === 'full') props.minWidth = '100%';
      else if (value === 'min') props.minWidth = 'min-content';
      else if (value === 'max') props.minWidth = 'max-content';
      else if (value === 'fit') props.minWidth = 'fit-content';
      else if (value === '0') props.minWidth = '0px';
      else if (value.startsWith('[') && value.endsWith(']')) {
        props.minWidth = value.slice(1, -1);
      } else if (TAILWIND_SPACING[value]) {
        props.minWidth = TAILWIND_SPACING[value];
      }
      continue;
    }

    // Max width
    if (className.startsWith('max-w-')) {
      const value = className.slice(6);
      if (MAX_WIDTH_VALUES[value]) {
        props.maxWidth = MAX_WIDTH_VALUES[value];
      } else if (value.startsWith('[') && value.endsWith(']')) {
        props.maxWidth = value.slice(1, -1);
      }
      continue;
    }

    // Min height
    if (className.startsWith('min-h-')) {
      const value = className.slice(6);
      if (value === 'full') props.minHeight = '100%';
      else if (value === 'screen') props.minHeight = '100vh';
      else if (value === 'min') props.minHeight = 'min-content';
      else if (value === 'max') props.minHeight = 'max-content';
      else if (value === 'fit') props.minHeight = 'fit-content';
      else if (value === '0') props.minHeight = '0px';
      else if (value.startsWith('[') && value.endsWith(']')) {
        props.minHeight = value.slice(1, -1);
      } else if (TAILWIND_SPACING[value]) {
        props.minHeight = TAILWIND_SPACING[value];
      }
      continue;
    }

    // Max height
    if (className.startsWith('max-h-')) {
      const value = className.slice(6);
      if (value === 'full') props.maxHeight = '100%';
      else if (value === 'screen') props.maxHeight = '100vh';
      else if (value === 'min') props.maxHeight = 'min-content';
      else if (value === 'max') props.maxHeight = 'max-content';
      else if (value === 'fit') props.maxHeight = 'fit-content';
      else if (value === 'none') props.maxHeight = 'none';
      else if (value.startsWith('[') && value.endsWith(']')) {
        props.maxHeight = value.slice(1, -1);
      } else if (TAILWIND_SPACING[value]) {
        props.maxHeight = TAILWIND_SPACING[value];
      }
      continue;
    }

    // Display
    const displayClasses: Record<string, DisplayType> = {
      'block': 'block',
      'inline-block': 'inline-block',
      'inline': 'inline',
      'flex': 'flex',
      'inline-flex': 'inline-flex',
      'grid': 'grid',
      'inline-grid': 'inline-grid',
      'contents': 'contents',
      'hidden': 'none',
    };
    if (displayClasses[className]) {
      props.display = displayClasses[className];
      continue;
    }

    // Flex direction
    const flexDirections: Record<string, string> = {
      'flex-row': 'row',
      'flex-row-reverse': 'row-reverse',
      'flex-col': 'column',
      'flex-col-reverse': 'column-reverse',
    };
    if (flexDirections[className]) {
      props.flexDirection = flexDirections[className];
      continue;
    }

    // Flex shorthand classes
    if (className === 'flex-1') {
      props.flexGrow = 1;
      props.flexShrink = 1;
      props.flexBasis = '0%';
      continue;
    }
    if (className === 'flex-auto') {
      props.flexGrow = 1;
      props.flexShrink = 1;
      props.flexBasis = 'auto';
      continue;
    }
    if (className === 'flex-initial') {
      props.flexGrow = 0;
      props.flexShrink = 1;
      props.flexBasis = 'auto';
      continue;
    }
    if (className === 'flex-none') {
      props.flexGrow = 0;
      props.flexShrink = 0;
      props.flexBasis = 'auto';
      continue;
    }

    // Flex grow
    if (className === 'grow' || className === 'flex-grow') {
      props.flexGrow = 1;
      continue;
    }
    if (className === 'grow-0' || className === 'flex-grow-0') {
      props.flexGrow = 0;
      continue;
    }

    // Flex shrink
    if (className === 'shrink' || className === 'flex-shrink') {
      props.flexShrink = 1;
      continue;
    }
    if (className === 'shrink-0' || className === 'flex-shrink-0') {
      props.flexShrink = 0;
      continue;
    }

    // Flex basis
    const basisMatch = className.match(/^basis-(.+)$/);
    if (basisMatch) {
      const value = basisMatch[1];
      if (value === 'auto') props.flexBasis = 'auto';
      else if (value === 'full') props.flexBasis = '100%';
      else if (TAILWIND_SPACING[value]) props.flexBasis = TAILWIND_SPACING[value];
      else if (TAILWIND_FRACTIONS[value]) props.flexBasis = TAILWIND_FRACTIONS[value];
      else if (value.startsWith('[') && value.endsWith(']')) {
        props.flexBasis = value.slice(1, -1);
      }
      continue;
    }

    // Grid column span
    const colSpanMatch = className.match(/^col-span-(\d+|full)$/);
    if (colSpanMatch) {
      const value = colSpanMatch[1];
      props.gridColumn = value === 'full' ? '1 / -1' : `span ${value} / span ${value}`;
      continue;
    }

    // Grid row span
    const rowSpanMatch = className.match(/^row-span-(\d+|full)$/);
    if (rowSpanMatch) {
      const value = rowSpanMatch[1];
      props.gridRow = value === 'full' ? '1 / -1' : `span ${value} / span ${value}`;
      continue;
    }

    // Grid column start/end
    const colStartMatch = className.match(/^col-start-(\d+|auto)$/);
    if (colStartMatch) {
      const existing = props.gridColumn || '';
      props.gridColumn = `${colStartMatch[1]}${existing ? ` / ${existing.split('/')[1]?.trim() || 'auto'}` : ''}`;
      continue;
    }
    const colEndMatch = className.match(/^col-end-(\d+|auto)$/);
    if (colEndMatch) {
      const existing = props.gridColumn || 'auto';
      props.gridColumn = `${existing.split('/')[0]?.trim() || 'auto'} / ${colEndMatch[1]}`;
      continue;
    }

    // Grid template columns
    const gridColsMatch = className.match(/^grid-cols-(\d+|none|\[.+\])$/);
    if (gridColsMatch) {
      const value = gridColsMatch[1];
      if (value === 'none') {
        props.gridTemplateColumns = 'none';
      } else if (value.startsWith('[') && value.endsWith(']')) {
        props.gridTemplateColumns = value.slice(1, -1);
      } else {
        props.gridTemplateColumns = `repeat(${value}, minmax(0, 1fr))`;
      }
      continue;
    }

    // Grid template rows
    const gridRowsMatch = className.match(/^grid-rows-(\d+|none|\[.+\])$/);
    if (gridRowsMatch) {
      const value = gridRowsMatch[1];
      if (value === 'none') {
        props.gridTemplateRows = 'none';
      } else if (value.startsWith('[') && value.endsWith(']')) {
        props.gridTemplateRows = value.slice(1, -1);
      } else {
        props.gridTemplateRows = `repeat(${value}, minmax(0, 1fr))`;
      }
      continue;
    }

    // Overflow
    const overflows: Record<string, string> = {
      'overflow-auto': 'auto',
      'overflow-hidden': 'hidden',
      'overflow-clip': 'clip',
      'overflow-visible': 'visible',
      'overflow-scroll': 'scroll',
    };
    if (overflows[className]) {
      props.overflowX = overflows[className];
      props.overflowY = overflows[className];
      continue;
    }

    const overflowX: Record<string, string> = {
      'overflow-x-auto': 'auto',
      'overflow-x-hidden': 'hidden',
      'overflow-x-clip': 'clip',
      'overflow-x-visible': 'visible',
      'overflow-x-scroll': 'scroll',
    };
    if (overflowX[className]) {
      props.overflowX = overflowX[className];
      continue;
    }

    const overflowY: Record<string, string> = {
      'overflow-y-auto': 'auto',
      'overflow-y-hidden': 'hidden',
      'overflow-y-clip': 'clip',
      'overflow-y-visible': 'visible',
      'overflow-y-scroll': 'scroll',
    };
    if (overflowY[className]) {
      props.overflowY = overflowY[className];
      continue;
    }

    // Position
    const positions: Record<string, PositionType> = {
      'static': 'static',
      'fixed': 'fixed',
      'absolute': 'absolute',
      'relative': 'relative',
      'sticky': 'sticky',
    };
    if (positions[className]) {
      props.position = positions[className];
      continue;
    }
  }

  return props;
}

// =============================================================================
// Layout-Aware Tailwind Class Parsing
// =============================================================================

/**
 * Parse all Tailwind classes into layout CSS properties.
 *
 * This variant is tailored for layout hierarchy analysis. It returns
 * ParsedCssProperties which includes additional fields (flexWrap, alignItems,
 * justifyContent, gap, alignSelf, justifyItems) beyond what the canonical
 * parseTailwindClasses provides.
 *
 * Used by core/layout/analyzer to build LayoutNode trees.
 */
export function parseTailwindClassesLayout(classes: string[]): ParsedCssProperties {
  const props: ParsedCssProperties = {};

  for (const className of classes) {
    // Width
    const widthResult = parseWidthClass(className);
    if (widthResult) {
      // Map SizingStrategyType to layout SizingStrategy
      const strategy = (
        widthResult.strategy === 'content-based' ? 'fit-content' :
        widthResult.strategy === 'viewport' ? 'fixed' :
        widthResult.strategy === 'flex-controlled' ? 'flex' :
        widthResult.strategy === 'grid-controlled' ? 'auto' :
        widthResult.strategy === 'inherit' ? 'auto' :
        widthResult.strategy
      ) as ParsedCssProperties['width'] extends { strategy: infer S } | undefined ? S : never;
      props.width = { strategy, value: widthResult.value };
      continue;
    }

    // Height
    const heightResult = parseHeightClass(className);
    if (heightResult) {
      const strategy = (
        heightResult.strategy === 'content-based' ? 'fit-content' :
        heightResult.strategy === 'viewport' ? 'fixed' :
        heightResult.strategy === 'flex-controlled' ? 'flex' :
        heightResult.strategy === 'grid-controlled' ? 'auto' :
        heightResult.strategy === 'inherit' ? 'auto' :
        heightResult.strategy
      ) as ParsedCssProperties['height'] extends { strategy: infer S } | undefined ? S : never;
      props.height = { strategy, value: heightResult.value };
      continue;
    }

    // Min/Max width
    if (className.startsWith('min-w-')) {
      const value = className.slice(6);
      if (value === 'full') props.minWidth = '100%';
      else if (value === 'min') props.minWidth = 'min-content';
      else if (value === 'max') props.minWidth = 'max-content';
      else if (value === 'fit') props.minWidth = 'fit-content';
      else if (value === '0') props.minWidth = '0px';
      else if (value.startsWith('[') && value.endsWith(']')) {
        props.minWidth = value.slice(1, -1);
      } else if (TAILWIND_SPACING[value]) {
        props.minWidth = TAILWIND_SPACING[value];
      }
      continue;
    }

    if (className.startsWith('max-w-')) {
      const value = className.slice(6);
      if (MAX_WIDTH_VALUES[value]) {
        props.maxWidth = MAX_WIDTH_VALUES[value];
      } else if (value.startsWith('[') && value.endsWith(']')) {
        props.maxWidth = value.slice(1, -1);
      }
      continue;
    }

    // Min/Max height
    if (className.startsWith('min-h-')) {
      const value = className.slice(6);
      if (value === 'full') props.minHeight = '100%';
      else if (value === 'screen') props.minHeight = '100vh';
      else if (value === 'min') props.minHeight = 'min-content';
      else if (value === 'max') props.minHeight = 'max-content';
      else if (value === 'fit') props.minHeight = 'fit-content';
      else if (value === '0') props.minHeight = '0px';
      else if (value.startsWith('[') && value.endsWith(']')) {
        props.minHeight = value.slice(1, -1);
      } else if (TAILWIND_SPACING[value]) {
        props.minHeight = TAILWIND_SPACING[value];
      }
      continue;
    }

    if (className.startsWith('max-h-')) {
      const value = className.slice(6);
      if (value === 'full') props.maxHeight = '100%';
      else if (value === 'screen') props.maxHeight = '100vh';
      else if (value === 'min') props.maxHeight = 'min-content';
      else if (value === 'max') props.maxHeight = 'max-content';
      else if (value === 'fit') props.maxHeight = 'fit-content';
      else if (value === 'none') props.maxHeight = 'none';
      else if (value.startsWith('[') && value.endsWith(']')) {
        props.maxHeight = value.slice(1, -1);
      } else if (TAILWIND_SPACING[value]) {
        props.maxHeight = TAILWIND_SPACING[value];
      }
      continue;
    }

    // Display
    const displayClasses: Record<string, DisplayType> = {
      'block': 'block',
      'inline-block': 'inline-block',
      'inline': 'inline',
      'flex': 'flex',
      'inline-flex': 'inline-flex',
      'grid': 'grid',
      'inline-grid': 'inline-grid',
      'contents': 'contents',
      'hidden': 'none',
    };
    if (displayClasses[className]) {
      props.display = displayClasses[className];
      continue;
    }

    // Flex direction
    const flexDirections: Record<string, string> = {
      'flex-row': 'row',
      'flex-row-reverse': 'row-reverse',
      'flex-col': 'column',
      'flex-col-reverse': 'column-reverse',
    };
    if (flexDirections[className]) {
      props.flexDirection = flexDirections[className];
      continue;
    }

    // Flex wrap
    const flexWraps: Record<string, string> = {
      'flex-wrap': 'wrap',
      'flex-wrap-reverse': 'wrap-reverse',
      'flex-nowrap': 'nowrap',
    };
    if (flexWraps[className]) {
      props.flexWrap = flexWraps[className];
      continue;
    }

    // Flex grow/shrink
    if (className === 'flex-1') {
      props.flexGrow = 1;
      props.flexShrink = 1;
      props.flexBasis = '0%';
      continue;
    }
    if (className === 'flex-auto') {
      props.flexGrow = 1;
      props.flexShrink = 1;
      props.flexBasis = 'auto';
      continue;
    }
    if (className === 'flex-initial') {
      props.flexGrow = 0;
      props.flexShrink = 1;
      props.flexBasis = 'auto';
      continue;
    }
    if (className === 'flex-none') {
      props.flexGrow = 0;
      props.flexShrink = 0;
      props.flexBasis = 'auto';
      continue;
    }
    if (className === 'grow' || className === 'flex-grow') {
      props.flexGrow = 1;
      continue;
    }
    if (className === 'grow-0' || className === 'flex-grow-0') {
      props.flexGrow = 0;
      continue;
    }
    if (className === 'shrink' || className === 'flex-shrink') {
      props.flexShrink = 1;
      continue;
    }
    if (className === 'shrink-0' || className === 'flex-shrink-0') {
      props.flexShrink = 0;
      continue;
    }

    // Flex basis
    const basisMatch = className.match(/^basis-(.+)$/);
    if (basisMatch) {
      const value = basisMatch[1];
      if (value === 'auto') props.flexBasis = 'auto';
      else if (value === 'full') props.flexBasis = '100%';
      else if (TAILWIND_SPACING[value]) props.flexBasis = TAILWIND_SPACING[value];
      else if (TAILWIND_FRACTIONS[value]) props.flexBasis = TAILWIND_FRACTIONS[value];
      else if (value.startsWith('[') && value.endsWith(']')) {
        props.flexBasis = value.slice(1, -1);
      }
      continue;
    }

    // Align items
    const alignItems: Record<string, string> = {
      'items-start': 'flex-start',
      'items-end': 'flex-end',
      'items-center': 'center',
      'items-baseline': 'baseline',
      'items-stretch': 'stretch',
    };
    if (alignItems[className]) {
      props.alignItems = alignItems[className];
      continue;
    }

    // Align self
    const alignSelf: Record<string, string> = {
      'self-auto': 'auto',
      'self-start': 'flex-start',
      'self-end': 'flex-end',
      'self-center': 'center',
      'self-stretch': 'stretch',
      'self-baseline': 'baseline',
    };
    if (alignSelf[className]) {
      props.alignSelf = alignSelf[className];
      continue;
    }

    // Justify content
    const justifyContent: Record<string, string> = {
      'justify-start': 'flex-start',
      'justify-end': 'flex-end',
      'justify-center': 'center',
      'justify-between': 'space-between',
      'justify-around': 'space-around',
      'justify-evenly': 'space-evenly',
      'justify-stretch': 'stretch',
    };
    if (justifyContent[className]) {
      props.justifyContent = justifyContent[className];
      continue;
    }

    // Justify items
    const justifyItems: Record<string, string> = {
      'justify-items-start': 'start',
      'justify-items-end': 'end',
      'justify-items-center': 'center',
      'justify-items-stretch': 'stretch',
    };
    if (justifyItems[className]) {
      props.justifyItems = justifyItems[className];
      continue;
    }

    // Gap
    const gapMatch = className.match(/^gap-(\d+(?:\.\d+)?|px|\[.+\])$/);
    if (gapMatch) {
      const value = gapMatch[1];
      if (value.startsWith('[') && value.endsWith(']')) {
        props.gap = value.slice(1, -1);
      } else if (TAILWIND_SPACING[value]) {
        props.gap = TAILWIND_SPACING[value];
      }
      continue;
    }

    // Grid template columns
    const gridColsMatch = className.match(/^grid-cols-(\d+|none|\[.+\])$/);
    if (gridColsMatch) {
      const value = gridColsMatch[1];
      if (value === 'none') {
        props.gridTemplateColumns = 'none';
      } else if (value.startsWith('[') && value.endsWith(']')) {
        props.gridTemplateColumns = value.slice(1, -1);
      } else {
        props.gridTemplateColumns = `repeat(${value}, minmax(0, 1fr))`;
      }
      continue;
    }

    // Grid template rows
    const gridRowsMatch = className.match(/^grid-rows-(\d+|none|\[.+\])$/);
    if (gridRowsMatch) {
      const value = gridRowsMatch[1];
      if (value === 'none') {
        props.gridTemplateRows = 'none';
      } else if (value.startsWith('[') && value.endsWith(']')) {
        props.gridTemplateRows = value.slice(1, -1);
      } else {
        props.gridTemplateRows = `repeat(${value}, minmax(0, 1fr))`;
      }
      continue;
    }

    // Grid column span
    const colSpanMatch = className.match(/^col-span-(\d+|full)$/);
    if (colSpanMatch) {
      const value = colSpanMatch[1];
      props.gridColumn = value === 'full' ? '1 / -1' : `span ${value} / span ${value}`;
      continue;
    }

    // Grid row span
    const rowSpanMatch = className.match(/^row-span-(\d+|full)$/);
    if (rowSpanMatch) {
      const value = rowSpanMatch[1];
      props.gridRow = value === 'full' ? '1 / -1' : `span ${value} / span ${value}`;
      continue;
    }

    // Overflow
    const overflows: Record<string, string> = {
      'overflow-auto': 'auto',
      'overflow-hidden': 'hidden',
      'overflow-clip': 'clip',
      'overflow-visible': 'visible',
      'overflow-scroll': 'scroll',
    };
    if (overflows[className]) {
      props.overflow = overflows[className];
      continue;
    }

    const overflowX: Record<string, string> = {
      'overflow-x-auto': 'auto',
      'overflow-x-hidden': 'hidden',
      'overflow-x-clip': 'clip',
      'overflow-x-visible': 'visible',
      'overflow-x-scroll': 'scroll',
    };
    if (overflowX[className]) {
      props.overflowX = overflowX[className];
      continue;
    }

    const overflowY: Record<string, string> = {
      'overflow-y-auto': 'auto',
      'overflow-y-hidden': 'hidden',
      'overflow-y-clip': 'clip',
      'overflow-y-visible': 'visible',
      'overflow-y-scroll': 'scroll',
    };
    if (overflowY[className]) {
      props.overflowY = overflowY[className];
      continue;
    }

    // Position
    const positions: Record<string, PositionType> = {
      'static': 'static',
      'fixed': 'fixed',
      'absolute': 'absolute',
      'relative': 'relative',
      'sticky': 'sticky',
    };
    if (positions[className]) {
      props.position = positions[className];
      continue;
    }
  }

  return props;
}
