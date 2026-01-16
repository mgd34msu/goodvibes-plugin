/**
 * Constraint Chain Builder for Overflow Diagnosis
 *
 * Builds constraint chains from layout trees.
 *
 * @module handlers/frontend/overflow-diagnosis/constraint-builder
 */

import type { LayoutNode, ConstraintChainEntry } from './types.js';

/**
 * Describe the constraint a node applies
 */
export function describeConstraint(node: LayoutNode): string {
  const constraints: string[] = [];

  if (node.sizing.height.strategy === 'fixed' && node.sizing.height.value) {
    constraints.push(`fixed height (${node.sizing.height.value})`);
  } else if (node.sizing.height.strategy === 'percentage' && node.sizing.height.value) {
    constraints.push(`percentage height (${node.sizing.height.value})`);
  }

  if (node.sizing.width.strategy === 'fixed' && node.sizing.width.value) {
    constraints.push(`fixed width (${node.sizing.width.value})`);
  }

  if (node.overflow.y !== 'visible') {
    constraints.push(`overflow-y: ${node.overflow.y}`);
  }

  if ((node.display === 'flex' || node.display === 'inline-flex') && node.flex_props) {
    constraints.push(`flex ${node.flex_props.direction}`);
    if (node.flex_props.wrap === 'nowrap') {
      constraints.push('no-wrap');
    }
  }

  if (node.display === 'grid' || node.display === 'inline-grid') {
    constraints.push('grid layout');
  }

  return constraints.length > 0 ? constraints.join(', ') : 'no explicit constraints';
}

/**
 * Build constraint chain from tree to target element
 */
export function buildConstraintChain(tree: LayoutNode, target: string): ConstraintChainEntry[] {
  const chain: ConstraintChainEntry[] = [];
  const targetLower = target.toLowerCase();

  function traverse(node: LayoutNode, path: LayoutNode[]): boolean {
    const elementLower = node.element.toLowerCase();
    const classMatch = node.classes.some((c) => c.toLowerCase().includes(targetLower));

    if (elementLower.includes(targetLower) || classMatch) {
      // Found target, build chain from path
      for (let i = 0; i < path.length; i++) {
        const ancestor = path[i];
        const entry: ConstraintChainEntry = {
          element: ancestor.element,
          constrains: describeConstraint(ancestor),
        };

        if (i > 0) {
          const parent = path[i - 1];
          if (
            parent.display === 'flex' ||
            parent.display === 'inline-flex' ||
            parent.display === 'grid' ||
            parent.display === 'inline-grid'
          ) {
            entry.receives_from_parent = `${parent.display} layout constraints`;
          } else if (parent.sizing.height.strategy !== 'auto') {
            entry.receives_from_parent = 'height constraint from parent';
          }
        }

        chain.push(entry);
      }

      // Add the target itself
      chain.push({
        element: node.element,
        constrains: describeConstraint(node),
        receives_from_parent: path.length > 0 ? 'constraints from parent' : undefined,
      });

      return true;
    }

    for (const child of node.children) {
      if (traverse(child, [...path, node])) {
        return true;
      }
    }

    return false;
  }

  traverse(tree, []);
  return chain;
}
