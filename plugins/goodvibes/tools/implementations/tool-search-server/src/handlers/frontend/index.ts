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

// Analyze Render Triggers
export { handleAnalyzeRenderTriggers } from './analyze-render-triggers.js';
export type { AnalyzeRenderTriggersArgs } from './analyze-render-triggers.js';

// Analyze Stacking Context
export { handleAnalyzeStackingContext } from './analyze-stacking-context.js';
export type { AnalyzeStackingContextArgs } from './analyze-stacking-context.js';

// Layout Hierarchy Analysis
export { handleAnalyzeLayoutHierarchy } from './analyze-layout-hierarchy.js';
export type {
  AnalyzeLayoutHierarchyArgs,
  LayoutNode,
  AnalyzeLayoutHierarchyResult,
} from './analyze-layout-hierarchy.js';

// Analyze Responsive Breakpoints
export { handleAnalyzeResponsiveBreakpoints } from './analyze-responsive-breakpoints.js';
export type { AnalyzeResponsiveBreakpointsArgs } from './analyze-responsive-breakpoints.js';

// Diagnose Overflow Issues
export { handleDiagnoseOverflow } from './diagnose-overflow.js';
export type { DiagnoseOverflowArgs } from './diagnose-overflow.js';

// Trace Component State
export { handleTraceComponentState } from './trace-component-state.js';
export type { TraceComponentStateArgs } from './trace-component-state.js';

// Get Accessibility Tree
export { handleGetAccessibilityTree } from './get-accessibility-tree.js';
export type { GetAccessibilityTreeArgs, A11yNode } from './get-accessibility-tree.js';

// Get Sizing Strategy
export { handleGetSizingStrategy } from './get-sizing-strategy.js';
export type { GetSizingStrategyArgs, GetSizingStrategyResult } from './get-sizing-strategy.js';

// Analyze Tailwind Conflicts
export { handleAnalyzeTailwindConflicts } from './analyze-tailwind-conflicts.js';
export type { AnalyzeTailwindConflictsArgs } from './analyze-tailwind-conflicts.js';

// Analyze Event Flow
export { handleAnalyzeEventFlow } from './analyze-event-flow.js';
export type { AnalyzeEventFlowArgs } from './analyze-event-flow.js';
