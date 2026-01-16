/**
 * Analyze Stacking Context Handler
 *
 * Analyzes z-index and stacking contexts in React/Vue/Svelte components
 * using Tailwind CSS class analysis. Detects potential z-index conflicts,
 * context isolation issues, and portal destinations.
 *
 * @module handlers/frontend/analyze-stacking-context
 */

// Re-export everything from the modular implementation
export {
  handleAnalyzeStackingContext,
  type AnalyzeStackingContextArgs,
  type AnalyzeStackingContextResult,
  type StackingContext,
  type ContextCreator,
  type ZIndexInfo,
  type StackingIssue,
  type PortalInfo,
  type ToolResponse,
} from './stacking-context/index.js';
