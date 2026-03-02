/**
 * L3 Plugin Layer — Tool Dispatch Table
 *
 * Maps 14 MCP tool names to their dispatcher functions.
 * Provides a read-only dispatch table and lookup helpers.
 *
 * All handlers are imported from the extensions/ layer, which wraps
 * the underlying analysis logic with validation, error handling,
 * and the standard MCP content response format.
 *
 * @module plugins/dispatch
 */

import type { McpResponse } from '../shared/types.js';

// Import dispatchers from extensions/ layer
import { handleGetReactComponentTree } from '../extensions/component-tree.js';
import { handleAnalyzeStackingContext } from '../extensions/stacking-context.js';
import { handleAnalyzeResponsiveBreakpoints } from '../extensions/responsive-breakpoints.js';
import { handleTraceComponentState } from '../extensions/component-state.js';
import { handleAnalyzeRenderTriggers } from '../extensions/render-triggers.js';
import { handleAnalyzeLayoutHierarchy } from '../extensions/layout-hierarchy.js';
import { handleDiagnoseOverflow } from '../extensions/overflow-diagnosis.js';
import { handleGetAccessibilityTree } from '../extensions/accessibility-tree.js';
import { handleGetSizingStrategy } from '../extensions/sizing-strategy.js';
import { handleAnalyzeEventFlow } from '../extensions/event-flow.js';
import { handleAnalyzeTailwindConflicts } from '../extensions/tailwind-conflicts.js';
import { handleAnalyzeClientBoundary } from '../extensions/client-boundary.js';
import { handleAuditHookDependencies } from '../extensions/hook-dependencies.js';
import { handleAnalyzeErrorBoundaries } from '../extensions/error-boundaries.js';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Dispatcher function signature — receives raw unknown args and returns a
 * Promise resolving to an MCP-compliant content response.
 */
export type ToolDispatcher = (args: unknown) => Promise<McpResponse>;

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
  ['frontend_component_tree', handleGetReactComponentTree],
  ['frontend_stacking_context', handleAnalyzeStackingContext],
  ['frontend_responsive_breakpoints', handleAnalyzeResponsiveBreakpoints],
  ['frontend_component_state', handleTraceComponentState],
  ['frontend_render_triggers', handleAnalyzeRenderTriggers],
  ['frontend_layout_hierarchy', handleAnalyzeLayoutHierarchy],
  ['frontend_overflow', handleDiagnoseOverflow],
  ['frontend_accessibility_tree', handleGetAccessibilityTree],
  ['frontend_sizing_strategy', handleGetSizingStrategy],
  ['frontend_event_flow', handleAnalyzeEventFlow],
  ['frontend_tailwind_conflicts', handleAnalyzeTailwindConflicts],
  ['frontend_client_boundary', handleAnalyzeClientBoundary],
  ['frontend_hook_dependencies', handleAuditHookDependencies],
  ['frontend_error_boundaries', handleAnalyzeErrorBoundaries],
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
