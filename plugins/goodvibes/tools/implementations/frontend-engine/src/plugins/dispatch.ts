/**
 * L3 Plugin Layer — Tool Dispatch Table
 *
 * Maps 14 MCP tool names to their handler functions.
 * Provides a read-only dispatch table and lookup helpers.
 *
 * NOTE: Phase 2/3 refactoring — these handlers currently live in src/handlers/.
 * They will be rewired to extensions/ in Phase 3 of the architecture migration.
 * The dispatch table must remain functional with existing handler imports
 * throughout the transition.
 *
 * @module plugins/dispatch
 */

// Import handlers from existing handlers/ layer
// PHASE-3-TODO: Rewire these to extensions/ once that layer is created
import { handleAnalyzeRenderTriggers } from '../handlers/analyze-render-triggers.js';
import { handleAnalyzeStackingContext } from '../handlers/analyze-stacking-context.js';
import { handleAnalyzeLayoutHierarchy } from '../handlers/analyze-layout-hierarchy.js';
import { handleAnalyzeResponsiveBreakpoints } from '../handlers/analyze-responsive-breakpoints.js';
import { handleDiagnoseOverflow } from '../handlers/diagnose-overflow.js';
import { handleTraceComponentState } from '../handlers/trace-component-state.js';
import { handleGetAccessibilityTree } from '../handlers/get-accessibility-tree.js';
import { handleGetSizingStrategy } from '../handlers/get-sizing-strategy.js';
import { handleAnalyzeTailwindConflicts } from '../handlers/analyze-tailwind-conflicts.js';
import { handleAnalyzeEventFlow } from '../handlers/analyze-event-flow.js';
import { handleGetReactComponentTree } from '../handlers/react.js';
import { handleAnalyzeClientBoundary } from '../handlers/analyze-client-boundary.js';
import { handleAuditHookDependencies } from '../handlers/audit-hook-dependencies.js';
import { handleAnalyzeErrorBoundaries } from '../handlers/analyze-error-boundaries.js';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Dispatcher function signature — receives raw unknown args and returns a
 * Promise resolving to an MCP-compliant content response.
 */
export type ToolDispatcher = (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;

/** @deprecated Use ToolDispatcher instead */
export type ToolHandler = ToolDispatcher;

// =============================================================================
// Dispatch Table
// =============================================================================

/**
 * Read-only map of tool name to dispatcher function.
 * Contains 14 entries for all frontend analysis tools.
 */
export const DISPATCH_TABLE: ReadonlyMap<string, ToolDispatcher> = new Map<string, ToolDispatcher>([
  ['frontend_component_tree', handleGetReactComponentTree as ToolDispatcher],
  ['frontend_stacking_context', handleAnalyzeStackingContext as ToolDispatcher],
  ['frontend_responsive_breakpoints', handleAnalyzeResponsiveBreakpoints as ToolDispatcher],
  ['frontend_component_state', handleTraceComponentState as ToolDispatcher],
  ['frontend_render_triggers', handleAnalyzeRenderTriggers as ToolDispatcher],
  ['frontend_layout_hierarchy', handleAnalyzeLayoutHierarchy as ToolDispatcher],
  ['frontend_overflow', handleDiagnoseOverflow as ToolDispatcher],
  ['frontend_accessibility_tree', handleGetAccessibilityTree as ToolDispatcher],
  ['frontend_sizing_strategy', handleGetSizingStrategy as ToolDispatcher],
  ['frontend_event_flow', handleAnalyzeEventFlow as ToolDispatcher],
  ['frontend_tailwind_conflicts', handleAnalyzeTailwindConflicts as ToolDispatcher],
  ['frontend_client_boundary', handleAnalyzeClientBoundary as ToolDispatcher],
  ['frontend_hook_dependencies', handleAuditHookDependencies as ToolDispatcher],
  ['frontend_error_boundaries', handleAnalyzeErrorBoundaries as ToolDispatcher],
]);

// =============================================================================
// Dispatch Helpers
// =============================================================================

/**
 * Look up a dispatcher by tool name.
 *
 * @param name - MCP tool name
 * @returns The dispatcher function, or undefined if not found
 */
export function getDispatcher(name: string): ToolDispatcher | undefined {
  return DISPATCH_TABLE.get(name);
}

/** @deprecated Use getDispatcher instead */
export const getHandler = getDispatcher;

/**
 * List all registered tool names.
 *
 * @returns Array of tool names in registration order
 */
export function listTools(): string[] {
  return Array.from(DISPATCH_TABLE.keys());
}

/** @deprecated Use listTools instead */
export const listHandlers = listTools;

/**
 * Check if a tool is registered.
 *
 * @param name - MCP tool name
 * @returns true if the tool has a registered dispatcher
 * @deprecated Prefer checking getDispatcher(name) !== undefined
 */
export function hasHandler(name: string): boolean {
  return DISPATCH_TABLE.has(name);
}
