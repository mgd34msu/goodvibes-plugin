/**
 * L3 Plugin Layer — Barrel Export
 *
 * Re-exports the public API of the plugin layer: bootstrap function,
 * dispatch table helpers, and tool schema registry.
 *
 * @module plugins
 */

export { bootstrap } from './server.js';
export { TOOL_SCHEMAS } from './schemas.js';
export {
  DISPATCH_TABLE,
  getDispatcher,
  listTools,
  // Deprecated aliases
  getHandler,
  listHandlers,
  hasHandler,
} from './dispatch.js';
export type { ToolDispatcher, ToolHandler } from './dispatch.js';
