/**
 * Tree Builder for Stacking Context
 *
 * Builds hierarchical stacking context trees from flat element lists.
 *
 * @module core/stacking/tree-builder
 */

import type { StackingContext, ElementInfo, ZIndexInfo } from './types.js';

/**
 * Build stacking context tree from flat element list
 */
export function buildStackingTree(elements: ElementInfo[]): StackingContext {
  // Create a root context
  const root: StackingContext = {
    element: 'root',
    z_index: 'auto',
    creates_context: true,
    context_reason: 'document root',
    children: [],
  };

  // Map from element index to tree node
  const nodeMap = new Map<number, StackingContext>();

  // First pass: create nodes for elements that create contexts or have z-index
  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];
    const node: StackingContext = {
      element: elem.element,
      z_index: elem.z_index,
      creates_context: elem.creates_context,
      context_reason: elem.context_reason,
      children: [],
    };
    nodeMap.set(i, node);
  }

  // Second pass: build tree structure
  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];
    const node = nodeMap.get(i)!;

    // Find the parent stacking context
    let parentContextIndex: number | null = null;
    let searchIndex = elem.parent_index;
    const visited = new Set<number>();

    while (searchIndex !== null) {
      // Bounds check: parent_index must be a valid index
      if (searchIndex < 0 || searchIndex >= elements.length) {
        break;
      }
      // Cycle detection: if we've visited this index before, stop
      if (visited.has(searchIndex)) {
        break;
      }
      visited.add(searchIndex);

      const parentElem = elements[searchIndex];
      if (parentElem.creates_context) {
        parentContextIndex = searchIndex;
        break;
      }
      searchIndex = parentElem.parent_index;
    }

    if (parentContextIndex !== null) {
      const parentNode = nodeMap.get(parentContextIndex)!;
      parentNode.children.push(node);
    } else {
      // No parent context found, attach to root
      root.children.push(node);
    }
  }

  return root;
}

/**
 * Get the parent stacking context name for an element
 */
export function getContextParent(elementIndex: number, elements: ElementInfo[]): string {
  if (elementIndex < 0 || elementIndex >= elements.length) return 'root';
  const elem = elements[elementIndex];
  let searchIndex = elem.parent_index;
  const visited = new Set<number>();

  while (searchIndex !== null) {
    if (searchIndex < 0 || searchIndex >= elements.length) break;
    if (visited.has(searchIndex)) break;
    visited.add(searchIndex);
    const parentElem = elements[searchIndex];
    if (parentElem.creates_context) {
      return parentElem.element;
    }
    searchIndex = parentElem.parent_index;
  }

  return 'root';
}

/**
 * Collect all z-index values from tree
 */
export function collectZIndexValues(elements: ElementInfo[]): ZIndexInfo[] {
  const zValues: ZIndexInfo[] = [];

  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];
    if (typeof elem.z_index === 'number') {
      zValues.push({
        element: elem.element,
        z_index: elem.z_index,
        context_parent: getContextParent(i, elements),
      });
    }
  }

  return zValues;
}
