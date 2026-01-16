/**
 * Utility functions for Diagnose Overflow
 *
 * @module handlers/frontend/overflow-diagnosis/utils
 */

import type { ToolResponse, LayoutNode, BaseLayoutNode } from './types.js';

// =============================================================================
// Response Helpers
// =============================================================================

export function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function createErrorResponse(
  message: string,
  context?: Record<string, unknown>
): ToolResponse {
  return {
    content: [
      { type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) },
    ],
    isError: true,
  };
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
 * Check if sizing is fixed (has explicit dimension)
 */
export function isFixedSizing(
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
 * Check if element matches the hint
 */
export function matchesHint(node: LayoutNode, hint?: string): boolean {
  if (!hint) return true;
  const hintLower = hint.toLowerCase();
  return (
    node.element.toLowerCase().includes(hintLower) ||
    node.classes.some((c) => c.toLowerCase().includes(hintLower))
  );
}
