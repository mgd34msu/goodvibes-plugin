/**
 * Backward-compatibility shim. All handler implementations live in ./handlers/.
 * Import directly from './handlers/index.js' for new code.
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
