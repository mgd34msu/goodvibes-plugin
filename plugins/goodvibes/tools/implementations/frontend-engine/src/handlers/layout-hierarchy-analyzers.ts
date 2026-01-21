/**
 * Layout Hierarchy Analyzers
 *
 * Issue detection, constraint notes generation, and summary generation
 * for layout hierarchy analysis.
 *
 * @module handlers/frontend/layout-hierarchy-analyzers
 */

import type { DisplayType, PositionType, SizingStrategy } from './layout-hierarchy-utils.js';

// =============================================================================
// Types
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
