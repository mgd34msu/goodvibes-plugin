/**
 * Overflow utilities — Lane 4.
 * Ported from frontend-engine `core/overflow/utils.ts`.
 *
 * @module frontend/overflow/utils
 */

import type { LayoutNode, BaseLayoutNode } from './types.js';

/** Match a layout node against a `.class` / `#id` / `tag` selector. */
export function matchesSelector(
  node: { element: string; tag: string; classes: string[] },
  selector: string,
): boolean {
  if (selector.startsWith('.')) {
    const className = selector.slice(1).toLowerCase();
    return node.classes.some((c) => c.toLowerCase() === className);
  }
  if (selector.startsWith('#')) {
    const hashIdx = node.element.indexOf('#');
    if (hashIdx === -1) return false;
    const idStart = hashIdx + 1;
    const dotIdx = node.element.indexOf('.', idStart);
    const elementId = dotIdx === -1 ? node.element.slice(idStart) : node.element.slice(idStart, dotIdx);
    return elementId.toLowerCase() === selector.slice(1).toLowerCase();
  }
  return node.tag.toLowerCase() === selector.toLowerCase();
}

/** Add parent references to the layout tree for upward traversal. */
export function enrichTreeWithParents(node: BaseLayoutNode, parent?: LayoutNode): LayoutNode {
  const enriched: LayoutNode = { ...node, parent, children: [] };
  enriched.children = node.children.map((child) => enrichTreeWithParents(child, enriched));
  return enriched;
}

/** Constrained sizing = fixed pixel or percentage. */
export function isConstrainedSizing(strategy: 'fixed' | 'percentage' | 'auto' | 'flex' | 'fit-content'): boolean {
  return strategy === 'fixed' || strategy === 'percentage';
}

/** Auto sizing check. */
export function isAutoSizing(strategy: 'fixed' | 'percentage' | 'auto' | 'flex' | 'fit-content'): boolean {
  return strategy === 'auto';
}

/** Whether a node has auto-height children. */
export function hasAutoHeightChildren(node: LayoutNode): boolean {
  return node.children.some((child) => isAutoSizing(child.sizing.height.strategy));
}

/** Whether a layout node matches an optional element hint (selector). */
export function matchesHint(node: LayoutNode, hint?: string): boolean {
  if (!hint) return true;
  return matchesSelector(node, hint);
}
