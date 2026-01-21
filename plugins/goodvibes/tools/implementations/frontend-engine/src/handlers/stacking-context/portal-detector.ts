/**
 * Portal Detection for React/Vue/Svelte
 *
 * Detects portal usage patterns across different frameworks.
 *
 * @module handlers/frontend/stacking-context/portal-detector
 */

import ts from 'typescript';
import type { PortalInfo } from './types.js';

/**
 * Find the containing component/function for a source position
 */
export function findContainingComponent(position: number, sourceFile: ts.SourceFile): string | null {
  let result: string | null = null;

  function visit(node: ts.Node): void {
    if (node.getStart() <= position && node.getEnd() >= position) {
      // Function declaration
      if (ts.isFunctionDeclaration(node) && node.name) {
        result = node.name.getText(sourceFile);
      }
      // Arrow function in variable declaration
      else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        if (
          node.initializer &&
          (ts.isArrowFunction(node.initializer) ||
            ts.isFunctionExpression(node.initializer))
        ) {
          result = node.name.getText(sourceFile);
        }
      }
      // Class component
      else if (ts.isClassDeclaration(node) && node.name) {
        result = node.name.getText(sourceFile);
      }

      ts.forEachChild(node, visit);
    }
  }

  visit(sourceFile);
  return result;
}

/**
 * Detect React/Vue/Svelte portal usage in source code
 * @param content - Source file content
 * @param sourceFile - TypeScript source file
 * @returns Array of detected portals
 */
export function detectPortals(content: string, sourceFile: ts.SourceFile): PortalInfo[] {
  const portals: PortalInfo[] = [];

  // React createPortal pattern
  const reactPortalRegex =
    /createPortal\s*\(\s*[^,]+,\s*document\.getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = reactPortalRegex.exec(content)) !== null) {
    portals.push({
      component: findContainingComponent(match.index, sourceFile) || 'Unknown',
      destination: match[1],
    });
  }

  // React Portal component pattern (from react-dom)
  const reactPortalComponentRegex =
    /<Portal[^>]*container\s*=\s*\{[^}]*getElementById\s*\(\s*['"]([^'"]+)['"]/g;
  while ((match = reactPortalComponentRegex.exec(content)) !== null) {
    portals.push({
      component: findContainingComponent(match.index, sourceFile) || 'Unknown',
      destination: match[1],
    });
  }

  // Radix UI / Headless UI Portal pattern
  const radixPortalRegex = /<(Portal|DialogPortal|PopoverPortal)[^>]*>/g;
  while ((match = radixPortalRegex.exec(content)) !== null) {
    const containerMatch = content
      .slice(match.index, match.index + 200)
      .match(/container\s*=\s*\{[^}]*getElementById\s*\(\s*['"]([^'"]+)['"]/);

    portals.push({
      component: findContainingComponent(match.index, sourceFile) || 'Unknown',
      destination: containerMatch ? containerMatch[1] : 'document.body (default)',
    });
  }

  // Vue Teleport pattern
  const vueTeleportRegex = /<Teleport[^>]*to\s*=\s*['"]([^'"]+)['"]/g;
  while ((match = vueTeleportRegex.exec(content)) !== null) {
    portals.push({
      component: findContainingComponent(match.index, sourceFile) || 'Unknown',
      destination: match[1],
    });
  }

  // Svelte portal pattern (various libraries)
  const sveltePortalRegex = /<Portal[^>]*target\s*=\s*['"]([^'"]+)['"]/g;
  while ((match = sveltePortalRegex.exec(content)) !== null) {
    portals.push({
      component: findContainingComponent(match.index, sourceFile) || 'Unknown',
      destination: match[1],
    });
  }

  // Next.js Portal pattern
  const nextPortalRegex =
    /next\/dynamic[^}]*Portal|@radix-ui\/react-portal|@headlessui\/react/g;
  if (nextPortalRegex.test(content)) {
    // Check for usage patterns
    const modalRegex = /<(Modal|Dialog|Drawer|Sheet|Popover|Dropdown)[^>]*>/g;
    while ((match = modalRegex.exec(content)) !== null) {
      const existingPortal = portals.find(
        (p) =>
          p.component === findContainingComponent(match!.index, sourceFile)
      );
      if (!existingPortal) {
        portals.push({
          component: findContainingComponent(match.index, sourceFile) || 'Unknown',
          destination: 'document.body (inferred from modal/dialog pattern)',
        });
      }
    }
  }

  return portals;
}
