/**
 * L3 plugins/ barrel export — MCP interface layer.
 */

export { bootstrap } from './server.js';
export { TOOL_SCHEMAS } from './schemas.js';
export { DISPATCH_TABLE, getDispatcher, hasDispatcher, listTools } from './dispatch.js';
export type { ToolDispatcher } from './dispatch.js';
