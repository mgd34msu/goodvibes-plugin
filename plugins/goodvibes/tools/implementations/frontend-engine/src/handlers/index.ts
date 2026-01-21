/**
 * Frontend analysis handlers
 *
 * Provides tools for analyzing frontend code patterns:
 * - React render trigger analysis
 * - Stacking context and z-index analysis
 * - Layout hierarchy analysis with Tailwind CSS support
 * - Responsive breakpoint analysis for Tailwind CSS
 * - Overflow issue diagnosis and fix recommendations
 * - Accessibility tree building and WCAG issue detection
 * - Tailwind class conflict and redundancy detection
 *
 * @module handlers/frontend
 */

// Import handlers for registry (not re-exported to avoid tree-shaking)
import { handleAnalyzeRenderTriggers } from './analyze-render-triggers.js';
import { handleAnalyzeStackingContext } from './analyze-stacking-context.js';
import { handleAnalyzeLayoutHierarchy } from './analyze-layout-hierarchy.js';
import { handleAnalyzeResponsiveBreakpoints } from './analyze-responsive-breakpoints.js';
import { handleDiagnoseOverflow } from './diagnose-overflow.js';
import { handleTraceComponentState } from './trace-component-state.js';
import { handleGetAccessibilityTree } from './get-accessibility-tree.js';
import { handleGetSizingStrategy } from './get-sizing-strategy.js';
import { handleAnalyzeTailwindConflicts } from './analyze-tailwind-conflicts.js';
import { handleAnalyzeEventFlow } from './analyze-event-flow.js';
import { handleGetReactComponentTree } from './react.js';

// Export types only
export type { AnalyzeRenderTriggersArgs } from './analyze-render-triggers.js';
export type { AnalyzeStackingContextArgs } from './analyze-stacking-context.js';
export type {
  AnalyzeLayoutHierarchyArgs,
  LayoutNode,
  AnalyzeLayoutHierarchyResult,
} from './analyze-layout-hierarchy.js';
export type { AnalyzeResponsiveBreakpointsArgs } from './analyze-responsive-breakpoints.js';
export type { DiagnoseOverflowArgs } from './diagnose-overflow.js';
export type { TraceComponentStateArgs } from './trace-component-state.js';
export type { GetAccessibilityTreeArgs, A11yNode } from './get-accessibility-tree.js';
export type { GetSizingStrategyArgs, GetSizingStrategyResult } from './get-sizing-strategy.js';
export type { AnalyzeTailwindConflictsArgs } from './analyze-tailwind-conflicts.js';
export type { AnalyzeEventFlowArgs } from './analyze-event-flow.js';
export type { GetReactComponentTreeArgs } from './react.js';

// =============================================================================
// HANDLER REGISTRY
// =============================================================================

type ToolHandler = (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;

const handlerRegistry = new Map<string, ToolHandler>([
  ['get_react_component_tree', handleGetReactComponentTree as ToolHandler],
  ['analyze_stacking_context', handleAnalyzeStackingContext as ToolHandler],
  ['analyze_responsive_breakpoints', handleAnalyzeResponsiveBreakpoints as ToolHandler],
  ['trace_component_state', handleTraceComponentState as ToolHandler],
  ['analyze_render_triggers', handleAnalyzeRenderTriggers as ToolHandler],
  ['analyze_layout_hierarchy', handleAnalyzeLayoutHierarchy as ToolHandler],
  ['diagnose_overflow', handleDiagnoseOverflow as ToolHandler],
  ['get_accessibility_tree', handleGetAccessibilityTree as ToolHandler],
  ['get_sizing_strategy', handleGetSizingStrategy as ToolHandler],
  ['analyze_event_flow', handleAnalyzeEventFlow as ToolHandler],
  ['analyze_tailwind_conflicts', handleAnalyzeTailwindConflicts as ToolHandler],
]);

/**
 * Get a handler by tool name.
 */
export function getHandler(toolName: string): ToolHandler | undefined {
  return handlerRegistry.get(toolName);
}

/**
 * Check if a tool is registered.
 */
export function hasHandler(toolName: string): boolean {
  return handlerRegistry.has(toolName);
}

/**
 * List all registered tool names.
 */
export function listHandlers(): string[] {
  return Array.from(handlerRegistry.keys());
}
