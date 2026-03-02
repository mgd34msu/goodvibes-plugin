/**
 * React Component Tree Analysis Types
 *
 * Type definitions for the React component analysis primitives.
 * Used across component-analyzer, component-detector, and relationship-builder.
 *
 * @module core/react/types
 */

// =============================================================================
// Tool Argument Types
// =============================================================================

/**
 * Arguments for the get_react_component_tree tool
 */
export interface GetReactComponentTreeArgs {
  /** Specific component file to analyze */
  file?: string;
  /** Directory to analyze for components */
  path?: string;
  /** Start analysis from a specific component name */
  root_component?: string;
  /** Maximum depth to traverse in component tree */
  depth?: number;
}

// =============================================================================
// Component Data Types
// =============================================================================

/**
 * Component tree node structure
 */
export interface ComponentTreeNode {
  name: string;
  file: string;
  props: string[];
  children: ComponentTreeNode[];
  /** True if the component is lazy-loaded via React.lazy */
  lazy?: boolean;
  /** HOC wrappers applied to the component (e.g. ['memo', 'forwardRef']) */
  wrappers?: string[];
}

/**
 * Component info in flat list
 */
export interface ComponentInfo {
  name: string;
  file: string;
  line: number;
  props: string[];
  used_by: string[];
  uses: string[];
  /** True if the component is lazy-loaded via React.lazy */
  lazy?: boolean;
  /** HOC wrappers applied to the component (e.g. ['memo', 'forwardRef']) */
  wrappers?: string[];
}

/**
 * Result of component tree analysis
 */
export interface ComponentTreeResult {
  tree: ComponentTreeNode | null;
  components: ComponentInfo[];
  count: number;
}

// =============================================================================
// HOC Unwrap Types
// =============================================================================

/**
 * Result of unwrapping HOC call expressions
 */
export interface UnwrapResult {
  /** The innermost function node (the actual render function), if found */
  innerFn: import('typescript').FunctionExpression | import('typescript').ArrowFunction | null;
  /** Ordered list of wrapper names outermost-first (e.g. ['memo', 'forwardRef']) */
  wrappers: string[];
  /** True if any wrapper is lazy */
  isLazy: boolean;
  /** For withRouter/connect-style HOCs: the component identifier passed as argument */
  hoistedComponent: string | null;
}
