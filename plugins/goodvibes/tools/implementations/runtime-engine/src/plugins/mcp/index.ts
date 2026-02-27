/**
 * MCP Plugin — Barrel Exports
 *
 * Re-exports the public API surface of the MCP server plugin.
 */

export { RuntimeEngineServer } from './mcp-server.js';
export type { ToolHandler, HandlerContext } from './tool-handlers.js';
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
} from './tool-handlers.js';
