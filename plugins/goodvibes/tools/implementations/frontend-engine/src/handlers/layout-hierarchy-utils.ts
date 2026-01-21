/**
 * Layout Hierarchy Utilities
 *
 * Constants and utility functions for Tailwind CSS class parsing
 * used by the layout hierarchy analyzer.
 *
 * @module handlers/frontend/layout-hierarchy-utils
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Sizing strategy for width/height
 */
export interface SizingStrategy {
  strategy: 'fixed' | 'percentage' | 'auto' | 'flex' | 'fit-content';
  value?: string;
}

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

/**
 * Parsed CSS properties from Tailwind classes
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
// Constants
// =============================================================================

/**
 * Tailwind spacing scale to CSS values
 */
export const TAILWIND_SPACING: Record<string, string> = {
  '0': '0px',
  'px': '1px',
  '0.5': '0.125rem',
  '1': '0.25rem',
  '1.5': '0.375rem',
  '2': '0.5rem',
  '2.5': '0.625rem',
  '3': '0.75rem',
  '3.5': '0.875rem',
  '4': '1rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '7': '1.75rem',
  '8': '2rem',
  '9': '2.25rem',
  '10': '2.5rem',
  '11': '2.75rem',
  '12': '3rem',
  '14': '3.5rem',
  '16': '4rem',
  '20': '5rem',
  '24': '6rem',
  '28': '7rem',
  '32': '8rem',
  '36': '9rem',
  '40': '10rem',
  '44': '11rem',
  '48': '12rem',
  '52': '13rem',
  '56': '14rem',
  '60': '15rem',
  '64': '16rem',
  '72': '18rem',
  '80': '20rem',
  '96': '24rem',
};

/**
 * Tailwind fraction widths
 */
export const TAILWIND_FRACTIONS: Record<string, string> = {
  '1/2': '50%',
  '1/3': '33.333333%',
  '2/3': '66.666667%',
  '1/4': '25%',
  '2/4': '50%',
  '3/4': '75%',
  '1/5': '20%',
  '2/5': '40%',
  '3/5': '60%',
  '4/5': '80%',
  '1/6': '16.666667%',
  '2/6': '33.333333%',
  '3/6': '50%',
  '4/6': '66.666667%',
  '5/6': '83.333333%',
  '1/12': '8.333333%',
  '2/12': '16.666667%',
  '3/12': '25%',
  '4/12': '33.333333%',
  '5/12': '41.666667%',
  '6/12': '50%',
  '7/12': '58.333333%',
  '8/12': '66.666667%',
  '9/12': '75%',
  '10/12': '83.333333%',
  '11/12': '91.666667%',
};

// =============================================================================
// Width Parsing
// =============================================================================

/**
 * Parse Tailwind width classes
 */
export function parseWidthClass(className: string): SizingStrategy | undefined {
  // Fixed widths from spacing scale
  const fixedMatch = className.match(/^w-(\d+(?:\.\d+)?|px)$/);
  if (fixedMatch) {
    const value = TAILWIND_SPACING[fixedMatch[1]];
    if (value) {
      return { strategy: 'fixed', value };
    }
  }

  // Fraction widths
  const fractionMatch = className.match(/^w-(\d+\/\d+)$/);
  if (fractionMatch) {
    const value = TAILWIND_FRACTIONS[fractionMatch[1]];
    if (value) {
      return { strategy: 'percentage', value };
    }
  }

  // Arbitrary values
  const arbitraryMatch = className.match(/^w-\[(.+)\]$/);
  if (arbitraryMatch) {
    const value = arbitraryMatch[1];
    if (value.endsWith('%')) {
      return { strategy: 'percentage', value };
    }
    return { strategy: 'fixed', value };
  }

  // Special width classes
  const specialWidths: Record<string, SizingStrategy> = {
    'w-auto': { strategy: 'auto' },
    'w-full': { strategy: 'percentage', value: '100%' },
    'w-screen': { strategy: 'fixed', value: '100vw' },
    'w-svw': { strategy: 'fixed', value: '100svw' },
    'w-lvw': { strategy: 'fixed', value: '100lvw' },
    'w-dvw': { strategy: 'fixed', value: '100dvw' },
    'w-min': { strategy: 'fit-content', value: 'min-content' },
    'w-max': { strategy: 'fit-content', value: 'max-content' },
    'w-fit': { strategy: 'fit-content', value: 'fit-content' },
  };

  return specialWidths[className];
}

// =============================================================================
// Height Parsing
// =============================================================================

/**
 * Parse Tailwind height classes
 */
export function parseHeightClass(className: string): SizingStrategy | undefined {
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
    return { strategy: 'fixed', value };
  }

  // Special height classes
  const specialHeights: Record<string, SizingStrategy> = {
    'h-auto': { strategy: 'auto' },
    'h-full': { strategy: 'percentage', value: '100%' },
    'h-screen': { strategy: 'fixed', value: '100vh' },
    'h-svh': { strategy: 'fixed', value: '100svh' },
    'h-lvh': { strategy: 'fixed', value: '100lvh' },
    'h-dvh': { strategy: 'fixed', value: '100dvh' },
    'h-min': { strategy: 'fit-content', value: 'min-content' },
    'h-max': { strategy: 'fit-content', value: 'max-content' },
    'h-fit': { strategy: 'fit-content', value: 'fit-content' },
  };

  return specialHeights[className];
}

// =============================================================================
// Tailwind Class Parsing
// =============================================================================

/**
 * Parse all Tailwind classes into CSS properties
 */
export function parseTailwindClasses(classes: string[]): ParsedCssProperties {
  const props: ParsedCssProperties = {};

  for (const className of classes) {
    // Width
    const widthStrategy = parseWidthClass(className);
    if (widthStrategy) {
      props.width = widthStrategy;
      continue;
    }

    // Height
    const heightStrategy = parseHeightClass(className);
    if (heightStrategy) {
      props.height = heightStrategy;
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
      const maxWidthValues: Record<string, string> = {
        'none': 'none',
        'xs': '20rem',
        'sm': '24rem',
        'md': '28rem',
        'lg': '32rem',
        'xl': '36rem',
        '2xl': '42rem',
        '3xl': '48rem',
        '4xl': '56rem',
        '5xl': '64rem',
        '6xl': '72rem',
        '7xl': '80rem',
        'full': '100%',
        'min': 'min-content',
        'max': 'max-content',
        'fit': 'fit-content',
        'prose': '65ch',
        'screen-sm': '640px',
        'screen-md': '768px',
        'screen-lg': '1024px',
        'screen-xl': '1280px',
        'screen-2xl': '1536px',
      };
      if (maxWidthValues[value]) {
        props.maxWidth = maxWidthValues[value];
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
