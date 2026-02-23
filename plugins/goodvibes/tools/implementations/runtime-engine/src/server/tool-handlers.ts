/**
 * Tool handler implementations for the runtime-engine MCP server.
 *
 * This file is a backward-compatibility shim. All handler implementations
 * have been split into per-tool modules under ./handlers/:
 *
 * - handlers/types.ts      - ToolHandler type + HandlerContext interface
 * - handlers/shared.ts     - toSuccess(), toError() helpers
 * - handlers/status.ts     - handleRuntimeStatus
 * - handlers/config.ts     - handleRuntimeConfig, VALID_CONFIG_KEYS, CONFIG_KEY_TYPES
 * - handlers/events.ts     - handleRuntimeEvents, matchesTypePattern, resolveTimestamp, applyVerbosity
 * - handlers/emit.ts       - handleRuntimeEmit
 * - handlers/workflow.ts   - handleRuntimeWorkflow
 * - handlers/triggers.ts   - handleRuntimeTriggers, VALID_TRIGGER_ACTION_TYPES, validateTriggerDefinition
 * - handlers/agents.ts     - handleRuntimeAgents
 * - handlers/index.ts      - barrel export + handlerRegistry + getHandler/hasHandler/listHandlers + allSchemas
 */

export type { ToolHandler, HandlerContext } from './handlers/index.js';

export {
  getHandler,
  hasHandler,
  listHandlers,
  handlerRegistry,
  allSchemas,
  handleRuntimeStatus,
  handleRuntimeConfig,
  handleRuntimeEvents,
  handleRuntimeEmit,
  handleRuntimeWorkflow,
  handleRuntimeTriggers,
  handleRuntimeAgents,
  toSuccess,
  toError,
  VALID_CONFIG_KEYS,
  CONFIG_KEY_TYPES,
  VALID_TRIGGER_ACTION_TYPES,
  validateTriggerDefinition,
  matchesTypePattern,
  resolveTimestamp,
  applyVerbosity,
} from './handlers/index.js';
