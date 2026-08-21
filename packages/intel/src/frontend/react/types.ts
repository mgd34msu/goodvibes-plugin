/**
 * React component-tree analysis types, Lane 4.
 * Ported from frontend-engine `core/react/types.ts` (bare-tree fields only; the
 * annotation blocks + `resolved_path` live on the merged node in the tool).
 *
 * @module frontend/react/types
 */

import type ts from 'typescript';

/** Bare component tree node (before annotations). */
export interface ComponentTreeNode {
  name: string;
  file: string;
  resolved_path: string;
  props: string[];
  children: ComponentTreeNode[];
  lazy?: boolean;
  wrappers?: string[];
}

/** Component info in the flat list. */
export interface ComponentInfo {
  name: string;
  file: string;
  resolved_path: string;
  line: number;
  props: string[];
  used_by: string[];
  uses: string[];
  lazy?: boolean;
  wrappers?: string[];
}

/** Result of unwrapping HOC call expressions. */
export interface UnwrapResult {
  innerFn: ts.FunctionExpression | ts.ArrowFunction | null;
  wrappers: string[];
  isLazy: boolean;
  hoistedComponent: string | null;
}

/** The AST node that defines a component, indexed for annotation passes. */
export interface ComponentNodeRef {
  sourceFile: ts.SourceFile;
  node: ts.Node;
}
