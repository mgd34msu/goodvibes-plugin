/**
 * React component relationship builder — Lane 4.
 * Ported from frontend-engine `core/react/relationship-builder.ts`; `buildTree`
 * carries the `resolved_path` echo (issue 1 fix #3) through to each node.
 *
 * @module frontend/react/relationship-builder
 */

import ts from 'typescript';
import type { ComponentInfo, ComponentTreeNode } from './types.js';

/** Find all JSX component usages (Uppercase tags) in a node. */
export function findUsedComponents(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  const used = new Set<string>();
  function visit(n: ts.Node): void {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tagName = n.tagName.getText(sourceFile);
      if (/^[A-Z]/.test(tagName)) {
        const componentName = tagName.split('.').pop() || tagName;
        used.add(componentName);
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return Array.from(used);
}

/** Build used_by relationships from uses relationships (mutates in place). */
export function buildUsedByRelationships(components: ComponentInfo[]): void {
  const componentMap = new Map<string, ComponentInfo>();
  for (const comp of components) {componentMap.set(comp.name, comp);}
  for (const comp of components) {
    for (const usedName of comp.uses) {
      const usedComp = componentMap.get(usedName);
      if (usedComp && !usedComp.used_by.includes(comp.name)) {
        usedComp.used_by.push(comp.name);
      }
    }
  }
}

/** Build a component tree starting from a root name (depth-bounded, cycle-safe). */
export function buildTree(
  rootName: string,
  components: ComponentInfo[],
  depth: number,
  visited: Set<string> = new Set(),
): ComponentTreeNode | null {
  if (depth <= 0 || visited.has(rootName)) {return null;}
  const component = components.find((c) => c.name === rootName);
  if (!component) {return null;}

  visited.add(rootName);

  const children: ComponentTreeNode[] = [];
  for (const childName of component.uses) {
    const childNode = buildTree(childName, components, depth - 1, new Set(visited));
    if (childNode) {children.push(childNode);}
  }

  return {
    name: component.name,
    file: component.file,
    resolved_path: component.resolved_path,
    props: component.props,
    children,
    ...(component.lazy !== undefined && { lazy: component.lazy }),
    ...(component.wrappers !== undefined && { wrappers: component.wrappers }),
  };
}

/** Root candidates: App/Main/Root/etc. first, else components with no parents. */
export function findRootComponents(components: ComponentInfo[]): string[] {
  const priorityNames = ['App', 'Main', 'Root', 'Application', 'Layout'];
  for (const name of priorityNames) {
    const comp = components.find((c) => c.name === name);
    if (comp) {return [comp.name];}
  }
  const rootCandidates = components.filter((c) => c.used_by.length === 0);
  if (rootCandidates.length > 0) {return rootCandidates.map((c) => c.name);}
  return components.length > 0 ? [components[0].name] : [];
}
