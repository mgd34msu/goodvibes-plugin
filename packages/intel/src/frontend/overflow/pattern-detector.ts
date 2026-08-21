/**
 * Overflow pattern detector, Lane 4.
 * Ported verbatim from frontend-engine `core/overflow/pattern-detector.ts`.
 * Keeps the nested-flex min-height detector (pattern 7); the absolute-positioning
 * heuristic (pattern 4) stays severity `low` and the merged tool guards it further
 * (§4.4.2).
 *
 * @module frontend/overflow/pattern-detector
 */

import type { LayoutNode, OverflowPattern } from './types.js';
import { isConstrainedSizing, isAutoSizing, hasAutoHeightChildren, matchesHint } from './utils.js';

/** Find overflow-prone patterns in the layout tree. */
export function findOverflowPatterns(tree: LayoutNode, hint?: string): OverflowPattern[] {
  const patterns: OverflowPattern[] = [];

  function traverse(node: LayoutNode): void {
    if (
      isConstrainedSizing(node.sizing.height.strategy) &&
      hasAutoHeightChildren(node) &&
      node.overflow.y === 'visible' &&
      matchesHint(node, hint)
    ) {
      patterns.push({
        type: 'fixed_parent_auto_children',
        severity: 'high',
        description: 'Fixed-height container with auto-height children may overflow',
        parent: node,
        children: node.children.filter((c) => isAutoSizing(c.sizing.height.strategy)),
      });
    }

    if (
      (node.display === 'flex' || node.display === 'inline-flex') &&
      node.overflow.y === 'visible' &&
      isConstrainedSizing(node.sizing.height.strategy) &&
      matchesHint(node, hint)
    ) {
      patterns.push({
        type: 'constrained_flex_no_overflow',
        severity: 'medium',
        description: 'Flex container with constrained height but no overflow handling',
        element: node,
      });
    }

    if (
      node.sizing.height.strategy === 'percentage' &&
      node.parent &&
      node.parent.sizing.height.strategy === 'auto' &&
      matchesHint(node, hint)
    ) {
      patterns.push({
        type: 'nested_percentage_heights',
        severity: 'medium',
        description: 'Percentage height on child but parent has no defined height',
        element: node,
        parent: node.parent,
      });
    }

    if (
      node.position === 'absolute' &&
      node.parent &&
      node.parent.position === 'static' &&
      matchesHint(node, hint)
    ) {
      patterns.push({
        type: 'absolute_no_containment',
        severity: 'low',
        description: 'Absolute positioned element may overflow non-relative parent',
        element: node,
        parent: node.parent,
      });
    }

    if (
      node.flex_props &&
      node.flex_props.shrink === 0 &&
      node.parent &&
      (node.parent.display === 'flex' || node.parent.display === 'inline-flex') &&
      isConstrainedSizing(node.parent.sizing.height.strategy) &&
      matchesHint(node, hint)
    ) {
      patterns.push({
        type: 'flex_no_shrink',
        severity: 'low',
        description: 'Flex child with shrink-0 may cause parent overflow',
        element: node,
        parent: node.parent,
      });
    }

    if (
      (node.display === 'grid' || node.display === 'inline-grid') &&
      node.overflow.y === 'visible' &&
      isConstrainedSizing(node.sizing.height.strategy) &&
      matchesHint(node, hint)
    ) {
      patterns.push({
        type: 'grid_overflow',
        severity: 'medium',
        description: 'Grid container with constrained height but no overflow handling',
        element: node,
      });
    }

    if (
      (node.display === 'flex' || node.display === 'inline-flex') &&
      node.parent &&
      (node.parent.display === 'flex' || node.parent.display === 'inline-flex') &&
      !node.classes.some((c) => c === 'min-h-0') &&
      node.flex_props?.grow === 1 &&
      matchesHint(node, hint)
    ) {
      patterns.push({
        type: 'min_height_zero_missing',
        severity: 'high',
        description: 'Nested flex container without min-h-0 may not scroll properly',
        element: node,
        parent: node.parent,
      });
    }

    for (const child of node.children) {traverse(child);}
  }

  traverse(tree);

  const severityOrder = { high: 0, medium: 1, low: 2 };
  patterns.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  return patterns;
}
