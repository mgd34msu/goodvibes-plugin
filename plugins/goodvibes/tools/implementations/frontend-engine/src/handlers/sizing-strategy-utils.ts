/**
 * Sizing Strategy Utilities
 *
 * Constants and utility functions for Tailwind CSS class parsing
 * used by the sizing strategy analyzer.
 *
 * @module handlers/frontend/sizing-strategy-utils
 */

// =============================================================================
// Types
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

/**
 * Max width named values
 */
export const MAX_WIDTH_VALUES: Record<string, string> = {
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
// Tailwind Class Parsing
// =============================================================================

/**
 * Parse all Tailwind classes into element properties
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
// Element Identifier Helper
// =============================================================================

/**
 * Create element identifier string
 */
export function createElementIdentifier(tagName: string, classes: string[], id?: string): string {
  if (id) {
    return `${tagName}#${id}`;
  }
  if (classes.length > 0) {
    const layoutClasses = classes.filter(
      (c) =>
        c.startsWith('flex') ||
        c.startsWith('grid') ||
        c.startsWith('w-') ||
        c.startsWith('h-') ||
        c.startsWith('overflow') ||
        c === 'block' ||
        c === 'inline' ||
        c === 'hidden'
    );
    const identifierClasses = layoutClasses.length > 0 ? layoutClasses.slice(0, 3) : classes.slice(0, 2);
    return `${tagName}.${identifierClasses.join('.')}`;
  }
  return tagName;
}
