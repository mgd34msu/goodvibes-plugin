/**
 * React Component Relationship Builder
 *
 * Builds component usage graphs, reverse dependency (used_by) maps,
 * and recursive component trees from flat component lists.
 *
 * @module core/react/relationship-builder
 */

import ts from 'typescript';
import type { ComponentInfo, ComponentTreeNode } from './types.js';

// =============================================================================
// JSX Component Usage Detection
// =============================================================================

/**
 * Find all JSX component usages in a source file node
 */
export function findUsedComponents(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  const used: Set<string> = new Set();

  function visit(n: ts.Node): void {
    // JSX element: <Component />
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tagName = n.tagName.getText(sourceFile);
      // Only uppercase (custom components), not lowercase (HTML elements)
      if (/^[A-Z]/.test(tagName)) {
        // Remove any namespace prefix (e.g., React.Fragment -> Fragment)
        const componentName = tagName.split('.').pop() || tagName;
        used.add(componentName);
      }
    }
    ts.forEachChild(n, visit);
  }

  visit(node);
  return Array.from(used);
}

// =============================================================================
// Relationship Building
// =============================================================================

/**
 * Build used_by relationships from uses relationships
 */
export function buildUsedByRelationships(components: ComponentInfo[]): void {
  const componentMap = new Map<string, ComponentInfo>();

  for (const comp of components) {
    componentMap.set(comp.name, comp);
  }

  for (const comp of components) {
    for (const usedName of comp.uses) {
      const usedComp = componentMap.get(usedName);
      if (usedComp && !usedComp.used_by.includes(comp.name)) {
        usedComp.used_by.push(comp.name);
      }
    }
  }
}

/**
 * Build component tree starting from a root
 */
export function buildTree(
  rootName: string,
  components: ComponentInfo[],
  depth: number,
  visited: Set<string> = new Set()
): ComponentTreeNode | null {
  if (depth <= 0 || visited.has(rootName)) {
    return null;
  }

  const component = components.find(c => c.name === rootName);
  if (!component) {
    return null;
  }

  visited.add(rootName);

  const children: ComponentTreeNode[] = [];
  for (const childName of component.uses) {
    const childNode = buildTree(childName, components, depth - 1, new Set(visited));
    if (childNode) {
      children.push(childNode);
    }
  }

  return {
    name: component.name,
    file: component.file,
    props: component.props,
    children,
    ...(component.lazy !== undefined && { lazy: component.lazy }),
    ...(component.wrappers !== undefined && { wrappers: component.wrappers }),
  };
}

/**
 * Find the best root component (one with no parents, or App/Main/Root)
 */
export function findRootComponent(components: ComponentInfo[], entryFile?: string): string | null {
  // Priority: App, Main, Root, or any component with no parents
  const priorityNames = ['App', 'Main', 'Root', 'Application', 'Layout'];

  for (const name of priorityNames) {
    const comp = components.find(c => c.name === name);
    if (comp) return comp.name;
  }

  // Find components with no parents
  const rootCandidates = components.filter(c => c.used_by.length === 0);
  if (rootCandidates.length > 0) {
    return rootCandidates[0].name;
  }

  // Fallback to first component
  return components.length > 0 ? components[0].name : null;
}
