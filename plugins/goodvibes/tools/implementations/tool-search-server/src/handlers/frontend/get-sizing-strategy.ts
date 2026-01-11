/**
 * Get Sizing Strategy Handler
 *
 * Analyzes how a specific element's size is determined by examining:
 * - Explicit width/height declarations (Tailwind classes or CSS)
 * - Flex behavior (grow, shrink, basis)
 * - Grid placement and sizing
 * - Min/max constraints
 * - Ancestor chain constraints
 * - Position context
 *
 * @module handlers/frontend/get-sizing-strategy
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the get_sizing_strategy tool
 */
export interface GetSizingStrategyArgs {
  /** Component file path to analyze */
  file: string;
  /** Selector: class (.className), id (#id), or element path */
  selector: string;
}

/**
 * Width or height sizing info
 */
interface SizingDimension {
  /** The Tailwind class or CSS value specified */
  specified: string;
  /** How the size is determined */
  strategy: string;
  /** Parent/ancestor constraints affecting this dimension */
  constrained_by?: string[];
}

/**
 * Min/max constraints
 */
interface MinMaxConstraints {
  min_width?: string;
  max_width?: string;
  min_height?: string;
  max_height?: string;
}

/**
 * Flex behavior analysis
 */
interface FlexBehavior {
  grow: number;
  shrink: number;
  basis: string;
  will_shrink: boolean;
  will_grow: boolean;
}

/**
 * Grid behavior analysis
 */
interface GridBehavior {
  column: string;
  row: string;
  area?: string;
}

/**
 * Overflow settings
 */
interface OverflowSettings {
  x: string;
  y: string;
}

/**
 * Ancestor in the constraint chain
 */
interface AncestorNode {
  element: string;
  sizing_impact: string;
}

/**
 * Complete sizing analysis result
 */
