/**
 * Layout Hierarchy Analyzer
 *
 * AST analysis, JSX parsing, tree building, issue detection,
 * constraint notes generation, and summary generation for layout
 * hierarchy analysis.
 *
 * Extracted from layout-hierarchy-core and layout-hierarchy-analyzers.
 * Uses the canonical Tailwind parser from core/tailwind/parser (layout variant)
 * rather than duplicating parsing logic.
 *
 * @module core/layout/analyzer
 */

import ts from 'typescript';
import { parseTailwindClassesLayout } from '../tailwind/parser.js';
import { createElementIdentifier } from '../tailwind/identifier.js';
import { extractClassesFromAttribute } from '../jsx/class-extractor.js';
import type {
  DisplayType,
  PositionType,
  ParsedCssProperties,
  Sizing,
  FlexProps,
  GridProps,
  Overflow,
  LayoutNode,
  LayoutIssue,
  LayoutContext,
} from './types.js';

// =============================================================================
// AST Analysis Helpers
// =============================================================================

/**
 * Extract className attribute from a JSX element
 */
export function extractClassName(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sourceFile: ts.SourceFile): string[] {
  const classes: string[] = [];

  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr)) {
      const attrName = attr.name.getText(sourceFile);
      if (attrName === 'className' || attrName === 'class') {
        classes.push(...extractClassesFromAttribute(attr));
      }
    }
  }

  return classes;
}

/**
 * Extract id attribute from a JSX element
 */
export function extractId(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sourceFile: ts.SourceFile): string | undefined {
  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'id') {
      if (attr.initializer && ts.isStringLiteral(attr.initializer)) {
        return attr.initializer.text;
      }
    }
  }
  return undefined;
}

// Re-export createElementIdentifier for consumers of this module
export { createElementIdentifier };

// =============================================================================
// Layout Node Building
// =============================================================================

/**
 * Build LayoutNode from parsed CSS properties
 */
export function buildLayoutNode(
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
export function matchesSelector(tagName: string, classes: string[], id: string | undefined, selector: string): boolean {
  if (selector.startsWith('#')) {
    return id === selector.slice(1);
  }
  if (selector.startsWith('.')) {
    return classes.includes(selector.slice(1));
  }
  // Match by tag name
  return tagName.toLowerCase() === selector.toLowerCase();
}

// =============================================================================
// JSX Tree Parsing
// =============================================================================

/**
 * Recursively parse JSX tree into layout nodes
 */
export function parseJsxElement(
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
    const props = parseTailwindClassesLayout(classes);

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

    /* v8 ignore next -- defensive: shouldInclude is true when selector is undefined */
    return null;
  }

  // Handle self-closing JSX element
  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    const classes = extractClassName(node, sourceFile);
    const id = extractId(node, sourceFile);
    const props = parseTailwindClassesLayout(classes);

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

    /* v8 ignore next -- defensive: empty fragment with no children after filtering */
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
// File Parsing
// =============================================================================

// Re-export findRootJsx from the canonical jsx/element-finder module
export { findRootJsx } from '../jsx/element-finder.js';

// =============================================================================
// Issue Detection
// =============================================================================

/**
 * Detect potential layout issues in the tree
 */
export function detectIssues(node: LayoutNode, context: LayoutContext = { depth: 0 }): LayoutIssue[] {
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

// =============================================================================
// Constraint Notes Generation
// =============================================================================

/**
 * Generate constraint notes for the layout
 */
export function generateConstraintNotes(node: LayoutNode, notes: string[] = [], path = ''): string[] {
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

// =============================================================================
// Summary Generation
// =============================================================================

/**
 * Generate summary of the layout
 */
export function generateSummary(tree: LayoutNode, issues: LayoutIssue[]): string {
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
