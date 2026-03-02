/**
 * Utility functions for Overflow Diagnosis
 *
 * @module core/overflow/utils
 */

import type { LayoutNode, BaseLayoutNode } from './types.js';

// =============================================================================
// Selector Matching
// =============================================================================

/**
 * Match a layout node against a CSS-style selector string.
 *
 * The `element` field is a COMPOSITE identifier produced by `createElementIdentifier()`
 * in `layout-hierarchy-core.ts`, with format: `tag`, `tag#id`, `tag.class1.class2`,
 * or `tag#id.class1.class2`. The `tag` field holds just the raw tag name.
 *
 * Supported selector forms:
 * - `.className` — checks `node.classes` array for an exact match (case-insensitive)
 * - `#id`        — parses the `#id` portion out of `node.element` and compares (case-insensitive)
 * - `tagName`    — uses `node.tag` directly (case-insensitive)
 */
export function matchesSelector(
  node: { element: string; tag: string; classes: string[] },
  selector: string
): boolean {
  if (selector.startsWith('.')) {
    // Class selector: check classes array for exact match (case-insensitive).
    // Tailwind classes are always lowercase, but we normalise to be safe.
    const className = selector.slice(1).toLowerCase();
    return node.classes.some((c) => c.toLowerCase() === className);
  }

  if (selector.startsWith('#')) {
    // ID selector: extract the id segment from the composite element string.
    // Format is tag#id or tag#id.class1.class2 — id runs from '#' to the next '.' or end.
    const hashIdx = node.element.indexOf('#');
    if (hashIdx === -1) return false;
    const idStart = hashIdx + 1;
    const dotIdx = node.element.indexOf('.', idStart);
    const elementId =
      dotIdx === -1
        ? node.element.slice(idStart)
        : node.element.slice(idStart, dotIdx);
    return elementId.toLowerCase() === selector.slice(1).toLowerCase();
  }

  // Tag selector: use the dedicated `tag` field (never contains id/class fragments).
  return node.tag.toLowerCase() === selector.toLowerCase();
}

// =============================================================================
// Tree Enrichment
// =============================================================================

/**
 * Add parent references to the layout tree for traversal
 */
export function enrichTreeWithParents(
  node: BaseLayoutNode,
  parent?: LayoutNode
): LayoutNode {
  const enrichedNode: LayoutNode = {
    ...node,
    parent,
    children: [],
  };

  enrichedNode.children = node.children.map((child) =>
    enrichTreeWithParents(child, enrichedNode)
  );

  return enrichedNode;
}

// =============================================================================
// Sizing Helpers
// =============================================================================

/**
 * Check if sizing is constrained (fixed pixel or percentage — not auto/flex/fit-content)
 */
export function isConstrainedSizing(
  strategy: 'fixed' | 'percentage' | 'auto' | 'flex' | 'fit-content'
): boolean {
  return strategy === 'fixed' || strategy === 'percentage';
}

/**
 * Check if sizing is auto or undefined
 */
export function isAutoSizing(
  strategy: 'fixed' | 'percentage' | 'auto' | 'flex' | 'fit-content'
): boolean {
  return strategy === 'auto';
}

/**
 * Check if a node has auto height children
 */
export function hasAutoHeightChildren(node: LayoutNode): boolean {
  return node.children.some((child) => isAutoSizing(child.sizing.height.strategy));
}

/**
 * Check if a layout node matches the given element hint.
 *
 * The hint is a CSS-style selector. Delegates to `matchesSelector` for
 * consistent handling of the composite `element` field (e.g. `div#main.flex`).
 *
 * Supported selector forms:
 * - `.className` — matches whole class name (case-insensitive)
 * - `#id`        — extracts id from composite element string (case-insensitive)
 * - `tagName`    — uses `node.tag` directly (case-insensitive)
 */
export function matchesHint(node: LayoutNode, hint?: string): boolean {
  if (!hint) return true;
  return matchesSelector(node, hint);
}