export interface GetSizingStrategyResult {
  file: string;
  element: string;
  sizing: {
    width: SizingDimension;
    height: SizingDimension;
    min_max: MinMaxConstraints;
  };
  flex_behavior?: FlexBehavior;
  grid_behavior?: GridBehavior;
  overflow: OverflowSettings;
  position_context: string;
  ancestor_chain: AncestorNode[];
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
 * Internal element analysis node
 */
interface ElementNode {
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

type SizingStrategyType =
  | 'fixed'
  | 'percentage'
  | 'viewport'
  | 'content-based'
  | 'flex-controlled'
  | 'grid-controlled'
  | 'auto'
  | 'inherit';

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
 * Max width named values
 */
const MAX_WIDTH_VALUES: Record<string, string> = {
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

/**
 * Parse width class and determine strategy
 */
function parseWidthClass(
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

/**
 * Parse height class and determine strategy
 */
function parseHeightClass(
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

/**
 * Parse all Tailwind classes into element properties
 */
function parseTailwindClasses(classes: string[]): Partial<ElementNode> {
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
// AST Analysis
// =============================================================================

/**
 * Extract className from JSX element
 */
function extractClassName(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sourceFile: ts.SourceFile
): string[] {
  const classes: string[] = [];

  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr)) {
      const attrName = attr.name.getText(sourceFile);
      if (attrName === 'className' || attrName === 'class') {
        if (attr.initializer) {
          if (ts.isStringLiteral(attr.initializer)) {
            classes.push(...attr.initializer.text.split(/\s+/).filter(Boolean));
          } else if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
            const expr = attr.initializer.expression;
            if (ts.isTemplateExpression(expr)) {
              classes.push(...expr.head.text.split(/\s+/).filter(Boolean));
              for (const span of expr.templateSpans) {
                if (span.literal.text) {
                  classes.push(...span.literal.text.split(/\s+/).filter(Boolean));
                }
              }
            } else if (ts.isNoSubstitutionTemplateLiteral(expr)) {
              classes.push(...expr.text.split(/\s+/).filter(Boolean));
            } else if (ts.isCallExpression(expr)) {
              for (const arg of expr.arguments) {
                if (ts.isStringLiteral(arg)) {
                  classes.push(...arg.text.split(/\s+/).filter(Boolean));
                }
              }
            }
          }
        }
      }
    }
  }

  return classes;
}

/**
 * Extract id attribute from JSX element
 */
function extractId(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sourceFile: ts.SourceFile
): string | undefined {
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
 * Check if element matches selector
 */
function matchesSelector(tagName: string, classes: string[], id: string | undefined, selector: string): boolean {
  if (selector.startsWith('#')) {
    return id === selector.slice(1);
  }
  if (selector.startsWith('.')) {
    return classes.includes(selector.slice(1));
  }
  return tagName.toLowerCase() === selector.toLowerCase();
}

/**
 * Build element node from JSX
 */
function buildElementNode(
  tagName: string,
  classes: string[],
  id: string | undefined,
  parent?: ElementNode
): ElementNode {
  const parsed = parseTailwindClasses(classes);
  return {
    tagName,
    classes,
    id,
    parent,
    children: [],
    ...parsed,
  } as ElementNode;
}

/**
 * Recursively parse JSX tree
 */
function parseJsxTree(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  parent?: ElementNode
): ElementNode | null {
  if (ts.isJsxElement(node)) {
    const openingElement = node.openingElement;
    const tagName = openingElement.tagName.getText(sourceFile);
    const classes = extractClassName(openingElement, sourceFile);
    const id = extractId(openingElement, sourceFile);

    const elementNode = buildElementNode(tagName, classes, id, parent);

    for (const child of node.children) {
      const childNode = parseJsxTree(child, sourceFile, elementNode);
      if (childNode) {
        elementNode.children.push(childNode);
      }
    }

    return elementNode;
  }

  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    const classes = extractClassName(node, sourceFile);
    const id = extractId(node, sourceFile);

    return buildElementNode(tagName, classes, id, parent);
  }

  if (ts.isJsxFragment(node)) {
    const fragmentNode: ElementNode = {
      tagName: 'Fragment',
      classes: [],
      parent,
      children: [],
      display: 'contents',
      position: 'static',
      overflowX: 'visible',
      overflowY: 'visible',
    };

    for (const child of node.children) {
      const childNode = parseJsxTree(child, sourceFile, fragmentNode);
      if (childNode) {
        fragmentNode.children.push(childNode);
      }
    }

    return fragmentNode.children.length > 0 ? fragmentNode : null;
  }

  if (ts.isJsxExpression(node) && node.expression) {
    let result: ElementNode | null = null;
    ts.forEachChild(node.expression, (child) => {
      if (!result) {
        result = parseJsxTree(child, sourceFile, parent);
      }
    });
    return result;
  }

  return null;
}

/**
 * Find element by selector in tree
 */
function findElementBySelector(root: ElementNode, selector: string): ElementNode | null {
  if (matchesSelector(root.tagName, root.classes, root.id, selector)) {
    return root;
  }

  for (const child of root.children) {
    const found = findElementBySelector(child, selector);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * Find the first returned JSX element in a file
 */
function findRootJsx(sourceFile: ts.SourceFile): ts.Node | null {
  let rootJsx: ts.Node | null = null;

  function visit(node: ts.Node): void {
    if (rootJsx) return;

    if (ts.isReturnStatement(node) && node.expression) {
      if (
        ts.isJsxElement(node.expression) ||
        ts.isJsxSelfClosingElement(node.expression) ||
        ts.isJsxFragment(node.expression)
      ) {
        rootJsx = node.expression;
        return;
      }
      if (ts.isParenthesizedExpression(node.expression)) {
        const inner = node.expression.expression;
        if (ts.isJsxElement(inner) || ts.isJsxSelfClosingElement(inner) || ts.isJsxFragment(inner)) {
          rootJsx = inner;
          return;
        }
      }
    }

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
// Sizing Strategy Analysis
// =============================================================================

/**
 * Determine strategy description from type
 */
function getStrategyDescription(strategy: SizingStrategyType, value?: string): string {
  switch (strategy) {
    case 'fixed':
      return `Fixed size (${value || 'explicit value'})`;
    case 'percentage':
      return `Percentage of parent (${value || 'calculated'})`;
    case 'viewport':
      return `Viewport-relative (${value || 'vw/vh'})`;
    case 'content-based':
      return `Content-based (${value || 'intrinsic'})`;
    case 'flex-controlled':
      return 'Controlled by flex properties';
    case 'grid-controlled':
      return 'Controlled by grid placement';
    case 'auto':
      return 'Auto (browser default)';
    case 'inherit':
      return 'Inherited from parent';
    default:
      return 'Unknown';
  }
}

/**
 * Analyze width strategy considering parent context
 */
function analyzeWidthStrategy(element: ElementNode): SizingDimension {
  const constraints: string[] = [];
  let strategy: SizingStrategyType = 'auto';
  let specified = 'auto';

  // Check explicit width
  if (element.width) {
    strategy = element.width.strategy;
    specified = element.width.classes.join(' ') || element.width.value || 'auto';
  }

  // Check if controlled by flex
  if (element.parent?.display === 'flex' || element.parent?.display === 'inline-flex') {
    const parentDir = element.parent.flexDirection || 'row';
    const isMainAxis = parentDir === 'row' || parentDir === 'row-reverse';

    if (isMainAxis) {
      if (element.flexGrow !== undefined && element.flexGrow > 0) {
        if (!element.width || element.width.strategy === 'auto') {
          strategy = 'flex-controlled';
          specified = element.flexBasis || 'flex-grow';
        }
        constraints.push(`flex-grow: ${element.flexGrow}`);
      }
      if (element.flexBasis && element.flexBasis !== 'auto') {
        constraints.push(`flex-basis: ${element.flexBasis}`);
      }
    }
  }

  // Check if controlled by grid
  if (element.parent?.display === 'grid' || element.parent?.display === 'inline-grid') {
    if (element.gridColumn) {
      if (!element.width || element.width.strategy === 'auto') {
        strategy = 'grid-controlled';
        specified = element.gridColumn;
      }
      constraints.push(`grid-column: ${element.gridColumn}`);
    }
  }

  // Walk ancestor chain for constraints
  let current = element.parent;
  while (current) {
    if (current.maxWidth) {
      constraints.push(`max-width: ${current.maxWidth} (from ${createElementIdentifier(current.tagName, current.classes, current.id)})`);
    }
    if (current.width?.strategy === 'fixed' || current.width?.strategy === 'viewport') {
      constraints.push(`parent width: ${current.width.value} (from ${createElementIdentifier(current.tagName, current.classes, current.id)})`);
    }
    if (current.overflowX === 'hidden' || current.overflowX === 'clip') {
      constraints.push(`overflow-x: ${current.overflowX} (from ${createElementIdentifier(current.tagName, current.classes, current.id)})`);
    }
    current = current.parent;
  }

  return {
    specified,
    strategy: getStrategyDescription(strategy, element.width?.value),
    constrained_by: constraints.length > 0 ? constraints : undefined,
  };
}

/**
 * Analyze height strategy considering parent context
 */
function analyzeHeightStrategy(element: ElementNode): SizingDimension {
  const constraints: string[] = [];
  let strategy: SizingStrategyType = 'auto';
  let specified = 'auto';

  // Check explicit height
  if (element.height) {
    strategy = element.height.strategy;
    specified = element.height.classes.join(' ') || element.height.value || 'auto';
  }

  // Check if controlled by flex
  if (element.parent?.display === 'flex' || element.parent?.display === 'inline-flex') {
    const parentDir = element.parent.flexDirection || 'row';
    const isMainAxis = parentDir === 'column' || parentDir === 'column-reverse';

    if (isMainAxis) {
      if (element.flexGrow !== undefined && element.flexGrow > 0) {
        if (!element.height || element.height.strategy === 'auto') {
          strategy = 'flex-controlled';
          specified = element.flexBasis || 'flex-grow';
        }
        constraints.push(`flex-grow: ${element.flexGrow}`);
      }
      if (element.flexBasis && element.flexBasis !== 'auto') {
        constraints.push(`flex-basis: ${element.flexBasis}`);
      }
    }
  }

  // Check if controlled by grid
  if (element.parent?.display === 'grid' || element.parent?.display === 'inline-grid') {
    if (element.gridRow) {
      if (!element.height || element.height.strategy === 'auto') {
        strategy = 'grid-controlled';
        specified = element.gridRow;
      }
      constraints.push(`grid-row: ${element.gridRow}`);
    }
  }

  // Walk ancestor chain for constraints
  let current = element.parent;
  while (current) {
    if (current.maxHeight) {
      constraints.push(`max-height: ${current.maxHeight} (from ${createElementIdentifier(current.tagName, current.classes, current.id)})`);
    }
    if (current.height?.strategy === 'fixed' || current.height?.strategy === 'viewport') {
      constraints.push(`parent height: ${current.height.value} (from ${createElementIdentifier(current.tagName, current.classes, current.id)})`);
    }
    if (current.overflowY === 'hidden' || current.overflowY === 'clip') {
      constraints.push(`overflow-y: ${current.overflowY} (from ${createElementIdentifier(current.tagName, current.classes, current.id)})`);
    }
    // Check for percentage height without parent height (common issue)
    if (
      element.height?.strategy === 'percentage' &&
      (!current.height || current.height.strategy === 'auto') &&
      current.display !== 'flex' &&
      current.display !== 'grid'
    ) {
      constraints.push(`WARNING: percentage height may not work (${createElementIdentifier(current.tagName, current.classes, current.id)} has auto height)`);
    }
    current = current.parent;
  }

  return {
    specified,
    strategy: getStrategyDescription(strategy, element.height?.value),
    constrained_by: constraints.length > 0 ? constraints : undefined,
  };
}

/**
 * Analyze flex behavior
 */
function analyzeFlexBehavior(element: ElementNode): FlexBehavior | undefined {
  if (element.parent?.display !== 'flex' && element.parent?.display !== 'inline-flex') {
    return undefined;
  }

  const grow = element.flexGrow ?? 0;
  const shrink = element.flexShrink ?? 1;
  const basis = element.flexBasis || 'auto';

  return {
    grow,
    shrink,
    basis,
    will_shrink: shrink > 0,
    will_grow: grow > 0,
  };
}

/**
 * Analyze grid behavior
 */
function analyzeGridBehavior(element: ElementNode): GridBehavior | undefined {
  if (element.parent?.display !== 'grid' && element.parent?.display !== 'inline-grid') {
    return undefined;
  }

  return {
    column: element.gridColumn || 'auto',
    row: element.gridRow || 'auto',
    area: element.gridArea,
  };
}

/**
 * Determine position context
 */
function getPositionContext(element: ElementNode): string {
  if (element.position === 'fixed') {
    return 'Fixed to viewport';
  }

  if (element.position === 'absolute') {
    let current = element.parent;
    while (current) {
      if (current.position !== 'static') {
        return `Absolute, relative to ${createElementIdentifier(current.tagName, current.classes, current.id)} (${current.position})`;
      }
      current = current.parent;
    }
    return 'Absolute, relative to initial containing block (no positioned ancestor)';
  }

  if (element.position === 'sticky') {
    let current = element.parent;
    while (current) {
      if (current.overflowX !== 'visible' || current.overflowY !== 'visible') {
        return `Sticky within ${createElementIdentifier(current.tagName, current.classes, current.id)} (overflow container)`;
      }
      current = current.parent;
    }
    return 'Sticky within viewport';
  }

  return element.position === 'relative' ? 'Relative (in normal flow, offset relative to self)' : 'Static (normal document flow)';
}

/**
 * Build ancestor chain with sizing impact
 */
function buildAncestorChain(element: ElementNode): AncestorNode[] {
  const chain: AncestorNode[] = [];
  let current = element.parent;

  while (current) {
    const impacts: string[] = [];

    // Display type impact
    if (current.display === 'flex' || current.display === 'inline-flex') {
      const dir = current.flexDirection || 'row';
      impacts.push(`flex container (${dir})`);
    } else if (current.display === 'grid' || current.display === 'inline-grid') {
      const cols = current.gridTemplateColumns || 'auto';
      impacts.push(`grid container (${cols})`);
    }

    // Size constraints
    if (current.width?.strategy === 'fixed' || current.width?.strategy === 'percentage') {
      impacts.push(`width: ${current.width.value}`);
    }
    if (current.height?.strategy === 'fixed' || current.height?.strategy === 'percentage') {
      impacts.push(`height: ${current.height.value}`);
    }
    if (current.maxWidth) {
      impacts.push(`max-width: ${current.maxWidth}`);
    }
    if (current.maxHeight) {
      impacts.push(`max-height: ${current.maxHeight}`);
    }

    // Overflow
    if (current.overflowX !== 'visible' || current.overflowY !== 'visible') {
      const overflow =
        current.overflowX === current.overflowY
          ? current.overflowX
          : `x: ${current.overflowX}, y: ${current.overflowY}`;
      impacts.push(`overflow: ${overflow}`);
    }

    // Position
    if (current.position !== 'static') {
      impacts.push(`position: ${current.position}`);
    }

    if (impacts.length > 0) {
      chain.push({
        element: createElementIdentifier(current.tagName, current.classes, current.id),
        sizing_impact: impacts.join('; '),
      });
    }

    current = current.parent;
  }

  return chain;
}

/**
 * Generate human-readable summary
 */
function generateSummary(
  element: ElementNode,
  widthAnalysis: SizingDimension,
  heightAnalysis: SizingDimension,
  flexBehavior?: FlexBehavior,
  gridBehavior?: GridBehavior
): string {
  const parts: string[] = [];

  // Width summary
  if (widthAnalysis.strategy.includes('Fixed')) {
    parts.push(`Width is fixed at ${element.width?.value || 'explicit value'}.`);
  } else if (widthAnalysis.strategy.includes('Percentage')) {
    parts.push(`Width is ${element.width?.value || '100%'} of parent.`);
  } else if (widthAnalysis.strategy.includes('flex')) {
    parts.push(`Width is controlled by flex layout${flexBehavior?.will_grow ? ' and will grow to fill available space' : ''}.`);
  } else if (widthAnalysis.strategy.includes('grid')) {
    parts.push(`Width is determined by grid column placement.`);
  } else {
    parts.push(`Width is auto (determined by content).`);
  }

  // Height summary
  if (heightAnalysis.strategy.includes('Fixed')) {
    parts.push(`Height is fixed at ${element.height?.value || 'explicit value'}.`);
  } else if (heightAnalysis.strategy.includes('Percentage')) {
    parts.push(`Height is ${element.height?.value || '100%'} of parent.`);
  } else if (heightAnalysis.strategy.includes('flex')) {
    parts.push(`Height is controlled by flex layout.`);
  } else if (heightAnalysis.strategy.includes('grid')) {
    parts.push(`Height is determined by grid row placement.`);
  } else {
    parts.push(`Height is auto (determined by content).`);
  }

  // Flex behavior
  if (flexBehavior) {
    if (flexBehavior.will_grow && flexBehavior.will_shrink) {
      parts.push(`As a flex item, it will both grow and shrink as needed.`);
    } else if (flexBehavior.will_grow) {
      parts.push(`As a flex item, it will grow but not shrink.`);
    } else if (flexBehavior.will_shrink) {
      parts.push(`As a flex item, it will shrink if needed but not grow.`);
    } else {
      parts.push(`As a flex item, it maintains its size (flex-none behavior).`);
    }
  }

  // Grid behavior
  if (gridBehavior) {
    if (gridBehavior.column !== 'auto' || gridBehavior.row !== 'auto') {
      parts.push(`Grid placement: column ${gridBehavior.column}, row ${gridBehavior.row}.`);
    }
  }

  // Constraints warning
  const widthConstraints = widthAnalysis.constrained_by?.filter((c) => c.includes('WARNING')) || [];
  const heightConstraints = heightAnalysis.constrained_by?.filter((c) => c.includes('WARNING')) || [];
  if (widthConstraints.length > 0 || heightConstraints.length > 0) {
    parts.push(`Note: There are potential sizing issues that may need attention.`);
  }

  return parts.join(' ');
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handles the get_sizing_strategy MCP tool call.
 *
 * Analyzes how a specific element's size is determined by examining
 * Tailwind classes, flex/grid context, and ancestor constraints.
 *
 * @param args - The get_sizing_strategy tool arguments
 * @returns MCP tool response with sizing analysis
 */
export async function handleGetSizingStrategy(args: GetSizingStrategyArgs): Promise<ToolResponse> {
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
    let content = fs.readFileSync(filePath, 'utf-8');

    // For Vue/Svelte, extract template section
    if (ext === '.vue') {
      const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
      if (templateMatch) {
        content = templateMatch[1]
          .replace(/:class=/g, 'className=')
          .replace(/v-bind:class=/g, 'className=')
          .replace(/class=/g, 'className=');
      }
    } else if (ext === '.svelte') {
      content = content.replace(/class=/g, 'className=');
    }

    // Parse as TSX
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
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

    // Parse JSX tree into element nodes
    const rootElement = parseJsxTree(rootJsxNode, sourceFile);

    if (!rootElement) {
      return createErrorResponse('Failed to parse JSX tree.', { file: args.file });
    }

    // Find target element by selector
    const targetElement = findElementBySelector(rootElement, args.selector);

    if (!targetElement) {
      return createErrorResponse(`No element matching selector "${args.selector}" found in component.`, {
        file: args.file,
        selector: args.selector,
      });
    }

    // Analyze sizing
    const widthAnalysis = analyzeWidthStrategy(targetElement);
    const heightAnalysis = analyzeHeightStrategy(targetElement);
    const flexBehavior = analyzeFlexBehavior(targetElement);
    const gridBehavior = analyzeGridBehavior(targetElement);
    const positionContext = getPositionContext(targetElement);
    const ancestorChain = buildAncestorChain(targetElement);

    // Build result
    const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    const result: GetSizingStrategyResult = {
      file: relativePath,
      element: createElementIdentifier(targetElement.tagName, targetElement.classes, targetElement.id),
      sizing: {
        width: widthAnalysis,
        height: heightAnalysis,
        min_max: {
          min_width: targetElement.minWidth,
          max_width: targetElement.maxWidth,
          min_height: targetElement.minHeight,
          max_height: targetElement.maxHeight,
        },
      },
      flex_behavior: flexBehavior,
      grid_behavior: gridBehavior,
      overflow: {
        x: targetElement.overflowX,
        y: targetElement.overflowY,
      },
      position_context: positionContext,
      ancestor_chain: ancestorChain,
      summary: generateSummary(targetElement, widthAnalysis, heightAnalysis, flexBehavior, gridBehavior),
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file, selector: args.selector });
  }
}
