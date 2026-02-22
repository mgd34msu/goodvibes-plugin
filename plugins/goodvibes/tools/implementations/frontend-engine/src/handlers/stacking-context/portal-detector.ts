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
 * Number of characters to inspect after a createPortal() call to determine
 * whether it uses a ref/dynamic container rather than a static getElementById.
 */
const CREATE_PORTAL_CONTEXT_WINDOW = 300;

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

  // Radix UI / Headless UI / Floating UI portal imports + usage verification
  // Only report if the file both imports portal-capable packages AND actually uses portal-like JSX.
  // Note: next/dynamic does not expose a Portal API — removed that branch.
  const nextPortalImportRegex =
    /from\s+['"](?:@radix-ui\/react-portal|@headlessui\/react|@floating-ui\/react)['"]/g;
  if (nextPortalImportRegex.test(content)) {
    // Check for actual JSX usage of portal-wrapped components
    const modalRegex = /<(Modal|Dialog|Drawer|Sheet|Popover|Dropdown)[^>]*>/g;
    while ((match = modalRegex.exec(content)) !== null) {
      const component = findContainingComponent(match.index, sourceFile) || 'Unknown';
      const existingPortal = portals.find((p) => p.component === component);
      if (!existingPortal) {
        portals.push({
          component,
          destination: 'document.body (inferred from portal library import + modal usage)',
        });
      }
    }
  }

  // Custom portal wrapper detection:
  // Look for functions/components that call createPortal internally
  const createPortalUsageRegex = /createPortal\s*\(/g;
  let createPortalMatch: RegExpExecArray | null;
  while ((createPortalMatch = createPortalUsageRegex.exec(content)) !== null) {
    // Check if this createPortal call is NOT already captured by the reactPortalRegex above
    // (i.e. it doesn't include getElementById - it might use a ref or custom container)
    const contextSlice = content.slice(
      createPortalMatch.index,
      createPortalMatch.index + CREATE_PORTAL_CONTEXT_WINDOW
    );
    const alreadyCaptured = /document\.getElementById\s*\(\s*['"][^'"]+['"]/.test(
      contextSlice
    );
    if (!alreadyCaptured) {
      const component =
        findContainingComponent(createPortalMatch.index, sourceFile) || 'Unknown';
      const existingPortal = portals.find((p) => p.component === component);
      if (!existingPortal) {
        portals.push({
          component,
          destination: 'dynamic/ref container (createPortal without getElementById)',
        });
      }
    }
  }

  return portals;
}
