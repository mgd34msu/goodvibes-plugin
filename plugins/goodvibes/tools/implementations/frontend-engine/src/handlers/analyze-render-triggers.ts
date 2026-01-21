/**
 * Analyze Render Triggers Handler
 *
 * Identifies what causes React components to re-render by analyzing:
 * - Memoization status (React.memo, PureComponent, shouldComponentUpdate)
 * - Inline definitions (objects, arrays, functions, JSX in render)
 * - Expensive computations not wrapped in useMemo
 * - Context subscriptions and their granularity
 * - Child component prop stability
 *
 * @module handlers/frontend/analyze-render-triggers
 */

// Re-export everything from the modular implementation
export {
  handleAnalyzeRenderTriggers,
  type AnalyzeRenderTriggersArgs,
  type AnalyzeRenderTriggersResult,
  type RenderTrigger,
  type InlineDefinition,
  type ExpensiveComputation,
  type ContextSubscription,
  type ChildAnalysis,
  type OptimizationSuggestion,
  type MemoType,
  type ToolResponse,
} from './render-triggers/index.js';
