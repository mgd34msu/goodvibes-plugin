/**
 * Handler registry for the runtime-engine MCP server.
 *
 * Re-exports all per-tool handlers and provides the registry Map
 * plus helper functions for clean handler lookup.
 *
 * Also re-exports allSchemas (tool input schema definitions) for use
 * by the MCP server's ListTools handler.
 */

export type { ToolHandler, HandlerContext } from './types.js';
import type { ToolHandler } from './types.js';

export { toSuccess, toError } from './shared.js';

import { handleRuntimeStatus } from './status.js';
export { handleRuntimeStatus };

import { handleRuntimeConfig, VALID_CONFIG_KEYS, CONFIG_KEY_TYPES } from './config.js';
export { handleRuntimeConfig, VALID_CONFIG_KEYS, CONFIG_KEY_TYPES };

import { handleRuntimeEvents, matchesTypePattern, resolveTimestamp, applyVerbosity } from './events.js';
export { handleRuntimeEvents, matchesTypePattern, resolveTimestamp, applyVerbosity };

import { handleRuntimeEmit } from './emit.js';
export { handleRuntimeEmit };

import { handleRuntimeWorkflow } from './workflow.js';
export { handleRuntimeWorkflow };

import { handleRuntimeTriggers, VALID_TRIGGER_ACTION_TYPES, validateTriggerDefinition } from './triggers.js';
export { handleRuntimeTriggers, VALID_TRIGGER_ACTION_TYPES, validateTriggerDefinition };

import { handleRuntimeAgents } from './agents.js';
export { handleRuntimeAgents };

import { handleRuntimeState } from './state.js';
export { handleRuntimeState };

import { handleDaemon } from './daemon-handler.js';
export { handleDaemon };

// ─── Tool schemas ─────────────────────────────────────────────────────────────

export { allSchemas } from './schemas.js';

// ─── Handler registry ─────────────────────────────────────────────────────────

/**
 * Central registry mapping tool names to handler functions.
 * Mirrors the pattern used by precision-engine's handlerRegistry.
 */
export const handlerRegistry = new Map<string, ToolHandler>([
  ['runtime_status', handleRuntimeStatus],
  ['runtime_config', handleRuntimeConfig],
  ['runtime_events', handleRuntimeEvents],
  ['runtime_emit', handleRuntimeEmit],
  ['runtime_workflow', handleRuntimeWorkflow],
  ['runtime_triggers', handleRuntimeTriggers],
  ['runtime_agents', handleRuntimeAgents],
  ['runtime_state', handleRuntimeState],
  ['runtime_daemon', handleDaemon],
]);

/**
 * Retrieve a registered handler by tool name.
 *
 * @param toolName - The MCP tool name.
 * @returns The handler function, or undefined if not registered.
 */
export function getHandler(toolName: string): ToolHandler | undefined {
  return handlerRegistry.get(toolName);
}

/**
 * Check whether a tool is registered.
 *
 * @param toolName - The MCP tool name.
 * @returns True if a handler is registered for the given name.
 */
export function hasHandler(toolName: string): boolean {
  return handlerRegistry.has(toolName);
}

/**
 * List all registered tool names.
 *
 * @returns Array of tool name strings.
 */
export function listHandlers(): string[] {
  return Array.from(handlerRegistry.keys());
}
