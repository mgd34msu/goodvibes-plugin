/**
 * Handler registry for precision-engine.
 */

import { ToolHandler } from '../utils/index.js';

// Import SPEC-v2 handler implementations
import { handlePrecisionWrite } from './precision-write.js';
import { handlePrecisionExec } from './precision-exec.js';
import { handlePrecisionFetch } from './precision-fetch.js';
import { handleDiscover } from './discover.js';
import { handlePrecisionGrep } from './precision-grep.js';
import { handlePrecisionRead } from './precision-read.js';
import { handlePrecisionGlob } from './precision-glob.js';
import { handlePrecisionSymbols } from './precision-symbols.js';
import { handlePrecisionEdit } from './precision-edit.js';
import { handlePrecisionConfig } from './precision-config.js';
import { handlePrecisionNotebook } from './precision-notebook.js';
import { handlePrecisionAgent } from './precision-agent.js';

// Re-export SPEC-v2 handlers for direct access
export {
  handlePrecisionWrite,
  handlePrecisionExec,
  handlePrecisionFetch,
  handleDiscover,
  handlePrecisionGrep,
  handlePrecisionRead,
  handlePrecisionGlob,
  handlePrecisionSymbols,
  handlePrecisionEdit,
  handlePrecisionConfig,
  handlePrecisionNotebook,
  handlePrecisionAgent,
};

// Re-export ToolHandler type
export type { ToolHandler };

/**
 * Handler registry - SPEC-v2 tools only.
 */
export const handlerRegistry = new Map<string, ToolHandler>([
  ['precision_write', handlePrecisionWrite],
  ['precision_exec', handlePrecisionExec],
  ['precision_fetch', handlePrecisionFetch],
  ['discover', handleDiscover],
  ['precision_grep', handlePrecisionGrep],
  ['precision_read', handlePrecisionRead],
  ['precision_glob', handlePrecisionGlob],
  ['precision_symbols', handlePrecisionSymbols],
  ['precision_edit', handlePrecisionEdit],
  ['precision_config', handlePrecisionConfig],
  ['precision_notebook', handlePrecisionNotebook],
  ['precision_agent', handlePrecisionAgent],
]);

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
