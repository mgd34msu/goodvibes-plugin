/**
 * Handler registry for project-engine v2.0.0.
 *
 * Maps tool names to handler functions.
 * Populated in Phase 10 after all domain handlers are migrated.
 */

import type { ToolHandler } from '../types.js';

/**
 * Handler registry - maps tool names to handler functions.
 * Will contain 29 entries when fully populated.
 */
export const handlerRegistry = new Map<string, ToolHandler>();

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
