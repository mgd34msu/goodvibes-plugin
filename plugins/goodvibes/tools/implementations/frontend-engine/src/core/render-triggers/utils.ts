/**
 * Utility functions for Analyze Render Triggers
 *
 * @module core/render-triggers/utils
 */

import * as path from 'path';
import ts from 'typescript';
import { getLineNumberFromSourceFile } from '../../shared/utils.js';

// =============================================================================
// Path Helpers
// =============================================================================

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function makeRelativePath(absolutePath: string, projectRoot: string): string {
  return normalizeFilePath(path.relative(projectRoot, absolutePath));
}

// =============================================================================
// AST Helpers
// =============================================================================

/**
 * Get a clean code snippet for a node
 */
export function getCodeSnippet(node: ts.Node, sourceFile: ts.SourceFile, maxLength = 80): string {
  const text = node.getText(sourceFile).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}

/**
 * Check if we're inside a JSX attribute context
 */
export function isInsideJsxAttribute(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxAttribute(current)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Check if a node is inside a hook call (useCallback, useMemo)
 */
export function isInsideMemoizationHook(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isCallExpression(current)) {
      const callText = current.expression.getText(sourceFile);
      if (callText === 'useCallback' || callText === 'useMemo' ||
          callText === 'React.useCallback' || callText === 'React.useMemo') {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}
