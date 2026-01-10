/**
 * Analyze Layout Hierarchy Handler
 *
 * Parses JSX/TSX/Vue/Svelte files and analyzes the CSS layout hierarchy
 * to identify sizing constraints, flex/grid properties, and potential
 * layout issues. Supports Tailwind CSS class parsing.
 *
 * @module handlers/frontend/analyze-layout-hierarchy
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the analyze_layout_hierarchy tool
 */
export interface AnalyzeLayoutHierarchyArgs {
  /** Component file path to analyze */
  file: string;
  /** Optional: Focus on specific element by class or id */
  selector?: string;
}

/**
 * Sizing strategy for width/height
 */
interface SizingStrategy {
  strategy: 'fixed' | 'percentage' | 'auto' | 'flex' | 'fit-content';
  value?: string;
}

/**
 * Sizing properties for an element
 */
interface Sizing {
  width: SizingStrategy;
  height: SizingStrategy;
}

/**
 * Flex properties for a flex container or item
 */
interface FlexProps {
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
interface GridProps {
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
interface Overflow {
  x: string;
  y: string;
}

/**
 * Display type
 */
type DisplayType =
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
type PositionType = 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';

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

/**
 * Potential layout issue
 */
interface LayoutIssue {
  element: string;
  issue: string;
  suggestion: string;
}

/**
 * Result of layout hierarchy analysis
 */
export interface AnalyzeLayoutHierarchyResult {
  file: string;
  root_element: string;
  layout_tree: LayoutNode;
  constraint_notes: string[];
  potential_issues: LayoutIssue[];
  summary: string;
}

/**
 * Tool response format
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Parent context for issue detection
 */
interface LayoutContext {
  parentDisplay?: DisplayType;
  parentSizing?: Sizing;
  parentOverflow?: Overflow;
  parentPosition?: PositionType;
  depth: number;
}

// =============================================================================
// Response Helpers
// =============================================================================

function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function createErrorResponse(message: string, context?: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) }],
    isError: true,
  };
}

// =============================================================================
// Tailwind Class Parsing
// =============================================================================

/**
 * Tailwind spacing scale to CSS values
 */
