/**
 * Types for Analyze Render Triggers
 *
 * @module handlers/frontend/render-triggers/types
 */

/**
 * Arguments for the analyze_render_triggers tool
 */
export interface AnalyzeRenderTriggersArgs {
  /** Path to the React component file to analyze */
  file: string;
  /** Analyze child component memoization (default: false) */
  include_children?: boolean;
}

/**
 * Memoization type information
 */
export type MemoType = 'React.memo' | 'PureComponent' | 'shouldComponentUpdate';

/**
 * Render trigger types
 */
export type TriggerType = 'state' | 'prop' | 'context' | 'parent' | 'force_update';

/**
 * Frequency of render triggers
 */
export type TriggerFrequency = 'every_render' | 'on_change' | 'rare';

/**
 * Inline definition types
 */
export type InlineDefinitionType = 'object' | 'array' | 'function' | 'jsx';

/**
 * Context granularity
 */
export type ContextGranularity = 'entire_context' | 'selected_value';

/**
 * Optimization suggestion priority
 */
export type OptimizationPriority = 'high' | 'medium' | 'low';

/**
 * Optimization suggestion types
 */
export type OptimizationType = 'memo' | 'useCallback' | 'useMemo' | 'context_split' | 'state_colocation';

/**
 * Information about a render trigger
 */
export interface RenderTrigger {
  type: TriggerType;
  name?: string;
  source: string;
  frequency: TriggerFrequency;
  preventable: boolean;
  prevention_method?: string;
}

/**
 * Information about an inline definition
 */
export interface InlineDefinition {
  type: InlineDefinitionType;
  code_snippet: string;
  line: number;
  issue: string;
  fix: string;
}

/**
 * Information about an expensive computation
 */
export interface ExpensiveComputation {
  description: string;
  line: number;
  is_memoized: boolean;
  suggestion?: string;
}

/**
 * Information about a context subscription
 */
export interface ContextSubscription {
  context: string;
  selector?: string;
  granularity: ContextGranularity;
  issue?: string;
}

/**
 * Information about a child component's prop stability
 */
export interface ChildAnalysis {
  component: string;
  memoized: boolean;
  receives_unstable_props: boolean;
  unstable_props?: string[];
}

/**
 * Optimization suggestion
 */
export interface OptimizationSuggestion {
  priority: OptimizationPriority;
  type: OptimizationType;
  description: string;
  estimated_impact: string;
  code_example?: string;
}

/**
 * Result of render trigger analysis
 */
export interface AnalyzeRenderTriggersResult {
  component: string;
  file: string;
  is_memoized: boolean;
  memo_type?: MemoType;
  render_triggers: RenderTrigger[];
  inline_definitions: InlineDefinition[];
  expensive_computations: ExpensiveComputation[];
  context_subscriptions: ContextSubscription[];
  children_analysis?: ChildAnalysis[];
  optimization_suggestions: OptimizationSuggestion[];
}

/**
 * Tool response format
 */
export interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Internal memoization info
 */
export interface MemoInfo {
  is_memoized: boolean;
  memo_type?: MemoType;
}

/**
 * Internal component info for analysis
 */
export interface ComponentAnalysis {
  name: string;
  node: import('typescript').Node;
  line: number;
  memoInfo: MemoInfo;
}
