/**
 * Layer 3 Plugins — Barrel Exports
 *
 * Explicit named exports for the plugin API consumed by bootstrap and other
 * internal subsystems. MCP server symbols are intentionally excluded — the
 * MCP server is a process entry point, not a plugin consumed by bootstrap.
 * Import MCP symbols directly from './mcp/mcp-server.js' if needed.
 */

// WRFC plugin
export { registerWRFCPlugin, getDefaultWRFCConfig, WRFCPlugin } from './wrfc/index.js';
export type { WRFCPluginConfig, PluginContext } from './wrfc/index.js';

// Hook processing plugin
export { HookProcessor, HookRegistry, registerDefaultHandlers } from './hooks/index.js';
export type {
  ClaudeHookResponse,
  HookProcessorDeps,
  HookHandler,
  RegisteredHandler,
  DefaultHandlerDeps,
} from './hooks/index.js';

// Time plugin
export { TimePlugin, getDefaultTimeConfig } from './time/index.js';
export type { TimePluginConfig, TimePluginContext } from './time/index.js';

// External events plugin
export { ExternalPlugin, createDefaultExternalPluginConfig } from './external/index.js';
export type { ExternalPluginConfig } from './external/index.js';