const TAILWIND_SPACING: Record<string, string> = {
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
const TAILWIND_FRACTIONS: Record<string, string> = {
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
 * Parsed CSS properties from Tailwind classes
 */
interface ParsedCssProperties {
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

/**
 * Parse Tailwind width classes
 */
function parseWidthClass(className: string): SizingStrategy | undefined {
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

/**
 * Parse Tailwind height classes
 */
function parseHeightClass(className: string): SizingStrategy | undefined {
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

/**
 * Parse all Tailwind classes into CSS properties
 */
function parseTailwindClasses(classes: string[]): ParsedCssProperties {
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

// =============================================================================
// AST Analysis Helpers
// =============================================================================

/**
 * Extract className attribute from a JSX element
 */
function extractClassName(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sourceFile: ts.SourceFile): string[] {
  const classes: string[] = [];

  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'className') {
      if (attr.initializer) {
        if (ts.isStringLiteral(attr.initializer)) {
          // className="flex items-center"
          classes.push(...attr.initializer.text.split(/\s+/).filter(Boolean));
        } else if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
          // className={`flex ${condition ? 'visible' : 'hidden'}`}
          // className={cn('flex', condition && 'visible')}
          // Try to extract static class names from template literals
          const expr = attr.initializer.expression;
          if (ts.isTemplateExpression(expr)) {
            // Extract head text
            const headText = expr.head.text;
            classes.push(...headText.split(/\s+/).filter(Boolean));

            // Extract literal spans
            for (const span of expr.templateSpans) {
              if (span.literal.text) {
                classes.push(...span.literal.text.split(/\s+/).filter(Boolean));
              }
            }
          } else if (ts.isNoSubstitutionTemplateLiteral(expr)) {
            classes.push(...expr.text.split(/\s+/).filter(Boolean));
          } else if (ts.isCallExpression(expr)) {
            // Handle cn(), clsx(), classNames() calls
            for (const arg of expr.arguments) {
              if (ts.isStringLiteral(arg)) {
                classes.push(...arg.text.split(/\s+/).filter(Boolean));
              }
            }
          }
        }
      }
    }

    // Also handle 'class' attribute for Vue/Svelte compatibility
    if (ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'class') {
      if (attr.initializer && ts.isStringLiteral(attr.initializer)) {
        classes.push(...attr.initializer.text.split(/\s+/).filter(Boolean));
      }
    }
  }

  return classes;
}

/**
 * Extract id attribute from a JSX element
 */
function extractId(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sourceFile: ts.SourceFile): string | undefined {
  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'id') {
      if (attr.initializer && ts.isStringLiteral(attr.initializer)) {
        return attr.initializer.text;
      }
    }
  }
  return undefined;
}

/**
 * Create element identifier string
 */
function createElementIdentifier(tagName: string, classes: string[], id?: string): string {
  if (id) {
    return `${tagName}#${id}`;
  }
  if (classes.length > 0) {
    // Use first few layout-relevant classes
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

/**
 * Build LayoutNode from parsed CSS properties
 */
function buildLayoutNode(
  tagName: string,
  classes: string[],
  id: string | undefined,
  props: ParsedCssProperties,
  children: LayoutNode[]
): LayoutNode {
  const element = createElementIdentifier(tagName, classes, id);

  // Determine sizing
  const sizing: Sizing = {
    width: props.width || { strategy: 'auto' },
    height: props.height || { strategy: 'auto' },
  };

  // Determine display
  const display: DisplayType = props.display || 'block';

  // Build flex props if flex container
  let flex_props: FlexProps | undefined;
  if (display === 'flex' || display === 'inline-flex') {
    flex_props = {
      direction: props.flexDirection || 'row',
      grow: props.flexGrow ?? 0,
      shrink: props.flexShrink ?? 1,
      basis: props.flexBasis || 'auto',
    };
    if (props.flexWrap) flex_props.wrap = props.flexWrap;
    if (props.alignItems) flex_props.align = props.alignItems;
    if (props.justifyContent) flex_props.justify = props.justifyContent;
    if (props.gap) flex_props.gap = props.gap;
  }

  // Build grid props if grid container
  let grid_props: GridProps | undefined;
  if (display === 'grid' || display === 'inline-grid' || props.gridColumn || props.gridRow || props.gridArea) {
    grid_props = {};
    if (props.gridTemplateColumns) grid_props.template_columns = props.gridTemplateColumns;
    if (props.gridTemplateRows) grid_props.template_rows = props.gridTemplateRows;
    if (props.gap) grid_props.gap = props.gap;
    if (props.gridColumn) grid_props.column = props.gridColumn;
    if (props.gridRow) grid_props.row = props.gridRow;
    if (props.gridArea) grid_props.area = props.gridArea;
  }

  // Determine overflow
  const overflow: Overflow = {
    x: props.overflowX || props.overflow || 'visible',
    y: props.overflowY || props.overflow || 'visible',
  };

  // Determine position
  const position: PositionType = props.position || 'static';

  return {
    element,
    tag: tagName,
    classes,
    sizing,
    display,
    flex_props,
    grid_props,
    overflow,
    position,
    children,
  };
}

/**
 * Check if element matches selector
 */
function matchesSelector(tagName: string, classes: string[], id: string | undefined, selector: string): boolean {
  if (selector.startsWith('#')) {
    return id === selector.slice(1);
  }
  if (selector.startsWith('.')) {
    return classes.includes(selector.slice(1));
  }
  // Match by tag name
  return tagName.toLowerCase() === selector.toLowerCase();
}

/**
 * Recursively parse JSX tree into layout nodes
 */
function parseJsxElement(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  selector?: string,
  foundSelector = false
): LayoutNode | null {
  // Handle JSX element with children
  if (ts.isJsxElement(node)) {
    const openingElement = node.openingElement;
    const tagName = openingElement.tagName.getText(sourceFile);
    const classes = extractClassName(openingElement, sourceFile);
    const id = extractId(openingElement, sourceFile);
    const props = parseTailwindClasses(classes);

    // Check if this element matches the selector
    const elementMatches = selector ? matchesSelector(tagName, classes, id, selector) : false;
    const shouldInclude = !selector || foundSelector || elementMatches;

    // Parse children
    const children: LayoutNode[] = [];
    for (const child of node.children) {
      const childNode = parseJsxElement(
        child,
        sourceFile,
        selector,
        foundSelector || elementMatches
      );
      if (childNode) {
        children.push(childNode);
      }
    }

    // If we have a selector and haven't found it yet, only return matching subtree
    if (selector && !foundSelector && !elementMatches) {
      // Check if any children matched
      if (children.length > 0) {
        return children.length === 1 ? children[0] : buildLayoutNode(tagName, classes, id, props, children);
      }
      return null;
    }

    if (shouldInclude) {
      return buildLayoutNode(tagName, classes, id, props, children);
    }

    return null;
  }

  // Handle self-closing JSX element
  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    const classes = extractClassName(node, sourceFile);
    const id = extractId(node, sourceFile);
    const props = parseTailwindClasses(classes);

    // Check if this element matches the selector
    const elementMatches = selector ? matchesSelector(tagName, classes, id, selector) : true;

    if (!selector || foundSelector || elementMatches) {
      return buildLayoutNode(tagName, classes, id, props, []);
    }

    return null;
  }

  // Handle JSX fragment
  if (ts.isJsxFragment(node)) {
    const children: LayoutNode[] = [];
    for (const child of node.children) {
      const childNode = parseJsxElement(child, sourceFile, selector, foundSelector);
      if (childNode) {
        children.push(childNode);
      }
    }

    // If fragment has only one child, return that child
    if (children.length === 1) {
      return children[0];
    }

    // If fragment has multiple children, wrap in a pseudo-fragment node
    if (children.length > 0) {
      return {
        element: 'Fragment',
        tag: 'Fragment',
        classes: [],
        sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
        display: 'contents',
        overflow: { x: 'visible', y: 'visible' },
        position: 'static',
        children,
      };
    }

    return null;
  }

  // Handle JSX expression (e.g., {children}, {condition && <Element />})
  if (ts.isJsxExpression(node) && node.expression) {
    // Try to find JSX elements within expressions
    let result: LayoutNode | null = null;
    ts.forEachChild(node.expression, (child) => {
      if (!result) {
        result = parseJsxElement(child, sourceFile, selector, foundSelector);
      }
    });
    return result;
  }

  return null;
}

// =============================================================================
// Issue Detection
// =============================================================================

/**
 * Detect potential layout issues in the tree
 */
function detectIssues(node: LayoutNode, context: LayoutContext = { depth: 0 }): LayoutIssue[] {
  const issues: LayoutIssue[] = [];

  // Issue: Fixed height container with auto-height children and no overflow handling
  if (
    node.sizing.height.strategy === 'fixed' &&
    node.overflow.y === 'visible' &&
    node.children.some((c) => c.sizing.height.strategy === 'auto')
  ) {
    issues.push({
      element: node.element,
      issue: 'Fixed height container with auto-height children may overflow without proper handling',
      suggestion: 'Add overflow-y-auto or overflow-hidden to prevent content from overflowing',
    });
  }

  // Issue: Flex item without explicit shrink in a row with fixed-width siblings
  if (
    context.parentDisplay === 'flex' &&
    node.flex_props &&
    node.flex_props.shrink === 1 &&
    node.sizing.width.strategy === 'auto'
  ) {
    const hasFixedWidthSibling = false; // Would need sibling context
    if (!hasFixedWidthSibling) {
      // Only flag if explicit grow is set without basis
      if (node.flex_props.grow > 0 && node.flex_props.basis === 'auto') {
        issues.push({
          element: node.element,
          issue: 'Flex item with grow but no explicit basis may collapse unexpectedly',
          suggestion: 'Consider adding flex-basis (e.g., basis-0 for equal distribution or a specific value)',
        });
      }
    }
  }

  // Issue: Nested flex containers without explicit sizing
  if (
    (node.display === 'flex' || node.display === 'inline-flex') &&
    context.parentDisplay === 'flex' &&
    node.sizing.width.strategy === 'auto' &&
    node.sizing.height.strategy === 'auto' &&
    !node.flex_props?.basis
  ) {
    issues.push({
      element: node.element,
      issue: 'Nested flex container without explicit sizing may have unpredictable dimensions',
      suggestion:
        'Consider adding explicit width/height or flex-basis for more predictable layout behavior',
    });
  }

  // Issue: Grid container without explicit column definition
  if ((node.display === 'grid' || node.display === 'inline-grid') && !node.grid_props?.template_columns) {
    issues.push({
      element: node.element,
      issue: 'Grid container without explicit column template - items will stack in single column',
      suggestion: 'Add grid-cols-N or grid-template-columns to define the grid structure',
    });
  }

  // Issue: Absolute/fixed positioned element without explicit dimensions
  if (
    (node.position === 'absolute' || node.position === 'fixed') &&
    node.sizing.width.strategy === 'auto' &&
    node.sizing.height.strategy === 'auto'
  ) {
    issues.push({
      element: node.element,
      issue: `${node.position} positioned element without explicit dimensions may have zero size`,
      suggestion: 'Add explicit width/height or use inset properties (inset-0, left/right, top/bottom)',
    });
  }

  // Issue: Percentage height without parent height
  if (
    node.sizing.height.strategy === 'percentage' &&
    context.parentSizing?.height.strategy === 'auto'
  ) {
    issues.push({
      element: node.element,
      issue: 'Percentage height on element with auto-height parent will have no effect',
      suggestion: 'Ensure parent has explicit height or use flex/grid for height distribution',
    });
  }

  // Issue: overflow-scroll without fixed dimensions
  if (
    (node.overflow.x === 'scroll' || node.overflow.y === 'scroll' || node.overflow.x === 'auto' || node.overflow.y === 'auto') &&
    node.sizing.width.strategy === 'auto' &&
    node.sizing.height.strategy === 'auto' &&
    node.display !== 'flex' &&
    context.parentDisplay !== 'flex'
  ) {
    issues.push({
      element: node.element,
      issue: 'Overflow scroll/auto without constrained dimensions may not scroll as expected',
      suggestion: 'Add explicit height/width or use flex layout to constrain the scrollable area',
    });
  }

  // Recursively check children
  const childContext: LayoutContext = {
    parentDisplay: node.display,
    parentSizing: node.sizing,
    parentOverflow: node.overflow,
    parentPosition: node.position,
    depth: context.depth + 1,
  };

  for (const child of node.children) {
    issues.push(...detectIssues(child, childContext));
  }

  return issues;
}

/**
 * Generate constraint notes for the layout
 */
function generateConstraintNotes(node: LayoutNode, notes: string[] = [], path = ''): string[] {
  const currentPath = path ? `${path} > ${node.element}` : node.element;

  // Note fixed dimensions
  if (node.sizing.width.strategy === 'fixed' && node.sizing.width.value) {
    notes.push(`${currentPath}: Fixed width of ${node.sizing.width.value}`);
  }
  if (node.sizing.height.strategy === 'fixed' && node.sizing.height.value) {
    notes.push(`${currentPath}: Fixed height of ${node.sizing.height.value}`);
  }

  // Note percentage dimensions
  if (node.sizing.width.strategy === 'percentage' && node.sizing.width.value) {
    notes.push(`${currentPath}: Width constrained to ${node.sizing.width.value} of parent`);
  }
  if (node.sizing.height.strategy === 'percentage' && node.sizing.height.value) {
    notes.push(`${currentPath}: Height constrained to ${node.sizing.height.value} of parent`);
  }

  // Note flex distribution
  if (node.display === 'flex' && node.flex_props) {
    const flexDesc = [];
    if (node.flex_props.direction !== 'row') {
      flexDesc.push(`direction: ${node.flex_props.direction}`);
    }
    if (node.flex_props.gap) {
      flexDesc.push(`gap: ${node.flex_props.gap}`);
    }
    if (node.flex_props.justify && node.flex_props.justify !== 'flex-start') {
      flexDesc.push(`justify: ${node.flex_props.justify}`);
    }
    if (node.flex_props.align && node.flex_props.align !== 'stretch') {
      flexDesc.push(`align: ${node.flex_props.align}`);
    }
    if (flexDesc.length > 0) {
      notes.push(`${currentPath}: Flex container (${flexDesc.join(', ')})`);
    }
  }

  // Note grid structure
  if (node.display === 'grid' && node.grid_props) {
    const gridDesc = [];
    if (node.grid_props.template_columns) {
      gridDesc.push(`columns: ${node.grid_props.template_columns}`);
    }
    if (node.grid_props.template_rows) {
      gridDesc.push(`rows: ${node.grid_props.template_rows}`);
    }
    if (node.grid_props.gap) {
      gridDesc.push(`gap: ${node.grid_props.gap}`);
    }
    if (gridDesc.length > 0) {
      notes.push(`${currentPath}: Grid container (${gridDesc.join(', ')})`);
    }
  }

  // Note overflow handling
  if (node.overflow.x !== 'visible' || node.overflow.y !== 'visible') {
    const overflowDesc = node.overflow.x === node.overflow.y
      ? node.overflow.x
      : `x: ${node.overflow.x}, y: ${node.overflow.y}`;
    notes.push(`${currentPath}: Overflow handling (${overflowDesc})`);
  }

  // Note positioned elements
  if (node.position !== 'static') {
    notes.push(`${currentPath}: Positioned (${node.position})`);
  }

  // Recurse into children
  for (const child of node.children) {
    generateConstraintNotes(child, notes, currentPath);
  }

  return notes;
}

/**
 * Generate summary of the layout
 */
function generateSummary(tree: LayoutNode, issues: LayoutIssue[]): string {
  const parts: string[] = [];

  // Count elements by display type
  const displayCounts: Record<string, number> = {};
  const positionCounts: Record<string, number> = {};

  function countNodes(node: LayoutNode): void {
    displayCounts[node.display] = (displayCounts[node.display] || 0) + 1;
    if (node.position !== 'static') {
      positionCounts[node.position] = (positionCounts[node.position] || 0) + 1;
    }
    node.children.forEach(countNodes);
  }

  countNodes(tree);

  // Build summary
  parts.push(`Root element: ${tree.element}`);

  const layoutTypes = [];
  if (displayCounts.flex || displayCounts['inline-flex']) {
    layoutTypes.push(`${(displayCounts.flex || 0) + (displayCounts['inline-flex'] || 0)} flex containers`);
  }
  if (displayCounts.grid || displayCounts['inline-grid']) {
    layoutTypes.push(`${(displayCounts.grid || 0) + (displayCounts['inline-grid'] || 0)} grid containers`);
  }
  if (layoutTypes.length > 0) {
    parts.push(`Layout structure: ${layoutTypes.join(', ')}`);
  }

  const positionTypes = Object.entries(positionCounts)
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');
  if (positionTypes) {
    parts.push(`Positioned elements: ${positionTypes}`);
  }

  if (issues.length === 0) {
    parts.push('No potential layout issues detected.');
  } else {
    parts.push(`${issues.length} potential issue${issues.length > 1 ? 's' : ''} detected.`);
  }

  return parts.join('. ');
}

// =============================================================================
// File Parsing
// =============================================================================

/**
 * Find the first returned JSX element in a file
 */
function findRootJsx(sourceFile: ts.SourceFile): ts.Node | null {
  let rootJsx: ts.Node | null = null;

  function visit(node: ts.Node): void {
    if (rootJsx) return;

    // Look for return statements with JSX
    if (ts.isReturnStatement(node) && node.expression) {
      if (
        ts.isJsxElement(node.expression) ||
        ts.isJsxSelfClosingElement(node.expression) ||
        ts.isJsxFragment(node.expression)
      ) {
        rootJsx = node.expression;
        return;
      }
      // Handle parenthesized expressions: return (<div>...</div>)
      if (ts.isParenthesizedExpression(node.expression)) {
        const inner = node.expression.expression;
        if (ts.isJsxElement(inner) || ts.isJsxSelfClosingElement(inner) || ts.isJsxFragment(inner)) {
          rootJsx = inner;
          return;
        }
      }
    }

    // Look for arrow function implicit returns
    if (ts.isArrowFunction(node) && node.body) {
      if (
        ts.isJsxElement(node.body) ||
        ts.isJsxSelfClosingElement(node.body) ||
        ts.isJsxFragment(node.body)
      ) {
        rootJsx = node.body;
        return;
      }
      if (ts.isParenthesizedExpression(node.body)) {
        const inner = node.body.expression;
        if (ts.isJsxElement(inner) || ts.isJsxSelfClosingElement(inner) || ts.isJsxFragment(inner)) {
          rootJsx = inner;
          return;
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return rootJsx;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handles the analyze_layout_hierarchy MCP tool call.
 *
 * Parses JSX/TSX files to analyze the CSS layout hierarchy, extracting:
 * - Display types (flex, grid, block)
 * - Sizing strategies (fixed, percentage, auto)
 * - Flex/grid properties
 * - Overflow and position settings
 * - Potential layout issues and suggestions
 *
 * @param args - The analyze_layout_hierarchy tool arguments
 * @returns MCP tool response with layout analysis
 */
export async function handleAnalyzeLayoutHierarchy(
  args: AnalyzeLayoutHierarchyArgs
): Promise<ToolResponse> {
  const projectRoot = process.cwd();

  try {
    // Resolve file path
    const filePath = path.isAbsolute(args.file) ? args.file : path.resolve(projectRoot, args.file);

    // Check file exists
    if (!fs.existsSync(filePath)) {
      return createErrorResponse(`File not found: ${args.file}`, { provided_path: args.file });
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.tsx', '.jsx', '.vue', '.svelte'].includes(ext)) {
      return createErrorResponse(
        `Unsupported file type: ${ext}. Supported: .tsx, .jsx, .vue, .svelte`,
        { provided_path: args.file }
      );
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // For Vue/Svelte, extract template section
    let jsxContent = content;
    if (ext === '.vue') {
      const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
      if (templateMatch) {
        // Convert Vue template to JSX-like format for parsing
        jsxContent = templateMatch[1]
          .replace(/:class=/g, 'className=')
          .replace(/v-bind:class=/g, 'className=')
          .replace(/class=/g, 'className=');
      }
    } else if (ext === '.svelte') {
      // For Svelte, content is mixed, try to parse directly
      jsxContent = content.replace(/class=/g, 'className=');
    }

    // Parse as TSX
    const sourceFile = ts.createSourceFile(
      filePath,
      jsxContent,
      ts.ScriptTarget.Latest,
      true,
      ext === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
    );

    // Find root JSX element
    const rootJsxNode = findRootJsx(sourceFile);

    if (!rootJsxNode) {
      return createErrorResponse('No JSX element found in file. Ensure the component returns JSX.', {
        file: args.file,
      });
    }

    // Parse JSX tree into layout nodes
    const layoutTree = parseJsxElement(rootJsxNode, sourceFile, args.selector);

    if (!layoutTree) {
      if (args.selector) {
        return createErrorResponse(`No element matching selector "${args.selector}" found in component.`, {
          file: args.file,
          selector: args.selector,
        });
      }
      return createErrorResponse('Failed to parse layout hierarchy from JSX.', {
        file: args.file,
      });
    }

    // Detect issues
    const potentialIssues = detectIssues(layoutTree);

    // Generate constraint notes
    const constraintNotes = generateConstraintNotes(layoutTree);

    // Generate summary
    const summary = generateSummary(layoutTree, potentialIssues);

    // Build result
    const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    const result: AnalyzeLayoutHierarchyResult = {
      file: relativePath,
      root_element: layoutTree.element,
      layout_tree: layoutTree,
      constraint_notes: constraintNotes,
      potential_issues: potentialIssues,
      summary,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
