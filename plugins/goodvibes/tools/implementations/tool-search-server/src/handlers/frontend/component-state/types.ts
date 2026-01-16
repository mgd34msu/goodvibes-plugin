/**
 * Types for Trace Component State
 *
 * @module handlers/frontend/component-state/types
 */

/**
 * Arguments for the trace_component_state tool
 */
export interface TraceComponentStateArgs {
  /** File path to analyze (relative to project root or absolute) */
  file: string;
  /** Analyze imported child components (default: false) */
  include_children?: boolean;
  /** How deep to trace child components (default: 2) */
  depth?: number;
}

/**
 * Local state information from hooks
 */
export interface LocalStateInfo {
  name: string;
  type: string;
  hook: 'useState' | 'useReducer' | 'useRef';
  initial_value?: string;
  setter?: string;
  used_in_jsx: boolean;
  passed_to_children?: string[];
}

/**
 * Received prop information
 */
export interface ReceivedProp {
  name: string;
  type?: string;
  required: boolean;
  default_value?: string;
}

/**
 * Props passed down to children
 */
export interface PassedDownProp {
  prop_name: string;
  to_component: string;
  original_source: 'prop' | 'state' | 'derived' | 'context';
}

/**
 * Props analysis
 */
export interface PropsAnalysis {
  received: ReceivedProp[];
  passed_down: PassedDownProp[];
}

/**
 * Consumed context information
 */
export interface ConsumedContext {
  hook: string;
  context_name?: string;
  values_used: string[];
}

/**
 * Provided context information
 */
export interface ProvidedContext {
  context_name: string;
  value_source: string;
}

/**
 * Context analysis
 */
export interface ContextAnalysis {
  consumed: ConsumedContext[];
  provided: ProvidedContext[];
}

/**
 * Effect hook information
 */
export interface EffectInfo {
  type: 'useEffect' | 'useLayoutEffect' | 'useMemo' | 'useCallback';
  dependencies: string[];
  has_cleanup: boolean;
}

/**
 * Issue detected in the component
 */
export interface ComponentIssue {
  type: 'prop_drilling' | 'callback_instability' | 'missing_memo' | 'effect_deps' | 'state_in_render';
  severity: 'error' | 'warning' | 'info';
  location: string;
  description: string;
  suggestion: string;
}

/**
 * Result of tracing component state
 */
export interface TraceComponentStateResult {
  component: string;
  file: string;
  local_state: LocalStateInfo[];
  props: PropsAnalysis;
  context: ContextAnalysis;
  effects: EffectInfo[];
  issues: ComponentIssue[];
}

/**
 * Tool response format
 */
export interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Internal analysis context
 */
export interface AnalysisContext {
  sourceFile: import('typescript').SourceFile;
  projectRoot: string;
  stateVariables: Map<string, LocalStateInfo>;
  propNames: Set<string>;
  contextValues: Map<string, ConsumedContext>;
  jsxUsedIdentifiers: Set<string>;
  jsxPassedProps: PassedDownProp[];
  inlineCallbacks: Array<{ component: string; propName: string; line: number }>;
}
